from datetime import datetime
from typing import Any, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, HttpUrl


class AgentBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = None
    source_url: HttpUrl
    platform: str = Field(..., pattern="^(github|huggingface|mcp|web|gitlab|bitbucket|npm|pypi|other)$")
    category: Optional[str] = Field(None, max_length=100)
    tags: list[str] = Field(default_factory=list)
    system_prompt: Optional[str] = None
    tool_code: Optional[str] = None
    dependencies: dict[str, Any] = Field(default_factory=dict)
    required_keys: list[str] = Field(default_factory=list)


class AgentCreate(AgentBase):
    quality_score: int = Field(default=0, ge=0, le=100)
    content_hash: Optional[str] = Field(None, pattern="^[a-f0-9]{64}$")
    embedding: Optional[list[float]] = None


class AgentUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    description: Optional[str] = None
    category: Optional[str] = Field(None, max_length=100)
    tags: Optional[list[str]] = None
    system_prompt: Optional[str] = None
    tool_code: Optional[str] = None
    dependencies: Optional[dict[str, Any]] = None
    required_keys: Optional[list[str]] = None
    quality_score: Optional[int] = Field(None, ge=0, le=100)
    is_verified: Optional[bool] = None


class AgentResponse(AgentBase):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    quality_score: int
    content_hash: Optional[str]
    embedding: Optional[list[float]]
    version: int
    is_verified: bool
    scanned_at: datetime
    created_at: datetime
    updated_at: datetime


class AgentListResponse(BaseModel):
    agents: list[AgentResponse]
    total: int
    page: int
    page_size: int


class SkillBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = None
    code: Optional[str] = None
    language: Optional[str] = Field(None, max_length=50)
    entry_point: Optional[str] = Field(None, max_length=255)
    config_schema: dict[str, Any] = Field(default_factory=dict)


class SkillCreate(SkillBase):
    agent_id: UUID


class SkillUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    description: Optional[str] = None
    code: Optional[str] = None
    language: Optional[str] = Field(None, max_length=50)
    entry_point: Optional[str] = Field(None, max_length=255)
    config_schema: Optional[dict[str, Any]] = None


class SkillResponse(SkillBase):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    agent_id: UUID
    created_at: datetime


class CredentialBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    provider: str = Field(..., min_length=1, max_length=100)
    category: Optional[str] = Field(None, max_length=100)
    tags: list[str] = Field(default_factory=list)
    environment: str = Field(default="development", pattern="^(production|development|free-tier)$")
    metadata: dict[str, Any] = Field(default_factory=dict)


class CredentialCreate(CredentialBase):
    value: str = Field(..., min_length=1, description="Plaintext secret value (will be encrypted)")


class CredentialUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    provider: Optional[str] = Field(None, min_length=1, max_length=100)
    category: Optional[str] = Field(None, max_length=100)
    tags: Optional[list[str]] = None
    environment: Optional[str] = Field(None, pattern="^(production|development|free-tier)$")
    metadata: Optional[dict[str, Any]] = None
    value: Optional[str] = Field(None, min_length=1, description="New plaintext secret value")


class CredentialResponse(CredentialBase):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    created_at: datetime
    updated_at: datetime
    last_verified_at: Optional[datetime]
    is_valid: Optional[bool]

    # Never include encrypted value in response


class CredentialRevealResponse(BaseModel):
    id: UUID
    name: str
    value: str  # Decrypted value - handle with care!


class CrawlQueueBase(BaseModel):
    url: HttpUrl
    source_type: Optional[str] = Field(None, max_length=50)
    priority: int = Field(default=0, ge=0)


class CrawlQueueCreate(CrawlQueueBase):
    pass


class CrawlQueueResponse(CrawlQueueBase):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    status: str
    attempts: int
    error: Optional[str]
    discovered_at: datetime
    started_at: Optional[datetime]
    completed_at: Optional[datetime]


class ScrapeLogResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    queue_id: Optional[UUID]
    agent_id: Optional[UUID]
    url: Optional[str]
    status: Optional[str]
    extracted_data: Optional[dict[str, Any]]
    error: Optional[str]
    latency_ms: Optional[int]
    tokens_used: Optional[int]
    created_at: datetime


class SearchRequest(BaseModel):
    query: str = Field(..., min_length=1, max_length=500)
    platform: Optional[str] = None
    category: Optional[str] = None
    tags: Optional[list[str]] = None
    min_quality: int = Field(default=0, ge=0, le=100)
    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=20, ge=1, le=100)


class SemanticSearchRequest(BaseModel):
    query: str = Field(..., min_length=1, max_length=500)
    limit: int = Field(default=10, ge=1, le=50)
    min_similarity: float = Field(default=0.7, ge=0.0, le=1.0)


class ExportRequest(BaseModel):
    agent_ids: list[UUID]
    format: str = Field(..., pattern="^(python|typescript|docker|mcp|env)$")
    include_credentials: bool = False


class HealthCheckRequest(BaseModel):
    credential_ids: Optional[list[UUID]] = None
    provider: Optional[str] = None


class StatsResponse(BaseModel):
    total_agents: int
    total_skills: int
    total_credentials: int
    pending_crawls: int
    storage_used_mb: float
    storage_limit_mb: float
    agents_by_platform: dict[str, int]
    agents_by_category: dict[str, int]