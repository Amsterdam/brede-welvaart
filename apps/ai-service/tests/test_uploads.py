"""
Tests for the upload pipeline: path helpers, extract_upload_document (incl.
primary/fallback behaviour), and UploadProcessor.prepare_chunks.

Self-contained: LocalStorage on a tmp_path + a tiny PDF generated via PyMuPDF
(already a runtime dep). No network, no external services, fast.
"""

from __future__ import annotations

import pytest
from src.preprocessing.extractor import DocumentExtractor
from src.preprocessing.upload import UploadProcessor, extract_upload_document
from src.storage import LocalStorage
from src.utils.schemas import IndexChunk
from src.utils.upload_paths import (
    parse_upload_blob_path,
    upload_chunks_key,
    upload_doc_id,
    upload_doc_prefix,
)

# ----------------------------------------------------------------------- path helpers


def test_parse_upload_blob_path_happy():
    assert parse_upload_blob_path("uploads/proj-abc/documents/doc-123/original.pdf") == (
        "proj-abc",
        "doc-123",
        "original.pdf",
    )


def test_parse_upload_blob_path_tolerates_leading_slash():
    assert parse_upload_blob_path("/uploads/proj/documents/doc/foo.pdf") == (
        "proj",
        "doc",
        "foo.pdf",
    )


def test_parse_upload_blob_path_preserves_nested_filename():
    assert parse_upload_blob_path("uploads/p/documents/d/sub/file.pdf") == (
        "p",
        "d",
        "sub/file.pdf",
    )


@pytest.mark.parametrize(
    "bad_path",
    [
        "projects/abc/doc.pdf",  # wrong top-level prefix
        "uploads/abc/wrongfolder/doc/original.pdf",  # parts[2] != "documents"
        "uploads/abc",  # too short
        "uploads/abc/documents/doc",  # no filename
    ],
)
def test_parse_upload_blob_path_rejects_bad_layout(bad_path):
    with pytest.raises(ValueError, match="Unexpected upload blob path"):
        parse_upload_blob_path(bad_path)


def test_upload_doc_id_and_paths_are_consistent():
    assert upload_doc_id("a", "b") == "upload:a:b"
    assert upload_doc_prefix("a", "b") == "uploads/a/documents/b"
    assert upload_chunks_key("a", "b") == "uploads/a/documents/b/chunks.json"


# ----------------------------------------------------------------------- fixtures


@pytest.fixture
def sample_pdf_bytes() -> bytes:
    """Tiny one-page PDF with known Dutch text content."""
    import fitz

    doc = fitz.open()
    page = doc.new_page()
    page.insert_text(
        (50, 72),
        "Brede welvaart pilot voor Amsterdam. Onderzoek naar bewoners en beleid.",
    )
    page.insert_text(
        (50, 100),
        "Een tweede regel met wat extra woorden om een chunk te vullen.",
    )
    out = doc.tobytes()
    doc.close()
    return out


@pytest.fixture
def rich_pdf_bytes() -> bytes:
    """One-page PDF whose body comfortably exceeds the production min_chars (100)."""
    import fitz

    doc = fitz.open()
    page = doc.new_page()
    paragraph = (
        "Brede welvaart in Amsterdam gaat over meer dan economische groei. "
        "Het onderzoek laat zien dat de leefbaarheid in de wijken toeneemt wanneer "
        "bewoners worden betrokken bij beleid over groen, wonen en veiligheid. "
        "Tegelijkertijd stijgt de druk op de woningmarkt en neemt de ongelijkheid "
        "tussen stadsdelen toe, wat effecten heeft op gezondheid en welzijn."
    )
    page.insert_textbox(fitz.Rect(40, 60, 540, 760), paragraph, fontsize=11)
    out = doc.tobytes()
    doc.close()
    return out


@pytest.fixture
def tiny_pdf_bytes() -> bytes:
    """One-page PDF with far less text than the production min_chars (100)."""
    import fitz

    doc = fitz.open()
    page = doc.new_page()
    page.insert_text((50, 72), "Te kort.")
    out = doc.tobytes()
    doc.close()
    return out


@pytest.fixture
def storage(tmp_path) -> LocalStorage:
    return LocalStorage(tmp_path)


def _pymupdf() -> DocumentExtractor:
    return DocumentExtractor(backend="pymupdf")


def _write_pdf(storage: LocalStorage, blob_path: str, pdf_bytes: bytes) -> None:
    storage.write_file(pdf_bytes, blob_path)


