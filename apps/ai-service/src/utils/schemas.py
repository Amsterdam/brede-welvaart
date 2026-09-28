"""Schemas for LLM responses, benchmark results, validators, etc"""
# flake8: noqa: D106
import json
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Dict, List, Literal, Optional, Union

from pydantic import BaseModel, ConfigDict, Field, model_validator
from src.openresearch.models import AuthorProfile, TeamProfile
from src.storage import Storage

__all__ = ["AuthorProfile", "TeamProfile"]

BW_CATEGORIES = Literal[
    "subjectief_welzijn",
    "gezondheid",
    "inkomen",
    "onderwijs",
    "ruimte",
    "economisch_kapitaal",
    "natuurlijk_kapitaal",
    "sociaal_kapitaal",
    "veiligheid",
    "wonen",
]

# ------------------------------------------------------------------ extraction


class BoundingBox(BaseModel):
    """
    Bounding box of a text element on a PDF page, in points.
    PyMuPDF: top-left origin (y increases downward).
    Docling: bottom-left origin (PDF convention, y increases upward).
    The extractor preserves each backend's native convention - check extractor field.
    """

    page: int
    x0: float
    y0: float
    x1: float
    y1: float


class TableOfContentsEntry(BaseModel):
    level: int  # 1 = chapter, 2 = section, 3 = subsection
    title: str
    page: int | None = None


class TextBlock(BaseModel):
    """
    A raw text block within a page.
    PyMuPDF: one block per visual paragraph, bbox always populated.
    Docling: one block per semantic element, block_type populated.
    """

    text: str
    page: int
    bbox: BoundingBox | None = None
    block_type: str | None = None  # "paragraph", "list_item", "caption", etc. - Docling only


class PageContent(BaseModel):
    """Content of a single page - text, dimensions, and raw text blocks."""

    page_number: int  # 1-indexed
    text: str = ""  # full page text, cleaned
    width: float | None = None  # page width in points - PyMuPDF only
    height: float | None = None  # page height in points - PyMuPDF only
    blocks: list[TextBlock] = Field(default_factory=list)


class PDFMetadata(BaseModel):
    """Metadata embedded in a PDF file. Populated by PyMuPDF only."""

    title: str | None = None
    author: str | None = None
    subject: str | None = None
    keywords: str | None = None
    creator: str | None = None  # application that created the source (e.g. "PowerPoint")
    producer: str | None = None  # PDF writer (e.g. "Adobe PDF Library")


class DocTypeHint(str, Enum):
    """
    Inferred document type based on page count, layout, TOC presence, and PDF metadata.
    Used downstream to inform chunking strategy - e.g. chunk by section for reports,
    by page for presentations, fixed window as fallback.

    Two independent hints are stored per document (layout_hint, name_hint) alongside
    the resolved doc_type_hint. See assembler._resolve_hints for resolution logic.
    """

    report = "report"
    thesis = "thesis"
    presentation = "presentation"
    factsheet = "factsheet"
    poster = "poster"
    unknown = "unknown"


class ExtractedSection(BaseModel):
    """
    A semantic section of a document (heading + body text).
    PyMuPDF: sections built from TOC + page text ranges, bbox is None.
    Docling: sections from layout model, bbox populated per heading element.
    """

    title: str | None = None
    level: int | None = None
    text: str = ""
    page: int | None = None
    bbox: BoundingBox | None = None  # None for PyMuPDF, populated for Docling
    source_doc_id: str | None = None  # set by assembler when merging multi-doc articles


class ExtractedDocument(BaseModel):
    """
    Output of DocumentExtractor.extract().
    Both PyMuPDF and Docling backends return this model - consumers
    never need to know which backend was used.
    """

    text: str  # full plain text, always present
    toc: list[TableOfContentsEntry] = Field(default_factory=list)  # empty if PDF has no bookmarks
    sections: list[ExtractedSection] = Field(default_factory=list)  # empty for PyMuPDF without TOC
    pages: list[PageContent] = Field(default_factory=list)  # per-page text + blocks + dimensions
    pdf_metadata: PDFMetadata | None = None  # PDF-embedded metadata, PyMuPDF only
    doc_type_hint: DocTypeHint = DocTypeHint.unknown  # inferred from layout + metadata
    page_count: int | None = None
    extractor: Literal["pymupdf", "docling", "pdfplumber"] = "pymupdf"
    warnings: list[str] = Field(default_factory=list)  # e.g. "scanned PDF, no text layer"


