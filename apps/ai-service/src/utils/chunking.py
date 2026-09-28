"""
Generic chunking utilities for AssembledDocument -> IndexChunk conversion.

Chunking strategy for best_chunks collection:
  always:       summary chunk + body chunk (if present)
  if sections:  one chunk per section, skip if < min_chars or extraction garbage,
                split if > max_chars (caps under Azure embed 8192-token limit)
  elif text:    fixed window chunks over text, skip if < min_chars
"""

from __future__ import annotations

from langchain_text_splitters import RecursiveCharacterTextSplitter
from src.utils.schemas import AssembledDocument, IndexChunk

# Hard cap on a single chunk's char length. ~6k tokens for Dutch (using the
# corpus's ~3.5 chars/token ratio), safely under Azure's 8192-token embed
# limit. Leaves 99.8% of sections untouched - only the outliers (one giant
# section per doc - the 30 problem docs identified by find_huge_sections.py)
# get split into 2-3 sub-chunks at paragraph boundaries.
_MAX_CHARS = 20_000

# Tokens that signal docling extraction garbage (PDF font/glyph fallback when
# the underlying script can't be decoded - Arabic, CID-encoded fonts, etc.).
# Sections dominated by these tokens are non-text noise; embedding them
# wastes API calls and pollutes the retrieval space.
_GLYPH_GARBAGE_PREFIXES = ("/a", "/gid", "/i255")
_GARBAGE_TOKEN_RATIO = 0.4
_GARBAGE_MIN_TOKENS = 20  # don't false-positive on a few stray glyph names


def _looks_like_extraction_garbage(text: str) -> bool:
    """Return True for sections that look like raw PDF glyph extraction output."""
    tokens = text.split()
    if len(tokens) < _GARBAGE_MIN_TOKENS:
        return False
    junk = sum(1 for t in tokens if t.startswith(_GLYPH_GARBAGE_PREFIXES))
    return junk / len(tokens) > _GARBAGE_TOKEN_RATIO


def _split_if_oversize(text: str, max_chars: int = _MAX_CHARS) -> list[str]:
    r"""
    Return [text] if it fits, else split into sub-chunks at paragraph boundaries.

    No overlap - splits happen at semantic boundaries (\n\n, then \n), so each
    sub-chunk is already a self-contained slice of the original section.
    """
    if len(text) <= max_chars:
        return [text]
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=max_chars,
        chunk_overlap=0,
        separators=["\n\n", "\n"],
    )
    return splitter.split_text(text)


def _section_chunks(doc: AssembledDocument, meta: dict, min_chars: int) -> list[IndexChunk]:
    chunks = []
    for section in doc.sections:
        text = f"{section.title}\n\n{section.text}" if section.title else section.text
        if len(text) < min_chars or _looks_like_extraction_garbage(text):
            continue
        for part in _split_if_oversize(text):
            if len(part) < min_chars:
                continue
            chunks.append(
                IndexChunk(
                    content=part,
                    chunk_type="section",
                    page=section.page,
                    section_title=section.title,
                    source_doc_id=section.source_doc_id,
                    **meta,
                )
            )
    return chunks


def _text_chunks(
    doc: AssembledDocument,
    meta: dict,
    min_chars: int,
    chunk_size: int,
    chunk_overlap: int,
) -> list[IndexChunk]:
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=chunk_size,
        chunk_overlap=chunk_overlap,
        separators=["\n\n", "\n"],
    )
    return [
        IndexChunk(content=chunk_text, chunk_type="chunk", **meta)
        for chunk_text in splitter.split_text(doc.text)
        if len(chunk_text) >= min_chars
    ]


def chunk_assembled_doc(
    doc: AssembledDocument,
    min_chars: int = 100,
    chunk_size: int = 1000,
    chunk_overlap: int = 200,
) -> list[IndexChunk]:
    """
    Produce best_chunks for an assembled document.

    Always includes summary and body as standalone chunks if present (split if
    they exceed the size cap - rare, only ~7 body chunks in the corpus).
    Then sections if available, else fixed window over text.
    Chunks below min_chars or that look like extraction garbage are skipped.
    """
    meta = {
        "doc_id": doc.id,
        "source": doc.source,
        "title": doc.title,
        "url": doc.url,
        "published_at": doc.published_at,
        "category": doc.category,
        "language": doc.language,
        "keywords": doc.keywords,
        "creator_id": doc.metadata.get("creator_id") if doc.metadata else None,
        "authors": doc.metadata.get("authors", []) if doc.metadata else [],
        "teams": doc.metadata.get("teams", []) if doc.metadata else [],
    }
    chunks: list[IndexChunk] = []

    if doc.summary:
        for part in _split_if_oversize(doc.summary):
            chunks.append(IndexChunk(content=part, chunk_type="summary", **meta))

    if doc.body:
        for part in _split_if_oversize(doc.body):
            chunks.append(IndexChunk(content=part, chunk_type="body", **meta))

    if doc.sections:
        chunks.extend(_section_chunks(doc, meta, min_chars))
    elif doc.text:
        chunks.extend(_text_chunks(doc, meta, min_chars, chunk_size, chunk_overlap))

    # Salvage: sections were present but every one was filtered out (shorter than
    # min_chars or extraction garbage) while the document still has usable full
    # text. Fall back to fixed-window chunks rather than emit nothing. Without
    # this, an upload whose docling sections are thin yields 0 chunks -> 0 effects.
    # OR docs are unaffected: they always carry a summary chunk, so `chunks` is
    # already non-empty here.
    if not chunks and doc.text:
        chunks.extend(_text_chunks(doc, meta, min_chars, chunk_size, chunk_overlap))

    return chunks