# ----------------------------------------------------------------------- extract_upload_document


def test_extract_upload_document_writes_meta_and_chunks(storage, sample_pdf_bytes):
    blob_path = "uploads/proj1/documents/doc1/original.pdf"
    _write_pdf(storage, blob_path, sample_pdf_bytes)

    meta = extract_upload_document(
        storage,
        project_id="proj1",
        document_id="doc1",
        original_key=blob_path,
        filename="original.pdf",
        primary_extractor=_pymupdf(),
        min_chars=10,  # so the tiny test text doesn't get filtered out
    )

    assert meta.status == "extracted"
    assert meta.error is None
    assert meta.chunk_count >= 1
    assert meta.project_id == "proj1"
    assert meta.document_id == "doc1"
    assert meta.extractor == "pymupdf"

    doc_prefix = upload_doc_prefix("proj1", "doc1")
    assert storage.exists(f"{doc_prefix}/extracted.json")
    assert storage.exists(f"{doc_prefix}/meta.json")
    assert storage.exists(f"{doc_prefix}/chunks.json")

    chunks = IndexChunk.load_file(storage, f"{doc_prefix}/chunks.json")
    assert len(chunks) == meta.chunk_count
    assert all(c.doc_id == "upload:proj1:doc1" for c in chunks)
    assert all(c.source == "upload" for c in chunks)


def test_extract_upload_document_idempotent(storage, sample_pdf_bytes):
    """Second call short-circuits without re-running extraction."""
    blob_path = "uploads/proj/documents/doc/original.pdf"
    _write_pdf(storage, blob_path, sample_pdf_bytes)

    first = extract_upload_document(
        storage,
        project_id="proj",
        document_id="doc",
        original_key=blob_path,
        primary_extractor=_pymupdf(),
        min_chars=10,
    )
    assert first.status == "extracted"

    # corrupt the source — if extraction re-ran, this would now fail
    storage.write_file(b"corrupted bytes, not a PDF", blob_path)

    second = extract_upload_document(
        storage,
        project_id="proj",
        document_id="doc",
        original_key=blob_path,
        primary_extractor=_pymupdf(),
        min_chars=10,
    )
    assert second.status == "extracted"
    # same meta (timestamp unchanged → no re-extraction)
    assert second.extracted_at == first.extracted_at
    assert second.chunk_count == first.chunk_count


def test_extract_upload_document_failure_writes_failed_meta(storage):
    """Malformed PDF -> meta.status=failed, error captured."""
    blob_path = "uploads/proj/documents/bad-doc/original.pdf"
    storage.write_file(b"not actually a PDF, just garbage", blob_path)

    meta = extract_upload_document(
        storage,
        project_id="proj",
        document_id="bad-doc",
        original_key=blob_path,
        primary_extractor=_pymupdf(),
    )

    assert meta.status == "failed"
    assert meta.error
    assert "primary (pymupdf)" in meta.error
    assert meta.chunk_count == 0
    # status doc is still persisted so the backend can poll it
    assert storage.exists(f"{upload_doc_prefix('proj', 'bad-doc')}/meta.json")


def test_extract_upload_document_falls_back_on_primary_failure(storage, sample_pdf_bytes):
    """When primary's skip thresholds trigger, fallback should run and succeed."""
    blob_path = "uploads/proj/documents/big-doc/original.pdf"
    _write_pdf(storage, blob_path, sample_pdf_bytes)

    # pdfplumber with absurdly tiny max_file_mb -> skip + ExtractionError
    primary = DocumentExtractor(backend="pdfplumber", max_file_mb=0.000001)
    fallback = DocumentExtractor(backend="pymupdf")  # defaults, will succeed

    meta = extract_upload_document(
        storage,
        project_id="proj",
        document_id="big-doc",
        original_key=blob_path,
        primary_extractor=primary,
        fallback_extractor=fallback,
        min_chars=10,
    )

    assert meta.status == "extracted"
    assert meta.error is None
    assert meta.extractor == "pymupdf"  # the fallback that succeeded
    assert meta.chunk_count >= 1


