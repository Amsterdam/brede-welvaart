"""
Integration tests for the Brede Welvaart API endpoints.
Requires a running service at AISERVICE_BASE_URL (default: http://127.0.0.1:8000).
Run manually, not in CI.

Usage:
    uv run pytest tests/integration/test_bw_api.py -m integration -v -s
    uv run pytest tests/integration/test_bw_api.py -m integration -k effects -v -s
"""

from __future__ import annotations

import os
import time
from pathlib import Path

import httpx
import pytest
from dotenv import load_dotenv
from src.storage import get_storage
from src.utils.config import load_config

load_dotenv()

pytestmark = pytest.mark.integration

BASE_URL = os.getenv("AISERVICE_BASE_URL", "http://127.0.0.1:8000")

_TEST_PDFS_DIR = Path(__file__).parent.parent / "data" / "uploads"
_BENCHMARK_PDF_ENV = "BW_BENCHMARK_PDF"


def _list_upload_test_pdfs() -> list[Path]:
    benchmark_pdf = os.getenv(_BENCHMARK_PDF_ENV)
    pdfs = []
    if benchmark_pdf:
        benchmark_path = Path(benchmark_pdf).expanduser()
        if benchmark_path.exists():
            pdfs.append(benchmark_path)
    if _TEST_PDFS_DIR.exists():
        pdfs.extend(sorted(_TEST_PDFS_DIR.glob("*.pdf")))
    return pdfs


EXAMPLE_INPUT = {
    "goal": "inzicht in effecten op woningmarkt",
    "motivation": "brede welvaart scan bezoekerseconomie",
}
EXAMPLE_THEME = "wonen"
EXAMPLE_EFFECT = "Stijging huurprijzen door toerisme"
EXAMPLE_PROJECT_ID = "test-scan-001"


def print_source_summary(source: dict) -> None:
    print(f"  doc_id     : {source.get('doc_id')}")
    print(f"  title      : {source.get('title')}")
    print(f"  score      : {source.get('score')}")
    print(f"  url        : {source.get('url')}")
    print(f"  chunk_type : {source.get('chunk_type')}")


def print_author_summary(author: dict) -> None:
    print(f"  id          : {author.get('id')}")
    print(f"  name        : {author.get('name')}")
    print(f"  affiliation : {author.get('affiliation')}")
    print(f"  score       : {author.get('score')}")
    print(f"  doc_ids     : {author.get('doc_ids', [])[:3]}")


def print_talking_point_summary(point: dict) -> None:
    print(f"  topic       : {point.get('topic')}")
    print(f"  themes      : {point.get('themes')}")
    print(f"  source docs : {point.get('supporting_doc_ids', [])[:3]}")


@pytest.fixture(scope="module")
def client():
    with httpx.Client(base_url=BASE_URL, timeout=60) as c:
        yield c


# ---------------------------------------------------------------------------
# Health / smoke
# ---------------------------------------------------------------------------


def test_llm_endpoint_reachable(client):
    print(f"\n{'='*60}")
    print("TEST: /test-llm reachable")
    print("=" * 60)

    if os.getenv("AISERVICE_DEBUG", "false").lower() != "true":
        pytest.skip("AISERVICE_DEBUG not set — debug endpoints disabled")

    response = client.get("/test-llm")
    print(f"  Status : {response.status_code}")
    print(f"  Body   : {response.text[:200]}")

    assert response.status_code == 200


# ---------------------------------------------------------------------------
# Discovery endpoints
# ---------------------------------------------------------------------------


def test_find_sources(client):
    print(f"\n{'='*60}")
    print("TEST: POST /bw/find-sources")
    print("=" * 60)

    response = client.post("/bw/find-sources", json={"input": EXAMPLE_INPUT})
    print(f"  Status: {response.status_code}")

    assert response.status_code == 200
    sources = response.json()
    assert isinstance(sources, list)
    assert len(sources) >= 1

    print(f"  Returned {len(sources)} sources")
    for s in sources[:3]:
        print_source_summary(s)

    first = sources[0]
    assert "doc_id" in first
    assert "title" in first
    assert "score" in first
    assert isinstance(first["score"], float)
    assert -1.0 <= first["score"] <= 1.0


