import hashlib
from dataclasses import dataclass
from typing import Optional

import numpy as np
from sentence_transformers import SentenceTransformer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ...models import Agent
from ...schemas import AgentCreate


@dataclass(slots=True)
class NormalizedAgent:
    agent_data: AgentCreate
    embedding: list[float]
    is_duplicate: bool
    existing_agent_id: Optional[str] = None


class NormalizerService:
    """Normalize, deduplicate, and generate embeddings for agents."""

    def __init__(self, session: AsyncSession):
        self.session = session
        self._embedder: Optional[SentenceTransformer] = None

    def _get_embedder(self) -> SentenceTransformer:
        if self._embedder is None:
            # Use lightweight model for embeddings
            self._embedder = SentenceTransformer("all-MiniLM-L6-v2")
        return self._embedder

    def generate_embedding(self, text: str) -> list[float]:
        """Generate vector embedding for semantic search."""
        embedder = self._get_embedder()
        embedding = embedder.encode(text, normalize_embeddings=True)
        return embedding.tolist()

    def create_search_text(self, agent: AgentCreate) -> str:
        """Create combined text for embedding."""
        parts = [
            agent.name or "",
            agent.description or "",
            agent.system_prompt or "",
            agent.tool_code or "",
            " ".join(agent.tags or []),
            agent.category or "",
        ]
        return " ".join(p for p in parts if p)

    async def normalize(self, extraction_result, crawl_metadata: dict = None, source_url: str = "") -> NormalizedAgent:
        """Normalize extraction result into AgentCreate with embedding."""
        # Generate content hash for exact deduplication
        content_parts = [
            extraction_result.name or "",
            extraction_result.system_prompt or "",
            extraction_result.tool_code or "",
        ]
        content_hash = hashlib.sha256("".join(content_parts).encode()).hexdigest()

        # Check for exact duplicate
        existing = await self.session.execute(
            select(Agent).where(Agent.content_hash == content_hash)
        )
        existing_agent = existing.scalar_one_or_none()

        if existing_agent:
            # Update existing agent version
            return NormalizedAgent(
                agent_data=AgentCreate(
                    name=extraction_result.name or existing_agent.name,
                    description=extraction_result.description or existing_agent.description,
                    source_url=source_url,
                    platform=existing_agent.platform,
                    category=extraction_result.category or existing_agent.category,
                    tags=list(set((extraction_result.tags or []) + (existing_agent.tags or []))),
                    system_prompt=extraction_result.system_prompt or existing_agent.system_prompt,
                    tool_code=extraction_result.tool_code or existing_agent.tool_code,
                    dependencies=extraction_result.dependencies or existing_agent.dependencies,
                    required_keys=extraction_result.required_keys or existing_agent.required_keys,
                    quality_score=existing_agent.quality_score,
                    content_hash=content_hash,
                ),
                embedding=existing_agent.embedding or [],
                is_duplicate=True,
                existing_agent_id=str(existing_agent.id),
            )

        # Check for near-duplicate via semantic similarity
        search_text = self.create_search_text(
            AgentCreate(
                name=extraction_result.name or "",
                description=extraction_result.description or "",
                source_url=source_url,
                platform="web",
                category=extraction_result.category,
                tags=extraction_result.tags or [],
                system_prompt=extraction_result.system_prompt or "",
                tool_code=extraction_result.tool_code or "",
                dependencies=extraction_result.dependencies or {},
                required_keys=extraction_result.required_keys or [],
            )
        )

        embedding = self.generate_embedding(search_text)

        # Check similarity with existing agents (if any)
        # This is a simplified check - in production use pgvector similarity search
        similar = await self.session.execute(
            select(Agent).where(Agent.embedding.is_not(None)).limit(100)
        )
        for agent in similar.scalars().all():
            if agent.embedding:
                similarity = self._cosine_similarity(embedding, agent.embedding)
                if similarity > 0.95:  # Very high similarity threshold
                    return NormalizedAgent(
                        agent_data=AgentCreate(
                            name=extraction_result.name or agent.name,
                            description=extraction_result.description or agent.description,
                            source_url=source_url,
                            platform=agent.platform,
                            category=extraction_result.category or agent.category,
                            tags=list(set((extraction_result.tags or []) + (agent.tags or []))),
                            system_prompt=extraction_result.system_prompt or agent.system_prompt,
                            tool_code=extraction_result.tool_code or agent.tool_code,
                            dependencies=extraction_result.dependencies or agent.dependencies,
                            required_keys=extraction_result.required_keys or agent.required_keys,
                            quality_score=agent.quality_score,
                            content_hash=content_hash,
                        ),
                        embedding=embedding,
                        is_duplicate=True,
                        existing_agent_id=str(agent.id),
                    )

        # Create new agent
        agent_data = AgentCreate(
            name=extraction_result.name or "Unnamed Agent",
            description=extraction_result.description,
            source_url=source_url,
            platform=crawl_metadata.get("platform", "web") if crawl_metadata else "web",
            category=extraction_result.category,
            tags=extraction_result.tags or [],
            system_prompt=extraction_result.system_prompt,
            tool_code=extraction_result.tool_code,
            dependencies=extraction_result.dependencies or {},
            required_keys=extraction_result.required_keys or [],
            quality_score=0,  # Will be set by scorer
            content_hash=content_hash,
            embedding=embedding,
        )

        return NormalizedAgent(
            agent_data=agent_data,
            embedding=embedding,
            is_duplicate=False,
        )

    def _cosine_similarity(self, a: list[float], b: list[float]) -> float:
        """Compute cosine similarity between two vectors."""
        a_np = np.array(a)
        b_np = np.array(b)
        return float(np.dot(a_np, b_np) / (np.linalg.norm(a_np) * np.linalg.norm(b_np)))

    async def upsert_agent(self, normalized: NormalizedAgent, quality_score: int) -> Agent:
        """Insert or update agent in database."""
        if normalized.is_duplicate and normalized.existing_agent_id:
            # Update existing
            result = await self.session.execute(
                select(Agent).where(Agent.id == normalized.existing_agent_id)
            )
            agent = result.scalar_one()
            agent.version += 1
            agent.quality_score = quality_score
            agent.is_verified = quality_score >= 70
            # Update fields with new data
            for key, value in normalized.agent_data.model_dump(exclude_unset=True).items():
                if key not in ("id", "version", "created_at", "content_hash", "embedding"):
                    setattr(agent, key, value)
        else:
            # Create new
            agent = Agent(**normalized.agent_data.model_dump())
            agent.quality_score = quality_score
            agent.is_verified = quality_score >= 70
            agent.embedding = normalized.embedding
            self.session.add(agent)

        await self.session.flush()
        await self.session.refresh(agent)
        return agent