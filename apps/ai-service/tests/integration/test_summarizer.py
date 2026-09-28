"""
Integration tests for src.document_analysis.summarization.Summarizer.

Exercises the Summarizer primitive directly (no BWAnalyzer, no UploadProcessor,
no /bw endpoints) against the real Azure OpenAI LLM, on the PDFs in
tests/data/uploads/. Tests the title cascade + the summary LLM call as a
single coherent unit, since that's the Summarizer's public API.

Usage:
    uv run pytest tests/integration/test_summarizer.py -m integration -v -s
"""

from __future__ import annotations

import os
from pathlib import Path

import pytest
import yaml
from src.document_analysis import Summarizer
from src.llms import LLMRouter
from src.preprocessing.extractor import DocumentExtractor
from src.storage import LocalStorage

pytestmark = pytest.mark.integration

_TEST_PDFS_DIR = Path(__file__).parent.parent / "data" / "uploads"
_BENCHMARK_PDF_ENV = "BW_BENCHMARK_PDF"


def _list_test_pdfs() -> list[Path]:
    benchmark_pdf = os.getenv(_BENCHMARK_PDF_ENV)
    pdfs = []
    if benchmark_pdf:
        benchmark_path = Path(benchmark_pdf).expanduser()
        if benchmark_path.exists():
            pdfs.append(benchmark_path)
    if _TEST_PDFS_DIR.exists():
        pdfs.extend(sorted(_TEST_PDFS_DIR.glob("*.pdf")))
    return pdfs


def _pdf_id(p: Path) -> str:
    return p.stem


@pytest.fixture(scope="module")
def summarizer():
    with open("config/prompts.yaml") as f:
        prompts = yaml.safe_load(f)
    with open("config/system.yaml") as f:
        system = yaml.safe_load(f)
    llm = LLMRouter.get_model(provider="azure", model_name="gpt-4o-mini")
    return Summarizer(
        llm=llm,
        prompts=prompts,
        organization=system["organization"]["nl"],
        language="nl",
    )


@pytest.fixture(scope="module")
def extractor():
    """Use pymupdf — fast and deterministic, fine for summarization input."""
    return DocumentExtractor(backend="pymupdf")


def _extract(extractor, pdf_path, tmp_path_factory):
    """Run the real extractor against pdf_path via a tmp LocalStorage."""
    storage = LocalStorage(tmp_path_factory.mktemp("summ"))
    key = f"{pdf_path.stem}.pdf"
    storage.write_file(pdf_path.read_bytes(), key)
    return extractor.extract(storage, key)


@pytest.mark.parametrize("pdf_path", _list_test_pdfs(), ids=_pdf_id)
def test_summarize_real_pdf(summarizer, extractor, tmp_path_factory, pdf_path):
    """
    Real-PDF summarization: extract -> Summarizer.summarize -> assert shape.

    Prints title, summary and length so the test output doubles as a manual
    sanity check on prompt quality.
    """
    extracted = _extract(extractor, pdf_path, tmp_path_factory)
    print(f"\n=== {pdf_path.stem} ===")
    print(f"  Extracted text length: {len(extracted.text)} chars")
    print(f"  Sections: {len(extracted.sections)}  TOC entries: {len(extracted.toc)}")
    print(f"  PDF metadata title: {(extracted.pdf_metadata and extracted.pdf_metadata.title)!r}")

    summary = summarizer.summarize(extracted)
    print(f"  Title:   {summary.title!r}")
    print(f"  Summary: {summary.summary[:1000]}")
    print(f"  Length:  {len(summary.summary)} chars")

    assert summary.summary, "Summarizer returned empty summary"
    assert isinstance(summary.summary, str)
    assert summary.title is None or (isinstance(summary.title, str) and summary.title)


def test_summarize_language_override(summarizer, extractor, tmp_path_factory):
    """language='en' produces an English summary even though Summarizer default is nl."""
    pdfs = _list_test_pdfs()
    if not pdfs:
        pytest.skip("no test PDFs in tests/data/uploads/")
    extracted = _extract(extractor, pdfs[0], tmp_path_factory)

    summary = summarizer.summarize(extracted, language="en")
    print(f"\n=== language=en ({pdfs[0].stem}) ===")
    print(f"  Title:   {summary.title!r}")
    print(f"  Summary: {summary.summary[:600]}")

    assert summary.summary
