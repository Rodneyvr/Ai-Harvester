from typing import Optional
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from pydantic import BaseModel, HttpUrl
from sqlalchemy import select, func
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.database import get_session
from ..core.queue import get_queue_service, Queues
from ..models import CrawlQueue, ScrapeLog, Agent
from ..services.harvester import (
    DiscoveryService,
    CrawlerService,
    LLMExtractor,
    QualityScorer,
    NormalizerService,
    SecurityScanner,
)

router = APIRouter(prefix="/harvester", tags=["harvester"])


class CrawlRequest(BaseModel):
    url: HttpUrl
    source_type: str = "manual"
    priority: int = 0


class AutoDiscoverRequest(BaseModel):
    max_per_source: int = 20
    sources: Optional[list[str]] = None  # ["github", "huggingface", "search", "mcp"]


class CrawlStatusResponse(BaseModel):
    queue_id: UUID
    url: str
    status: str
    attempts: int
    error: Optional[str]
    discovered_at: str


@router.post("/crawl", response_model=CrawlStatusResponse, status_code=202)
async def queue_crawl(
    request: CrawlRequest,
    background_tasks: BackgroundTasks,
    session: AsyncSession = Depends(get_session),
):
    """Queue a URL for crawling."""
    queue_item = CrawlQueue(
        url=str(request.url),
        source_type=request.source_type,
        priority=request.priority,
    )
    session.add(queue_item)
    await session.flush()
    await session.refresh(queue_item)

    # Add to queue
    queue = get_queue_service()
    await queue.enqueue(Queues.CRAWL, {"queue_id": str(queue_item.id), "url": str(request.url)}, request.priority)

    return CrawlStatusResponse(
        queue_id=queue_item.id,
        url=queue_item.url,
        status=queue_item.status.value,
        attempts=queue_item.attempts,
        error=queue_item.error,
        discovered_at=queue_item.discovered_at.isoformat(),
    )


@router.post("/auto-discover", status_code=202)
async def auto_discover(
    request: AutoDiscoverRequest,
    background_tasks: BackgroundTasks,
    session: AsyncSession = Depends(get_session),
):
    """Run auto-discovery across all sources."""
    discovery = DiscoveryService()
    try:
        urls = await discovery.run_auto_discovery(request.max_per_source)

        queue = get_queue_service()
        count = 0
        for url_obj in urls:
            queue_item = CrawlQueue(
                url=url_obj.url,
                source_type=url_obj.source,
                priority=url_obj.priority,
            )
            session.add(queue_item)
            await session.flush()

            await queue.enqueue(
                Queues.CRAWL,
                {"queue_id": str(queue_item.id), "url": url_obj.url},
                url_obj.priority,
            )
            count += 1

        await session.commit()
        return {"discovered": count, "queued": count}
    finally:
        await discovery.close()


@router.get("/queue", response_model=list[CrawlStatusResponse])
async def get_crawl_queue(
    status: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    session: AsyncSession = Depends(get_session),
):
    """Get crawl queue status."""
    query = select(CrawlQueue).order_by(CrawlQueue.priority.desc(), CrawlQueue.discovered_at.desc())
    if status:
        query = query.where(CrawlQueue.status == status)
    query = query.limit(limit)

    result = await session.execute(query)
    items = result.scalars().all()

    return [
        CrawlStatusResponse(
            queue_id=item.id,
            url=item.url,
            status=item.status.value,
            attempts=item.attempts,
            error=item.error,
            discovered_at=item.discovered_at.isoformat(),
        )
        for item in items
    ]


@router.get("/queue/stats")
async def get_queue_stats(session: AsyncSession = Depends(get_session)):
    """Get queue statistics."""
    total = await session.execute(select(func.count(CrawlQueue.id)))
    pending = await session.execute(
        select(func.count(CrawlQueue.id)).where(CrawlQueue.status == "pending")
    )
    running = await session.execute(
        select(func.count(CrawlQueue.id)).where(CrawlQueue.status == "running")
    )
    done = await session.execute(
        select(func.count(CrawlQueue.id)).where(CrawlQueue.status == "done")
    )
    failed = await session.execute(
        select(func.count(CrawlQueue.id)).where(CrawlQueue.status == "failed")
    )

    queue = get_queue_service()
    queue_sizes = {}
    for q in [Queues.CRAWL, Queues.EXTRACT, Queues.NORMALIZE]:
        queue_sizes[q] = await queue.queue_size(q)

    return {
        "total": total.scalar(),
        "pending": pending.scalar(),
        "running": running.scalar(),
        "done": done.scalar(),
        "failed": failed.scalar(),
        "queue_sizes": queue_sizes,
    }


