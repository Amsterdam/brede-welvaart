"""
Data models for the OpenResearch Amsterdam collector.

The raw API returns a lot of fields;
we capture everything in `raw` and pull out the most useful fields
as typed attributes for convenience.
"""

from __future__ import annotations

import html
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field


def _trans(value: Any, lang: str = "nl") -> str | None:
    """
    Extract a string from a Zotonic `{_type: trans, tr: {en: ..., nl: ...}}` object.
    Falls back to the first available language if the requested one is absent.
    Returns the raw value unchanged if it is already a plain string.
    """
    if isinstance(value, str):
        return html.unescape(value) or None
    if isinstance(value, dict):
        tr = value.get("tr") or value.get("trans")
        if isinstance(tr, dict):
            result = tr.get(lang) or next(iter(tr.values()), None)
            return html.unescape(result) if result else None
    return None


class AuthorProfile(BaseModel):
    """Profile of a person author linked to an article."""

    id: int
    name: str | None = None
    affiliation: str | None = None
    expertise_labels: list[str] = Field(default_factory=list)


class TeamProfile(BaseModel):
    """Profile of an editorial team linked to an article."""

    id: int
    name: str | None = None


class Resource(BaseModel):
    """A single resource fetched from the Resource model API."""

    id: int
    # category_id as returned by the API; category is the resolved name string
    category_id: int | None = None
    category: str | None = None  # resolved from category_id via client cache
    title: str | None = None
    summary: str | None = None
    body: str | None = None
    creator_id: int | None = None

    # Slug / URL info
    name: str | None = None  # machine-readable slug (e.g. "article")
    slug: str | None = None
    page_url_abs: str | None = None

    # Publication / modification timestamps
    publication_start: datetime | None = None
    publication_end: datetime | None = None
    created: datetime | None = None
    modified: datetime | None = None

    # Languages this resource is available in
    language: list[str] = Field(default_factory=list)

    # Keyword IDs linked to this resource (populated by collector)
    keyword_ids: list[int] = Field(default_factory=list)
    # Resolved keyword labels (populated by collector)
    keywords: list[str] = Field(default_factory=list)

    # Author profile fields — populated by the enrich step
    authors: list[AuthorProfile] = Field(default_factory=list)
    teams: list[TeamProfile] = Field(default_factory=list)

    # IDs of attached document resources (populated by the collector)
    document_ids: list[int] = Field(default_factory=list)
    # Local paths to any downloaded files (populated by storage layer)
    downloaded_files: list[str] = Field(default_factory=list)
    raadsinformatie: dict[str, str | None] = Field(default_factory=dict)

    # How this resource was discovered ("sitemap" or "api")
    collection_source: Literal["sitemap", "api"] = "api"

    # Keep the full raw response so nothing is thrown away
    raw: dict[str, Any] = Field(default_factory=dict)

    @classmethod
    def from_api(cls, data: dict[str, Any], lang: str = "nl") -> "Resource":
        """Build a Resource from a raw `/api/model/rsc/get/<id>` result record."""
        pub = data.get("publication", {})
        return cls(
            id=data["id"],
            category_id=data.get("category_id"),
            # category left as None here - resolved later by the client/collector
            title=_trans(data.get("title"), lang),
            summary=_trans(data.get("summary"), lang),
            body=_trans(data.get("body"), lang),
            creator_id=data.get("creator_id"),
            name=data.get("name"),
            slug=data.get("slug"),
            page_url_abs=data.get("page_url_abs"),
            publication_start=data.get("publication_start")
            or (pub.get("start") if isinstance(pub, dict) else None),
            publication_end=data.get("publication_end")
            or (pub.get("end") if isinstance(pub, dict) else None),
            created=data.get("created"),
            modified=data.get("modified"),
            language=data.get("language") or [],
            raw=data,
        )


class SearchPage(BaseModel):
    """A single page of results from the Search model API."""

    ids: list[int] = Field(default_factory=list)
    total: int = 0
    pages: int = 1
    next_page: int | None = None  # None means no more pages

    @classmethod
    def from_api(cls, data: dict[str, Any]) -> "SearchPage":
        """Build a SearchPage from a raw search API response."""
        result = data.get("result", {})
        next_raw = result.get("next")
        return cls(
            ids=result.get("result", []),
            total=result.get("total", 0),
            pages=result.get("pages", 1),
            next_page=next_raw if next_raw is not False and next_raw is not None else None,
        )


class SearchFilters(BaseModel):
    """
    All optional filter parameters understood by the Zotonic search API.
    Pass only what's needed; the rest default to None / omitted.
    """

    # Full-text query
    text: str | None = None

    # Category filters — use string names like "article", "collection"
    cat: list[str] | None = None
    cat_exact: list[str] | None = None
    cat_exclude: list[str] | None = None

    # Date / time filters (ISO-8601 strings or relative like "+1 week")
    publication_after: str | None = None
    publication_before: str | None = None
    created_after: str | None = None
    created_before: str | None = None
    modified_after: str | None = None
    modified_before: str | None = None

    # Publication year/month convenience filters
    publication_year: int | None = None
    publication_month: int | None = None

    # Edge / relation filters
    hassubject: int | str | None = None
    hasobject: int | str | None = None
    hasobjectpredicate: str | None = None

    # Sorting  (e.g. "-rsc.modified", "rsc.publication_start")
    sort: str | None = "-rsc.modified"

    # Pagination
    page: int = 1
    pagelen: int = 20

    # Misc
    is_published: str | None = "true"  # "true" | "false" | "all"
    language: str | None = None

    def to_query_params(self) -> dict[str, Any]:
        """Convert to a flat dict of query-string parameters for the API."""
        params = {}
        for k, v in self.model_dump().items():
            if v is None or v == "":
                continue
            if isinstance(v, list):
                if not v:
                    continue
                params[k] = ",".join(str(i) for i in v)
            else:
                params[k] = v
        return params


class CollectionResult(BaseModel):
    """Tracks the outcome of a collection run — what was collected, skipped, or failed."""

    collected: list[int] = Field(default_factory=list)
    skipped: list[int] = Field(default_factory=list)
    failed: list[int] = Field(default_factory=list)
    files_downloaded: int = 0

    @property
    def total(self) -> int:
        """Total number of resources processed (collected + skipped + failed)."""
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