def test_find_authors(client):
    print(f"\n{'='*60}")
    print("TEST: POST /bw/find-authors")
    print("=" * 60)

    response = client.post("/bw/find-authors", json={"input": EXAMPLE_INPUT})
    print(f"  Status: {response.status_code}")

    assert response.status_code == 200
    authors = response.json()
    assert isinstance(authors, list)
    assert len(authors) >= 1

    print(f"  Returned {len(authors)} authors")
    for a in authors[:3]:
        print_author_summary(a)

    first = authors[0]
    assert "id" in first
    assert "doc_ids" in first
    assert isinstance(first["doc_ids"], list)


def test_find_talking_points(client):
    print(f"\n{'='*60}")
    print("TEST: POST /bw/find-talking-points")
    print("=" * 60)

    response = client.post("/bw/find-talking-points", json={"input": EXAMPLE_INPUT})
    print(f"  Status: {response.status_code}")

    assert response.status_code == 200
    points = response.json()
    assert isinstance(points, list)
    assert len(points) >= 1

    print(f"  Returned {len(points)} talking points")
    for p in points[:3]:
        print_talking_point_summary(p)

    first = points[0]
    assert "topic" in first
    assert "description" in first
    assert "themes" in first
    assert "supporting_doc_ids" in first


def test_bulk_analyze(client):
    print(f"\n{'='*60}")
    print("TEST: POST /bw/analyze")
    print("=" * 60)

    payload = {"project_id": EXAMPLE_PROJECT_ID, "input": EXAMPLE_INPUT}
    response = client.post("/bw/analyze", json=payload, timeout=120)
    print(f"  Status: {response.status_code}")

    assert response.status_code == 200
    result = response.json()

    print(f"  Keys: {list(result.keys())}")

    # All four components should be present
    assert "sources" in result
    assert "authors" in result
    assert "talking_points" in result

    assert isinstance(result["sources"], list)
    assert isinstance(result["authors"], list)
    assert isinstance(result["talking_points"], list)

    print(f"  sources        : {len(result['sources'])}")
    print(f"  authors        : {len(result['authors'])}")
    print(f"  talking_points : {len(result['talking_points'])}")


# ---------------------------------------------------------------------------
# Effect generation endpoints
# ---------------------------------------------------------------------------


def test_generate_effects(client):
    print(f"\n{'='*60}")
    print(f"TEST: POST /bw/generate-effects (theme={EXAMPLE_THEME})")
    print("=" * 60)

    payload = {"input": EXAMPLE_INPUT, "theme": EXAMPLE_THEME}
    response = client.post("/bw/generate-effects", json=payload, timeout=120)
    print(f"  Status: {response.status_code}")

    assert response.status_code == 200
    result = response.json()

    n_sources = len((result.get("retrieval_results") or {}).get("results", []))
    print(f"  theme_key         : {result.get('theme_key')}")
    print(f"  theme_name        : {result.get('theme_name')}")
    print(f"  language          : {result.get('language')}")
    print(f"  sources retrieved : {n_sources}")
    print(f"  processed_response:\n{result.get('processed_response', '')[:600]}")  # noqa: E231

    assert result["theme_key"] == EXAMPLE_THEME
    assert result["theme_name"]
    assert result["language"] in ("nl", "en")
    assert result["raw_response"]


def test_generate_effects_all_themes(client):
    """Smoke-test every valid theme key returns 200 with a response."""
    themes = [
        "wonen",
        "gezondheid",
        "veiligheid",
        "onderwijs",
        "ruimte",
        "inkomen",
        "economisch_kapitaal",
        "natuurlijk_kapitaal",
        "sociaal_kapitaal",
        "subjectief_welzijn",
    ]

    print(f"\n{'='*60}")
    print("TEST: generate-effects for all themes")
    print("=" * 60)

    for theme in themes:
        response = client.post(
            "/bw/generate-effects",
            json={"input": EXAMPLE_INPUT, "theme": theme},
            timeout=120,
        )
        print(f"  {theme:<25} → {response.status_code}")  # noqa: E231
        if response.status_code != 200:
            print(f"    error body: {response.text[:200].replace(chr(10), ' ')}")
        assert response.status_code == 200, (
            f"Failed for theme '{theme}': status={response.status_code}, "
            f"body={response.text[:500]}"
        )
        result = response.json()
        theme_key = result.get("theme_key")
        snippet = (result.get("processed_response") or "")[:100].replace("\n", " ")
        print(f"    theme_key={theme_key}")
        print(f"    {snippet}")
        assert result["theme_key"] == theme