# ------------------------------------------------------------------ assembly


class AssembledDocument(BaseModel):
    """
    A fully preprocessed document ready for chunking and indexing.
    Produced by source-specific assemblers (OR, raadsinformatie, etc.)
    and consumed by the retrieval layer.
    """

    id: str  # source-scoped, e.g. "openresearch:15907"
    source: str  # "openresearch" | "raadsinformatie" | ...
    title: str | None = None
    url: str | None = None
    language: list[str] = Field(default_factory=list)

    # content fields - kept separate so retriever can choose what to index
    body: str | None = None  # OR article body (HTML stripped) - the authored content
    summary: str | None = None  # human-written (OR: summary field, others: abstract etc.)
    auto_summary: str | None = None  # future: LLM-generated summary
    keywords: list[str] = Field(default_factory=list)
    category: str | None = None
    published_at: datetime | None = None
    text: str = ""  # full assembled: summary + body + children + RI

    # structural metadata - populated from ExtractedDocument(s)
    toc: list[TableOfContentsEntry] = Field(default_factory=list)
    sections: list[ExtractedSection] = Field(
        default_factory=list
    )  # populated when Docling was used
    pages: list[PageContent] = Field(default_factory=list)  # per-page content with bboxes
    pdf_metadata: PDFMetadata | None = None  # from first leaf document that has it

    # doc type - three fields: two independent signals + resolved value
    doc_type_hint: DocTypeHint = DocTypeHint.unknown  # resolved: used downstream
    layout_hint: DocTypeHint = DocTypeHint.unknown  # from creator string / landscape / page count
    name_hint: DocTypeHint = DocTypeHint.unknown  # from title / filename keywords

    page_count: int | None = None
    extractors_used: list[str] = Field(default_factory=list)

    # source-specific extras that don't fit the generic fields above
    metadata: dict[str, Any] = Field(default_factory=dict)

    # provenance
    assembled_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    extraction_failed: bool = False
    extraction_error: str | None = None


# ------------------------------------------------------------------ collections


class IndexChunk(BaseModel):
    """
    A single chunk ready for embedding and storage in a collection.
    Produced by ORAssembler.compile_collections(), consumed by the retriever.
    content is what gets embedded; all other fields are metadata stored alongside the vector.
    """

    content: str
    doc_id: str  # back to AssembledDocument.id
    source: str  # "openresearch" | "raadsinformatie" | ...
    title: str | None = None  # article title - for display and citation
    url: str | None = None  # for citations
    chunk_type: str  # "summary" | "body" | "section" | "chunk"
    page: int | None = None
    section_title: str | None = None  # if chunk came from a named section
    source_doc_id: str | None = None  # if section came from a child doc
    # propagated from main AssembledDocument
    published_at: datetime | None = None
    category: str | None = None  # e.g. article / report / etc
    language: list[str] = Field(default_factory=list)
    keywords: list[str] = Field(default_factory=list)
    creator_id: int | None = None  # OR author ID
    # Author profile fields — populated by enrich step
    authors: list[AuthorProfile] = Field(default_factory=list)
    teams: list[TeamProfile] = Field(default_factory=list)

    @classmethod
    def load_file(cls, storage: Storage, key: str) -> list["IndexChunk"]:
        raw = storage.read_file(key).decode("utf-8")
        return [cls.model_validate(c) for c in json.loads(raw)]

    @staticmethod
    def save_file(chunks: list["IndexChunk"], storage: Storage, key: str) -> None:
        """
        Write chunks as a JSON array. For LocalStorage we stream chunk-by-chunk
        to the file to avoid building a multi-GB list + multi-GB string in
        memory for very large indices (487k+ chunks on this corpus). Other
        backends fall back to the simple in-memory path.
        """
        # Local fast path: stream so peak memory stays at one chunk's worth.
        from src.storage.local import LocalStorage

        if isinstance(storage, LocalStorage):
            path = storage._resolve(key)
            path.parent.mkdir(parents=True, exist_ok=True)
            with path.open("w", encoding="utf-8") as f:
                f.write("[")
                for i, chunk in enumerate(chunks):
                    if i:
                        f.write(",")
                    f.write("\n  ")
                    f.write(json.dumps(chunk.model_dump(mode="json"), ensure_ascii=False))
                f.write("\n]\n")
            return

        # Fallback: in-memory build for non-local backends.
        data = json.dumps(
            [c.model_dump(mode="json") for c in chunks], ensure_ascii=False, indent=2
        )
        storage.write_file(data, key)


