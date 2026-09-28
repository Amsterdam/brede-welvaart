"""
Upload preprocessing pipeline: lazy extraction + chunking for uploaded PDFs.

Sits alongside DocumentExtractor in `preprocessing/` — same family of operations
(raw input -> structured text -> chunks). Uses the SAME extraction config as
the corpus pipeline (primary backend + optional fallback), so docling / pymupdf
/ pdfplumber and all their thresholds apply uniformly.

Skips the OR-specific assembly step (uploads are single self-contained docs —
no body/summary/children to stitch) and goes ExtractedDocument -> IndexChunks
directly via a synthetic AssembledDocument.

Storage layout: see src/utils/upload_paths.py.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone

from src.preprocessing.extractor import DocumentExtractor, ExtractionError, UnsupportedFormatError
from src.storage import Storage
from src.utils.chunking import chunk_assembled_doc
from src.utils.schemas import AssembledDocument, ExtractedDocument, IndexChunk, UploadDocumentMeta
from src.utils.upload_paths import (
    SOURCE,
    parse_upload_blob_path,
    upload_chunks_key,
    upload_doc_id,
    upload_doc_prefix,
    upload_extracted_key,
)

logger = logging.getLogger(__name__)


# ----------------------------------------------------------------------- extraction


def extract_upload_document(
    storage: Storage,
    *,
    project_id: str,
    document_id: str,
    original_key: str,
    filename: str | None = None,
    primary_extractor: DocumentExtractor,
    fallback_extractor: DocumentExtractor | None = None,
    min_chars: int = 100,
    chunk_size: int = 1000,
    chunk_overlap: int = 200,
    force: bool = False,
) -> UploadDocumentMeta:
    """
    Extract an uploaded PDF and write its chunks + metadata to storage.

    Mirrors the corpus pipeline's primary/fallback behaviour: if the primary
    extractor raises (e.g. docling skipping a praatplaat for low text density),
    the fallback is tried. The 'extractor' field on the returned meta tells you
    which backend succeeded.

    Idempotent: if extraction artifacts already exist for (project_id, document_id)
    and force is False, returns the persisted UploadDocumentMeta without
    re-extracting. On failure, the meta is still written with status="failed" so
    the backend can surface the error.
    """
    doc_prefix = upload_doc_prefix(project_id, document_id)
    chunks_key = upload_chunks_key(project_id, document_id)
    meta_key = f"{doc_prefix}/meta.json"
    extracted_key = upload_extracted_key(project_id, document_id)

    # short-circuit: already extracted, not forcing
    if (
        not force
        and storage.exists(meta_key)
        and storage.exists(chunks_key)
        and storage.exists(extracted_key)
    ):
        try:
            existing = UploadDocumentMeta.model_validate_json(
                storage.read_file(meta_key).decode("utf-8")
            )
            if existing.status == "extracted":
                logger.info("Skipping %s/%s — already extracted", project_id, document_id)
                return existing
        except Exception:
            # bad meta file — fall through and re-extract
            pass

    started = datetime.now(timezone.utc)
    extracted, error = _extract_with_fallback(
        storage, original_key, primary_extractor, fallback_extractor
    )
    if extracted is None:
        return _fail(
            storage,
            project_id=project_id,
            document_id=document_id,
            original_key=original_key,
            filename=filename,
            error=error or "extraction failed",
            started=started,
            meta_key=meta_key,
        )

    # synthetic AssembledDocument so chunk_assembled_doc works unchanged
    doc = AssembledDocument(
        id=upload_doc_id(project_id, document_id),
        source=SOURCE,
        title=filename,
        text=extracted.text,
        toc=extracted.toc,
        sections=extracted.sections,
        pages=extracted.pages,
        page_count=extracted.page_count,
        doc_type_hint=extracted.doc_type_hint,
        extractors_used=[extracted.extractor],
        metadata={
            "project_id": project_id,
            "document_id": document_id,
            "blob_name": original_key,
            "filename": filename,
        },
    )

    chunks = chunk_assembled_doc(
        doc, min_chars=min_chars, chunk_size=chunk_size, chunk_overlap=chunk_overlap
    )

    # Fail loudly on zero chunks. Reaching here with no chunks means even the
    # full-text salvage in chunk_assembled_doc found nothing usable — i.e. the PDF
    # has no real text layer (scanned/image-only) or its text is too sparse to
    # clear min_chars. Marking the doc failed surfaces a clear error to the
    # backend instead of silently completing with zero effects (the failure mode
    # that hid the docling->pymupdf regression).
    if not chunks:
        char_count = len(extracted.text or "")
        return _fail(
            storage,
            project_id=project_id,
            document_id=document_id,
            original_key=original_key,
            filename=filename,
            error=(
                f"PDF_NO_EXTRACTABLE_TEXT: extractor={extracted.extractor} produced "
                f"{char_count} chars but 0 chunks (need >= {min_chars} chars each). "
                "Likely a scanned/image-only PDF without a text layer."
            ),
            started=started,
            meta_key=meta_key,
        )

    storage.write_file(extracted.model_dump_json(indent=2), extracted_key)
    IndexChunk.save_file(chunks, storage, chunks_key)

    meta = UploadDocumentMeta(
        project_id=project_id,
        document_id=document_id,
        filename=filename,
        blob_name=original_key,
        extracted_at=datetime.now(timezone.utc),
        status="extracted",
        chunk_count=len(chunks),
        page_count=extracted.page_count,
        extractor=extracted.extractor,
    )
    storage.write_file(meta.model_dump_json(indent=2), meta_key)
    logger.info(
        "Extracted upload %s/%s with %s: %d chunks from %d pages",
        project_id,
        document_id,
        extracted.extractor,
        len(chunks),
        extracted.page_count or 0,
    )
    return meta


def _extract_with_fallback(
    storage: Storage,
    original_key: str,
    primary: DocumentExtractor,
    fallback: DocumentExtractor | None,
):
    """Try primary; on failure try fallback (if any). Returns (extracted, error)."""
    try:
        return primary.extract(storage, original_key), None
    except (UnsupportedFormatError, ExtractionError) as e:
        primary_error = f"primary ({primary.backend}): {e}"
        if fallback is None:
            return None, primary_error
        logger.info("primary failed (%s), retrying with fallback", primary_error)
        try:
            return fallback.extract(storage, original_key), None
        except (UnsupportedFormatError, ExtractionError) as e2:
            return None, f"{primary_error} | fallback ({fallback.backend}): {e2}"


def _fail(
    storage: Storage,
    *,
    project_id: str,
    document_id: str,
    original_key: str,
    filename: str | None,
    error: str,
    started: datetime,
    meta_key: str,
) -> UploadDocumentMeta:
    logger.warning("Upload extraction failed for %s/%s: %s", project_id, document_id, error)
    meta = UploadDocumentMeta(
        project_id=project_id,
        document_id=document_id,
        filename=filename,
        blob_name=original_key,
        extracted_at=started,
        status="failed",
        chunk_count=0,
        error=error,
    )
    storage.write_file(meta.model_dump_json(indent=2), meta_key)
    return meta


# ----------------------------------------------------------------------- orchestrator


class UploadProcessor:
    """
    Orchestrates lazy extract + chunk for uploaded PDFs.

    Receives its DocumentExtractor(s) (matches the ORExtractor convention in
    src/openresearch/assembler.py). Callers wire the extractors from config;
    UploadProcessor stays free of config-schema knowledge.
    """

    def __init__(
        self,
        storage: Storage,
        primary_extractor: DocumentExtractor,
        fallback_extractor: DocumentExtractor | None = None,
        indexing_config: dict | None = None,
    ):
        self.storage = storage
        self._primary = primary_extractor
        self._fallback = fallback_extractor
        self.indexing_config = indexing_config or {}

    def prepare_chunks(
        self, blob_path: str, filename: str | None = None
    ) -> tuple[str, list[IndexChunk]]:
        """Parse blob_path, lazy-extract if needed, return (doc_id, chunks)."""
        project_id, document_id = self._ensure_extracted(blob_path, filename)
        chunks = IndexChunk.load_file(self.storage, upload_chunks_key(project_id, document_id))
        return upload_doc_id(project_id, document_id), chunks

    def prepare_extracted(
        self, blob_path: str, filename: str | None = None
    ) -> tuple[str, ExtractedDocument]:
        """Parse blob_path, lazy-extract if needed, return (doc_id, ExtractedDocument)."""
        project_id, document_id = self._ensure_extracted(blob_path, filename)
        extracted = ExtractedDocument.model_validate_json(
            self.storage.read_file(upload_extracted_key(project_id, document_id)).decode("utf-8")
        )
        return upload_doc_id(project_id, document_id), extracted

    def _ensure_extracted(self, blob_path: str, filename: str | None) -> tuple[str, str]:
        """Run lazy extraction if artifacts are missing. Returns (project_id, document_id)."""
        project_id, document_id, derived_filename = parse_upload_blob_path(blob_path)
        filename = filename or derived_filename

        chunks_key = upload_chunks_key(project_id, document_id)
        extracted_key = upload_extracted_key(project_id, document_id)
        if self.storage.exists(chunks_key) and self.storage.exists(extracted_key):
            return project_id, document_id

        meta = extract_upload_document(
            self.storage,
            project_id=project_id,
            document_id=document_id,
            original_key=blob_path,
            filename=filename,
            primary_extractor=self._primary,
            fallback_extractor=self._fallback,
            min_chars=self.indexing_config.get("min_chars", 100),
            chunk_size=self.indexing_config.get("chunk_size", 1000),
            chunk_overlap=self.indexing_config.get("chunk_overlap", 200),
            force=False,
        )
        if meta.status == "failed":
            raise RuntimeError(f"Upload extraction failed: {meta.error}")
        return project_id, document_id


__all__ = [
    "UploadProcessor",
    "extract_upload_document",
]