def test_complement_effects(client):
    print(f"\n{'='*60}")
    print(f"TEST: POST /bw/complement-effects (theme={EXAMPLE_THEME})")
    print("=" * 60)

    payload = {"input": EXAMPLE_INPUT, "theme": EXAMPLE_THEME}
    response = client.post("/bw/complement-effects", json=payload, timeout=120)
    print(f"  Status: {response.status_code}")

    assert response.status_code == 200
    result = response.json()

    n_sources = len((result.get("retrieval_results") or {}).get("results", []))
    print(f"  theme_key         : {result.get('theme_key')}")
    print(f"  sources retrieved : {n_sources}")
    print(f"  processed_response:\n{result.get('processed_response', '')[:600]}")  # noqa: E231

    assert result["theme_key"] == EXAMPLE_THEME
    assert result["raw_response"]


def test_evaluate_effect(client):
    print(f"\n{'='*60}")
    print("TEST: POST /bw/evaluate-effect")
    print("=" * 60)

    payload = {
        "input": EXAMPLE_INPUT,
        "theme": EXAMPLE_THEME,
        "effect_description": EXAMPLE_EFFECT,
    }
    response = client.post("/bw/evaluate-effect", json=payload, timeout=120)
    print(f"  Status: {response.status_code}")

    assert response.status_code == 200
    result = response.json()

    n_sources = len((result.get("retrieval_results") or {}).get("results", []))
    print(f"  theme_key         : {result.get('theme_key')}")
    print(f"  effect_description: {EXAMPLE_EFFECT}")
    print(f"  sources retrieved : {n_sources}")
    print(f"  processed_response:\n{result.get('processed_response', '')[:600]}")  # noqa: E231

    assert result["theme_key"] == EXAMPLE_THEME
    assert result["raw_response"]


def test_invalid_theme_returns_error(client):
    print(f"\n{'='*60}")
    print("TEST: invalid theme → error")
    print("=" * 60)

    response = client.post(
        "/bw/generate-effects",
        json={"input": EXAMPLE_INPUT, "theme": "this_is_not_a_theme"},
    )
    print(f"  Status: {response.status_code}")

    assert response.status_code in (400, 422)


def test_find_statements(client):
    print(f"\n{'='*60}")
    print("TEST: POST /bw/find-statements")
    print("=" * 60)

    # first get a source to use its doc_id
    sources_resp = client.post("/bw/find-sources", json={"input": EXAMPLE_INPUT})
    assert sources_resp.status_code == 200
    sources = sources_resp.json()
    assert len(sources) >= 1
    doc_id = sources[0]["doc_id"]

    response = client.post(
        "/bw/find-statements",
        json={"doc_id": doc_id, "input": EXAMPLE_INPUT},
        timeout=60,
    )
    print(f"  Status: {response.status_code}")
    print(f"  doc_id: {doc_id}")

    assert response.status_code == 200
    statements = response.json()
    assert isinstance(statements, list)

    print(f"  Returned {len(statements)} statements")
    for s in statements[:3]:
        print(f"  page={s.get('page')} text={s.get('text', '')[:100]}")

    if statements:
        first = statements[0]
        assert "text" in first
        assert first["doc_id"] == doc_id
        assert first["source"] == "corpus"


# ---------------------------------------------------------------------------
# Document analysis endpoints (uploaded PDFs)
# ---------------------------------------------------------------------------
#
# These tests pre-write a PDF into the running service's storage so the AI
# service can lazy-extract it on the next API call. They assume the service
# is started against config/data_ingestion.yaml; same config is loaded here.


