"""Tests for content hashing and deduplication."""

import hashlib

from app.services.harvester.discovery import DiscoveryService


def test_content_hash_deterministic():
    """Same content should always produce the same hash."""
    discovery = DiscoveryService()
    content = "test agent content"
    h1 = discovery.generate_content_hash(content)
    h2 = discovery.generate_content_hash(content)
    assert h1 == h2
    assert len(h1) == 64  # SHA-256 hex


def test_content_hash_different_for_different_content():
    """Different content should produce different hashes."""
    discovery = DiscoveryService()
    h1 = discovery.generate_content_hash("content A")
    h2 = discovery.generate_content_hash("content B")
    assert h1 != h2


def test_content_hash_matches_sha256():
    """Generated hash should match standard SHA-256."""
    discovery = DiscoveryService()
    content = "hello world"
    expected = hashlib.sha256(content.encode()).hexdigest()
    assert discovery.generate_content_hash(content) == expected


def test_platform_detection():
    """URL platform detection should work for known domains."""
    discovery = DiscoveryService()
    assert discovery._detect_platform("https://github.com/org/repo") == "github"
    assert discovery._detect_platform("https://huggingface.co/spaces/agent") == "huggingface"
    assert discovery._detect_platform("https://gitlab.com/org/repo") == "gitlab"
    assert discovery._detect_platform("https://pypi.org/project/pkg/") == "pypi"
    assert discovery._detect_platform("https://npmjs.com/package/pkg") == "npm"
    assert discovery._detect_platform("https://example.com/blog") == "web"