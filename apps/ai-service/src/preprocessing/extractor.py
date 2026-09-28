"""
Format-aware document extractor with pluggable PDF backends.

Supports PyMuPDF, Docling, and pdfplumber for PDF extraction.
DOCX and TXT are handled directly, no backend choice needed.

Dependencies:
    pymupdf       - fast, always available:  uv add pymupdf
    docling       - slow, rich structure:    uv add docling
    pdfplumber    - simple, no TOC/metadata: uv add pdfplumber

Usage:
    extractor = DocumentExtractor(backend="pymupdf")
    doc = extractor.extract(storage, "openresearch/15907/report.pdf")

    doc.text          - full plain text
    doc.toc           - table of contents entries
    doc.sections      - semantic sections (Docling: with bboxes, PyMuPDF: page-level)
    doc.pages         - per-page content with text, dimensions, text blocks
    doc.pdf_metadata  - title, author, creator, keywords etc.
    doc.doc_type_hint - inferred document type (report, thesis, presentation, factsheet)
    doc.page_count    - number of pages
    doc.extractor     - "pymupdf" | "docling" | "pdfplumber" | "docx" | "txt"
    doc.warnings      - any issues encountered

Bounding boxes:
    PyMuPDF  - available on TextBlock level (raw blocks), None on sections
    Docling  - available on ExtractedSection level (semantic elements)
"""

from __future__ import annotations

import gc
import logging
import os
import re
import time
from pathlib import Path
from typing import Literal

from src.storage import Storage, with_local_path
from src.utils.doc_utils import pdf_skip_reason
from src.utils.schemas import (
    BoundingBox,
    DocTypeHint,
    ExtractedDocument,
    ExtractedSection,
    PageContent,
    PDFMetadata,
    TableOfContentsEntry,
    TextBlock,
)
from src.utils.string_utils import clean_text

logger = logging.getLogger(__name__)

SUPPORTED_SUFFIXES = {".pdf", ".docx", ".txt"}
Backend = Literal[
    "pymupdf", "docling", "pdfplumber"
]  # PDF backends only; DOCX/TXT use native parsers


class UnsupportedFormatError(Exception):
    """Raised when the file format is not supported by the extractor."""


class ExtractionError(Exception):
    """Raised when extraction fails due to a backend error or missing file."""


def _infer_doc_type(
    page_count: int | None,
    pages: list[PageContent],
    toc: list[TableOfContentsEntry],
    pdf_metadata: PDFMetadata | None,
) -> DocTypeHint:
    if page_count is None:
        return DocTypeHint.unknown

    creator = (pdf_metadata.creator or "").lower() if pdf_metadata else ""
    if any(x in creator for x in ("powerpoint", "impress", "keynote", "canva")):
        return DocTypeHint.presentation

    # landscape pages -> likely presentation or poster
    # guard: all() on empty sequence returns True, so require at least one page with dimensions
    pages_with_dims = [p for p in pages if p.width and p.height]
    if pages_with_dims and all(p.width > p.height for p in pages_with_dims):
        return DocTypeHint.presentation

    if page_count <= 4:
        return DocTypeHint.factsheet

    if page_count >= 40 and toc:
        return DocTypeHint.thesis

    if toc:
        return DocTypeHint.report

    return DocTypeHint.unknown


def _get_docling_bbox_and_page(item: object) -> tuple[int | None, BoundingBox | None]:
    """Extract page number and bounding box from a Docling item's provenance."""
    prov = getattr(item, "prov", None) or []
    if not prov:
        return None, None
    p = prov[0]
    page = getattr(p, "page_no", None)
    raw_bbox = getattr(p, "bbox", None)
    if raw_bbox is None:
        return page, None
    return page, BoundingBox(
        page=page or 0,
        x0=float(raw_bbox.l),
        y0=float(raw_bbox.b),
        x1=float(raw_bbox.r),
        y1=float(raw_bbox.t),
    )


