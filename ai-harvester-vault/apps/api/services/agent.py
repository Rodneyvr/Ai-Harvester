from typing import Optional
from uuid import UUID

from sqlalchemy import select, func, or_
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import Agent, Skill
from ..schemas import AgentCreate, AgentUpdate, AgentResponse, AgentListResponse, SearchRequest, SkillResponse


class AgentService:
    """Service for managing harvested agents."""

    def __init__(self, session: AsyncSession):
        self.session = session

    async def create(self, data: AgentCreate) -> AgentResponse:
        """Create a new agent."""
        agent = Agent(**data.model_dump())
        self.session.add(agent)
        await self.session.flush()
        await self.session.refresh(agent)
        return AgentResponse.model_validate(agent)

    async def get(self, agent_id: UUID) -> Optional[AgentResponse]:
        """Get agent by ID."""
        result = await self.session.execute(
            select(Agent).where(Agent.id == agent_id)
        )
        agent = result.scalar_one_or_none()
        if agent:
            return AgentResponse.model_validate(agent)
        return None

    async def get_with_skills(self, agent_id: UUID) -> Optional[dict]:
        """Get agent with its skills."""
        result = await self.session.execute(
            select(Agent).where(Agent.id == agent_id)
        )
        agent = result.scalar_one_or_none()
        if not agent:
            return None

        skills_result = await self.session.execute(
            select(Skill).where(Skill.agent_id == agent_id)
        )
        skills = skills_result.scalars().all()

        return {
            "agent": AgentResponse.model_validate(agent),
            "skills": [SkillResponse.model_validate(s) for s in skills],
        }

    async def update(self, agent_id: UUID, data: AgentUpdate) -> Optional[AgentResponse]:
        """Update an agent."""
        result = await self.session.execute(
            select(Agent).where(Agent.id == agent_id)
        )
        agent = result.scalar_one_or_none()
        if not agent:
            return None

        update_data = data.model_dump(exclude_unset=True)
        for key, value in update_data.items():
            setattr(agent, key, value)

        await self.session.flush()
        await self.session.refresh(agent)
        return AgentResponse.model_validate(agent)

    async def delete(self, agent_id: UUID) -> bool:
        """Delete an agent."""
        result = await self.session.execute(
            select(Agent).where(Agent.id == agent_id)
        )
        agent = result.scalar_one_or_none()
        if not agent:
            return False
        await self.session.delete(agent)
        return True

    async def search(self, params: SearchRequest) -> AgentListResponse:
        """Search agents with filters."""
        query = select(Agent)

        if params.platform:
            query = query.where(Agent.platform == params.platform)
        if params.category:
            query = query.where(Agent.category == params.category)
        if params.tags:
            for tag in params.tags:
                query = query.where(Agent.tags.contains([tag]))
        if params.min_quality:
            query = query.where(Agent.quality_score >= params.min_quality)

        # Text search
        if params.query:
            search_term = f"%{params.query}%"
            query = query.where(
                or_(
                    Agent.name.ilike(search_term),
                    Agent.description.ilike(search_term),
                    Agent.system_prompt.ilike(search_term),
                )
            )

        # Count total
        count_query = select(func.count()).select_from(query.subquery())
        total_result = await self.session.execute(count_query)
        total = total_result.scalar()

        # Paginate and order
        query = query.order_by(Agent.quality_score.desc(), Agent.created_at.desc())
        query = query.offset((params.page - 1) * params.page_size).limit(params.page_size)

        result = await self.session.execute(query)
        agents = result.scalars().all()

        return AgentListResponse(
            agents=[AgentResponse.model_validate(a) for a in agents],
            total=total,
            page=params.page,
            page_size=params.page_size,
        )

    async def semantic_search(self, query: str, limit: int = 10, min_similarity: float = 0.7) -> list[AgentResponse]:
        """Semantic search using pgvector (requires pgvector extension)."""
        # This would use pgvector cosine similarity
        # For now, fall back to text search
        search_params = SearchRequest(query=query, page=1, page_size=limit, min_quality=0)
        result = await self.search(search_params)
        return result.agents

    async def get_categories(self) -> list[str]:
        """Get all unique categories."""
        result = await self.session.execute(
            select(Agent.category).distinct().where(Agent.category.isnot(None))
        )
        return [c for c in result.scalars().all() if c]

    async def get_platforms(self) -> list[str]:
        """Get all platforms with counts."""
        result = await self.session.execute(
            select(Agent.platform, func.count(Agent.id))
            .group_by(Agent.platform)
        )
        return [f"{p.value} ({c})" for p, c in result.all()]

    async def get_stats(self) -> dict:
        """Get agent statistics."""
        total_result = await self.session.execute(select(func.count(Agent.id)))
        total = total_result.scalar()

        verified_result = await self.session.execute(
            select(func.count(Agent.id)).where(Agent.is_verified == True)
        )
        verified = verified_result.scalar()

        by_platform_result = await self.session.execute(
            select(Agent.platform, func.count(Agent.id)).group_by(Agent.platform)
        )
        by_platform = {p.value: c for p, c in by_platform_result.all()}

        by_category_result = await self.session.execute(
            select(Agent.category, func.count(Agent.id))
            .where(Agent.category.isnot(None))
            .group_by(Agent.category)
        )
        by_category = dict(by_category_result.all())

        avg_quality_result = await self.session.execute(
            select(func.avg(Agent.quality_score))
        )
        avg_quality = avg_quality_result.scalar() or 0

        return {
            "total_agents": total,
            "verified_agents": verified,
            "average_quality": round(float(avg_quality), 1),
            "by_platform": by_platform,
            "by_category": by_category,
        }