from functools import lru_cache
from typing import Optional

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )

    # Database — defaults to SQLite (zero-config, works on Android/Termux)
    # For PostgreSQL: postgresql+asyncpg://user:password@host:port/dbname
    database_url: str = Field(
        default="sqlite+aiosqlite:///./harvester.db",
        description="Database connection string (sqlite+aiosqlite or postgresql+asyncpg)",
    )

    # Redis
    redis_url: str = Field(
        default="redis://localhost:6379/0",
        description="Redis connection string for queue/cache",
    )

    # Encryption
    master_encryption_key: str = Field(
        default="",
        description="Base64-encoded 32-byte key for AES-256-GCM",
    )

    # LLM Providers
    groq_api_key: str = Field(default="", description="Groq API key for Llama models")
    gemini_api_key: str = Field(default="", description="Google Gemini API key")
    ollama_base_url: str = Field(
        default="http://localhost:11434", description="Ollama base URL for local models"
    )

    # Search APIs
    serper_api_key: str = Field(default="", description="Serper.dev API key")
    tavily_api_key: str = Field(default="", description="Tavily API key")

    # App
    environment: str = Field(default="development", description="Environment name")
    log_level: str = Field(default="INFO", description="Logging level")
    api_host: str = Field(default="0.0.0.0", description="API host")
    api_port: int = Field(default=8000, description="API port")

    # Frontend
    next_public_api_url: str = Field(
        default="http://localhost:8000", description="Public API URL for frontend"
    )

    @field_validator("master_encryption_key")
    @classmethod
    def validate_encryption_key(cls, v: str) -> str:
        if not v:
            return v
        import base64

        try:
            decoded = base64.b64decode(v)
            if len(decoded) != 32:
                raise ValueError("Master encryption key must be 32 bytes (base64 encoded)")
        except Exception as e:
            raise ValueError(f"Invalid master encryption key: {e}")
        return v

    @property
    def is_production(self) -> bool:
        return self.environment.lower() == "production"

    @property
    def has_groq(self) -> bool:
        return bool(self.groq_api_key)

    @property
    def has_gemini(self) -> bool:
        return bool(self.gemini_api_key)

    @property
    def has_search_api(self) -> bool:
        return bool(self.serper_api_key or self.tavily_api_key)


@lru_cache
def get_settings() -> Settings:
    return Settings()