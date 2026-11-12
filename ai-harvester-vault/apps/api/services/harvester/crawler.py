import asyncio
import hashlib
import random
from dataclasses import dataclass
from typing import Optional
from urllib.parse import urljoin, urlparse

from crawl4ai import AsyncWebCrawler, BrowserConfig, CrawlerRunConfig
from playwright.async_api import async_playwright

from ..core.config import get_settings


@dataclass(slots=True)
class CrawlResult:
    url: str
    success: bool
    markdown: Optional[str] = None
    html: Optional[str] = None
    links: list[str] = None
    error: Optional[str] = None
    latency_ms: int = 0
    content_hash: Optional[str] = None


class CrawlerService:
    """Web crawler using Crawl4AI and Playwright for JS-heavy sites."""

    def __init__(self):
        self.settings = get_settings()
        self._crawl4ai: Optional[AsyncWebCrawler] = None
        self._playwright = None
        self._browser = None
        self._semaphore = asyncio.Semaphore(3)  # Max 3 concurrent

    async def initialize(self) -> None:
        """Initialize crawler engines."""
        # Crawl4AI for fast markdown extraction
        browser_config = BrowserConfig(
            headless=True,
            verbose=False,
            browser_type="chromium",
        )
        self._crawl4ai = AsyncWebCrawler(config=browser_config)
        await self._crawl4ai.start()

        # Playwright for complex interactions
        self._playwright = await async_playwright().start()
        self._browser = await self._playwright.chromium.launch(headless=True)

    async def close(self) -> None:
        """Clean up resources."""
        if self._crawl4ai:
            await self._crawl4ai.close()
        if self._browser:
            await self._browser.close()
        if self._playwright:
            await self._playwright.stop()

    async def crawl(self, url: str, use_playwright: bool = False) -> CrawlResult:
        """Crawl a URL and extract content."""
        import time
        start = time.perf_counter()

        async with self._semaphore:
            # Add polite delay
            await asyncio.sleep(random.uniform(0.5, 1.5))

            try:
                if use_playwright:
                    result = await self._crawl_playwright(url)
                else:
                    result = await self._crawl_crawl4ai(url)

                result.latency_ms = int((time.perf_counter() - start) * 1000)
                if result.markdown:
                    result.content_hash = hashlib.sha256(result.markdown.encode()).hexdigest()
                return result

            except Exception as e:
                return CrawlResult(
                    url=url,
                    success=False,
                    error=str(e),
                    latency_ms=int((time.perf_counter() - start) * 1000),
                )

    async def _crawl_crawl4ai(self, url: str) -> CrawlResult:
        """Crawl using Crawl4AI (fast, good markdown)."""
        run_config = CrawlerRunConfig(
            word_count_threshold=10,
            extraction_strategy="NoExtractionStrategy",
            chunking_strategy="RegexChunking",
            css_selector=None,
            screenshot=False,
            pdf=False,
        )

        result = await self._crawl4ai.arun(url=url, config=run_config)

        if result.success:
            links = []
            if result.links:
                for link in result.links.get("internal", []):
                    links.append(link["href"])
                for link in result.links.get("external", []):
                    links.append(link["href"])

            return CrawlResult(
                url=url,
                success=True,
                markdown=result.markdown,
                html=result.html,
                links=links[:100],  # Limit links
            )
        else:
            return CrawlResult(
                url=url,
                success=False,
                error=result.error_message,
            )

    async def _crawl_playwright(self, url: str) -> CrawlResult:
        """Crawl using Playwright (for JS-heavy sites)."""
        context = await self._browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            viewport={"width": 1280, "height": 720},
        )
        page = await context.new_page()

        try:
            # Navigate with timeout
            await page.goto(url, wait_until="networkidle", timeout=30000)

            # Wait for content
            await page.wait_for_timeout(2000)

            # Try to get markdown via readability
            content = await page.evaluate("""() => {
                const article = document.querySelector('article, main, .content, #content, .post, .markdown-body');
                return article ? article.innerText : document.body.innerText;
            }""")

            # Get all links
            links = await page.evaluate("""() => {
                return Array.from(document.querySelectorAll('a[href]')).map(a => a.href);
            }""")

            return CrawlResult(
                url=url,
                success=True,
                markdown=content[:50000] if content else None,  # Limit size
                links=links[:100],
            )

        except Exception as e:
            return CrawlResult(url=url, success=False, error=str(e))
        finally:
            await context.close()

    async def extract_links(self, url: str, max_depth: int = 1) -> list[str]:
        """Extract links from a page for recursive crawling."""
        result = await self.crawl(url)
        if not result.success or not result.links:
            return []

        base_domain = urlparse(url).netloc
        filtered = []

        for link in result.links:
            try:
                parsed = urlparse(link)
                # Only same domain for recursive
                if parsed.netloc == base_domain or not parsed.netloc:
                    full_url = urljoin(url, link)
                    filtered.append(full_url)
            except Exception:
                continue

        return list(set(filtered))[:50]


class GitHubCrawler:
    """Specialized crawler for GitHub repositories."""

    def __init__(self):
        self.settings = get_settings()
        self._client = None

    async def _get_client(self):
        import httpx
        if self._client is None:
            headers = {"Accept": "application/vnd.github.v3+json"}
            if self.settings.github_token:
                headers["Authorization"] = f"token {self.settings.github_token}"
            self._client = httpx.AsyncClient(headers=headers, timeout=30.0)
        return self._client

    async def close(self):
        if self._client:
            await self._client.aclose()

    async def get_repo_contents(self, owner: str, repo: str, path: str = "") -> list[dict]:
        """Get repository contents."""
        client = await self._get_client()
        response = await client.get(f"https://api.github.com/repos/{owner}/{repo}/contents/{path}")
        response.raise_for_status()
        return response.json()

    async def get_file_content(self, owner: str, repo: str, path: str) -> Optional[str]:
        """Get file content from GitHub."""
        client = await self._get_client()
        response = await client.get(
            f"https://api.github.com/repos/{owner}/{repo}/contents/{path}",
            headers={"Accept": "application/vnd.github.v3.raw"},
        )
        if response.status_code == 200:
            return response.text
        return None

    async def find_agent_files(self, owner: str, repo: str) -> list[dict]:
        """Find potential agent/skill files in a repo."""
        important_files = [
            "README.md", "readme.md",
            "system_prompt.txt", "system_prompt.md",
            "prompt.txt", "prompt.md",
            "agent.py", "agent.js", "agent.ts",
            "skill.py", "skill.js", "skill.ts",
            "tools.py", "tools.json",
            "mcp.json", "manifest.json",
            "config.yaml", "config.yml",
        ]

        found = []
        for filename in important_files:
            content = await self.get_file_content(owner, repo, filename)
            if content:
                found.append({"path": filename, "content": content})

        # Also check root directory
        try:
            contents = await self.get_repo_contents(owner, repo)
            for item in contents:
                if item["type"] == "file" and item["name"].endswith((".py", ".js", ".ts", ".json", ".md", ".txt", ".yaml", ".yml")):
                    if any(kw in item["name"].lower() for kw in ["agent", "skill", "tool", "prompt", "mcp", "config"]):
                        content = await self.get_file_content(owner, repo, item["path"])
                        if content:
                            found.append({"path": item["path"], "content": content})
        except Exception:
            pass

        return found