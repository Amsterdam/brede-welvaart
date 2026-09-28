"""
Tests for the chunking salvage path and statement-grounding robustness — the two
silent-zero traps that let the docling->pymupdf upload regression produce 0
effects without an error.

Self-contained: no storage, no network, no LLM. Builds AssembledDocument /
IndexChunk directly.
"""

from __future__ import annotations

import pytest

from src.bw_analyzer.bw_analyzer import BWAnalyzer, StatementExtractionError
from src.utils.chunking import chunk_assembled_doc
from src.utils.schemas import AssembledDocument, ExtractedSection, IndexChunk

# ----------------------------------------------------------------------- salvage


def _doc(*, sections, text) -> AssembledDocument:
    return AssembledDocument(id="upload:p:d", source="upload", sections=sections, text=text)


def test_chunking_salvages_full_text_when_all_sections_are_thin():
    """Sections present but every one is below min_chars -> fall back to the full
    text instead of emitting nothing. This is the upload failure mode: docling
    finds headings but the per-section bodies are too short, and the `elif text`
    branch is otherwise unreachable once `sections` is truthy."""
    thin_sections = [
        ExtractedSection(title="Kop 1", text="kort"),
        ExtractedSection(title="Kop 2", text="ook kort"),
    ]
    long_text = (
        "Brede welvaart in Amsterdam gaat over leefbaarheid, gezondheid en "
        "gelijke kansen. De druk op de woningmarkt stijgt en dat heeft effect op "
        "het welzijn van bewoners in verschillende stadsdelen van de stad."
    )
    chunks = chunk_assembled_doc(_doc(sections=thin_sections, text=long_text), min_chars=100)

    assert chunks, "expected salvage to produce chunks from full text"
    assert all(c.chunk_type == "chunk" for c in chunks)


def test_chunking_returns_empty_when_no_usable_text():
    """Thin sections AND no usable full text -> genuinely empty (the fail-loud
    guard in upload.py turns this into a surfaced error)."""
    thin_sections = [ExtractedSection(title="Kop", text="kort")]
    chunks = chunk_assembled_doc(_doc(sections=thin_sections, text="te kort"), min_chars=100)

    assert chunks == []


def test_chunking_keeps_section_chunks_when_substantial():
    """Sanity: substantial sections still produce section chunks (salvage does
    not kick in and override the normal path)."""
    body = (
        "De leefbaarheid in de wijken neemt toe wanneer bewoners worden betrokken "
        "bij het beleid over groen, wonen en veiligheid in hun directe omgeving."
    )
    chunks = chunk_assembled_doc(
        _doc(sections=[ExtractedSection(title="Bevindingen", text=body)], text=body),
        min_chars=100,
    )

    assert chunks
    assert any(c.chunk_type == "section" for c in chunks)


# ----------------------------------------------------------------------- grounding


def _chunk(content: str, page: int | None = None) -> IndexChunk:
    return IndexChunk(
        content=content, doc_id="upload:p:d", source="upload", chunk_type="chunk", page=page
    )


def _analyzer() -> BWAnalyzer:
    # _match_chunk only touches the static _normalize_for_match + module logger,
    # so an uninitialized instance is enough to exercise it without the heavy
    # constructor (LLM, retrievers, prompts, ...).
    return BWAnalyzer.__new__(BWAnalyzer)


def test_match_chunk_tolerates_whitespace_differences():
    """A 'verbatim' statement whose spacing/newlines differ from the source chunk
    must still ground — the extractor's clean_text and the LLM's re-emission do
    not preserve whitespace identically. Before the fix this silently dropped
    valid statements."""
    chunk = _chunk("De leefbaarheid in de wijken neemt toe door participatie.", page=4)
    statement = "De leefbaarheid  in de\nwijken neemt   toe door participatie."

    matched = _analyzer()._match_chunk(statement, [chunk])

    assert matched is chunk
    assert matched.page == 4


def test_match_chunk_grounds_short_statement_in_long_chunk():
    """A short statement embedded in a much longer chunk must match. A raw
    SequenceMatcher ratio is diluted by the length gap; longest-overlap coverage
    is not."""
    long_chunk = _chunk(
        "Inleiding en achtergrond over het onderzoek. " * 20
        + "De ongelijkheid tussen stadsdelen neemt toe. "
        + "Verdere methodologische toelichting volgt hierna. " * 20
    )
    statement = "De ongelijkheid tussen stadsdelen neemt toe."

    assert _analyzer()._match_chunk(statement, [long_chunk]) is long_chunk


def test_match_chunk_rejects_unrelated_statement():
    """An ungrounded (hallucinated) statement must NOT match any chunk."""
    chunk = _chunk("De leefbaarheid in de wijken neemt toe door participatie.")
    statement = "De stad lanceert volgend jaar een eigen ruimtevaartprogramma."

    assert _analyzer()._match_chunk(statement, [chunk]) is None


# ----------------------------------------------------------------------- response parsing


def test_statement_parser_accepts_json_code_fence():
    raw = '```json\n[{"text": "Effect op wonen", "page": 2}]\n```'

    assert _analyzer()._extract_json_array(raw) == [
        {"text": "Effect op wonen", "page": 2}
    ]


def test_statement_parser_accepts_statements_wrapper():
    raw = '{"statements": [{"text": "Effect op gezondheid", "page": 4}]}'

    assert _analyzer()._extract_json_array(raw) == [
        {"text": "Effect op gezondheid", "page": 4}
    ]


def test_parse_failure_is_not_reported_as_empty_extraction():
    with pytest.raises(StatementExtractionError, match="invalid JSON"):
        _analyzer()._parse_statements("geen JSON", "openresearch:1", [_chunk("tekst")])
