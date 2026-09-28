"""
OpenResearch document extraction and assembly.

Two pipeline steps, two classes:

  ORExtractor  (step 1) - reads OR source files, extracts text via DocumentExtractor,
                          writes into the extracted/{id}/ prefix on storage.

  ORAssembler  (step 2) - reads extracted/{id}/ prefixes, stitches article text
                          from body/summary/children/raadsinformatie,
                          writes assembled/{id}/ prefixes.

Both step 1 and step 2 read AND write through a single Storage backend (local or Azure).
The downloaded_files entries on Resource records are already storage-relative keys
(the collector writes them that way), so we read them directly via storage.

Assembly rules:
  - document category  -> extract text from downloaded files
  - article with kids  -> summary + body + children's extracted text
  - article standalone -> summary + body only
  - article with ri    -> summary + body + raadsinformatie extracted text
  - truly empty        -> skip (no text, no files, no children, no ri)

Output layout (step 1):
  {extracted_prefix}/{doc_id}/{stem}.txt            - plain text, one per source file
  {extracted_prefix}/{doc_id}/{stem}.extracted.json - full ExtractedDocument
  {extracted_prefix}/{doc_id}/meta.json             - AssembledDocument summary

Output layout (step 2):
  {output_prefix}/{article_id}/assembled.txt        - stitched, ready for indexing
  {output_prefix}/{article_id}/meta.json            - AssembledDocument summary

Output layout (step 3, compile_collections):
  {collections_prefix}/{name}/{article_id}.json     - list[IndexChunk]
"""

from __future__ import annotations

import json
import logging
from collections.abc import Iterator

from src.openresearch.models import Resource
from src.preprocessing.extractor import (
    DocumentExtractor,
    ExtractionError,
    UnsupportedFormatError,
    _infer_doc_type_from_title,
    _resolve_hints,
)
from src.storage import Storage
from src.utils.chunking import chunk_assembled_doc
from src.utils.schemas import (
    AssembledDocument,
    DocTypeHint,
    ExtractedDocument,
    ExtractedSection,
    IndexChunk,
    PageContent,
    TableOfContentsEntry,
)
from src.utils.string_utils import clean_text, strip_html
from tqdm import tqdm

logger = logging.getLogger(__name__)

SOURCE = "openresearch"

_TYPE_PRIORITY = [
    DocTypeHint.thesis,
    DocTypeHint.report,
    DocTypeHint.presentation,
    DocTypeHint.factsheet,
    DocTypeHint.unknown,
]


# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------


def _read_json(storage: Storage, key: str) -> dict:
    return json.loads(storage.read_file(key).decode("utf-8"))


def _read_text(storage: Storage, key: str) -> str:
    return storage.read_file(key).decode("utf-8")


def _list_txt_files(storage: Storage, prefix: str) -> list[str]:
    """Return sorted list of *.txt file keys under prefix."""
    names = [n for n in storage.get_folder_contents(prefix) if n.endswith(".txt")]
    return sorted(f"{prefix}/{n}" for n in names)


def load_records(storage: Storage, or_data_prefix: str) -> dict[int, Resource]:
    """Load all metadata.json files under the OR data prefix on storage."""
    subfolders = list(
        tqdm(storage.get_subfolders(or_data_prefix), desc="Scanning folders", unit="dir")
    )
    records = {}
    for sub in tqdm(subfolders, desc="Loading records", unit="file"):
        meta_key = f"{or_data_prefix}/{sub}/metadata.json"
        if not storage.exists(meta_key):
            continue
        try:
            raw = _read_json(storage, meta_key)
            records[raw["id"]] = Resource.model_validate(raw)
        except Exception as e:
            logger.warning("Failed to load %s: %s", meta_key, e)
    return records


def iter_records(
    storage: Storage,
    or_data_prefix: str,
    category: str | None = None,
) -> Iterator[Resource]:
    """Iterate OR records on the fly without loading everything into memory."""
    for sub in storage.get_subfolders(or_data_prefix):
        meta_key = f"{or_data_prefix}/{sub}/metadata.json"
        if not storage.exists(meta_key):
            continue
        try:
            raw = _read_json(storage, meta_key)
            if category and raw.get("category") != category:
                continue
            yield Resource.model_validate(raw)
        except Exception as e:
            logger.warning("Failed to load %s: %s", meta_key, e)


