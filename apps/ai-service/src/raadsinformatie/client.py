"""
Low-level async HTTP client for the ORI (Open Raadsinformatie) ElasticSearch API.

Two operations:
  Search:    POST /<index>/_search   -> paginated hits via search_after
  Fetch doc: GET  /<index>/_doc/<id> -> single _source

File download uses the resolve URL stored in the RaadsStuk's `url` field.
"""

from __future__ import annotations

import asyncio
import logging
from pathlib import Path
from typing import Any, AsyncGenerator

import httpx

from .models import RaadsStuk, SearchFilters

logger = logging.getLogger(__name__)

BASE_URL = "https://api.openraadsinformatie.nl/v1/elastic"
DEFAULT_INDEX = "ori_amsterdam_20250317151602"
USER_AGENT = "BredeWelvaart Data Collector (Gemeente Amsterdam; contact: innovatie@amsterdam.nl)"

_RETRY_BASE = 1.0


class RaadsinformatieClient:
    """
    Async client for the ORI ElasticSearch API.

    Usage::

        async with RaadsinformatieClient() as client:
            async for hit in client.search_document_hits(
                SearchFilters(document_type="Voordracht")
            ):
                raads_stuk = await client.get_raads_stuk(hit["_source"]["attachment"])
                ...
    """

    def __init__(
        self,
        base_url: str = BASE_URL,
        index: str = DEFAULT_INDEX,
        timeout: float = 30.0,
        max_retries: int = 3,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.index = index
        self._search_url = f"{self.base_url}/{self.index}/_search"
        self._doc_url = f"{self.base_url}/{self.index}/_doc"
        self._client = httpx.AsyncClient(
            timeout=timeout,
            headers={
                "Accept": "application/json",
                "Content-Type": "application/json",
                "User-Agent": USER_AGENT,
            },
            follow_redirects=True,
        )
        self._max_retries = max_retries

    async def __aenter__(self) -> RaadsinformatieClient:
        """Enter the async context manager."""
        return self

    async def __aexit__(self, *_: Any) -> None:
        """Exit the async context manager and close the HTTP client."""
        await self._client.aclose()

    async def close(self) -> None:
        """Close the underlying HTTP client."""
        await self._client.aclose()

    # Internal helpers

    async def _post_json(self, url: str, body: dict[str, Any]) -> dict[str, Any]:
        """POST a JSON body and return parsed response, with retries."""
        last_exc: Exception | None = None
        for attempt in range(1, self._max_retries + 1):
            try:
                resp = await self._client.post(url, json=body)
                resp.raise_for_status()
                return resp.json()
            except (httpx.HTTPStatusError, httpx.RequestError) as exc:
                if isinstance(exc, httpx.HTTPStatusError):
                    logger.warning(
                        "HTTP %d for %s\nES error: %s",
                        exc.response.status_code,
                        url,
                        exc.response.text[:500],
                    )
                else:
                    logger.warning("Request error for %s: %s", url, exc)
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
        raise last_exc or RuntimeError(f"All {self._max_retries} attempts failed for {url}")

    async def _get_json(self, url: str) -> dict[str, Any]:
        """GET a URL and return parsed JSON, with retries."""
        last_exc: Exception | None = None
        for attempt in range(1, self._max_retries + 1):
            try:
                resp = await self._client.get(url)
                resp.raise_for_status()
                return resp.json()
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
        raise last_exc or RuntimeError(f"All {self._max_retries} attempts failed for {url}")

    # Search — document type hits (formerly AgendaItems)

    def _build_document_query(
        self, filters: SearchFilters, search_after: list | None
    ) -> dict[str, Any]:
        must: list[dict[str, Any]] = []
        filter_clauses: list[dict[str, Any]] = []

        if filters.document_type:
            must.append({"match": {"name": filters.document_type}})
        else:
            must.append({"match_all": {}})

        if filters.date_from or filters.date_to:
            date_range = {}
            if filters.date_from:
                date_range["gte"] = f"{filters.date_from}T00:00:00Z"  # noqa: E231
            if filters.date_to:
                date_range["lte"] = f"{filters.date_to}T23:59:59Z"  # noqa: E231
            filter_clauses.append({"range": {"start_date": date_range}})

        bool_query: dict[str, Any] = {"must": must}
        if filter_clauses:
            bool_query["filter"] = filter_clauses

        query: dict[str, Any] = {
            "size": filters.page_size,
            "query": {"bool": bool_query},
            "_source": ["name", "attachment", "start_date", "parent"],
            "sort": [{"start_date": "asc"}, {"_id": "asc"}],
        }
        if search_after:
            query["search_after"] = search_after
        return query

    async def search_document_hits(
        self, filters: SearchFilters
    ) -> AsyncGenerator[dict[str, Any], None]:
        """
        Async generator yielding raw search hits for document type searches,
        auto-paginating via search_after.
        """
        search_after = None
        page = 0
        total_yielded = 0

        while True:
            body = self._build_document_query(filters, search_after)
            data = await self._post_json(self._search_url, body)
            hits = data["hits"]["hits"]
            if not hits:
                break

            page += 1
            logger.info("Document hit page %d: %d hits", page, len(hits))

            for hit in hits:
                yield hit
                total_yielded += 1
                if filters.max_results and total_yielded >= filters.max_results:
                    return

            if len(hits) < filters.page_size:
                break
            if filters.max_results and total_yielded >= filters.max_results:
                break
            search_after = hits[-1]["sort"]

    # Search — RaadsStukken (full-text)

    def _build_raads_stuk_query(
        self, filters: SearchFilters, search_after: list | None
    ) -> dict[str, Any]:
        must: list[dict[str, Any]] = []
        filter_clauses: list[dict[str, Any]] = []

        if filters.text:
            must.append(
                {
                    "nested": {
                        "path": "text_pages",
                        "query": {"match": {"text_pages.text": filters.text}},
                    }
                }
            )
        else:
            must.append({"match_all": {}})

        if filters.date_from or filters.date_to:
            date_range: dict[str, str] = {}
            if filters.date_from:
                date_range["gte"] = filters.date_from
            if filters.date_to:
                date_range["lte"] = filters.date_to
            filter_clauses.append({"range": {"last_discussed_at": date_range}})

        bool_query: dict[str, Any] = {"must": must}
        if filter_clauses:
            bool_query["filter"] = filter_clauses

        query: dict[str, Any] = {
            "size": filters.page_size,
            "query": {"bool": bool_query},
            "sort": [{"last_discussed_at": "asc"}, {"_id": "asc"}],
        }
        if search_after:
            query["search_after"] = search_after
        return query

    async def search_raads_stukken(
        self, filters: SearchFilters
    ) -> AsyncGenerator[RaadsStuk, None]:
        """
        Async generator yielding RaadsStukken matching a full-text search,
        auto-paginating via search_after.
        """
        search_after = None
        page = 0
        total_yielded = 0

        while True:
            body = self._build_raads_stuk_query(filters, search_after)
            data = await self._post_json(self._search_url, body)
            hits = data["hits"]["hits"]
            if not hits:
                break

            page += 1
            logger.info("RaadsStuk page %d: %d hits", page, len(hits))

            for hit in hits:
                yield RaadsStuk.from_media_source(hit["_id"], hit["_source"])
                total_yielded += 1
                if filters.max_results and total_yielded >= filters.max_results:
                    return

            if len(hits) < filters.page_size:
                break
            if filters.max_results and total_yielded >= filters.max_results:
                break
            search_after = hits[-1]["sort"]

    # Single-doc fetch

    async def get_raads_stuk(self, doc_id: str) -> RaadsStuk | None:
        """Fetch a single RaadsStuk by its ORI document ID."""
        url = f"{self._doc_url}/{doc_id}"
        try:
            data = await self._get_json(url)
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code == 404:
                logger.debug("RaadsStuk %s not found", doc_id)
                return None
            raise
        if not data.get("found"):
            return None
        return RaadsStuk.from_media_source(data["_id"], data["_source"])

    # File download

    async def download_file(self, raads_stuk: RaadsStuk) -> tuple[str, bytes] | None:
        """
        Download the file associated with a RaadsStuk.
        Returns (filename, bytes) or None if unavailable.
        """
        if not raads_stuk.url:
            return None

        filename = Path(raads_stuk.file_name or f"{raads_stuk.id}.pdf").name

        try:
            resp = await self._client.get(raads_stuk.url, headers={"Accept": "*/*"})
            resp.raise_for_status()
            logger.info(
                "Downloaded %s (%d bytes) for RaadsStuk %s",
                filename,
                len(resp.content),
                raads_stuk.id,
            )
            return filename, resp.content
        except httpx.HTTPStatusError as exc:
            status = exc.response.status_code
            if status in (403, 404, 406):
                logger.debug("No downloadable file for %s (HTTP %d)", raads_stuk.id, status)
            else:
                logger.warning("HTTP %d downloading %s", status, raads_stuk.id)
            return None
        except httpx.RequestError as exc:
            logger.warning("Request error downloading %s: %s", raads_stuk.id, exc)
            return None
