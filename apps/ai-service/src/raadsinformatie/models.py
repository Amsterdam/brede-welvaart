"""
Data models for the Raadsinformatie (ORI ElasticSearch) collector.

A raadsstuk is a municipal document - voordracht, bijlage, besluit, motie, etc.
ORI stores these across two linked record types (a metadata record and a file record),
which we merge into a single RaadsStuk - analogous to Resource in OpenResearch.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class TextPage(BaseModel):
    """A single page of extracted text from a PDF."""

    page_number: int
    text: str


class RaadsStuk(BaseModel):
    """
    A single raadsstuk — the merged record of a document and its file,
    as fetched from the ORI ElasticSearch index.
    """

    id: str

    # Descriptive
    name: str | None = None
    document_type: str | None = None  # e.g. "Voordracht", "Bijlage", "Besluit"
    file_name: str | None = None
    content_type: str | None = None
    size_in_bytes: int | None = None

    # URLs
    url: str | None = None  # ORI resolve URL (redirects to actual file)
    original_url: str | None = None  # upstream source URL

    # Timestamps
    last_discussed_at: datetime | None = None
    date_modified: datetime | None = None

    # Context
    parent: str | None = None
    has_organization_name: str | None = None

    # Extracted text (from ORI pipeline — quality varies)
    text_pages: list[TextPage] = Field(default_factory=list)
    md_text: list[str] = Field(default_factory=list)

    # Local path to downloaded file (populated by storage layer)
    downloaded_file: str | None = None

    # Full raw _source — nothing discarded
    raw: dict[str, Any] = Field(default_factory=dict)

    @classmethod
    def from_media_source(cls, doc_id: str, source: dict[str, Any]) -> RaadsStuk:
        """Build a RaadsStuk from a raw ORI _source dict."""
        text_pages = [
            TextPage(page_number=p.get("page_number", i + 1), text=p.get("text", ""))
            for i, p in enumerate(source.get("text_pages") or [])
        ]
        return cls(
            id=doc_id,
            name=source.get("name"),
            file_name=source.get("file_name"),
            content_type=source.get("content_type"),
            size_in_bytes=source.get("size_in_bytes"),
            url=source.get("url"),
            original_url=source.get("original_url"),
            last_discussed_at=source.get("last_discussed_at"),
            date_modified=source.get("date_modified"),
            has_organization_name=source.get("has_organization_name"),
            text_pages=text_pages,
            md_text=source.get("md_text") or [],
            raw=source,
        )

    @property
    def full_text(self) -> str:
        """All extracted page text joined into a single string."""
        return "\n".join(p.text for p in self.text_pages if p.text.strip())


class SearchFilters(BaseModel):
    """Parameters for a search against the ORI index."""

    document_type: str | None = None  # e.g. "Voordracht"
    text: str | None = None
    date_from: str | None = None
    date_to: str | None = None
    page_size: int = 500
    max_results: int | None = None


class CollectionResult(BaseModel):
    """Tracks the outcome of a collection run."""

    collected: list[str] = Field(default_factory=list)
    skipped: list[str] = Field(default_factory=list)
    failed: list[str] = Field(default_factory=list)
    files_downloaded: int = 0

    @property
    def total(self) -> int:
        """Total number of docs processed (collected + skipped + failed)."""
        return len(self.collected) + len(self.skipped) + len(self.failed)

    def __str__(self) -> str:
        """Human-friendly summary of the collection result."""
        return (
            f"CollectionResult("
            f"collected={len(self.collected)}, "
            f"skipped={len(self.skipped)}, "
            f"failed={len(self.failed)}, "
            f"files={self.files_downloaded})"
        )