# ------------------------------------------------------------------ uploads


class UploadDocumentMeta(BaseModel):
    """
    Per-document status doc persisted at uploads/{project_id}/documents/{document_id}/meta.json.
    The backend can read this to surface extraction state ("extracted" | "failed") to the user.
    """

    project_id: str
    document_id: str
    filename: str | None = None
    blob_name: str  # storage key of the original uploaded PDF
    extracted_at: datetime
    status: Literal["extracted", "failed"]
    chunk_count: int = 0
    page_count: int | None = None
    extractor: str | None = None  # which DocumentExtractor backend ran
    error: str | None = None


# ------------------------------------------------------------------ manifests


class ExtractionRecord(BaseModel):
    """Slim per-document record written into the extraction manifest."""

    id: str
    title: str | None = None
    extractor: str = "pymupdf"
    layout_hint: DocTypeHint = DocTypeHint.unknown
    name_hint: DocTypeHint = DocTypeHint.unknown
    doc_type_hint: DocTypeHint = DocTypeHint.unknown
    page_count: int | None = None
    extraction_failed: bool = False
    extraction_error: str | None = None


class ExtractionManifest(BaseModel):
    """
    Written to the output folder after extract_documents.py.
    Tracks what was extracted, which backend was used, and what failed.
    Full document content lives in extracted/{id}/ — not here.
    """

    source: str
    started_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    finished_at: datetime | None = None
    extractor: str = "pymupdf"
    total: int = 0
    succeeded: int = 0
    failed: int = 0
    skipped: int = 0
    documents: list[ExtractionRecord] = Field(default_factory=list)


class AssemblyManifest(BaseModel):
    """
    Written to the output folder after assemble_articles.py.
    Single source of truth for what was assembled, what failed, and when.
    Full document content lives in assembled/{id}/ — not here.
    """

    source: str
    started_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    finished_at: datetime | None = None
    extractors_used: list[str] = Field(
        default_factory=list
    )  # backends that contributed, e.g. ["docling", "pymupdf"]
    total: int = 0
    succeeded: int = 0
    failed: int = 0
    skipped: int = 0
    documents: list[str] = Field(default_factory=list)  # assembled doc ids


# ------------------------------------------------------------------ llms


class LLMResponse(BaseModel):
    """Storing the inputs and outputs of LLMs"""

    model_config = ConfigDict(extra="allow")

    raw_prompt: str = ""
    formatted_prompt: Union[str, List] = Field(default="")
    raw_response: str = ""
    processed_response: Optional[str] = None
    error: bool = False
    exception: Optional[str] = None


class LLMMetadata(BaseModel):
    """LLM configuration metadata"""

    model_config = ConfigDict(extra="allow")

    model_name: str
    inference_engine: str
    params: Optional[Union[Dict[str, Any], str]] = None


# ------------------------------------------------------------------ retrieval and RAG