def _flush_docling_section(
    sections: list[ExtractedSection],
    current_title: str | None,
    current_level: int | None,
    current_page: int | None,
    current_bbox: BoundingBox | None,
    current_texts: list[str],
) -> None:
    """Append the current accumulated section to the sections list."""
    body = clean_text("\n\n".join(current_texts))
    if current_title or body:
        sections.append(
            ExtractedSection(
                title=current_title,
                level=current_level,
                text=body,
                page=current_page,
                bbox=current_bbox,
            )
        )


def _parse_docx_paragraphs(
    paragraphs: list,
) -> tuple[list[ExtractedSection], list[TableOfContentsEntry]]:
    """Parse DOCX paragraph list into sections and TOC entries."""
    sections: list[ExtractedSection] = []
    toc: list[TableOfContentsEntry] = []
    current_title: str | None = None
    current_level: int | None = None
    current_texts: list[str] = []

    for para in paragraphs:
        text = para.text.strip()
        if not text:
            continue
        style = para.style.name if para.style else ""
        if style.startswith("Heading"):
            body = clean_text("\n\n".join(current_texts))
            if current_title or body:
                sections.append(
                    ExtractedSection(title=current_title, level=current_level, text=body)
                )
            try:
                current_level = int(style.split()[-1])
            except ValueError:
                current_level = 1
            current_title = text
            current_texts = []
            toc.append(TableOfContentsEntry(level=current_level, title=text))
        else:
            current_texts.append(text)

    body = clean_text("\n\n".join(current_texts))
    if current_title or body:
        sections.append(ExtractedSection(title=current_title, level=current_level, text=body))

    return sections, toc


def _pdfplumber_extract_pages(path: Path) -> tuple[list[PageContent], list[str]]:
    """Open a PDF with pdfplumber and extract per-page text. Returns (pages, warnings)."""
    try:
        import pdfplumber  # noqa: PLC0415
    except ImportError as e:
        raise ExtractionError("Run: uv add pdfplumber") from e

    warnings: list[str] = []
    pages: list[PageContent] = []

    with pdfplumber.open(path) as pdf:
        for page in pdf.pages:
            page_num = page.page_number  # 1-indexed
            try:
                text = page.extract_text() or ""
            except Exception as e:
                logger.warning("pdfplumber error on page %d of %s: %s", page_num, path.name, e)
                text = ""

            if not text.strip():
                warnings.append(f"No text on page {page_num} — skipping")

            pages.append(
                PageContent(
                    page_number=page_num,
                    text=clean_text(text),
                    width=float(page.width) if page.width else None,
                    height=float(page.height) if page.height else None,
                    blocks=[],  # pdfplumber has words/chars but no paragraph blocks
                )
            )

    return pages, warnings


def _parse_docling_document(
    docling_doc: object,
) -> tuple[
    list[ExtractedSection],
    list[TableOfContentsEntry],
    list[str],
    dict[int, list[str]],
    dict[int, list[TextBlock]],
]:
    """Parse a Docling document into sections, TOC, text parts, and page data."""
    sections: list[ExtractedSection] = []
    toc: list[TableOfContentsEntry] = []
    full_text_parts: list[str] = []
    page_texts: dict[int, list[str]] = {}
    page_blocks: dict[int, list[TextBlock]] = {}

    current_title: str | None = None
    current_level: int | None = None
    current_page: int | None = None
    current_bbox: BoundingBox | None = None
    current_texts: list[str] = []

    for item, level in docling_doc.iterate_items():
        label = getattr(item, "label", None)
        text = (getattr(item, "text", None) or "").strip()
        if not text:
            continue

        label_str = str(label).lower() if label else ""
        is_heading = any(h in label_str for h in ("section_header", "heading", "title"))
        page, bbox = _get_docling_bbox_and_page(item)

        if page is not None:
            page_texts.setdefault(page, []).append(text)
            if bbox:
                page_blocks.setdefault(page, []).append(
                    TextBlock(text=text, page=page, bbox=bbox, block_type=label_str or None)
                )

        full_text_parts.append(text)

        if is_heading:
            _flush_docling_section(
                sections, current_title, current_level, current_page, current_bbox, current_texts
            )
            current_title = text
            current_level = level or 1
            current_page = page
            current_bbox = bbox
            current_texts = []
            toc.append(TableOfContentsEntry(level=current_level, title=text, page=page))
        else:
            current_texts.append(text)

    _flush_docling_section(
        sections, current_title, current_level, current_page, current_bbox, current_texts
    )

    return sections, toc, full_text_parts, page_texts, page_blocks


