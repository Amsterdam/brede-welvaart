"""
Low-level async HTTP client for the OpenResearch Amsterdam APIs.

Two APIs:
  Resource:  GET /api/model/rsc/get/<id>
  Search:    GET /api/model/search/get/or_query?<params>

File downloads use the media model API:
  Media:     GET /api/model/media/get/<id>  -> filename
  Download:  GET /image/<filename>
"""

from __future__ import annotations

import asyncio
import logging
import re
from typing import Any, AsyncIterator

import httpx

from .models import AuthorProfile, Resource, SearchFilters, SearchPage, TeamProfile

logger = logging.getLogger(__name__)

BASE_URL = "https://openresearch.amsterdam"
USER_AGENT = "BredeWelvaart Data Collector (Gemeente Amsterdam; contact: innovatie@amsterdam.nl)"

# Seconds to wait between retry attempts (exponential: 1s, 2s, 4s, ...)
_RETRY_BASE = 1.0

_HTML_TAG_RE = re.compile(r"<[^>]+>")


class OpenResearchClient:
    """
    Async client for the OpenResearch Amsterdam public APIs.

    Usage::

        async with OpenResearchClient() as client:
            await client.load_category_map()
            resource = await client.get_resource(134661)
            async for page in client.search_all(SearchFilters(text="klimaat")):
                for rid in page.ids:
                    ...
    """

    def __init__(
        self,
        base_url: str = BASE_URL,
        lang: str = "nl",
        timeout: float = 30.0,
        max_retries: int = 3,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.lang = lang
        self._client = httpx.AsyncClient(
            timeout=timeout,
            headers={
                "Accept": "application/json",
                "User-Agent": USER_AGENT,
            },
            follow_redirects=True,
        )
        self._max_retries = max_retries
        self._category_cache: dict[int, str] = {}
        self._keyword_cache: dict[int, str] = {}
        self._author_cache: dict[int, AuthorProfile] = {}

    async def __aenter__(self) -> "OpenResearchClient":
        """Allow use as an async context manager."""
        return self

    async def __aexit__(self, *_: Any) -> None:
        """Close the underlying HTTP client on context exit."""
        await self._client.aclose()

    async def close(self) -> None:
        """Explicitly close the underlying HTTP client."""
        await self._client.aclose()

    # Internal helpers

    async def _get_json(self, url: str, params: dict | None = None) -> dict[str, Any]:
        """GET a URL and return the parsed JSON, raising on API-level errors."""
        last_exc: Exception | None = None
        for attempt in range(1, self._max_retries + 1):
            try:
                response = await self._client.get(url, params=params)
                response.raise_for_status()
                data = response.json()
            except (httpx.HTTPStatusError, httpx.RequestError) as exc:
                last_exc = exc
                if attempt < self._max_retries:
                    wait = _RETRY_BASE * (2 ** (attempt - 1))
                    logger.warning(
                        "Attempt %d/%d failed for %s: %s — retrying in %.0fs",
                        attempt,
                        self._max_retries,
                        url,
                        exc,
                        wait,
                    )
                    await asyncio.sleep(wait)
                continue

            if data.get("status") == "error":
                raise ValueError(f"API error for {url}: {data.get('reason', 'unknown')}")

            return data

        raise last_exc or RuntimeError(f"All {self._max_retries} attempts failed for {url}")

    # Resource API

    async def get_resource(self, resource_id: int) -> Resource:
        """Fetch a single resource by numeric ID."""
        url = f"{self.base_url}/api/model/rsc/get/{resource_id}"
        logger.debug("Fetching resource %d", resource_id)
        data = await self._get_json(url)
        result = data.get("result", data)
        resource = Resource.from_api(result, lang=self.lang)
        # Resolve category name if we have it cached already (no extra request)
        if resource.category_id is not None:
            resource.category = self._category_cache.get(resource.category_id)
        return resource

    async def get_resources(self, ids: list[int]) -> list[Resource]:
        """Fetch multiple resources. Returns them in the order given."""
        tasks = [self.get_resource(rid) for rid in ids]
        return list(await asyncio.gather(*tasks))

    # Search API

    async def search(self, filters: SearchFilters) -> SearchPage:
        """Run a single search page and return the result."""
        url = f"{self.base_url}/api/model/search/get/or_query"
        params = filters.to_query_params()
        logger.debug("Search page %d: %s", filters.page, params)
        data = await self._get_json(url, params=params)
        return SearchPage.from_api(data)

    async def search_all(
        self,
        filters: SearchFilters,
        max_pages: int | None = None,
    ) -> AsyncIterator[SearchPage]:
        """
        Async generator that yields SearchPage objects, auto-paginating
        until there are no more results (or `max_pages` is reached).
        """
        if max_pages is not None and max_pages <= 0:
            return

        current_filters = filters.model_copy(update={"page": 1})
        pages_fetched = 0

        while True:
            page = await self.search(current_filters)
            logger.info(
                "Page %d: %d ids, next=%s, pages=%d",
                current_filters.page,
                len(page.ids),
                page.next_page,
                page.pages,
            )
            yield page
            pages_fetched += 1

            if page.next_page is None:
                break
            if max_pages is not None and pages_fetched >= max_pages:
                logger.info("Stopping after %d pages (max_pages limit)", pages_fetched)
                break

            current_filters = current_filters.model_copy(update={"page": page.next_page})

    # Category mapping

    async def load_category_map(self) -> dict[int, str]:
        """
        Fetch all categories and return {id: name} map (cache).
        Should be called once at startup.
        Safe to call multiple times (just refreshes the cache).
        """
        all_ids: list[int] = []
        async for page in self.search_all(
            SearchFilters(cat=["category"], is_published="all", pagelen=100)
        ):
            all_ids.extend(page.ids)

        resources = await self.get_resources(all_ids)
        self._category_cache = {r.id: r.raw.get("name") for r in resources if r.raw.get("name")}
        logger.info("Category map loaded: %d entries", len(self._category_cache))
        return self._category_cache

    async def resolve_category(self, category_id: int) -> str | None:
        """
        Return the name string for a category ID, fetching it if not cached.
        Falls back to a single resource fetch for any cache miss
        (e.g. if load_category_map() was not called, or a new category appeared).
        """
        if category_id in self._category_cache:
            return self._category_cache[category_id]

        try:
            resource = await self.get_resource(category_id)
            name = resource.raw.get("name")  # the slug-like name, e.g. "article"
            if name:
                self._category_cache[category_id] = name
                logger.debug("Resolved category %d and added to cache: %r", category_id, name)
            return name
        except Exception as exc:
            logger.debug("Could not resolve category %d: %s", category_id, exc)
            return None

    # Keyword mapping

    async def load_keyword_map(self) -> dict[int, str]:
        """
        Fetch all keywords and return {id: title} map (cache).
        Should be called once at startup alongside load_category_map.
        """
        all_ids: list[int] = []
        async for page in self.search_all(
            SearchFilters(cat=["keyword"], is_published="all", pagelen=100)
        ):
            all_ids.extend(page.ids)

        resources = await self.get_resources(all_ids)
        self._keyword_cache = {r.id: r.title for r in resources if r.title}

        logger.info("Keyword map loaded: %d entries", len(self._keyword_cache))
        return self._keyword_cache

    async def resolve_keyword(self, keyword_id: int) -> str | None:
        """Return the title string for a keyword ID, fetching it if not cached."""
        if keyword_id in self._keyword_cache:
            return self._keyword_cache[keyword_id]
        try:
            resource = await self.get_resource(keyword_id)
            title = resource.title
            if title:
                self._keyword_cache[keyword_id] = title
                logger.debug("Resolved keyword %d and added to cache: %r", keyword_id, title)
            return title
        except Exception as exc:
            logger.debug("Could not resolve keyword %d: %s", keyword_id, exc)
            return None

    # Author profile

    def _extract_name(self, raw: dict) -> str | None:
        """Build a full name from first/prefix/surname fields, falling back to title."""
        parts = [
            raw.get("name_first"),
            raw.get("name_surname_prefix"),
            raw.get("name_surname"),
        ]
        name = " ".join(p for p in parts if p)
        if name:
            return name

        title_raw = raw.get("title")
        if not title_raw:
            return None
        if isinstance(title_raw, dict):
            tr = title_raw.get("tr", {})
            return tr.get(self.lang) or next(iter(tr.values()), None)
        if isinstance(title_raw, str):
            return title_raw or None
        return None

    def _extract_affiliation(self, raw: dict) -> str | None:
        """Extract and clean affiliation from the summary field."""
        summary_raw = raw.get("summary")
        if not summary_raw:
            return None
        if isinstance(summary_raw, dict):
            tr = summary_raw.get("tr", {})
            raw_text = tr.get(self.lang) or next(iter(tr.values()), None)
        else:
            raw_text = summary_raw
        if not raw_text:
            return None
        return " ".join(_HTML_TAG_RE.sub(" ", raw_text).split()) or None

    async def _fetch_expertise_labels(self, author_id: int) -> list[str]:
        """Resolve all keyword labels for an author."""
        keyword_ids = await self.get_keyword_ids(author_id)
        labels = []
        for kid in keyword_ids:
            label = await self.resolve_keyword(kid)
            if label:
                labels.append(label)
        return labels

    async def get_author_profile(self, author_id: int) -> AuthorProfile:
        """Fetch name, affiliation and expertise for a person resource. Cached by author_id."""
        if author_id in self._author_cache:
            return self._author_cache[author_id]
        try:
            resource = await self.get_resource(author_id)
            profile = AuthorProfile(
                id=author_id,
                name=self._extract_name(resource.raw),
                affiliation=self._extract_affiliation(resource.raw),
                expertise_labels=await self._fetch_expertise_labels(author_id),
            )
        except Exception as exc:
            logger.debug("Could not fetch author profile for %d: %s", author_id, exc)
            profile = AuthorProfile(id=author_id)
        self._author_cache[author_id] = profile
        return profile

    async def get_article_authors(self, article_id: int) -> list[int]:
        """All person IDs linked to an article via hassubject + cat_exact=person."""
        try:
            filters = SearchFilters(
                hassubject=article_id,
                cat_exact=["person"],
                is_published="all",
                pagelen=100,
            )
            page = await self.search(filters)
            return page.ids
        except Exception as exc:
            logger.debug("Could not fetch authors for %d: %s", article_id, exc)
            return []

    async def get_article_teams(self, article_id: int) -> list[int]:
        """All editorial team IDs linked to an article via hassubject + cat_exact=editorial."""
        try:
            filters = SearchFilters(
                hassubject=article_id,
                cat_exact=["editorial"],
                is_published="all",
                pagelen=100,
            )
            page = await self.search(filters)
            return page.ids
        except Exception as exc:
            logger.debug("Could not fetch teams for %d: %s", article_id, exc)
            return []

    async def get_team_profile(self, team_id: int) -> TeamProfile | None:
        """Fetch the profile of an editorial team resource."""
        try:
            resource = await self.get_resource(team_id)
            return TeamProfile(id=team_id, name=resource.title)
        except Exception as exc:
            logger.debug("Could not fetch team %d: %s", team_id, exc)
            return None

    # Document edges

    async def get_document_ids(self, resource_id: int) -> list[int]:
        """Fetch IDs of document resources linked from this resource (cat=document)."""
        try:
            filters = SearchFilters(
                hassubject=resource_id,
                cat=["document"],
                is_published="all",
                pagelen=100,
            )
            page = await self.search(filters)
            return page.ids
        except Exception as exc:
            logger.debug("Could not fetch document edges for %d: %s", resource_id, exc)
            return []

    async def get_keyword_ids(self, resource_id: int) -> list[int]:
        """Fetch IDs of keyword resources linked from this resource."""
        try:
            filters = SearchFilters(
                hassubject=resource_id,
                cat=["keyword"],
                is_published="all",
                pagelen=100,
            )
            page = await self.search(filters)
            return page.ids
        except Exception as exc:
            logger.debug("Could not fetch keyword edges for %d: %s", resource_id, exc)
            return []

    # File download

    async def get_media_record(self, resource_id: int) -> dict | None:
        """Fetch the medium record for a resource from the media model API."""
        url = f"{self.base_url}/api/model/media/get/{resource_id}"
        try:
            data = await self._get_json(url)
            return data.get("result")
        except Exception as exc:
            logger.debug("No media record for resource %d: %s", resource_id, exc)
            return None

    def _medium_url_from_record(self, media_record: dict) -> str | None:
        """Construct download URL from a media record's filename."""
        filename = media_record.get("filename")
        if filename:
            return f"{self.base_url}/image/{filename}"
        return None

    async def download_file(self, resource: Resource) -> tuple[str, bytes] | None:
        """
        Attempt to download the primary file attached to a resource.
        Returns (filename, bytes) or None if nothing downloadable was found.
        """
        media_record = await self.get_media_record(resource.id)
        if not media_record:
            return None

        url = self._medium_url_from_record(media_record)
        if not url:
            return None

        original_filename = (
            media_record.get("original_filename") or media_record["filename"].split("/")[-1]
        )

        try:
            resp = await self._client.get(url, headers={"Accept": "*/*"})
            resp.raise_for_status()
            # TODO: optionally filter by content-type here (e.g. only PDF/Word)     # noqa: T101
            # content_type = resp.headers.get("content-type", "").split(";")[0].strip()
            logger.info(
                "Downloaded %s (%d bytes) for resource %d",
                original_filename,
                len(resp.content),
                resource.id,
            )
            return original_filename, resp.content

        except httpx.HTTPStatusError as exc:
            status = exc.response.status_code
            if status in (403, 404):
                logger.debug("No downloadable file for resource %d (HTTP %d)", resource.id, status)
            else:
                logger.warning("HTTP %d when downloading resource %d", status, resource.id)
            return None
        except httpx.RequestError as exc:
            logger.warning("Request error downloading resource %d: %s", resource.id, exc)
            return None

    async def download_url(self, url: str) -> tuple[str, bytes] | None:
        """Download a file from an arbitrary URL and return (filename, bytes)."""
        filename = url.rstrip("/").split("/")[-1].split("?")[0]
        try:
            resp = await self._client.get(url, headers={"Accept": "*/*"})
            resp.raise_for_status()
            content_type = resp.headers.get("content-type", "").split(";")[0].strip()
            if "pdf" in content_type and not filename.endswith(".pdf"):
                filename += ".pdf"
            logger.info("Downloaded %s (%d bytes) from %s", filename, len(resp.content), url)
            return filename, resp.content
        except httpx.HTTPStatusError as exc:
            logger.warning("HTTP %d when downloading %s", exc.response.status_code, url)
            return None
        except httpx.RequestError as exc:
            logger.warning("Request error downloading %s: %s", url, exc)
            return None
