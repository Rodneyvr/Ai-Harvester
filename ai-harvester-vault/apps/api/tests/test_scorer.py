"""Tests for quality scoring."""

from app.services.harvester.extractor import ExtractionResult, QualityScorer


def test_score_range():
    """Score should be between 0 and 100."""
    scorer = QualityScorer()
    extraction = ExtractionResult(
        is_agent=True,
        confidence=0.5,
        name="Test",
        description="A test agent",
        system_prompt=None,
        tool_code=None,
        dependencies={},
        required_keys=[],
        category=None,
        tags=[],
    )
    score = scorer.score(extraction)
    assert 0 <= score <= 100


def test_score_empty():
    """Minimal extraction should score low."""
    scorer = QualityScorer()
    extraction = ExtractionResult(
        is_agent=True,
        confidence=0.1,
        name=None,
        description=None,
        system_prompt=None,
        tool_code=None,
        dependencies={},
        required_keys=[],
        category=None,
        tags=[],
    )
    score = scorer.score(extraction)
    assert score < 50


def test_score_complete():
    """Complete extraction should score high."""
    scorer = QualityScorer()
    extraction = ExtractionResult(
        is_agent=True,
        confidence=0.95,
        name="Full Agent",
        description="A fully documented agent with system prompt and tools",
        system_prompt="You are a helpful assistant that does X, Y, and Z.",
        tool_code="def tool(x): return x + 1",
        dependencies={"python": ["requests"]},
        required_keys=["OPENAI_API_KEY"],
        category="automation",
        tags=["coding", "automation"],
    )
    score = scorer.score(extraction)
    assert score >= 70


def test_score_with_stars():
    """High-star repos should get bonus points."""
    scorer = QualityScorer()
    extraction = ExtractionResult(
        is_agent=True,
        confidence=0.5,
        name="Test",
        description="Test",
        system_prompt=None,
        tool_code=None,
        dependencies={},
        required_keys=[],
        category=None,
        tags=[],
    )
    score_low = scorer.score(extraction, {"stars": 5})
    score_high = scorer.score(extraction, {"stars": 500})
    assert score_high > score_low