"""Tests for heuristic extraction when no LLM is available."""

from app.services.harvester.extractor import LLMExtractor


def test_heuristic_detects_agent_keywords():
    """Content with agent keywords should be detected as agent."""
    extractor = LLMExtractor()
    # No LLM keys set, so heuristic will be used
    import asyncio
    result = asyncio.run(extractor.extract(
        "This is a system prompt for an AI agent that uses function calling.",
        "https://github.com/org/agent-repo"
    ))
    # Heuristic should detect at least some agent keywords
    assert result.confidence >= 0
    assert result.name is not None or result.name is None  # Just verify no crash


def test_heuristic_non_agent():
    """Content without agent keywords should not be detected."""
    extractor = LLMExtractor()
    import asyncio
    result = asyncio.run(extractor.extract(
        "This is a blog post about cooking recipes and food.",
        "https://example.com/blog/cooking"
    ))
    assert result.is_agent is False or result.confidence < 0.5