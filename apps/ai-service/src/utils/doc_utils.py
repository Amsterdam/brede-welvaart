"""
Utils for document loading and preprocessing.

Uses pdfplumber for text extraction, which handles complex layouts and
multi-column documents better than basic PDF parsers.

If PDFs are scanned rather than digital, we can re-add pytesseract
as an OCR fallback (see plangids repo, requires Tesseract installed).
"""
import logging
from pathlib import Path

import pdfplumber
from langchain_core.documents import Document

logger = logging.getLogger(__name__)


def get_pdf_paths(folder: str) -> list[Path]:
    """
    Get all PDF file paths from a folder.

    Args:
        folder: Path to folder containing PDF files.

    Returns:
        Sorted list of PDF file paths.

    Raises:
        FileNotFoundError: If the folder does not exist.
        ValueError: If no PDF files are found in the folder.
    """
    folder_path = Path(folder)

    if not folder_path.exists():
        raise FileNotFoundError(f"Data folder not found: {folder}")

    pdf_files = sorted(folder_path.glob("*.pdf"))
    if not pdf_files:
        raise ValueError(f"No PDF files found in {folder}")

    logger.info("Found %d PDF files in %s", len(pdf_files), folder)
    return pdf_files


def load_pdfs(folder: str | None = None, pdf_paths: list[Path] | None = None) -> list[Document]:
    """
    Load PDF files (from folder or list)into LangChain Documents.

    Extracts text using pdfplumber. Pages with no extractable text
    (e.g. scanned pages) are skipped with a warning.

    Accepts either a folder path or an explicit list of PDF paths.

    Args:
        folder: Path to folder containing PDF files.
        pdf_paths: Explicit list of PDF file paths.

    Returns:
        List of Document objects, one per page across all PDFs.
    """
    if pdf_paths is None:
        if folder is None:
            raise ValueError("Either folder or pdf_paths must be provided.")
        pdf_paths = get_pdf_paths(folder)

    documents = []
    for pdf_file in pdf_paths:
        logger.info("Loading: %s", pdf_file.name)
        try:
            pages = _load_pdf(pdf_file)
            documents.extend(pages)
            logger.info("Extracted %d pages from %s", len(pages), pdf_file.name)
        except Exception as e:
            logger.error("Failed to load %s: %s", pdf_file.name, e)

    logger.info("Loaded %d pages total from %d PDFs", len(documents), len(pdf_paths))
    return documents


def _load_pdf(pdf_path: Path) -> list[Document]:
    """
    Extract text from a single PDF file.

    Args:
        pdf_path: Path to the PDF file.

    Returns:
        List of Document objects, one per page.
    """
    pages = []
    with pdfplumber.open(pdf_path) as pdf:
        for page_num, page in enumerate(pdf.pages, start=1):
            try:
                text = page.extract_text()
            except Exception as e:
                logger.error("Error extracting page %d from %s: %s", page_num, pdf_path.name, e)
                text = None

            if not text or not text.strip():
                logger.warning("No text on page %d of %s — skipping", page_num, pdf_path.name)
                continue

            pages.append(
                Document(
                    page_content=text,
                    metadata={"source": pdf_path.name, "page": page_num},
                )
            )

    return pages


def analyse_pdf(path: Path) -> dict:
    """
    Extract basic stats from a PDF using fitz.

    Returns a dict with:
        file_size_mb, page_count, valid_pages, text_pages,
        text_fraction, total_chars, char_density, readable (bool)

    readable=False means fitz could not open the file — all numeric
    fields are 0 and callers should fall back to attempting extraction.
    """
    file_size = path.stat().st_size
    file_mb = file_size / 1024 / 1024
    base = {
        "file_size_mb": file_mb,
        "page_count": 0,
        "valid_pages": 0,
        "text_pages": 0,
        "text_fraction": 0.0,
        "total_chars": 0,
        "char_density": 0.0,
        "readable": False,
    }
    try:
        import fitz  # noqa: PLC0415

        doc = fitz.open(path)
        page_count = doc.page_count
        total_chars = 0
        text_pages = 0
        valid_pages = 0
        for i in range(page_count):
            try:
                p = doc.load_page(i)
                text = p.get_text().strip()
                total_chars += len(text)
                if len(text) > 50:
                    text_pages += 1
                valid_pages += 1
            except Exception:
                pass
        doc.close()
        return {
            "file_size_mb": file_mb,
            "page_count": page_count,
            "valid_pages": valid_pages,
            "text_pages": text_pages,
            "text_fraction": text_pages / valid_pages if valid_pages else 0.0,
            "total_chars": total_chars,
            "char_density": total_chars / file_size if file_size else 0.0,
            "readable": True,
        }
    except Exception:
        return base


def pdf_skip_reason(
    path: Path,
    max_file_mb: float = 100.0,
    max_pages: int = 300,
    min_text_fraction: float = 0.2,
    min_char_density: float = 0.001,
) -> str | None:
    """
    Return a skip reason string if the PDF should not be extracted, or None if it's fine.

    Checks in order:
    1. File too large (> max_file_mb MB)
    2. Too many pages (> max_pages)
    3. Too few pages have text (< min_text_fraction of pages have >50 chars)
    4. Low text density (< min_char_density chars/byte) — catches praatplaten
       and visual posters that have scattered vector text labels but are
       essentially image content.

    Defaults are tuned for Docling. For lighter backends (pymupdf, pdfplumber)
    you may want higher thresholds, e.g. max_file_mb=500, max_pages=1000.

    Returns None on any fitz error so the caller falls back to attempting extraction.
    """
    stats = analyse_pdf(path)

    size_mb = round(stats["file_size_mb"])
    if stats["file_size_mb"] > max_file_mb:
        return f"file too large ({size_mb} MB > {max_file_mb} MB)"

    if not stats["readable"]:
        return None  # can't check — let Docling try

    if stats["page_count"] > max_pages:
        return f"too many pages ({stats['page_count']}p > {max_pages}p)"

    if stats["valid_pages"] > 0 and stats["text_fraction"] < min_text_fraction:
        return f"image-heavy ({stats['text_pages']}/{stats['valid_pages']} pages have text)"

    if stats["char_density"] < min_char_density:
        density = round(stats["char_density"], 4)
        chars = stats["total_chars"]
        size_mb_1 = round(stats["file_size_mb"], 1)
        return f"low text density ({chars} chars in {size_mb_1} MB = {density} chars/byte)"

    return None
