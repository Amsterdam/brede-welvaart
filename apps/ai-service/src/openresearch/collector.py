"""
Collector — orchestrates fetching and storing OpenResearch resources.

Uses a simple Storage interface (read_file / write_file) for persistence.
Metadata is stored as JSON alongside downloaded files:

    openresearch/
        <id>/
            metadata.json
            <filename>.pdf
"""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Any

from src.storage import LocalStorage, Storage

from .client import OpenResearchClient
from .models import CollectionResult, Resource, SearchFilters
from .utils import extract_raadsinformatie_urls

logger = logging.getLogger(__name__)

METADATA_FILENAME = "metadata.json"


class Collector:
    """
    Fetches resources from OpenResearch Amsterdam and stores them via
    a Storage backend (local filesystem or Azure Blob).

    File layout per resource:
        openresearch/<id>/metadata.json   <- all resource fields + raw API data
        openresearch/<id>/<filename>.pdf  <- downloaded attachment if any

    Parameters
    ----------
    storage:
        Any object with read_file / write_file / get_folder_contents.
        Defaults to simple local storage rooted at ./data.
    base_path:
        Folder prefix within storage (default: "openresearch").
    lang:
        Preferred language for translated fields (default: "nl").
    download_files:
        Whether to download attached PDFs.
    follow_document_edges:
        Whether to follow hasdocument edges to linked resources.
    skip_existing:
        Skip resources already present in storage (default: True).
    concurrency:
        Max concurrent API requests.
    """

    def __init__(
        self,
        storage: Storage | None = None,
        base_path: str = "openresearch",
        lang: str = "nl",
        download_files: bool = True,
        follow_document_edges: bool = True,
        skip_existing: bool = True,
        concurrency: int = 5,
    ) -> None:
        self.storage = storage or LocalStorage("./or_data")
        self.base_path = base_path
        self.lang = lang
        self.download_files = download_files
        self.follow_document_edges = follow_document_edges
        self.skip_existing = skip_existing
        self._sem = asyncio.Semaphore(concurrency)
        self._client: OpenResearchClient | None = None

    async def __aenter__(self) -> "Collector":
        """Start the HTTP client and load the category map."""
        self._client = OpenResearchClient(lang=self.lang)
        await self._client.load_category_map()
        await self._client.load_keyword_map()
        return self

    async def __aexit__(self, *_: Any) -> None:
        """Close the HTTP client on context exit."""
        if self._client:
            await self._client.close()

    @property
    def client(self) -> OpenResearchClient:
        """Return the active HTTP client, raising if not in a context manager."""
        if self._client is None:
            raise RuntimeError("Use Collector as an async context manager")
        return self._client

    # Storage helpers

    def _resource_folder(self, resource_id: int) -> str:
        """Return the storage folder path for a resource."""
        return f"{self.base_path}/{resource_id}"

    def _metadata_path(self, resource_id: int) -> str:
        """Return the full path to a resource's metadata.json file."""
        return f"{self._resource_folder(resource_id)}/{METADATA_FILENAME}"

    def _exists(self, resource_id: int) -> bool:
        """Check if a resource has already been stored."""
        try:
            self.storage.read_file(self._metadata_path(resource_id))
            return True
        except Exception:
            return False

    def _save_metadata(self, resource: Resource) -> None:
        """Serialise and write a resource's metadata to storage."""
        data = json.dumps(
            resource.model_dump(mode="json"), ensure_ascii=False, indent=2, default=str
        )
        self.storage.write_file(data, self._metadata_path(resource.id))

    def _save_file(self, resource_id: int, filename: str, data: bytes) -> str:
        """Write a downloaded file to storage and return its path."""
        path = f"{self._resource_folder(resource_id)}/{filename}"
        self.storage.write_file(data, path)
        return path

    async def _download_and_save(self, resource: Resource, result: CollectionResult) -> None:
        """Download the primary file for a resource and save it to storage."""
        try:
            async with self._sem:
                dl = await self.client.download_file(resource)
            if dl:
                filename, data = dl
                ref = self._save_file(resource.id, filename, data)
                resource.downloaded_files.append(ref)
                result.files_downloaded += 1
        except Exception as exc:
            logger.warning("File download failed for resource %d: %s", resource.id, exc)

    async def _resolve_keywords(self, resource: Resource) -> None:
        """Fetch and resolve keyword labels for a resource."""
        async with self._sem:
            keyword_ids = await self.client.get_keyword_ids(resource.id)
        resource.keyword_ids = keyword_ids
        for kid in keyword_ids:
            async with self._sem:
                label = await self.client.resolve_keyword(kid)
            if label:
                resource.keywords.append(label)

    async def _download_raadsinformatie(
        self, resource: Resource, result: CollectionResult
    ) -> None:
        """Extract raadsinformatie URLs from resource body and download them."""
        urls = extract_raadsinformatie_urls(resource.body or "")
        for url in urls:
            try:
                async with self._sem:
                    dl = await self.client.download_url(url)
                if dl:
                    filename, data = dl
                    ref = self._save_file(resource.id, f"raadsinformatie_{filename}", data)
                    resource.raadsinformatie.update({url: ref})
                else:
                    resource.raadsinformatie.update({url: None})
            except Exception as exc:
                logger.warning("Raadsinformatie download failed for %s: %s", url, exc)

    async def _follow_edges(self, resource: Resource, result: CollectionResult) -> None:
        """Follow document edges and recursively collect linked resources."""
        try:
            doc_ids = await self.client.get_document_ids(resource.id)
            resource.document_ids = doc_ids
            for doc_id in doc_ids:
                if doc_id != resource.id:
                    await self._collect_one(doc_id, result)
        except Exception as exc:
            logger.debug("Could not follow edges for %d: %s", resource.id, exc)

    def load_resource(self, resource_id: int) -> Resource | None:
        """Load a previously collected resource from storage."""
        try:
            raw = self.storage.read_file(self._metadata_path(resource_id))
            return Resource.model_validate(json.loads(raw))
        except Exception:
            return None

    def _get_all_resource_ids(self) -> list[int]:
        """
        Return IDs of all resources present in storage.

        Use get_subfolders (consistent across LocalStorage and AzureBlobStorage —
        both return immediate subfolder names). get_folder_contents on Azure returns
        blobs recursively, which would give names like "137362/metadata.json" and
        fail the isdigit() check, silently producing an empty list.
        """
        try:
            folders = self.storage.get_subfolders(self.base_path)
            return [int(f) for f in folders if f.isdigit()]
        except Exception:
            return []

    async def _enrich_authors(self, resource: Resource) -> None:
        """Fetch and set author and team info on a resource."""
        async with self._sem:
            author_ids = await self.client.get_article_authors(resource.id)

        authors = []
        for aid in author_ids:
            async with self._sem:
                profile = await self.client.get_author_profile(aid)
            authors.append(profile)

        async with self._sem:
            team_ids = await self.client.get_article_teams(resource.id)

        teams = []
        for tid in team_ids:
            async with self._sem:
                team = await self.client.get_team_profile(tid)
            if team:
                teams.append(team)

        resource.authors = authors
        resource.teams = teams

        # Fallback: if no person edges found, resolve creator_id profile
        if not authors and resource.creator_id:
            async with self._sem:
                profile = await self.client.get_author_profile(resource.creator_id)
            resource.authors = [profile]

    async def enrich_authors(self, force: bool = False) -> dict[str, int]:
        """
        Enrich all collected resources with author and team info.

        Uses load_resource / _save_metadata so it works correctly with both
        local filesystem and Azure Blob storage, and goes through Pydantic
        validation on every read/write.

        Parameters
        ----------
        force:
            Re-fetch even if author info is already present.

        Returns
        -------
        Stats dict with keys: enriched, skipped, failed
        """
        stats = {"enriched": 0, "skipped": 0, "failed": 0}

        for resource_id in self._get_all_resource_ids():
            resource = self.load_resource(resource_id)
            if resource is None:
                stats["failed"] += 1
                continue

            if not force and resource.authors:
                stats["skipped"] += 1
                continue

            try:
                await self._enrich_authors(resource)
                self._save_metadata(resource)
                stats["enriched"] += 1
                logger.info(
                    "Enriched %d — %d author(s): %s | %d team(s): %s",
                    resource_id,
                    len(resource.authors),
                    [a.name for a in resource.authors],
                    len(resource.teams),
                    [t.name for t in resource.teams],
                )
            except Exception as exc:
                logger.warning("Failed to enrich %d: %s", resource_id, exc)
                stats["failed"] += 1

        logger.info(
            "enrich_authors done: enriched=%d skipped=%d failed=%d",
            stats["enriched"],
            stats["skipped"],
            stats["failed"],
        )
        return stats

    # Core

    async def _fetch_resource(self, resource_id: int) -> Resource | None:
        """Fetch a single resource from the API, resolving category if needed."""
        try:
            async with self._sem:
                resource = await self.client.get_resource(resource_id)
        except Exception as exc:
            logger.warning("Failed to fetch resource %d: %s", resource_id, exc)
            return None

        # Resolve category name for any cache miss (e.g. newly added categories)
        if resource.category is None and resource.category_id is not None:
            async with self._sem:
                resource.category = await self.client.resolve_category(resource.category_id)

        return resource

    async def _collect_one(
        self,
        resource_id: int,
        result: CollectionResult,
        collect_categories: list[str] | None = None,
        collection_source: str = "api",
    ) -> None:
        """Fetch, optionally download, and store a single resource."""
        if self.skip_existing and self._exists(resource_id):
            logger.debug("Skipping %d (already in storage)", resource_id)
            result.skipped.append(resource_id)
            return

        resource = await self._fetch_resource(resource_id)
        if resource is None:
            result.failed.append(resource_id)
            return

        resource.collection_source = collection_source  # type: ignore[assignment]

        # Category filter -- only used by collect_from_sitemap where API-side
        # filtering is not available. Not passed down in _follow_edges so child
        # docs are always collected regardless of their own category.
        if collect_categories and resource.category not in collect_categories:
            logger.debug(
                "Skipping %d -- category %r not in %s",
                resource_id,
                resource.category,
                collect_categories,
            )
            result.skipped.append(resource_id)
            return

        await self._resolve_keywords(resource)

        if self.follow_document_edges:
            await self._follow_edges(resource, result)

        if self.download_files:
            await self._download_and_save(resource, result)
            await self._download_raadsinformatie(resource, result)

        self._save_metadata(resource)
        result.collected.append(resource_id)
        logger.info("Collected resource %d (%s)", resource_id, resource.title or "-")

    # Public API

    async def collect_by_id(self, *ids: int) -> CollectionResult:
        """Collect one or more resources by numeric ID."""
        result = CollectionResult()
        await asyncio.gather(*[self._collect_one(rid, result) for rid in ids])
        logger.info("collect_by_id done: %s", result)
        return result

    async def collect_collection(self, collection_id: int) -> CollectionResult:
        """Collect a collection resource and all its children."""
        result = CollectionResult()
        await self._collect_one(collection_id, result)

        filters = SearchFilters(hasobject=collection_id, is_published="all", pagelen=100)
        child_ids: list[int] = []
        async for page in self.client.search_all(filters):
            child_ids.extend(page.ids)
            logger.info("Collection %d: %d/%d children", collection_id, len(child_ids), page.total)

        await asyncio.gather(
            *[self._collect_one(rid, result) for rid in child_ids if rid != collection_id]
        )
        logger.info("collect_collection(%d) done: %s", collection_id, result)
        return result

    async def search_and_collect(
        self,
        filters: SearchFilters,
        max_pages: int | None = None,
        max_docs: int | None = None,
    ) -> CollectionResult:
        """Search for resources and collect all matches."""
        result = CollectionResult()

        async for page in self.client.search_all(filters, max_pages=max_pages):
            logger.info(
                "Search: %d collected, %d skipped, %d failed / %d total",
                len(result.collected),
                len(result.skipped),
                len(result.failed),
                page.total,
            )
            await asyncio.gather(*[self._collect_one(rid, result) for rid in page.ids])
            if max_docs and len(result.collected) >= max_docs:
                logger.info("Test mode: reached max_docs=%d, stopping collection", max_docs)
                break
        logger.info("search_and_collect done: %s", result)
        return result

    async def collect_from_sitemap(
        self,
        collect_categories: list[str] | None = None,
        max_docs: int | None = None,
    ) -> CollectionResult:
        """
        Fetch all resource IDs from the sitemap index and collect them.

        Processes one sitemap page at a time so progress is visible and
        memory usage is bounded. If interrupted, skip_existing ensures
        already-collected resources are not re-fetched on restart.

        collect_categories:
            If set, only resources whose category is in this list are stored.
            Child docs linked via edges are always collected regardless.
            Use this when you want the same category filtering as
            search_and_collect but need the completeness of sitemap discovery.
        """
        import re
        from xml.etree import ElementTree  # noqa: PLC0415

        from tqdm import tqdm  # noqa: PLC0415

        result = CollectionResult()
        id_pattern = re.compile(r"/page/(\d+)/")
        ns = {"sm": "http://www.sitemaps.org/schemas/sitemap/0.9"}

        # Fetch sitemap index
        sitemap_index_url = f"{self.client.base_url}/en/sitemap.xml"
        resp = await self.client._client.get(sitemap_index_url, headers={"Accept": "*/*"})
        resp.raise_for_status()
        root = ElementTree.fromstring(resp.text)
        sitemap_urls = [
            loc.text.strip()
            for loc in root.findall("sm:sitemap/sm:loc", ns)
            if loc.text and loc.text.strip()
        ]

        logger.info("Sitemap index: %d sitemap pages found", len(sitemap_urls))

        # Process one sitemap page at a time
        for sitemap_url in tqdm(sitemap_urls, desc="Sitemap pages", unit="page"):
            try:
                resp = await self.client._client.get(sitemap_url, headers={"Accept": "*/*"})
                resp.raise_for_status()
                root = ElementTree.fromstring(resp.text)
            except Exception as exc:
                logger.warning("Skipping sitemap page %s: %s", sitemap_url, exc)
                continue
            page_ids = []
            for loc in root.findall("sm:url/sm:loc", ns):
                m = id_pattern.search(loc.text or "")
                if m:
                    page_ids.append(int(m.group(1)))

            page_ids = list(dict.fromkeys(page_ids))  # deduplicate within page
            for rid in tqdm(page_ids, desc="Collecting", unit="doc", leave=False):
                await self._collect_one(rid, result, collect_categories, "sitemap")
                if max_docs and len(result.collected) >= max_docs:
                    logger.info(
                        "Test mode: reached max_docs=%d, stopping sitemap collection", max_docs
                    )
                    return result

            tqdm.write(
                f"  {sitemap_url.split('?')[1] if '?' in sitemap_url else sitemap_url} -- "
                f"{len(page_ids)} ids, "
                f"collected={len(result.collected)} "
                f"skipped={len(result.skipped)} "
                f"failed={len(result.failed)}"
            )

        logger.info("collect_from_sitemap done: %s", result)
        return result