@pytest.fixture(scope="module")
def uploaded_pdf():
    """
    Pre-stage a real PDF at uploads/_pytest_api_/documents/{slug}/original.pdf
    using the same storage the running service is using.

    Yields (blob_path, slug). Cleans up the per-doc folder at teardown.
    """
    pdfs = _list_upload_test_pdfs()
    if not pdfs:
        pytest.skip(f"no test PDFs in tests/data/uploads/ or ${_BENCHMARK_PDF_ENV}")

    pdf_path = pdfs[0]
    slug = f"{pdf_path.stem}-{int(time.time())}"
    cfg = load_config(Path("config/data_ingestion.yaml"))
    storage = get_storage(cfg.get("storage", {}))

    blob_path = f"uploads/_pytest_api_/documents/{slug}/original.pdf"
    storage.write_file(pdf_path.read_bytes(), blob_path)
    print(f"\n>>> Pre-staged PDF at {blob_path}")

    yield blob_path, slug

    # cleanup: remove the per-doc folder
    prefix = f"uploads/_pytest_api_/documents/{slug}"
    try:
        for key in storage.get_folder_contents(prefix):
            try:
                storage.delete_file(key) if hasattr(storage, "delete_file") else None
            except Exception:
                pass
    except Exception as e:
        print(f"<<< Cleanup of {prefix} failed: {e}")


def test_summarize_document(client, uploaded_pdf):
    blob_path, slug = uploaded_pdf
    print(f"\n{'='*60}")
    print("TEST: POST /bw/summarize-document")
    print("=" * 60)

    response = client.post(
        "/bw/summarize-document",
        json={"blob_path": blob_path, "filename": f"{slug}.pdf"},
        timeout=300,
    )
    print(f"  Status: {response.status_code}")

    assert response.status_code == 200
    data = response.json()
    print(f"  Title:   {data.get('title')!r}")
    print(f"  Summary: {(data.get('summary') or '')[:600]}")

    assert "title" in data
    assert "summary" in data
    assert isinstance(data["summary"], str)
    assert data["summary"], "summary should be non-empty"

    # second call should be a cache hit -> same payload
    response2 = client.post(
        "/bw/summarize-document",
        json={"blob_path": blob_path, "filename": f"{slug}.pdf"},
        timeout=60,
    )
    assert response2.status_code == 200
    assert response2.json() == data
    print("  Cache hit on second call confirmed.")


def test_summarize_document_bad_blob_path(client):
    """Malformed blob_path should produce a 422, not a 500."""
    print(f"\n{'='*60}")
    print("TEST: POST /bw/summarize-document with bad blob_path -> 422")
    print("=" * 60)

    response = client.post(
        "/bw/summarize-document",
        json={"blob_path": "not/a/valid/upload/path.pdf"},
    )
    print(f"  Status: {response.status_code}")
    print(f"  Body  : {response.text[:200]}")
    assert response.status_code == 422


def test_find_statements_upload(client, uploaded_pdf):
    """blob_path mode of /bw/find-statements (upload-aware path)."""
    blob_path, slug = uploaded_pdf
    print(f"\n{'='*60}")
    print("TEST: POST /bw/find-statements (blob_path / upload)")
    print("=" * 60)

    response = client.post(
        "/bw/find-statements",
        json={
            "input": EXAMPLE_INPUT,
            "blob_path": blob_path,
            "filename": f"{slug}.pdf",
        },
        timeout=300,
    )
    print(f"  Status: {response.status_code}")

    assert response.status_code == 200
    statements = response.json()
    assert isinstance(statements, list)
    print(f"  Returned {len(statements)} statements")
    for s in statements[:3]:
        print(f"  page={s.get('page')} text={s.get('text', '')[:100]}")
    if statements:
        first = statements[0]
        assert first.get("source") == "upload"
        assert first.get("text")


def test_find_statements_both_ids_rejected(client):
    """doc_id AND blob_path together -> 422 from pydantic validator."""
    print(f"\n{'='*60}")
    print("TEST: POST /bw/find-statements with both doc_id and blob_path -> 422")
    print("=" * 60)

    response = client.post(
        "/bw/find-statements",
        json={
            "input": EXAMPLE_INPUT,
            "doc_id": "openresearch:1",
            "blob_path": "uploads/x/documents/y/original.pdf",
        },
    )
    print(f"  Status: {response.status_code}")
    assert response.status_code == 422