def _doc_id(or_id: int) -> str:
    return f"{SOURCE}:{or_id}"  # noqa: E231


def _failed(record: Resource, error: str) -> AssembledDocument:
    return AssembledDocument(
        id=_doc_id(record.id),
        source=SOURCE,
        title=record.title,
        url=record.page_url_abs,
        language=record.language,
        keywords=record.keywords,
        category=record.category,
        published_at=record.publication_start,
        extraction_failed=True,
        extraction_error=error,
        metadata={
            "creator_id": record.creator_id,
            "authors": record.authors,
            "teams": record.teams,
        },
    )


# ---------------------------------------------------------------------------
# Step 1: extraction
# ---------------------------------------------------------------------------


class ORExtractor:
    """
    Extracts text from OR source files into the {extracted_prefix}/{id}/ layout on storage.

    Args:
        storage:           Storage backend used for both reading source files
                           (paths in Resource.downloaded_files) and writing extracted output.
        or_data_prefix:    Prefix where the collector wrote OR records (e.g. "openresearch").
        extracted_prefix:  Prefix where extracted texts are written (e.g. "extracted/docling").
        extractor:         DocumentExtractor instance (default: pymupdf).
        force:             Re-extract even if output already exists (overrides skip_existing).
        skip_existing:     Skip docs that have any meta.json, even if extraction_failed.
                           Default False - failed docs are retried.
    """

    def __init__(
        self,
        storage: Storage,
        or_data_prefix: str,
        extracted_prefix: str,
        extractor: DocumentExtractor | None = None,
        force: bool = False,
        skip_existing: bool = False,
    ) -> None:
        self.storage = storage
        self.or_data_prefix = or_data_prefix.rstrip("/")
        self.extracted_prefix = extracted_prefix.rstrip("/")
        self.extractor = extractor or DocumentExtractor(backend="pymupdf")
        self.force = force
        self.skip_existing = skip_existing

    def _record_prefix(self, record_id: int) -> str:
        return f"{self.extracted_prefix}/{record_id}"

    def extract_leaf(self, record: Resource) -> AssembledDocument:
        """Extract text from a document-category record's downloaded files."""
        return self._extract_files(
            record=record,
            file_keys=list(record.downloaded_files or []),
            missing_msg="No downloaded files",
        )

    def extract_raadsinformatie(self, record: Resource) -> AssembledDocument | None:
        """
        Extract raadsinformatie files for an article-category record.
        Returns None if the record has no raadsinformatie.
        """
        if not record.raadsinformatie:
            return None
        return self._extract_files(
            record=record,
            file_keys=list(record.raadsinformatie.values()),
            missing_msg="No raadsinformatie files",
        )

    def _extract_files(
        self,
        record: Resource,
        file_keys: list[str],
        missing_msg: str,
    ) -> AssembledDocument:
        """Shared extraction logic for both leaf documents and raadsinformatie."""
        record_prefix = self._record_prefix(record.id)
        meta_key = f"{record_prefix}/meta.json"

        if self.storage.exists(meta_key) and not self.force:
            existing = AssembledDocument.model_validate_json(_read_text(self.storage, meta_key))
            if not existing.extraction_failed:
                logger.debug("Skipping %d - already extracted", record.id)
                return existing
            if self.skip_existing:
                logger.debug(
                    "Skipping %d - skip_existing set (previous error: %s)",
                    record.id,
                    existing.extraction_error,
                )
                return existing
            logger.info(
                "Retrying %d - previous extraction failed: %s",
                record.id,
                existing.extraction_error,
            )

        if not file_keys:
            logger.warning("Record %d: %s", record.id, missing_msg)
            return _failed(record, missing_msg)

        extracted_docs: list[ExtractedDocument] = []
        errors: list[str] = []

        for rel_key in file_keys:
            self._extract_single_file(rel_key, record_prefix, extracted_docs, errors)

        return self._finalise_leaf(record, extracted_docs, errors, meta_key)

    def _extract_single_file(
        self,
        rel_key: str,
        record_prefix: str,
        extracted_docs: list[ExtractedDocument],
        errors: list[str],
    ) -> None:
        """Extract one file (storage key, relative to storage root) and accumulate results."""
        if not rel_key:
            return
        if not self.storage.exists(rel_key):
            errors.append(f"File not found: {rel_key}")
            logger.warning("File not found: %s", rel_key)
            return
        try:
            extracted = self.extractor.extract(self.storage, rel_key)
            extracted_docs.append(extracted)
            stem = rel_key.rsplit("/", 1)[-1].rsplit(".", 1)[0]
            if extracted.text:
                self.storage.write_file(extracted.text, f"{record_prefix}/{stem}.txt")
            self.storage.write_file(
                extracted.model_dump_json(indent=2),
                f"{record_prefix}/{stem}.extracted.json",
            )
        except (UnsupportedFormatError, ExtractionError) as e:
            errors.append(str(e))
            logger.warning("Failed to extract %s: %s", rel_key, e)

    def _finalise_leaf(
        self,
        record: Resource,
        extracted_docs: list[ExtractedDocument],
        errors: list[str],
        meta_key: str,
    ) -> AssembledDocument:
        all_text = [d.text for d in extracted_docs if d.text]
        toc = [e for d in extracted_docs for e in d.toc]
        sections = [s for d in extracted_docs for s in d.sections]
        pages = [p for d in extracted_docs for p in d.pages]
        total_pages = sum(d.page_count or 0 for d in extracted_docs)
        extractors = sorted({d.extractor for d in extracted_docs})
        warnings = [w for d in extracted_docs for w in d.warnings]

        pdf_metadata = next((d.pdf_metadata for d in extracted_docs if d.pdf_metadata), None)
        hints = [d.doc_type_hint for d in extracted_docs]
        layout_hint = next((t for t in _TYPE_PRIORITY if t in hints), DocTypeHint.unknown)
        name_hint = _infer_doc_type_from_title(record.title or "")
        doc_type = _resolve_hints(layout_hint, name_hint)

        failed = not bool(all_text)
        error = "; ".join(errors + warnings) if (errors or warnings) else None

        doc = AssembledDocument(
            id=_doc_id(record.id),
            source=SOURCE,
            title=record.title,
            url=record.page_url_abs,
            language=record.language,
            keywords=record.keywords,
            category=record.category,
            published_at=record.publication_start,
            text="\n\n".join(all_text),
            toc=toc,
            sections=sections,
            pages=pages,
            pdf_metadata=pdf_metadata,
            doc_type_hint=doc_type,
            layout_hint=layout_hint,
            name_hint=name_hint,
            page_count=total_pages or None,
            extractors_used=extractors,
            extraction_failed=failed,
            extraction_error=error,
            metadata={
                "creator_id": record.creator_id,
                "authors": record.authors,
                "teams": record.teams,
            },
        )

        self.storage.write_file(doc.model_dump_json(indent=2), meta_key)

        if failed:
            logger.warning("No text extracted for record %d. Errors: %s", record.id, error)

        return doc