class RetrievalItem(IndexChunk):
    page: int = Field(default=0, ge=0)  # override: default 0 for display, IndexChunk allows None
    score: float

    @classmethod
    def from_chunk(cls, chunk: IndexChunk, score: float) -> "RetrievalItem":
        data = chunk.model_dump()
        data["page"] = data.get("page") or 0
        return cls(**data, score=score)


class RetrievalResults(BaseModel):
    """Storing the inputs and outputs of a retrieval query."""

    query: str
    results: List[RetrievalItem]
    error: bool = False
    exception: Optional[str] = None
    n_retrieved: int = 0
    score_threshold: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    top_n: Optional[int] = Field(default=None, ge=1, le=100)


class RetrievalMetadata(BaseModel):
    """Retrieval configuration metadata"""

    model_config = ConfigDict(extra="allow")

    model_name: str
    type: Literal["azure", "local"]
    params: Optional[Union[Dict[str, Any], str]] = None


class RAGResponse(LLMResponse):
    """Storing the inputs and outputs of a RAG pipeline."""

    retrieval_results: Optional[RetrievalResults] = None
    question: str = ""


class RAGMetadata(BaseModel):
    """RAG configuration metadata"""

    model_config = ConfigDict(extra="allow")

    llm: LLMMetadata
    retrieval: RetrievalMetadata
    params: Optional[Union[Dict[str, Any], str]] = None


# ------------------------------------------------------------------ BW: project input


class BWProjectInput(BaseModel):
    """
    Structured intake form passed by the non-AI backend.
    Replaces the old case_key / case_description pattern — callers now pass content directly.

    Fields map to the user-facing scan intake form:
      goal - goal of the scan (e.g. "broader perspective on policy X")
      motivation - why BW impact is needed
      scope - scope, exclusions, geographic or thematic focus
    """

    goal: str = Field(description="Goal of the scan")
    motivation: str = Field(description="Why the user wants BW impact insight")
    scope: str = Field(default="", description="Scope, exclusions, focus areas")
    pdf_bytes: bytes | None = Field(
        default=None,
        exclude=True,  # not serialized — passed in-memory from endpoint
        description="Raw bytes of an uploaded project document, if any",
    )
    language: Literal["nl", "en"] = Field(
        default=None,
        description="User language preference = overrides analyzer default when set",
    )
    top_n: int = Field(default=20, ge=1, le=100)


class BWFeedback(BaseModel):
    """
    Feedback signals from a previous analysis pass.
    The non-AI backend owns session state and passes this on each call.
    Used to filter already-seen results and (later) steer retrieval.
    """

    already_shown_ids: list[str] = Field(default_factory=list)
    liked_source_ids: list[str] = Field(
        default_factory=list,
        description="Positive signal — future: used for Qdrant recommendation API",
    )
    disliked_source_ids: list[str] = Field(
        default_factory=list,
        description="Negative signal — future: used for Qdrant recommendation API",
    )


# ------------------------------------------------------------------ BW: finder requests


class BWFindRequest(BaseModel):
    """Request body for individual /bw/find-* endpoints."""

    input: BWProjectInput
    feedback: BWFeedback = Field(default_factory=BWFeedback)


class BWStatementsRequest(BaseModel):
    """
    Request body for /bw/find-statements.

    Three modes:
      1. Corpus single-doc:  doc_id="openresearch:N"
                             -> looks up chunks by doc_id on the prebuilt corpus
                                retriever (similarity search is not used here —
                                the caller already named the doc).
      2. Upload single-doc:  blob_path="uploads/{project_id}/documents/{document_id}/original.pdf"
                             -> AI service lazy-extracts + chunks the PDF on first
                                call (results persisted to storage), then loads
                                chunks.json directly into the LLM context. No
                                retriever, no embeddings — the caller already
                                named the doc. Subsequent calls hit the persisted
                                chunks.
      3. Bulk corpus:        both None
                             -> find_sources to discover relevant docs, then
                                per-source statements (corpus only).

    doc_id and blob_path are mutually exclusive.
    """

    input: BWProjectInput
    doc_id: str | None = None
    blob_path: str | None = None
    filename: str | None = None  # optional display name when blob_path is set

    @model_validator(mode="after")
    def _doc_id_xor_blob_path(self) -> "BWStatementsRequest":
        """Enforce mutual exclusivity at the request layer -> 422, not 500."""
        if self.doc_id is not None and self.blob_path is not None:
            raise ValueError("Pass either doc_id or blob_path, not both.")
        return self


