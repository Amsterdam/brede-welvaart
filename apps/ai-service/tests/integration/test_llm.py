"""
Integration tests for the LLM client.
Hits Azure Foundry - run manually, not in CI.

Usage:
    uv run pytest tests/integration/test_llm.py -m integration -v -s
"""

from __future__ import annotations

import pytest
from lingua import Language, LanguageDetectorBuilder
from src.llms import LLMRouter
from src.utils.schemas import LLMResponse

pytestmark = pytest.mark.integration

SIMPLE_PROMPT = "Geef een korte definitie van brede welvaart in één zin."
SYSTEM_PROMPT = "Je bent een assistent voor de gemeente Amsterdam."

detector = LanguageDetectorBuilder.from_languages(Language.DUTCH, Language.ENGLISH).build()


@pytest.fixture(scope="module")
def llm():
    return LLMRouter.get_model(provider="azure", model_name="gpt-4o-mini")


def test_basic_prompt(llm):
    print(f"\n{'='*60}")
    print("TEST: basic prompt")
    print("=" * 60)

    response = llm.prompt(SIMPLE_PROMPT)
    print(f"  Prompt            : {SIMPLE_PROMPT}")
    print(f"  raw_response      : {response.raw_response[:300]}")
    print(f"  processed_response: {(response.processed_response or '')[:300]}")

    assert isinstance(response, LLMResponse)
    assert len(response.raw_response) > 10


def test_prompt_with_system(llm):
    print(f"\n{'='*60}")
    print("TEST: prompt with system prompt")
    print("=" * 60)

    response = llm.prompt(SIMPLE_PROMPT, system=SYSTEM_PROMPT)
    print(f"  System            : {SYSTEM_PROMPT}")
    print(f"  Prompt            : {SIMPLE_PROMPT}")
    print(f"  processed_response: {(response.processed_response or '')[:300]}")

    assert isinstance(response, LLMResponse)
    assert len(response.processed_response or response.raw_response) > 10


def test_prompt_returns_dutch(llm):
    print(f"\n{'='*60}")
    print("TEST: response is in Dutch")
    print("=" * 60)

    response = llm.prompt(SIMPLE_PROMPT)
    text = response.processed_response or response.raw_response
    language = detector.detect_language_of(text)
    print(f"  processed_response: {text[:300]}")
    print(f"  Detected          : {language}")

    assert language == Language.DUTCH