# ---------------------------------------------------------------------------
# Step 2: assembly
# ---------------------------------------------------------------------------


class ORAssembler:
    """
    Assembles indexable text for OR articles from pre-extracted files.

    Reads {extracted_prefix}/{id}/ (written by ORExtractor), writes
    {output_prefix}/{id}/assembled.txt + meta.json.

    Args:
        storage:          Storage backend used for both input and output.
        extracted_prefix: Prefix where ORExtractor wrote extracted/{id}/ folders.
        output_prefix:    Prefix where assembled/{id}/ folders will be written.
        fallback_prefix:  Optional secondary extracted prefix. Used when a doc failed
                          or is missing in extracted_prefix.
        force:            Re-assemble even if output already exists.
    """

    def __init__(
        self,
        storage: Storage,
        extracted_prefix: str,
        output_prefix: str,
        fallback_prefix: str | None = None,
        force: bool = False,
    ) -> None:
        self.storage = storage
        self.extracted_prefix = extracted_prefix.rstrip("/")
        self.output_prefix = output_prefix.rstrip("/")
        self.fallback_prefix = fallback_prefix.rstrip("/") if fallback_prefix else None
        self.force = force

    def _resolve_extracted_dir(self, record_id: int | str) -> str | None:
        """
        Return the best available extracted prefix for a record id.
        Tries primary first, then fallback, returns None if neither succeeded.
        """
        primary = f"{self.extracted_prefix}/{record_id}"
        if self._extraction_succeeded(primary):
            return primary

        fallback = self._try_fallback_dir(record_id)
        if fallback:
            return fallback

        return None

    def _extraction_succeeded(self, prefix: str) -> bool:
        """Return True if the extracted prefix has a meta.json showing success."""
        meta = f"{prefix}/meta.json"
        if not self.storage.exists(meta):
            return False
        try:
            doc = AssembledDocument.model_validate_json(_read_text(self.storage, meta))
            return not doc.extraction_failed
        except Exception:
            return False

    def _try_fallback_dir(self, record_id: int | str) -> str | None:
        """Return fallback extracted prefix if it exists and succeeded, else None."""
        if not self.fallback_prefix:
            return None
        prefix = f"{self.fallback_prefix}/{record_id}"
        if self._extraction_succeeded(prefix):
            logger.debug("Using fallback extraction for %s", record_id)
            return prefix
        return None

    def assemble_article(self, record: Resource) -> AssembledDocument | None:
        """
        Assemble text for an article-category record from pre-extracted files.
        Returns None if the article has no text to assemble.
        """
        record_prefix = f"{self.output_prefix}/{record.id}"
        assembled_key = f"{record_prefix}/assembled.txt"
        meta_key = f"{record_prefix}/meta.json"

        if not self.force and self.storage.exists(assembled_key) and self.storage.exists(meta_key):
            logger.debug("Skipping %d - already assembled", record.id)
            return AssembledDocument.model_validate_json(_read_text(self.storage, meta_key))

        parts: list[str] = []
        toc: list[TableOfContentsEntry] = []
        sections: list[ExtractedSection] = []
        pages: list[PageContent] = []
        extractors_used: set[str] = set()
        doc_type_hints: list[DocTypeHint] = []

        summary = clean_text(record.summary) if record.summary else None
        body = strip_html(record.body) if record.body else None
        if summary:
            parts.append(summary)
        if body:
            parts.append(body)

        total_pages = self._collect_children(
            record, parts, toc, sections, pages, extractors_used, doc_type_hints
        )
        total_pages += self._collect_raadsinformatie(
            record, parts, toc, sections, pages, extractors_used, doc_type_hints
        )

        text = "\n\n".join(parts)
        if not text:
            logger.debug("Skipping truly empty article %d", record.id)
            return None

        layout_hint = next((t for t in _TYPE_PRIORITY if t in doc_type_hints), DocTypeHint.unknown)
        name_hint = _infer_doc_type_from_title(record.title or "")
        doc_type = _resolve_hints(layout_hint, name_hint)

        doc = AssembledDocument(
            id=_doc_id(record.id),
            source=SOURCE,
            title=record.title,
            url=record.page_url_abs,
            language=record.language,
            summary=summary,
            body=body,
            keywords=record.keywords,
            category=record.category,
            published_at=record.publication_start,
            text=text,
            toc=toc,
            sections=sections,
            pages=pages,
            doc_type_hint=doc_type,
            layout_hint=layout_hint,
            name_hint=name_hint,
            page_count=total_pages or None,
            metadata={
                "creator_id": record.creator_id,
                "authors": record.authors,
                "teams": record.teams,
            },
        )

        self.storage.write_file(text, assembled_key)
        self.storage.write_file(doc.model_dump_json(indent=2), meta_key)
        logger.debug("Assembled %d -> %s", record.id, assembled_key)

        return doc

    def _collect_children(
        self,
        record: Resource,
        parts: list[str],
        toc: list[TableOfContentsEntry],
        sections: list[ExtractedSection],
        pages: list[PageContent],
        extractors_used: set[str],
        doc_type_hints: list[DocTypeHint],
    ) -> int:
        """Stitch text + metadata from all child document records. Returns total page count."""
        total_pages = 0
        for child_id in record.document_ids:
            child_prefix = self._resolve_extracted_dir(child_id)

            if child_prefix is None:
                logger.warning(
                    "Child %d of article %d not extracted yet - run extract_documents first",
                    child_id,
                    record.id,
                )
                continue

            for txt_key in _list_txt_files(self.storage, child_prefix):
                text = _read_text(self.storage, txt_key).strip()
                if text:
                    parts.append(text)

            child_meta = f"{child_prefix}/meta.json"
            if self.storage.exists(child_meta):
                total_pages += self._merge_child_meta(
                    child_meta, toc, sections, pages, extractors_used, doc_type_hints
                )
        return total_pages

    def _collect_raadsinformatie(
        self,
        record: Resource,
        parts: list[str],
        toc: list[TableOfContentsEntry],
        sections: list[ExtractedSection],
        pages: list[PageContent],
        extractors_used: set[str],
        doc_type_hints: list[DocTypeHint],
    ) -> int:
        """Read pre-extracted raadsinformatie text from extracted/{record.id}/."""
        if not record.raadsinformatie:
            return 0

        ri_prefix = self._resolve_extracted_dir(record.id)
        if ri_prefix is None:
            logger.warning(
                "Raadsinformatie not pre-extracted for article %d - run extract_documents first",
                record.id,
            )
            return 0

        for txt_key in _list_txt_files(self.storage, ri_prefix):
            text = _read_text(self.storage, txt_key).strip()
            if text:
                parts.append(text)

        ri_meta = f"{ri_prefix}/meta.json"
        if self.storage.exists(ri_meta):
            return self._merge_child_meta(
                ri_meta, toc, sections, pages, extractors_used, doc_type_hints
            )
        return 0

    def _merge_child_meta(
        self,
        child_meta_key: str,
        toc: list[TableOfContentsEntry],
        sections: list[ExtractedSection],
        pages: list[PageContent],
        extractors_used: set[str],
        doc_type_hints: list[DocTypeHint],
    ) -> int:
        """Merge structural metadata from one child AssembledDocument. Returns page count."""
        try:
            raw = _read_json(self.storage, child_meta_key)
            raw.pop("pages", None)  # not used in chunking, saves memory
            child_doc = AssembledDocument.model_validate(raw)
            toc.extend(child_doc.toc)
            for s in child_doc.sections:
                s.source_doc_id = child_doc.id
            sections.extend(child_doc.sections)
            pages.extend(child_doc.pages)
            extractors_used.update(child_doc.extractors_used)
            if child_doc.doc_type_hint != DocTypeHint.unknown:
                doc_type_hints.append(child_doc.doc_type_hint)
            return child_doc.page_count or 0
        except Exception:
            return 0

    def compile_collections(
        self,
        doc: AssembledDocument,
        collections_prefix: str,
        collections: list[str] | None = None,
        min_chars: int = 100,
        chunk_size: int = 1000,
        chunk_overlap: int = 200,
    ) -> dict[str, int]:
        """
        Compile index chunks from an assembled doc and write them to collection prefixes.

        Args:
            doc:                Assembled document to compile.
            collections_prefix: Root prefix, e.g. "collections".
            collections:        Which collections to write (default: summaries + best_chunks).
            min_chars:          Skip chunks with fewer chars than this.
            chunk_size:         Max chars per chunk for fixed window splitting.
            chunk_overlap:      Overlap between fixed window chunks.

        Returns:
            Dict of collection name -> number of chunks written.
        """
        if collections is None:
            collections = ["summaries", "best_chunks"]

        collections_prefix = collections_prefix.rstrip("/")
        written: dict[str, int] = {}
        doc_filename = doc.id.replace(":", "_")

        # summaries collection - one chunk per doc, just the summary
        if "summaries" in collections and doc.summary:
            chunks = [
                IndexChunk(
                    content=doc.summary,
                    chunk_type="summary",
                    doc_id=doc.id,
                    source=doc.source,
                    title=doc.title,
                    url=doc.url,
                    published_at=doc.published_at,
                    category=doc.category,
                    language=doc.language,
                    keywords=doc.keywords,
                    creator_id=doc.metadata.get("creator_id"),
                    authors=doc.metadata.get("authors", []),
                    teams=doc.metadata.get("teams", []),
                )
            ]
            key = f"{collections_prefix}/summaries/{doc_filename}.json"
            IndexChunk.save_file(chunks, self.storage, key)
            written["summaries"] = len(chunks)

        # best_chunks collection - summary + body + sections or text chunks
        if "best_chunks" in collections:
            chunks = chunk_assembled_doc(
                doc, min_chars=min_chars, chunk_size=chunk_size, chunk_overlap=chunk_overlap
            )
            if chunks:
                key = f"{collections_prefix}/best_chunks/{doc_filename}.json"
                IndexChunk.save_file(chunks, self.storage, key)
                written["best_chunks"] = len(chunks)

        return written