class BWAnalyzeRequest(BaseModel):
    """Request body for the bulk /bw/analyze endpoint."""

    project_id: str
    input: BWProjectInput
    features: list[Literal["sources", "authors", "talking_points"]] = Field(
        default_factory=lambda: ["sources", "authors", "talking_points"]
    )
    feedback: BWFeedback = Field(default_factory=BWFeedback)


class BWKeyMessageArgument(BaseModel):
    """One user-curated effect used as grounded input for a key message."""

    title: str = Field(min_length=1, max_length=500)
    explanation: str = Field(default="", max_length=5000)
    sentiment: Literal["POSITIVE", "NEGATIVE", "NEUTRAL"]


class BWKeyMessageTheme(BaseModel):
    """Theme and its effects, without database-specific fields."""

    name: str = Field(min_length=1, max_length=500)
    slug: str = Field(min_length=1, max_length=500)
    arguments: list[BWKeyMessageArgument] = Field(default_factory=list, max_length=10)


class BWGenerateKeyMessageRequest(BaseModel):
    """Complete scan content needed to draft a key message."""

    name: str = Field(min_length=1, max_length=500)
    description: str = Field(default="", max_length=2000)
    goal: str = Field(default="", max_length=5000)
    motivation: str = Field(default="", max_length=5000)
    scope: str = Field(default="", max_length=5000)
    themes: list[BWKeyMessageTheme] = Field(default_factory=list, max_length=10)


class BWGenerateKeyMessageResponse(BaseModel):
    key_message: str


class BWSummarizeDocumentRequest(BaseModel):
    """
    Request body for /bw/summarize-document.

    Two modes (mutually exclusive):
      1. blob_path  -> upload: lazy-extract the PDF, summarize, cache at
                       uploads/{project_id}/documents/{document_id}/analysis.json
      2. doc_id     -> corpus: load the assembled document via CorpusReader,
                       summarize, cache at analyses/corpus/{safe_doc_id}.json

    Generic summary (same doc -> same output) in both modes.
    """

    blob_path: str | None = None
    doc_id: str | None = None
    filename: str | None = None  # optional display name for uploads
    language: Literal["nl", "en"] | None = None  # falls back to analyzer default

    @model_validator(mode="after")
    def _doc_id_xor_blob_path(self) -> "BWSummarizeDocumentRequest":
        """Exactly one of doc_id / blob_path. Enforced at the request layer -> 422."""
        if (self.blob_path is None) == (self.doc_id is None):
            raise ValueError("Pass exactly one of doc_id or blob_path.")
        return self


class BWAnalyzeDocumentRequest(BaseModel):
    """
    Request body for /bw/analyze-document.

    Bulk composition: summary (project-agnostic) + statements (project-tailored)
    in one response, in parallel. Accepts blob_path (upload) XOR doc_id (corpus),
    same as /bw/find-statements. Language is taken from input.language.
    """

    input: BWProjectInput
    blob_path: str | None = None
    doc_id: str | None = None
    filename: str | None = None  # optional display name for uploads

    @model_validator(mode="after")
    def _doc_id_xor_blob_path(self) -> "BWAnalyzeDocumentRequest":
        """Exactly one of doc_id / blob_path. Enforced at the request layer -> 422."""
        if (self.blob_path is None) == (self.doc_id is None):
            raise ValueError("Pass exactly one of doc_id or blob_path.")
        return self


# ------------------------------------------------------------------ BW: finder results