class DocumentExtractor:
    """
    Extracts structured text from documents.

    Args:
        backend:           PDF extraction backend - "pymupdf" (fast, block-level bboxes),
                           "docling" (slow, semantic section bboxes), or
                           "pdfplumber" (simple, no TOC/metadata).
        max_file_mb:       Skip PDFs larger than this (MB).
        max_pages:         Skip PDFs with more pages than this.
        min_text_fraction: Skip PDFs where fewer than this fraction of pages have >50 chars.
                           Docling-only — pymupdf/pdfplumber handle image-heavy PDFs fine.
        min_char_density:  Skip PDFs with fewer chars/byte than this.
                           Docling-only — catches praatplaten that OOM the layout model.
    """

    _BACKEND_DEFAULTS: dict[str, dict] = {
        "docling": {
            "max_file_mb": 100,
            "max_pages": 300,
            "min_text_fraction": 0.2,
            "min_char_density": 0.001,
        },
        "pymupdf": {
            "max_file_mb": 500,
            "max_pages": 1000,
            "min_text_fraction": 0.0,  # no density filtering — pymupdf handles image PDFs fine
            "min_char_density": 0.0,
        },
        "pdfplumber": {
            "max_file_mb": 200,
            "max_pages": 1000,
            "min_text_fraction": 0.0,
            "min_char_density": 0.0,
        },
    }

    def __init__(
        self,
        backend: Backend = "pymupdf",
        max_file_mb: float | None = None,
        max_pages: int | None = None,
        min_text_fraction: float | None = None,
        min_char_density: float | None = None,
    ) -> None:
        self.backend = backend
        defaults = self._BACKEND_DEFAULTS.get(backend, self._BACKEND_DEFAULTS["pymupdf"])
        self.max_file_mb = max_file_mb if max_file_mb is not None else defaults["max_file_mb"]
        self.max_pages = max_pages if max_pages is not None else defaults["max_pages"]
        self.min_text_fraction = (
            min_text_fraction if min_text_fraction is not None else defaults["min_text_fraction"]
        )
        self.min_char_density = (
            min_char_density if min_char_density is not None else defaults["min_char_density"]
        )
        self._docling_converter = None
        self._docling_doc_count = 0
        self._docling_recreate_every = 20  # recreate converter to release memory

    def _get_docling_converter(self, force_recreate: bool = False):
        if force_recreate and self._docling_converter is not None:
            # DoclingParseV2DocumentBackend accumulates memory in the backend
            # across conversions and never releases it (docling issue #2209).
            # There is no per-document cleanup API — explicit pipeline clearing
            # + deletion + gc is the only confirmed workaround.
            self._docling_converter.initialized_pipelines.clear()
            del self._docling_converter
            self._docling_converter = None
            gc.collect()

        if self._docling_converter is None:
            try:
                from docling.datamodel.base_models import InputFormat
                from docling.datamodel.pipeline_options import PdfPipelineOptions
                from docling.document_converter import DocumentConverter, PdfFormatOption
            except ImportError as e:
                raise ExtractionError("Run: uv add docling") from e

            opts = PdfPipelineOptions()
            opts.do_ocr = False
            opts.do_table_structure = False

            # Consume the layout model baked into the image (DOCLING_ARTIFACTS_PATH,
            # set in the Dockerfile) instead of downloading it from HuggingFace on
            # the first conversion. The runtime download was the multi-minute
            # cold-start that overran the analyze-document timeout.
            artifacts_path = os.getenv("DOCLING_ARTIFACTS_PATH") or None
            if artifacts_path:
                opts.artifacts_path = artifacts_path

            self._docling_converter = DocumentConverter(
                format_options={InputFormat.PDF: PdfFormatOption(pipeline_options=opts)}
            )
        return self._docling_converter

    def extract(self, storage: Storage, key: str) -> ExtractedDocument:
        """
        Extract structured text from a single file in storage.

        Args:
            storage: Storage backend the file lives in.
            key:     Storage-relative path / blob key.

        Returns:
            ExtractedDocument with text, toc, sections, pages, pdf_metadata,
            doc_type_hint, page_count. sections[i].bbox is populated for
            Docling; pages[i].blocks[j].bbox is populated for both backends.

        Raises:
            UnsupportedFormatError: File format not supported.
            ExtractionError: Extraction failed.
        """
        suffix = Path(key).suffix.lower()
        if suffix not in SUPPORTED_SUFFIXES:
            raise UnsupportedFormatError(
                f"Unsupported format '{suffix}'. Supported: {SUPPORTED_SUFFIXES}"
            )
        if not storage.exists(key):
            raise ExtractionError(f"File not found: {key}")

        display_name = Path(key).name
        logger.debug("Extracting %s (backend=%s)", display_name, self.backend)

        # .txt has no path-hungry library, read straight from storage.
        if suffix == ".txt":
            return self._extract_txt_bytes(storage.read_file(key))

        try:
            with with_local_path(storage, key, suffix=suffix) as path:
                match suffix:
                    case ".pdf":
                        return self._extract_pdf(path, display_name=display_name)
                    case ".docx":
                        return self._extract_docx(path)
                    case _:
                        raise UnsupportedFormatError(suffix)
        except (UnsupportedFormatError, ExtractionError):
            raise
        except Exception as e:
            raise ExtractionError(f"Failed to extract {display_name}: {e}") from e

    # ------------------------------------------------------------------ PDF

    def _extract_pdf(self, path: Path, display_name: str) -> ExtractedDocument:
        if self.backend == "docling":
            return self._extract_pdf_docling(path, display_name=display_name)
        if self.backend == "pdfplumber":
            return self._extract_pdf_pdfplumber(path, display_name=display_name)
        return self._extract_pdf_pymupdf(path)

    def _extract_pdf_pymupdf(self, path: Path) -> ExtractedDocument:
        try:
            import fitz
        except ImportError as e:
            raise ExtractionError("Run: uv add pymupdf") from e

        doc = fitz.open(path)
        warnings = []

        # PDF metadata
        raw_meta = doc.metadata or {}
        pdf_metadata = PDFMetadata(
            title=raw_meta.get("title") or None,
            author=raw_meta.get("author") or None,
            subject=raw_meta.get("subject") or None,
            keywords=raw_meta.get("keywords") or None,
            creator=raw_meta.get("creator") or None,
            producer=raw_meta.get("producer") or None,
        )

        # TOC - list of [level, title, page]
        toc = [
            TableOfContentsEntry(level=entry[0], title=entry[1], page=entry[2])
            for entry in doc.get_toc()
        ]

        # Per-page content with text blocks and bboxes
        pages: list[PageContent] = []

        for page in doc:
            page_text = page.get_text()

            # raw dict gives us text blocks with bboxes
            raw_dict = page.get_text("dict")
            blocks: list[TextBlock] = []
            for block in raw_dict.get("blocks", []):
                if block.get("type") != 0:  # 0 = text, 1 = image
                    continue
                block_text = " ".join(
                    span.get("text", "")
                    for line in block.get("lines", [])
                    for span in line.get("spans", [])
                ).strip()
                if not block_text:
                    continue
                x0, y0, x1, y1 = block["bbox"]
                blocks.append(
                    TextBlock(
                        text=block_text,
                        page=page.number + 1,
                        bbox=BoundingBox(
                            page=page.number + 1,
                            x0=x0,
                            y0=y0,
                            x1=x1,
                            y1=y1,
                        ),
                        block_type="paragraph",
                    )
                )

            rect = page.rect
            pages.append(
                PageContent(
                    page_number=page.number + 1,
                    text=clean_text(page_text),
                    width=rect.width,
                    height=rect.height,
                    blocks=blocks,
                )
            )

        page_count = doc.page_count
        doc.close()

        full_text = "\n\n".join(p.text for p in pages if p.text)

        if not full_text:
            warnings.append("No text extracted - may be a scanned PDF without text layer")

        # sections from TOC + page text - page-level granularity, no section bboxes
        sections = _build_sections_from_toc(toc, pages) if toc else []

        doc_type = _infer_doc_type(page_count, pages, toc, pdf_metadata)

        return ExtractedDocument(
            text=full_text,
            toc=toc,
            sections=sections,
            pages=pages,
            pdf_metadata=pdf_metadata,
            doc_type_hint=doc_type,
            page_count=page_count,
            extractor="pymupdf",
            warnings=warnings,
        )

    def _extract_pdf_pdfplumber(self, path: Path, display_name: str) -> ExtractedDocument:
        reason = pdf_skip_reason(
            path,
            max_file_mb=self.max_file_mb,
            max_pages=self.max_pages,
            min_text_fraction=self.min_text_fraction,
            min_char_density=self.min_char_density,
        )
        if reason:
            raise ExtractionError(f"Skipping {display_name}: {reason}")

        pages, warnings = _pdfplumber_extract_pages(path)
        page_count = len(pages)
        full_text = "\n\n".join(p.text for p in pages if p.text)

        if not full_text:
            warnings.append("No text extracted — may be a scanned PDF without text layer")

        # pdfplumber has no TOC or metadata API
        doc_type = _infer_doc_type(page_count, pages, toc=[], pdf_metadata=None)

        return ExtractedDocument(
            text=full_text,
            toc=[],
            sections=[],
            pages=pages,
            pdf_metadata=None,
            doc_type_hint=doc_type,
            page_count=page_count,
            extractor="pdfplumber",
            warnings=warnings,
        )

    def _extract_pdf_docling(self, path: Path, display_name: str) -> ExtractedDocument:
        self._docling_doc_count += 1
        force_recreate = self._docling_doc_count % self._docling_recreate_every == 0
        if force_recreate:
            logger.info(
                "Recreating Docling converter after %d docs to release memory",
                self._docling_doc_count,
            )
        logger.info("Docling: loading converter for %s", display_name)
        converter = self._get_docling_converter(force_recreate=force_recreate)

        file_size_mb = path.stat().st_size / 1024 / 1024
        reason = pdf_skip_reason(
            path,
            max_file_mb=self.max_file_mb,
            max_pages=self.max_pages,
            min_text_fraction=self.min_text_fraction,
            min_char_density=self.min_char_density,
        )
        if reason:
            raise ExtractionError(f"Skipping {display_name}: {reason}")

        logger.info(
            "Docling: converting %s (doc %d, %.1f MB)",
            display_name,
            self._docling_doc_count,
            file_size_mb,
        )
        warnings = []
        t0 = time.monotonic()

        result = converter.convert(str(path))

        logger.info(
            "Docling: finished %s in %.1fs",
            display_name,
            time.monotonic() - t0,
        )

        sections, toc, full_text_parts, page_texts, page_blocks = _parse_docling_document(
            result.document
        )

        all_page_nums = sorted(set(page_texts) | set(page_blocks))
        pages: list[PageContent] = [
            PageContent(
                page_number=pn,
                text=clean_text("\n\n".join(page_texts.get(pn, []))),
                blocks=page_blocks.get(pn, []),
                width=None,
                height=None,
            )
            for pn in all_page_nums
        ]

        full_text = clean_text("\n\n".join(full_text_parts))
        if not full_text:
            warnings.append("No text extracted by Docling")

        if sections and not any(s.bbox for s in sections):
            warnings.append(
                "No bboxes found in Docling output - "
                "PDF may lack provenance data (e.g. image-based or encrypted)"
            )

        page_count = max(all_page_nums) if all_page_nums else None
        doc_type = _infer_doc_type(page_count, pages, toc, pdf_metadata=None)

        return ExtractedDocument(
            text=full_text,
            toc=toc,
            sections=sections,
            pages=pages,
            pdf_metadata=None,  # docling doesn't expose PDF metadata directly
            doc_type_hint=doc_type,
            page_count=page_count,
            extractor="docling",
            warnings=warnings,
        )

    # ------------------------------------------------------------------ DOCX

    def _extract_docx(self, path: Path) -> ExtractedDocument:
        try:
            from docx import Document
        except ImportError as e:
            raise ExtractionError("Run: uv add python-docx") from e

        doc = Document(path)
        warnings = []
        sections, toc = _parse_docx_paragraphs(doc.paragraphs)

        full_text = clean_text(
            "\n\n".join(s.text for s in sections if s.text)
            or "\n\n".join(p.text.strip() for p in doc.paragraphs if p.text.strip())
        )

        if not full_text:
            warnings.append("No text extracted from DOCX")

        return ExtractedDocument(
            text=full_text,
            toc=toc,
            sections=sections,
            extractor="docx",
            warnings=warnings,
        )

    # ------------------------------------------------------------------ TXT

    def _extract_txt_bytes(self, data: bytes) -> ExtractedDocument:
        text = clean_text(data.decode("utf-8", errors="replace"))
        return ExtractedDocument(
            text=text,
            extractor="txt",
        )


