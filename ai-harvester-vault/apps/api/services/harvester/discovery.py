import hashlib
import re
from dataclasses import dataclass
from typing import Optional
from urllib.parse import urlparse

import httpx
from tenacity import retry, stop_after_attempt, wait_exponential

from ..core.config import get_settings


@dataclass(slots=True)
class DiscoveredURL:
    url: str
    source: str
    platform: str
    priority: int = 0
    metadata: Optional[dict] = None


class DiscoveryService:
    """Multi-source discovery for agent/skill URLs."""

    GITHUB_SEARCH_QUERIES = [
        "topic:agent language:python",
        "topic:mcp language:python",
        "topic:langchain language:python",
        "topic:autogen language:python",
        "topic:crewai language:python",
        "awesome-agents",
        "awesome-mcp-servers",
        "system-prompt agent",
    ]

    HUGGINGFACE_QUERIES = [
        "agent",
        "mcp-server",
        "langchain-tool",
        "autogen-agent",
    ]

    def __init__(self):
        self.settings = get_settings()
        self._client: Optional[httpx.AsyncClient] = None

    async def _get_client(self) -> httpx.AsyncClient:
        if self._client is None:
            self._client = httpx.AsyncClient(timeout=30.0)
        return self._client

    async def close(self) -> None:
        if self._client:
            await self._client.aclose()
            self._client = None

    @retry(wait=wait_exponential(multiplier=1, min=2, max=10), stop=stop_after_attempt(3))
    async def search_serper(self, query: str, num_results: int = 10) -> list[DiscoveredURL]:
        """Search via Serper.dev (Google search API)."""
        if not self.settings.serper_api_key:
            return []

        client = await self._get_client()
        response = await client.post(
            "https://google.serper.dev/search",
            headers={"X-API-KEY": self.settings.serper_api_key, "Content-Type": "application/json"},
            json={"q": query, "num": num_results},
        )
        response.raise_for_status()
        data = response.json()

        results = []
        for item in data.get("organic", []):
            url = item.get("link", "")
            if url:
                results.append(DiscoveredURL(
                    url=url,
                    source="serper",
                    platform=self._detect_platform(url),
                    priority=5,
                    metadata={"title": item.get("title"), "snippet": item.get("snippet")},
                ))
        return results

    @retry(wait=wait_exponential(multiplier=1, min=2, max=10), stop=stop_after_attempt(3))
    async def search_tavily(self, query: str, num_results: int = 10) -> list[DiscoveredURL]:
        """Search via Tavily API."""
        if not self.settings.tavily_api_key:
            return []

        client = await self._get_client()
        response = await client.post(
            "https://api.tavily.com/search",
            json={"api_key": self.settings.tavily_api_key, "query": query, "max_results": num_results},
        )
        response.raise_for_status()
        data = response.json()

        results = []
        for item in data.get("results", []):
            url = item.get("url", "")
            if url:
                results.append(DiscoveredURL(
                    url=url,
                    source="tavily",
                    platform=self._detect_platform(url),
                    priority=5,
                    metadata={"title": item.get("title"), "content": item.get("content")},
                ))
        return results

    async def search_github(self, query: str, num_results: int = 30) -> list[DiscoveredURL]:
        """Search GitHub repositories."""
        client = await self._get_client()
        headers = {"Accept": "application/vnd.github.v3+json"}
        if self.settings.github_token:
            headers["Authorization"] = f"token {self.settings.github_token}"

        params = {"q": query, "sort": "stars", "order": "desc", "per_page": num_results}
        response = await client.get("https://api.github.com/search/repositories", headers=headers, params=params)
        response.raise_for_status()
        data = response.json()

        results = []
        for item in data.get("items", []):
            url = item.get("html_url", "")
            if url:
                results.append(DiscoveredURL(
                    url=url,
                    source="github",
                    platform="github",
                    priority=10,
                    metadata={
                        "stars": item.get("stargazers_count"),
                        "description": item.get("description"),
                        "language": item.get("language"),
                        "topics": item.get("topics", []),
                    },
                ))
        return results

    async def search_huggingface(self, query: str, num_results: int = 20) -> list[DiscoveredURL]:
        """Search Hugging Face Spaces and Models."""
        client = await self._get_client()

        # Search Spaces
        response = await client.get(
            "https://huggingface.co/api/spaces",
            params={"search": query, "limit": num_results, "sort": "likes", "direction": -1},
        )
        response.raise_for_status()
        spaces = response.json()

        results = []
        for item in spaces:
            url = f"https://huggingface.co/spaces/{item.get('id', '')}"
            results.append(DiscoveredURL(
                url=url,
                source="huggingface",
                platform="huggingface",
                priority=8,
                metadata={
                    "likes": item.get("likes", 0),
                    "tags": item.get("tags", []),
                    "sdk": item.get("sdk"),
                },
            ))

        # Search Models
        response = await client.get(
            "https://huggingface.co/api/models",
            params={"search": query, "limit": num_results, "sort": "downloads", "direction": -1},
        )
        response.raise_for_status()
        models = response.json()

        for item in models:
            url = f"https://huggingface.co/{item.get('id', '')}"
            results.append(DiscoveredURL(
                url=url,
                source="huggingface",
                platform="huggingface",
                priority=6,
                metadata={
                    "downloads": item.get("downloads", 0),
                    "tags": item.get("tags", []),
                    "pipeline_tag": item.get("pipeline_tag"),
                },
            ))

        return results

    async def discover_mcp_registry(self) -> list[DiscoveredURL]:
        """Discover MCP servers from official registry."""
        client = await self._get_client()

        # Official MCP servers list
        urls = [
            "https://github.com/modelcontextprotocol/servers",
            "https://github.com/modelcontextprotocol/servers/tree/main/src",
        ]

        results = []
        for url in urls:
            results.append(DiscoveredURL(
                url=url,
                source="mcp_registry",
                platform="mcp",
                priority=15,
            ))

        # Try to fetch the registry index
        try:
            response = await client.get("https://raw.githubusercontent.com/modelcontextprotocol/servers/main/README.md")
            if response.status_code == 200:
                # Parse markdown for server links
                import re
                links = re.findall(r'https?://github\.com/[^\s\)]+', response.text)
                for link in links[:50]:
                    results.append(DiscoveredURL(
                        url=link,
                        source="mcp_registry",
                        platform="mcp",
                        priority=12,
                    ))
        except Exception:
            pass

        return results

    async def run_auto_discovery(self, max_per_source: int = 20) -> list[DiscoveredURL]:
        """Run comprehensive auto-discovery across all sources."""
        all_results = []

        # Search engine queries
        search_queries = [
            "MCP server system prompt",
            "LangChain tool schema",
            "AutoGen agent template",
            "CrewAI agent example",
            "OpenAI Assistant system prompt",
            "AI agent framework Python",
        ]

        if self.settings.has_search_api:
            for query in search_queries:
                if self.settings.serper_api_key:
                    results = await self.search_serper(query, max_per_source)
                    all_results.extend(results)
                if self.settings.tavily_api_key:
                    results = await self.search_tavily(query, max_per_source)
                    all_results.extend(results)

        # GitHub searches
        for query in self.GITHUB_SEARCH_QUERIES:
            results = await self.search_github(query, max_per_source)
            all_results.extend(results)

        # Hugging Face
        for query in self.HUGGINGFACE_QUERIES:
            results = await self.search_huggingface(query, max_per_source)
            all_results.extend(results)

        # MCP Registry
        results = await self.discover_mcp_registry()
        all_results.extend(results)

        # Deduplicate by URL
        seen = set()
        unique = []
        for r in all_results:
            if r.url not in seen:
                seen.add(r.url)
                unique.append(r)

        return unique

    def _detect_platform(self, url: str) -> str:
        """Detect platform from URL."""
        domain = urlparse(url).netloc.lower()
        if "github.com" in domain:
            return "github"
        elif "gitlab.com" in domain:
            return "gitlab"
        elif "bitbucket.org" in domain:
            return "bitbucket"
        elif "huggingface.co" in domain:
            return "huggingface"
        elif "npmjs.com" in domain or "npm.im" in domain:
            return "npm"
        elif "pypi.org" in domain:
            return "pypi"
        elif "modelcontextprotocol" in domain:
            return "mcp"
        return "web"

    def generate_content_hash(self, content: str) -> str:
        """Generate SHA-256 hash for deduplication."""
        return hashlib.sha256(content.encode()).hexdigest()