@router.get("/logs")
async def get_scrape_logs(
    queue_id: Optional[UUID] = Query(None),
    agent_id: Optional[UUID] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    session: AsyncSession = Depends(get_session),
):
    """Get scrape logs."""
    query = select(ScrapeLog).order_by(ScrapeLog.created_at.desc())
    if queue_id:
        query = query.where(ScrapeLog.queue_id == queue_id)
    if agent_id:
        query = query.where(ScrapeLog.agent_id == agent_id)
    query = query.limit(limit)

    result = await session.execute(query)
    logs = result.scalars().all()

    return [
        {
            "id": str(log.id),
            "queue_id": str(log.queue_id) if log.queue_id else None,
            "agent_id": str(log.agent_id) if log.agent_id else None,
            "url": log.url,
            "status": log.status,
            "error": log.error,
            "latency_ms": log.latency_ms,
            "tokens_used": log.tokens_used,
            "created_at": log.created_at.isoformat(),
        }
        for log in logs
    ]


@router.post("/process-queue")
async def process_queue(
    background_tasks: BackgroundTasks,
    max_items: int = Query(10, ge=1, le=50),
    session: AsyncSession = Depends(get_session),
):
    """Manually trigger queue processing (for testing)."""
    # This would normally be a background worker
    # For now, return info about what would be processed
    queue = get_queue_service()
    items = await queue.dequeue(Queues.CRAWL, max_items)
    return {"would_process": len(items), "items": items}


# Background worker functions (to be run as separate processes)
async def crawl_worker(queue_id: UUID, url: str):
    """Background worker to crawl a URL."""
    async with get_session() as session:
        # Update status
        queue_item = await session.get(CrawlQueue, queue_id)
        if not queue_item:
            return
        queue_item.status = "running"
        queue_item.started_at = func.now()
        queue_item.attempts += 1
        await session.commit()

        try:
            crawler = CrawlerService()
            await crawler.initialize()

            result = await crawler.crawl(url, use_playwright=False)
            await crawler.close()

            # Log result
            log = ScrapeLog(
                queue_id=queue_id,
                url=url,
                status="success" if result.success else "failed",
                extracted_data={"markdown": result.markdown} if result.markdown else None,
                error=result.error,
                latency_ms=result.latency_ms,
            )
            session.add(log)

            if result.success and result.markdown:
                # Queue for extraction
                q = get_queue_service()
                await q.enqueue(Queues.EXTRACT, {
                    "queue_id": str(queue_id),
                    "url": url,
                    "content": result.markdown,
                    "content_hash": result.content_hash,
                    "metadata": {"platform": "web", "source": "crawl"},
                })

            queue_item.status = "done"
            queue_item.completed_at = func.now()
        except Exception as e:
            queue_item.status = "failed"
            queue_item.error = str(e)
            queue_item.completed_at = func.now()

        await session.commit()


async def extract_worker(payload: dict):
    """Background worker to extract agent info from content."""
    async with get_session() as session:
        try:
            extractor = LLMExtractor()
            extraction = await extractor.extract(payload["content"], payload["url"])
            await extractor.close()  # if needed

            if not extraction.is_agent or extraction.confidence < 0.3:
                return

            # Score quality
            scorer = QualityScorer()
            quality = scorer.score(extraction, payload.get("metadata", {}))

            # Security scan
            scanner = SecurityScanner()
            scan = scanner.scan(extraction)

            if not scan.is_safe:
                # Log but continue (could be false positive)
                pass

            # Normalize and store
            normalizer = NormalizerService(session)
            normalized = await normalizer.normalize(extraction, payload.get("metadata"), payload["url"])

            agent = await normalizer.upsert_agent(normalized, quality)

            # Log extraction
            log = ScrapeLog(
                queue_id=UUID(payload["queue_id"]) if payload.get("queue_id") else None,
                agent_id=agent.id,
                url=payload["url"],
                status="extracted",
                extracted_data={
                    "name": extraction.name,
                    "confidence": extraction.confidence,
                    "quality_score": quality,
                    "scan_safe": scan.is_safe,
                },
            )
            session.add(log)
            await session.commit()

        except Exception as e:
            # Log error
            pass


async def run_workers():
    """Main worker loop - run as separate process."""
    queue = get_queue_service()

    while True:
        # Process crawl queue
        crawl_items = await queue.dequeue(Queues.CRAWL, 5)
        for item in crawl_items:
            await crawl_worker(UUID(item["id"]), item["payload"]["url"])

        # Process extraction queue
        extract_items = await queue.dequeue(Queues.EXTRACT, 5)
        for item in extract_items:
            await extract_worker(item["payload"])

        await asyncio.sleep(2)