import enum
import uuid
from datetime import datetime
from typing import Any, Optional

from sqlalchemy import (
    JSON,
    UUID,
    Boolean,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import BYTEA, ARRAY
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


class AgentPlatform(str, enum.Enum):
    GITHUB = "github"
    HUGGINGFACE = "huggingface"
    MCP = "mcp"
    WEB = "web"
    GITLAB = "gitlab"
    BITBUCKET = "bitbucket"
    NPM = "npm"
    PYPI = "pypi"
    OTHER = "other"


class CrawlStatus(str, enum.Enum):
    PENDING = "pending"
    RUNNING = "running"
    DONE = "done"
    FAILED = "failed"


class CredentialEnvironment(str, enum.Enum):
    PRODUCTION = "production"
    DEVELOPMENT = "development"
    FREE_TIER = "free-tier"


class Agent(Base):
    __tablename__ = "agents"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    source_url: Mapped[str] = mapped_column(String(500), unique=True, nullable=False)
    platform: Mapped[AgentPlatform] = mapped_column(
        Enum(AgentPlatform, native_enum=False), nullable=False, default=AgentPlatform.OTHER
    )
    category: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    tags: Mapped[list[str]] = mapped_column(ARRAY(String), default=list)
    system_prompt: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    tool_code: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    dependencies: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    required_keys: Mapped[list[str]] = mapped_column(ARRAY(String), default=list)
    quality_score: Mapped[int] = mapped_column(Integer, default=0)
    content_hash: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    embedding: Mapped[Optional[list[float]]] = mapped_column(JSON, nullable=True)
    version: Mapped[int] = mapped_column(Integer, default=1)
    is_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    scanned_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=func.now())
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=func.now(), onupdate=func.now()
    )

    skills: Mapped[list["Skill"]] = relationship(back_populates="agent", cascade="all, delete-orphan")
    scrape_logs: Mapped[list["ScrapeLog"]] = relationship(back_populates="agent")


class Skill(Base):
    __tablename__ = "skills"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    agent_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("agents.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    code: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    language: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    entry_point: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    config_schema: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=func.now())

    agent: Mapped["Agent"] = relationship(back_populates="skills")


class ApiCredential(Base):
    __tablename__ = "api_credentials"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    provider: Mapped[str] = mapped_column(String(100), nullable=False)
    category: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    tags: Mapped[list[str]] = mapped_column(ARRAY(String), default=list)
    environment: Mapped[CredentialEnvironment] = mapped_column(
        Enum(CredentialEnvironment, native_enum=False), nullable=False, default=CredentialEnvironment.DEVELOPMENT
    )
    encrypted_value: Mapped[bytes] = mapped_column(BYTEA, nullable=False)
    nonce: Mapped[bytes] = mapped_column(BYTEA, nullable=False)
    tag: Mapped[bytes] = mapped_column(BYTEA, nullable=False)
    metadata: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=func.now(), onupdate=func.now()
    )
    last_verified_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    is_valid: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)


class CrawlQueue(Base):
    __tablename__ = "crawl_queue"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    url: Mapped[str] = mapped_column(String(500), nullable=False)
    source_type: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    priority: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[CrawlStatus] = mapped_column(
        Enum(CrawlStatus, native_enum=False), nullable=False, default=CrawlStatus.PENDING
    )
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    error: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    discovered_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=func.now())
    started_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    scrape_logs: Mapped[list["ScrapeLog"]] = relationship(back_populates="queue_item")


class ScrapeLog(Base):
    __tablename__ = "scrape_logs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    queue_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("crawl_queue.id", ondelete="SET NULL"), nullable=True
    )
    agent_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("agents.id", ondelete="SET NULL"), nullable=True
    )
    url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    status: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    extracted_data: Mapped[Optional[dict[str, Any]]] = mapped_column(JSON, nullable=True)
    error: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    latency_ms: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    tokens_used: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=func.now())

    queue_item: Mapped[Optional["CrawlQueue"]] = relationship(back_populates="scrape_logs")
    agent: Mapped[Optional["Agent"]] = relationship(back_populates="scrape_logs")


# Indexes (created via migration, but defined here for reference)
Index("idx_agents_platform", Agent.platform)
Index("idx_agents_category", Agent.category)
Index("idx_agents_tags", Agent.tags, postgresql_using="gin")
Index("idx_agents_content_hash", Agent.content_hash)
Index("idx_skills_agent_id", Skill.agent_id)
Index("idx_credentials_category", ApiCredential.category)
Index("idx_credentials_environment", ApiCredential.environment)
Index("idx_credentials_provider", ApiCredential.provider)
Index("idx_queue_status_priority", CrawlQueue.status, CrawlQueue.priority.desc())
Index("idx_scrape_logs_queue_id", ScrapeLog.queue_id)
Index("idx_scrape_logs_agent_id", ScrapeLog.agent_id)