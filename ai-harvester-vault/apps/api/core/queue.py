import json
from dataclasses import dataclass
from typing import Any, Generic, Optional, TypeVar

import redis.asyncio as redis
from redis.asyncio import Redis

from .config import get_settings


T = TypeVar("T")


@dataclass(slots=True)
class QueueMessage(Generic[T]):
    id: str
    payload: T
    attempts: int = 0


class QueueService:
    """Upstash Redis-based queue for background jobs."""

    def __init__(self, redis_url: Optional[str] = None):
        settings = get_settings()
        self._redis_url = redis_url or settings.redis_url
        self._client: Optional[Redis] = None

    async def _get_client(self) -> Redis:
        if self._client is None:
            self._client = redis.from_url(
                self._redis_url, encoding="utf-8", decode_responses=True
            )
        return self._client

    async def close(self) -> None:
        if self._client:
            await self._client.close()
            self._client = None

    async def enqueue(self, queue_name: str, payload: dict[str, Any], priority: int = 0) -> str:
        """Add a job to the queue with optional priority (higher = more urgent)."""
        client = await self._get_client()
        job_id = f"{queue_name}:{payload.get('url', 'job')}:{hash(str(payload))}"
        message = {"id": job_id, "payload": payload, "attempts": 0}
        # Use sorted set for priority queue (score = -priority for max-heap behavior)
        await client.zadd(f"queue:{queue_name}", {json.dumps(message): -priority})
        return job_id

    async def dequeue(self, queue_name: str, count: int = 1) -> list[dict[str, Any]]:
        """Pop highest priority jobs from the queue."""
        client = await self._get_client()
        key = f"queue:{queue_name}"
        # Get and remove highest priority items
        items = await client.zpopmax(key, count=count)
        results = []
        for item, score in items:
            data = json.loads(item)
            data["priority"] = -score
            results.append(data)
        return results

    async def requeue(self, queue_name: str, message: dict[str, Any], priority: Optional[int] = None) -> None:
        """Requeue a message (e.g., after failure with incremented attempts)."""
        message["attempts"] = message.get("attempts", 0) + 1
        p = priority if priority is not None else message.get("priority", 0)
        await self.enqueue(queue_name, message["payload"], p)

    async def queue_size(self, queue_name: str) -> int:
        """Get number of pending jobs in queue."""
        client = await self._get_client()
        return await client.zcard(f"queue:{queue_name}")

    async def clear_queue(self, queue_name: str) -> int:
        """Clear all jobs from a queue."""
        client = await self._get_client()
        return await client.delete(f"queue:{queue_name}")


# Queue names
class Queues:
    CRAWL = "crawl"
    EXTRACT = "extract"
    NORMALIZE = "normalize"
    HEALTH_CHECK = "health_check"


# Singleton
_queue_service: Optional[QueueService] = None


def get_queue_service() -> QueueService:
    global _queue_service
    if _queue_service is None:
        _queue_service = QueueService()
    return _queue_service