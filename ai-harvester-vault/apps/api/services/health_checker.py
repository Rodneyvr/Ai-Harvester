import asyncio
import time
from dataclasses import dataclass
from typing import Optional
from uuid import UUID

import httpx

from ..core.database import get_session
from ..models import ApiCredential
from ..services.vault import VaultService
from sqlalchemy import select


@dataclass(slots=True)
class HealthCheckResult:
    credential_id: UUID
    provider: str
    is_valid: bool
    latency_ms: Optional[int]
    error: Optional[str]
    details: dict


class HealthChecker:
    """Check API key validity, latency, and quota for various providers."""

    PROVIDER_CONFIGS = {
        "openai": {
            "url": "https://api.openai.com/v1/models",
            "method": "GET",
            "headers": lambda key: {"Authorization": f"Bearer {key}"},
            "success_codes": [200],
        },
        "anthropic": {
            "url": "https://api.anthropic.com/v1/messages",
            "method": "POST",
            "headers": lambda key: {
                "x-api-key": key,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            },
            "json": lambda: {
                "model": "claude-3-haiku-20240307",
                "max_tokens": 1,
                "messages": [{"role": "user", "content": "Hi"}],
            },
            "success_codes": [200, 400],  # 400 = valid key but bad request
        },
        "groq": {
            "url": "https://api.groq.com/openai/v1/models",
            "method": "GET",
            "headers": lambda key: {"Authorization": f"Bearer {key}"},
            "success_codes": [200],
        },
        "google": {
            "url": "https://generativelanguage.googleapis.com/v1beta/models",
            "method": "GET",
            "params": lambda key: {"key": key},
            "success_codes": [200],
        },
        "serper": {
            "url": "https://google.serper.dev/account",
            "method": "GET",
            "headers": lambda key: {"X-API-KEY": key},
            "success_codes": [200],
        },
        "tavily": {
            "url": "https://api.tavily.com/usage",
            "method": "GET",
            "headers": lambda key: {"Authorization": f"Bearer {key}"},
            "success_codes": [200],
        },
        "github": {
            "url": "https://api.github.com/user",
            "method": "GET",
            "headers": lambda key: {"Authorization": f"token {key}"},
            "success_codes": [200],
        },
        "huggingface": {
            "url": "https://huggingface.co/api/whoami-v2",
            "method": "GET",
            "headers": lambda key: {"Authorization": f"Bearer {key}"},
            "success_codes": [200],
        },
    }

    def __init__(self, session=None):
        self.session = session
        self.vault = VaultService(session) if session else None
        self._client: Optional[httpx.AsyncClient] = None

    async def _get_client(self) -> httpx.AsyncClient:
        if self._client is None:
            self._client = httpx.AsyncClient(timeout=15.0)
        return self._client

    async def close(self):
        if self._client:
            await self._client.aclose()
            self._client = None

    async def check_credential(self, credential_id: UUID) -> HealthCheckResult:
        """Check a single credential."""
        if not self.vault:
            return HealthCheckResult(
                credential_id=credential_id,
                provider="unknown",
                is_valid=False,
                latency_ms=None,
                error="Vault service not available",
                details={},
            )

        reveal = await self.vault.reveal(credential_id)
        if not reveal:
            return HealthCheckResult(
                credential_id=credential_id,
                provider="unknown",
                is_valid=False,
                latency_ms=None,
                error="Credential not found",
                details={},
            )

        return await self.check_key(reveal.value, reveal.name)

    async def check_key(self, key: str, provider_hint: str = "") -> HealthCheckResult:
        """Check an API key against its provider."""
        provider = self._detect_provider(key, provider_hint)
        config = self.PROVIDER_CONFIGS.get(provider.lower())

        if not config:
            return HealthCheckResult(
                credential_id=UUID(int=0),
                provider=provider,
                is_valid=False,
                latency_ms=None,
                error=f"No health check config for provider: {provider}",
                details={},
            )

        client = await self._get_client()
        start = time.perf_counter()

        try:
            headers = config["headers"](key) if "headers" in config else {}
            params = config["params"](key) if "params" in config else {}
            json_data = config["json"]() if "json" in config else None

            response = await client.request(
                method=config["method"],
                url=config["url"],
                headers=headers,
                params=params,
                json=json_data,
            )

            latency_ms = int((time.perf_counter() - start) * 1000)
            is_valid = response.status_code in config.get("success_codes", [200])

            details = {
                "status_code": response.status_code,
                "response_time_ms": latency_ms,
            }

            # Try to extract quota info
            if is_valid:
                details.update(self._parse_quota_info(provider, response))

            return HealthCheckResult(
                credential_id=UUID(int=0),
                provider=provider,
                is_valid=is_valid,
                latency_ms=latency_ms,
                error=None if is_valid else f"HTTP {response.status_code}",
                details=details,
            )

        except httpx.TimeoutException:
            return HealthCheckResult(
                credential_id=UUID(int=0),
                provider=provider,
                is_valid=False,
                latency_ms=None,
                error="Request timeout",
                details={},
            )
        except Exception as e:
            return HealthCheckResult(
                credential_id=UUID(int=0),
                provider=provider,
                is_valid=False,
                latency_ms=None,
                error=str(e),
                details={},
            )

    async def check_multiple(self, credential_ids: list[UUID]) -> list[HealthCheckResult]:
        """Check multiple credentials concurrently."""
        tasks = [self.check_credential(cid) for cid in credential_ids]
        return await asyncio.gather(*tasks)

    async def check_all(self) -> list[HealthCheckResult]:
        """Check all credentials in vault."""
        if not self.vault:
            return []

        creds, _ = await self.vault.list(page_size=1000)
        return await self.check_multiple([c.id for c in creds])

    def _detect_provider(self, key: str, hint: str) -> str:
        """Detect provider from key format or hint."""
        hint_lower = hint.lower()
        key_lower = key.lower()

        if "openai" in hint_lower or key_lower.startswith("sk-"):
            return "openai"
        if "anthropic" in hint_lower or key_lower.startswith("sk-ant-"):
            return "anthropic"
        if "groq" in hint_lower or key_lower.startswith("gsk_"):
            return "groq"
        if "google" in hint_lower or "gemini" in hint_lower or key_lower.startswith("ai"):
            return "google"
        if "serper" in hint_lower:
            return "serper"
        if "tavily" in hint_lower or key_lower.startswith("tvly-"):
            return "tavily"
        if "github" in hint_lower or key_lower.startswith("ghp_") or key_lower.startswith("github_"):
            return "github"
        if "huggingface" in hint_lower or key_lower.startswith("hf_"):
            return "huggingface"

        return "unknown"

    def _parse_quota_info(self, provider: str, response: httpx.Response) -> dict:
        """Extract quota/rate limit info from response."""
        details = {}
        try:
            data = response.json()

            if provider == "serper":
                details["credits_remaining"] = data.get("credits", 0)
                details["plan"] = data.get("plan", "unknown")
            elif provider == "tavily":
                details["credits_used"] = data.get("usage", {}).get("credits_used", 0)
                details["credits_limit"] = data.get("usage", {}).get("credits_limit", 0)
            elif provider == "github":
                details["rate_limit_remaining"] = response.headers.get("X-RateLimit-Remaining")
                details["rate_limit_reset"] = response.headers.get("X-RateLimit-Reset")
            elif provider == "openai":
                details["rate_limit_remaining"] = response.headers.get("X-RateLimit-Remaining-Requests")
        except Exception:
            pass

        return details