def test_extract_upload_document_failed_when_both_extractors_fail(storage):
    """Both primary and fallback fail -> meta records both errors."""
    blob_path = "uploads/proj/documents/junk-doc/original.pdf"
    storage.write_file(b"not a PDF at all", blob_path)

    primary = DocumentExtractor(backend="pymupdf")
    fallback = DocumentExtractor(backend="pdfplumber")

    meta = extract_upload_document(
        storage,
        project_id="proj",
        document_id="junk-doc",
        original_key=blob_path,
        primary_extractor=primary,
        fallback_extractor=fallback,
    )

    assert meta.status == "failed"
    assert "primary (pymupdf)" in meta.error
    assert "fallback (pdfplumber)" in meta.error


def test_extract_upload_document_at_production_min_chars(storage, rich_pdf_bytes):
    """Regression: a real-sized doc must still produce chunks at the PRODUCTION
    min_chars (100), not just the relaxed min_chars=10 the other tests use. This
    is the config that runs in the deployment; testing only at 10 hid the
    silent-zero failure mode."""
    blob_path = "uploads/proj/documents/rich/original.pdf"
    _write_pdf(storage, blob_path, rich_pdf_bytes)

    meta = extract_upload_document(
        storage,
        project_id="proj",
        document_id="rich",
        original_key=blob_path,
        primary_extractor=_pymupdf(),
        # min_chars defaults to 100 — the production value
    )

    assert meta.status == "extracted"
    assert meta.error is None
    assert meta.chunk_count >= 1


def test_extract_upload_document_zero_chunks_fails_loud(storage, tiny_pdf_bytes):
    """A PDF with too little text to produce any chunk must FAIL loudly with
    PDF_NO_EXTRACTABLE_TEXT, not silently complete with zero effects."""
    blob_path = "uploads/proj/documents/tiny/original.pdf"
    _write_pdf(storage, blob_path, tiny_pdf_bytes)

    meta = extract_upload_document(
        storage,
        project_id="proj",
        document_id="tiny",
        original_key=blob_path,
        primary_extractor=_pymupdf(),
        # production min_chars=100; "Te kort." is ~8 chars -> 0 chunks
    )

    assert meta.status == "failed"
    assert "PDF_NO_EXTRACTABLE_TEXT" in meta.error
    assert meta.chunk_count == 0
    # status doc persisted so the backend surfaces the failure
    assert storage.exists(f"{upload_doc_prefix('proj', 'tiny')}/meta.json")


# ----------------------------------------------------------------------- UploadProcessor


def _processor(storage: LocalStorage, fallback: bool = False) -> UploadProcessor:
    return UploadProcessor(
        storage=storage,
        primary_extractor=DocumentExtractor(backend="pymupdf"),
        fallback_extractor=DocumentExtractor(backend="pdfplumber") if fallback else None,
        indexing_config={"min_chars": 10, "chunk_size": 1000, "chunk_overlap": 200},
    )


def test_upload_processor_prepare_chunks_extracts_on_first_call(storage, sample_pdf_bytes):
    blob_path = "uploads/p1/documents/d1/original.pdf"
    _write_pdf(storage, blob_path, sample_pdf_bytes)

    doc_id, chunks = _processor(storage).prepare_chunks(blob_path)

    assert doc_id == "upload:p1:d1"
    assert len(chunks) >= 1
    assert all(c.doc_id == doc_id for c in chunks)
    assert all(c.source == "upload" for c in chunks)
    assert storage.exists(upload_chunks_key("p1", "d1"))


def test_upload_processor_prepare_chunks_uses_cache_on_second_call(storage, sample_pdf_bytes):
    """Once chunks.json exists, prepare_chunks reads it without re-extracting."""
    blob_path = "uploads/p2/documents/d2/original.pdf"
    _write_pdf(storage, blob_path, sample_pdf_bytes)
    processor = _processor(storage)

    doc_id1, chunks1 = processor.prepare_chunks(blob_path)
    meta_before = storage.read_file(f"{upload_doc_prefix('p2', 'd2')}/meta.json")

    # corrupt the source — if re-extraction happens we'd see a different meta or crash
    storage.write_file(b"garbage", blob_path)

    doc_id2, chunks2 = processor.prepare_chunks(blob_path)
    meta_after = storage.read_file(f"{upload_doc_prefix('p2', 'd2')}/meta.json")

    assert doc_id1 == doc_id2
    assert len(chunks1) == len(chunks2)
    assert meta_before == meta_after  # confirms no re-extraction


def test_upload_processor_raises_for_bad_blob_path(storage):
    with pytest.raises(ValueError, match="Unexpected upload blob path"):
        _processor(storage).prepare_chunks("projects/abc/foo.pdf")