# ------------------------------------------------------------------ helpers


def _build_sections_from_toc(
    toc: list[TableOfContentsEntry],
    pages: list[PageContent],
) -> list[ExtractedSection]:
    """
    Build approximate sections from PyMuPDF TOC + PageContent list.
    Page-level granularity only - no section bboxes.
    """
    sections = []
    for i, entry in enumerate(toc):
        start_page = (entry.page or 1) - 1
        end_page = (toc[i + 1].page - 1) if i + 1 < len(toc) else len(pages)
        end_page = min(end_page, len(pages))
        section_text = "\n\n".join(p.text for p in pages[start_page:end_page] if p.text)
        sections.append(
            ExtractedSection(
                title=entry.title,
                level=entry.level,
                text=section_text,
                page=entry.page,
                bbox=None,
            )
        )
    return sections


# ---------------------------------------------------------------------------
# Title/name-based doc type inference
# ---------------------------------------------------------------------------

_TITLE_PATTERNS: list[tuple[re.Pattern, DocTypeHint]] = [
    # strongest signals first
    (re.compile(r"\bfactsheet\b", re.IGNORECASE), DocTypeHint.factsheet),
    (re.compile(r"\bposter\b", re.IGNORECASE), DocTypeHint.poster),
    (re.compile(r"\b(thesis|proefschrift|dissertat\w+)\b", re.IGNORECASE), DocTypeHint.thesis),
    (
        # rapport/rapportage also match as suffix in compounds (eindrapport, jaarrapport)
        re.compile(r"rapport(age)?\b|reports?\b|\b(monitor|onderzoek|nota)\b", re.IGNORECASE),
        DocTypeHint.report,
    ),
    (
        re.compile(r"\b(presentat(ie[ns]?|ions?)|slides?|deck)\b", re.IGNORECASE),
        DocTypeHint.presentation,
    ),
]


def _infer_doc_type_from_title(title: str) -> DocTypeHint:
    """Infer document type from title or filename keywords (name-based hint)."""
    for pattern, hint in _TITLE_PATTERNS:
        if pattern.search(title):
            return hint
    return DocTypeHint.unknown


def _resolve_hints(layout: DocTypeHint, name: DocTypeHint) -> DocTypeHint:
    """
    Resolve layout and name hints into a single doc_type_hint.

    Name wins whenever it has a signal - an explicit keyword in the title
    is more reliable than layout heuristics (page count, aspect ratio, creator
    string). Layout is the fallback for documents with no recognisable type
    in their name.
    """
    if name != DocTypeHint.unknown:
        return name
    return layout