class SourceResult(BaseModel):
    """A relevant source document from the corpus."""

    doc_id: str  # AssembledDocument.id, e.g. "openresearch:15907"
    title: str | None = None
    content: str | None = None
    url: str | None = None
    score: float
    chunk_type: str | None = None  # "summary" | "body" | "section" — which chunk matched
    published_at: datetime | None = None
    creator_id: int | None = None
    category: str | None = None
    language: list[str] = Field(default_factory=list)
    keywords: list[str] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(
        default_factory=dict,
        description="Open bag — OR fields vary (year, journal, etc.)",
    )


class AuthorResult(BaseModel):
    """An author aggregated from relevant source documents."""

    id: int | None = None
    name: str | None = None
    affiliation: str | None = None
    expertise: list[str] = Field(default_factory=list)
    is_team: bool = False
    doc_ids: list[str] = Field(default_factory=list)
    score: float = Field(description="Retrieval score (e.g. max among their documents)")
    metadata: dict[str, Any] = Field(default_factory=dict)


class Statement(BaseModel):
    """A relevant excerpt from a corpus document or an uploaded user PDF."""

    text: str
    doc_id: str | None = None  # None when source="upload"
    title: str | None = None
    url: str | None = None
    author: str | None = None
    page: int | None = None
    score: float = 0.0
    source: Literal["corpus", "upload"]


class TalkingPoint(BaseModel):
    """An LLM-generated topic, concern or angle relevant to the project."""

    topic: str
    description: str
    themes: list[str] = Field(default_factory=list)  # canonical broad welfare theme names
    supporting_doc_ids: list[str] = Field(default_factory=list)


class DocumentSummary(BaseModel):
    """
    Document-level analysis output: title + summary.

    Generic (same doc -> same summary). Produced by
    src.document_analysis.summarization.Summarizer. Reused by both the upload
    endpoint and (future) the pipeline auto-summary step that populates
    AssembledDocument.title / AssembledDocument.auto_summary.
    """

    title: str | None = None  # verbatim from the doc when possible (extractor or LLM)
    summary: str


class BWDocumentAnalysis(BaseModel):
    """
    Combined response from /bw/analyze-document.

    Either field may be None on partial failure: if summary fails but statements
    succeed (or vice versa), the successful branch is still returned so the
    frontend can render what's available. statements=[] means "no relevant
    statements found" (a valid result), not "extraction failed".
    """

    summary: DocumentSummary | None = None
    statements: list[Statement] | None = None


class BWProjectAnalysis(BaseModel):
    """Response from the bulk /bw/analyze endpoint. None = feature not requested."""

    project_id: str
    sources: list[SourceResult] | None = None
    authors: list[AuthorResult] | None = None
    talking_points: list[TalkingPoint] | None = None
    computed_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


# ------------------------------------------------------------------ BW: effects requests


class BWEffectRequest(BaseModel):
    """
    Request for effect generation endpoints.
    Language overrides the analyzer default — callers only set it when the user
    explicitly chose a language, otherwise omit and let the analyzer decide.

    selected_source_ids / selected_statement_ids: set by the non-AI backend when
    the user has curated which sources/statements to base the analysis on.
    If empty, the analyzer falls back to retrieval.
    """

    input: BWProjectInput
    theme: BW_CATEGORIES
    top_n: int = Field(default=20, ge=1, le=100)
    selected_source_ids: list[str] = Field(default_factory=list)
    selected_statement_ids: list[str] = Field(default_factory=list)


class BWEvaluateRequest(BWEffectRequest):
    effect_description: str = Field(min_length=1, max_length=10000)


# ------------------------------------------------------------------ BW: effects responses


class BWRAGResponse(RAGResponse):
    """
    Response from effect generation (generate / complement / evaluate).
    Organization and language are set by the analyzer from its own config,
    not echoed from the request — callers don't send them.
    """

    theme_key: BW_CATEGORIES  # e.g. "wonen" — validated
    theme_name: str  # e.g. "Wonen en leefomgeving" - localized display name
    theme_description: str = ""
    organization: str = ""  # populated by analyzer from its config
    language: Literal["nl", "en"] = "nl"
    existing_effects: Optional[List[str]] = None  # only for complement
