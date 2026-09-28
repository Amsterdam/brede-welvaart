"""
Collector — orchestrates fetching and storing ORI Raadsinformatie resources.

Storage layout (mirrors OpenResearch collector):

    raadsinformatie/
        <id>/
            metadata.json       <- RaadsStuk fields + raw _source
            <filename>.pdf      <- downloaded attachment if any
"""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Any

from src.storage import LocalStorage, Storage

from .client import RaadsinformatieClient
from .models import CollectionResult, RaadsStuk, SearchFilters

logger = logging.getLogger(__name__)

METADATA_FILENAME = "metadata.json"


class Collector:
    """
    Fetches RaadsStukken from the ORI ElasticSearch API and stores them
    via a Storage backend (local filesystem or Azure Blob).

    Two collection modes:
      - Via document type search (e.g. all "Voordracht" items) — follows the
        attachment link to get the full RaadsStuk with text and file.
      - Via full-text search — directly collects matching documents.

    Parameters
    ----------
    storage:
        Any object with read_file / write_file.
        Defaults to local storage rooted at ./ori_data.
    base_path:
        Folder prefix within storage (default: "raadsinformatie").
    download_files:
        Whether to download the actual PDF for each RaadsStuk.
    follow_documents:
        In document-type search mode, fetch the full RaadsStuk for each
        attachment (needed for text_pages; the search hit only carries a stub).
    skip_existing:
        Skip RaadsStukken already present in storage (default: True).
    concurrency:
        Max concurrent API/download requests.
    index:
        ORI ElasticSearch index name — update when a new ingest has run.
    """

    def __init__(
        self,
        storage: Storage | None = None,
        base_path: str = "raadsinformatie",
        download_files: bool = True,
        follow_documents: bool = True,
        skip_existing: bool = True,
        concurrency: int = 5,
        index: str | None = None,
    ) -> None:
        self.storage = storage or LocalStorage("./ori_data")
        self.base_path = base_path
        self.download_files = download_files
        self.follow_documents = follow_documents
        self.skip_existing = skip_existing
        self._sem = asyncio.Semaphore(concurrency)
        self._client: RaadsinformatieClient | None = None
        self._index = index

    async def __aenter__(self) -> Collector:
        """Enter the async context manager and initialise the HTTP client."""
        kwargs: dict[str, Any] = {}
        if self._index:
            kwargs["index"] = self._index
        self._client = RaadsinformatieClient(**kwargs)
        return self

    async def __aexit__(self, *_: Any) -> None:
        """Exit the async context manager and close the HTTP client."""
        if self._client:
            await self._client.close()

    @property
    def client(self) -> RaadsinformatieClient:
        """Return the active HTTP client, raising if not in a context manager."""
        if self._client is None:
            raise RuntimeError("Use Collector as an async context manager")
        return self._client

    # Storage helpers

    def _resource_folder(self, doc_id: str) -> str:
        return f"{self.base_path}/{doc_id}"

    def _metadata_path(self, doc_id: str) -> str:
        return f"{self._resource_folder(doc_id)}/{METADATA_FILENAME}"

    def _exists(self, doc_id: str) -> bool:
        try:
            self.storage.read_file(self._metadata_path(doc_id))
            return True
        except Exception:
            return False

    def _save_metadata(self, raads_stuk: RaadsStuk) -> None:
        data = json.dumps(
            raads_stuk.model_dump(mode="json"), ensure_ascii=False, indent=2, default=str
        )
        self.storage.write_file(data, self._metadata_path(raads_stuk.id))

    def _save_file(self, doc_id: str, filename: str, data: bytes) -> str:
        path = f"{self._resource_folder(doc_id)}/{filename}"
        self.storage.write_file(data, path)
        return path

    def load_raads_stuk(self, doc_id: str) -> RaadsStuk | None:
        """Load a previously collected RaadsStuk from storage."""
        try:
            raw = self.storage.read_file(self._metadata_path(doc_id))
            return RaadsStuk.model_validate(json.loads(raw))
        except Exception:
            return None

    # Core

    async def _collect_one(self, raads_stuk: RaadsStuk, result: CollectionResult) -> None:
        """Store a single RaadsStuk, optionally downloading its file."""
        if self.skip_existing and self._exists(raads_stuk.id):
            logger.debug("Skipping %s (already in storage)", raads_stuk.id)
            result.skipped.append(raads_stuk.id)
            return

        if self.download_files:
            try:
                async with self._sem:
                    dl = await self.client.download_file(raads_stuk)
                if dl:
                    filename, data = dl
                    path = self._save_file(raads_stuk.id, filename, data)
                    raads_stuk.downloaded_file = path
                    result.files_downloaded += 1
            except Exception as exc:
                logger.warning("File download failed for %s: %s", raads_stuk.id, exc)

        self._save_metadata(raads_stuk)
        result.collected.append(raads_stuk.id)
        logger.info("Collected %s (%s)", raads_stuk.id, raads_stuk.name or "-")

    async def _collect_from_document_hit(
        self, hit: dict[str, Any], result: CollectionResult
    ) -> None:
        """
        Given a raw search hit for a document type, fetch the full RaadsStuk
        for each attachment and enrich it with context from the hit.
        """
        source = hit["_source"]
        attachments: list[str] = source.get("attachment") or []
        if isinstance(attachments, str):
            attachments = [attachments]

        if not attachments:
            logger.debug("Document hit %s has no attachment, skipping", hit["_id"])
            return

        for attachment_id in attachments:
            if self.skip_existing and self._exists(attachment_id):
                result.skipped.append(attachment_id)
                continue

            if self.follow_documents:
                async with self._sem:
                    raads_stuk = await self.client.get_raads_stuk(attachment_id)
                if raads_stuk is None:
                    logger.warning(
                        "RaadsStuk %s not found for document %s", attachment_id, hit["_id"]
                    )
                    result.failed.append(attachment_id)
                    continue
            else:
                raads_stuk = RaadsStuk(id=attachment_id)

            # Enrich with context from the document hit
            raads_stuk.document_type = source.get("name")
            raads_stuk.parent = source.get("parent")

            await self._collect_one(raads_stuk, result)

    # Public API

    async def collect_by_document_type(self, filters: SearchFilters) -> CollectionResult:
        """
        Search by document type and collect the RaadsStuk attached to each hit.

        Example::

            await collector.collect_by_document_type(
                SearchFilters(document_type="Voordracht", date_from="2022-01-01")
            )
        """
        result = CollectionResult()
        tasks: list[Any] = []

        async for hit in self.client.search_document_hits(filters):
            tasks.append(self._collect_from_document_hit(hit, result))

        logger.info("Found %d document hits, collecting attachments...", len(tasks))
        await asyncio.gather(*tasks)
        logger.info("collect_by_document_type done: %s", result)
        return result

    async def collect_by_text_search(self, filters: SearchFilters) -> CollectionResult:
        """
        Search RaadsStukken by full-text content and collect them directly.

        Example::

            await collector.collect_by_text_search(
                SearchFilters(text="brede welvaart", date_from="2022-01-01")
            )
        """
        result = CollectionResult()
        tasks: list[Any] = []

        async for raads_stuk in self.client.search_raads_stukken(filters):
            tasks.append(self._collect_one(raads_stuk, result))

        logger.info("Found %d RaadsStukken, collecting...", len(tasks))
        await asyncio.gather(*tasks)
        logger.info("collect_by_text_search done: %s", result)
        return result

    async def collect_by_id(self, *doc_ids: str) -> CollectionResult:
        """Collect one or more RaadsStukken by their ORI document IDs."""
        result = CollectionResult()

        async def _fetch_and_collect(doc_id: str) -> None:
            async with self._sem:
                raads_stuk = await self.client.get_raads_stuk(doc_id)
            if raads_stuk is None:
                result.failed.append(doc_id)
                return
            await self._collect_one(raads_stuk, result)

        await asyncio.gather(*[_fetch_and_collect(did) for did in doc_ids])
        logger.info("collect_by_id done: %s", result)
        return result
