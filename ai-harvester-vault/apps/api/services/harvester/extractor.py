import json
import os
from dataclasses import dataclass
from typing import Optional

import google.generativeai as genai
from groq import Groq

from ..core.config import get_settings


@dataclass(slots=True)
class ExtractionResult:
    is_agent: bool
    confidence: float
    name: Optional[str] = None
    description: Optional[str] = None
    system_prompt: Optional[str] = None
    tool_code: Optional[str] = None
    dependencies: dict = None
    required_keys: list[str] = None
    category: Optional[str] = None
    tags: list[str] = None
    raw_response: Optional[str] = None


class LLMExtractor:
    """LLM-based extraction of agent/skill information from web content."""

    EXTRACTION_PROMPT = """Analyze the following web content and determine if it describes an AI agent, system prompt, tool definition, skill, or MCP server.

Content:
{content}

Return a JSON object with these fields:
{{
  "is_agent": true/false,
  "confidence": 0.0-1.0,
  "name": "Agent/Skill name or null",
  "description": "Brief description or null",
  "system_prompt": "The system prompt/core instructions or null",
  "tool_code": "Tool/function code, schemas, or null",
  "dependencies": {{"python": ["pkg1"], "npm": ["pkg2"]}} or {{}},
  "required_keys": ["OPENAI_API_KEY", "ANTHROPIC_API_KEY"] or [],
  "category": "coding|research|automation|finance|scraping|other" or null,
  "tags": ["tag1", "tag2"] or []
}}

Only return valid JSON. If content is not an agent/skill, set is_agent=false and confidence=0.0."""

    def __init__(self):
        self.settings = get_settings()
        self._groq_client: Optional[Groq] = None
        self._gemini_model = None

    def _get_groq(self) -> Groq:
        if self._groq_client is None and self.settings.groq_api_key:
            self._groq_client = Groq(api_key=self.settings.groq_api_key)
        return self._groq_client

    def _get_gemini(self):
        if self._gemini_model is None and self.settings.gemini_api_key:
            genai.configure(api_key=self.settings.gemini_api_key)
            self._gemini_model = genai.GenerativeModel("gemini-1.5-flash")
        return self._gemini_model

    async def extract(self, content: str, url: str = "") -> ExtractionResult:
        """Extract agent/skill info from content using available LLM."""
        # Truncate content to fit context window
        truncated = content[:15000]

        # Try Groq first (fastest)
        if self.settings.has_groq:
            result = await self._extract_groq(truncated)
            if result:
                return result

        # Fallback to Gemini
        if self.settings.has_gemini:
            result = await self._extract_gemini(truncated)
            if result:
                return result

        # Fallback to Ollama
        if self.settings.ollama_base_url:
            result = await self._extract_ollama(truncated)
            if result:
                return result

        # No LLM available - return basic heuristic
        return self._heuristic_extract(truncated, url)

    async def _extract_groq(self, content: str) -> Optional[ExtractionResult]:
        try:
            client = self._get_groq()
            if not client:
                return None

            response = client.chat.completions.create(
                model="llama-3.1-70b-versatile",
                messages=[
                    {"role": "system", "content": "You are an expert at identifying AI agents, system prompts, and tool definitions from web content. Return only valid JSON."},
                    {"role": "user", "content": self.EXTRACTION_PROMPT.format(content=content)},
                ],
                temperature=0.1,
                max_tokens=2000,
                response_format={"type": "json_object"},
            )

            data = json.loads(response.choices[0].message.content)
            return ExtractionResult(
                is_agent=data.get("is_agent", False),
                confidence=float(data.get("confidence", 0.0)),
                name=data.get("name"),
                description=data.get("description"),
                system_prompt=data.get("system_prompt"),
                tool_code=data.get("tool_code"),
                dependencies=data.get("dependencies", {}),
                required_keys=data.get("required_keys", []),
                category=data.get("category"),
                tags=data.get("tags", []),
                raw_response=response.choices[0].message.content,
            )
        except Exception:
            return None

    async def _extract_gemini(self, content: str) -> Optional[ExtractionResult]:
        try:
            model = self._get_gemini()
            if not model:
                return None

            response = await model.generate_content_async(
                self.EXTRACTION_PROMPT.format(content=content),
                generation_config=genai.GenerationConfig(
                    temperature=0.1,
                    max_output_tokens=2000,
                    response_mime_type="application/json",
                ),
            )

            data = json.loads(response.text)
            return ExtractionResult(
                is_agent=data.get("is_agent", False),
                confidence=float(data.get("confidence", 0.0)),
                name=data.get("name"),
                description=data.get("description"),
                system_prompt=data.get("system_prompt"),
                tool_code=data.get("tool_code"),
                dependencies=data.get("dependencies", {}),
                required_keys=data.get("required_keys", []),
                category=data.get("category"),
                tags=data.get("tags", []),
                raw_response=response.text,
            )
        except Exception:
            return None

    async def _extract_ollama(self, content: str) -> Optional[ExtractionResult]:
        try:
            import httpx
            async with httpx.AsyncClient(timeout=60.0) as client:
                response = await client.post(
                    f"{self.settings.ollama_base_url}/api/generate",
                    json={
                        "model": "llama3.1:70b",
                        "prompt": self.EXTRACTION_PROMPT.format(content=content),
                        "format": "json",
                        "options": {"temperature": 0.1},
                    },
                )
                response.raise_for_status()
                data = json.loads(response.json()["response"])

            return ExtractionResult(
                is_agent=data.get("is_agent", False),
                confidence=float(data.get("confidence", 0.0)),
                name=data.get("name"),
                description=data.get("description"),
                system_prompt=data.get("system_prompt"),
                tool_code=data.get("tool_code"),
                dependencies=data.get("dependencies", {}),
                required_keys=data.get("required_keys", []),
                category=data.get("category"),
                tags=data.get("tags", []),
                raw_response=response.json()["response"],
            )
        except Exception:
            return None

    def _heuristic_extract(self, content: str, url: str) -> ExtractionResult:
        """Basic heuristic extraction when no LLM is available."""
        content_lower = content.lower()
        url_lower = url.lower()

        # Keywords that suggest agent/skill content
        agent_keywords = [
            "system prompt", "system_prompt", "assistant prompt",
            "agent", "tool", "function calling", "mcp server",
            "langchain", "autogen", "crewai", "openai assistant",
        ]

        score = sum(1 for kw in agent_keywords if kw in content_lower)
        is_agent = score >= 2

        # Try to extract name from URL or title
        name = None
        if "github.com" in url_lower:
            parts = url_lower.split("/")
            if len(parts) >= 5:
                name = parts[4].replace("-", " ").title()

        return ExtractionResult(
            is_agent=is_agent,
            confidence=min(score * 0.15, 0.6),
            name=name,
            description=content[:500] if is_agent else None,
            system_prompt=None,
            tool_code=None,
            dependencies={},
            required_keys=[],
            category=None,
            tags=[],
        )


class QualityScorer:
    """Score extracted agents for quality and completeness."""

    def score(self, extraction: ExtractionResult, crawl_metadata: dict = None) -> int:
        """Score from 0-100."""
        score = 0

        # Base confidence from extractor
        score += int(extraction.confidence * 30)

        # Completeness bonuses
        if extraction.name:
            score += 10
        if extraction.description and len(extraction.description) > 50:
            score += 10
        if extraction.system_prompt and len(extraction.system_prompt) > 100:
            score += 20
        if extraction.tool_code:
            score += 15
        if extraction.dependencies:
            score += 5
        if extraction.required_keys:
            score += 5
        if extraction.category:
            score += 5
        if extraction.tags:
            score += min(len(extraction.tags) * 2, 10)

        # Source quality
        if crawl_metadata:
            stars = crawl_metadata.get("stars", 0)
            if stars > 100:
                score += 10
            elif stars > 10:
                score += 5

            likes = crawl_metadata.get("likes", 0)
            if likes > 50:
                score += 5

        return min(score, 100)