def test_analyze_document(client, uploaded_pdf):
    """Joint endpoint: summary + statements in one call (parallel LLM execution)."""
    blob_path, slug = uploaded_pdf
    print(f"\n{'='*60}")
    print("TEST: POST /bw/analyze-document (joint)")
    print("=" * 60)

    response = client.post(
        "/bw/analyze-document",
        json={
            "input": EXAMPLE_INPUT,
            "blob_path": blob_path,
            "filename": f"{slug}.pdf",
        },
        timeout=300,
    )
    print(f"  Status: {response.status_code}")

    assert response.status_code == 200
    data = response.json()
    assert "summary" in data
    assert "statements" in data

    print(f"  summary present:    {data['summary'] is not None}")
    print(f"  statements present: {data['statements'] is not None}")
    if data["summary"]:
        print(f"    Title:   {data['summary'].get('title')!r}")
        print(f"    Summary: {(data['summary'].get('summary') or '')[:300]}")
    if data["statements"]:
        print(f"    Statements: {len(data['statements'])}")

    # happy-path assertions (PDF is well-formed)
    assert data["summary"] is not None, "summary branch failed"
    assert data["summary"]["summary"]
    assert data["statements"] is not None, "statements branch failed"


def test_analyze_document_bad_blob_path(client):
    """Structural blob_path failure -> 422 (parse_upload_blob_path raises before LLM calls)."""
    print(f"\n{'='*60}")
    print("TEST: POST /bw/analyze-document with bad blob_path -> 422")
    print("=" * 60)

    response = client.post(
        "/bw/analyze-document",
        json={
            "input": EXAMPLE_INPUT,
            "blob_path": "not/a/valid/upload/path.pdf",
        },
    )
    print(f"  Status: {response.status_code}")
    assert response.status_code == 422


CORPUS_TEST_DOC_IDS = [
    "openresearch:132453",
    "openresearch:132659",
]


@pytest.mark.parametrize("doc_id", CORPUS_TEST_DOC_IDS)
def test_summarize_document_corpus(client, doc_id):
    """/bw/summarize-document with doc_id loads AssembledDocument via CorpusReader."""
    print(f"\n{'='*60}")
    print(f"TEST: POST /bw/summarize-document (doc_id={doc_id})")
    print("=" * 60)

    response = client.post(
        "/bw/summarize-document",
        json={"doc_id": doc_id},
        timeout=120,
    )
    print(f"  Status: {response.status_code}")
    assert response.status_code == 200
    data = response.json()
    print(f"  Title:   {data.get('title')!r}")
    print(f"  Summary: {(data.get('summary') or '')[:600]}")
    assert data["summary"]


@pytest.mark.parametrize("doc_id", CORPUS_TEST_DOC_IDS)
def test_analyze_document_corpus(client, doc_id):
    """/bw/analyze-document with doc_id: parallel summary + statements over a corpus doc."""
    print(f"\n{'='*60}")
    print(f"TEST: POST /bw/analyze-document (doc_id={doc_id})")
    print("=" * 60)

    response = client.post(
        "/bw/analyze-document",
        json={"input": EXAMPLE_INPUT, "doc_id": doc_id},
        timeout=300,
    )
    print(f"  Status: {response.status_code}")
    assert response.status_code == 200
    data = response.json()
    print(f"  summary present:    {data.get('summary') is not None}")
    print(f"  statements present: {data.get('statements') is not None}")
    if data.get("summary"):
        print(f"    Title:   {data['summary'].get('title')!r}")
        print(f"    Summary: {(data['summary'].get('summary') or '')[:400]}")
    if data.get("statements"):
        print(f"    Statements: {len(data['statements'])}")
    assert data["summary"]
    assert data["statements"] is not None


def test_summarize_document_neither_id_rejected(client):
    """Neither doc_id nor blob_path -> 422 (request validator)."""
    response = client.post("/bw/summarize-document", json={})
    print(f"\nTEST: POST /bw/summarize-document with neither -> {response.status_code}")
    assert response.status_code == 422


def test_summarize_document_both_ids_rejected(client):
    """Both doc_id AND blob_path -> 422 (request validator)."""
    response = client.post(
        "/bw/summarize-document",
        json={
            "doc_id": "openresearch:1",
            "blob_path": "uploads/x/documents/y/original.pdf",
        },
    )
    print(f"\nTEST: POST /bw/summarize-document with both -> {response.status_code}")
    assert response.status_code == 422
