"""
Crawler service — Playwright/Crawl4AI web crawling.

Re-exports from apps/api/services/harvester/crawler.py.
"""

from apps.api.services.harvester.crawler import (  # noqa: F401
    CrawlerService,
    CrawlResult,
    GitHubCrawler,
)