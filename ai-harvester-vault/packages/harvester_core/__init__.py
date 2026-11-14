"""
RedCoda Harvester Core — Embeddable Python library.

This package contains the core business logic for the AI agent harvester and
encrypted credential vault. It is designed to be dropped into any Python
project with minimal dependencies.

Usage:
    from harvester_core import VaultService, AgentService, SecurityScanner

    vault = VaultService(session)
    cred = vault.create(CredentialCreate(name="OPENAI", provider="openai", value="sk-..."))
"""

from .vault import VaultService, CredentialCreate, CredentialUpdate, CredentialResponse
from .agent import AgentService, AgentCreate, AgentResponse, AgentListResponse
from .scanner import SecurityScanner, ScanResult
from .extractor import LLMExtractor, ExtractionResult, QualityScorer
from .normalizer import NormalizerService, NormalizedAgent
from .discovery import DiscoveryService, DiscoveredURL
from .crawler import CrawlerService, CrawlResult
from .database import init_db, get_session, close_db, Base

__all__ = [
    # Vault
    "VaultService",
    "CredentialCreate",
    "CredentialUpdate",
    "CredentialResponse",
    # Agents
    "AgentService",
    "AgentCreate",
    "AgentResponse",
    "AgentListResponse",
    # Security
    "SecurityScanner",
    "ScanResult",
    # Extraction
    "LLMExtractor",
    "ExtractionResult",
    "QualityScorer",
    # Normalization
    "NormalizerService",
    "NormalizedAgent",
    # Discovery
    "DiscoveryService",
    "DiscoveredURL",
    # Crawler
    "CrawlerService",
    "CrawlResult",
    # Database
    "init_db",
    "get_session",
    "close_db",
    "Base",
]

__version__ = "1.0.0"
__company__ = "RedCoda"