"""
Integration tests for the OpenResearch collector.
Hit the live API - run manually, not in CI.

    uv run pytest tests/integration/ -m integration -v -s
"""

from __future__ import annotations

import pytest
from src.openresearch import Collector, SearchFilters
from src.storage import LocalStorage

pytestmark = pytest.mark.integration

RESOURCE_ID = 132659  # "Initial findings report"
COLLECTION_ID = 128337  # "Grip on LLMs"
QUERY = "grip on llms"
RAADSINFO_RESOURCE_ID = 115559  # Rapport Kinderombudsman
AUTHORS_RESOURCE_ID = 79233  # "35 jaar ACS" - 5 authors + "Redactie GGD" team


def print_resource_summary(resource) -> None:
    print(f"  id       : {resource.id}")
    print(f"  title    : {resource.title}")
    print(f"  category : {resource.category} (id={resource.category_id})")
    print(f"  slug     : {resource.slug}")
    print(f"  url      : {resource.page_url_abs}")
    print(f"  created  : {resource.created}")
    print(f"  modified : {resource.modified}")
    print(f"  language : {resource.language}")
    print(f"  doc_ids  : {resource.document_ids}")
    print(f"  files    : {resource.downloaded_files}")
    print(f"  keywords : {resource.keywords}")


@pytest.fixture
async def collector(tmp_path):
    storage = LocalStorage(tmp_path / "or_test_data")
    async with Collector(
        storage=storage,
        download_files=True,
        follow_document_edges=True,
        skip_existing=False,
        concurrency=3,
    ) as c:
        yield c


@pytest.mark.asyncio
async def test_single_resource(collector):
    print(f"\n{'='*60}")
    print(f"TEST 1: Single resource (id={RESOURCE_ID})")
    print("=" * 60)

    result = await collector.collect_by_id(RESOURCE_ID)
    print(f"Result: {result}")

    resource = collector.load_resource(RESOURCE_ID)
    if resource:
        print_resource_summary(resource)
    else:
        print("  !! Could not load resource from storage")

    # Collected doc + 2 attachments
    assert len(result.collected) >= 3
    assert result.files_downloaded >= 2
    assert not result.failed
    assert resource is not None
    # Doc has 3 keywords
    assert len(resource.keyword_ids) > 0
    assert len(resource.keywords) > 0
    assert all("&amp;" not in k for k in resource.keywords)  # no HTML entities


@pytest.mark.asyncio
async def test_collection(collector):
    print(f"\n{'='*60}")
    print(f"TEST 2: Collection (id={COLLECTION_ID})")
    print("=" * 60)

    result = await collector.collect_collection(COLLECTION_ID)
    print(f"Result: {result}")
    print(f"  Collected : {result.collected}")
    print(f"  Skipped   : {result.skipped}")
    print(f"  Failed    : {result.failed}")

    # Collected collection + at least 3 docs within collection
    assert COLLECTION_ID in result.collected
    assert len(result.collected) >= 3
    assert not result.failed


@pytest.mark.asyncio
async def test_search(collector):
    print(f"\n{'='*60}")
    print(f"TEST 3: Search — '{QUERY}'")
    print("=" * 60)

    filters = SearchFilters(text=QUERY, pagelen=10)

    result = await collector.search_and_collect(filters)
    print(f"Result: {result}")

    for rid in result.collected[:3]:
        resource = collector.load_resource(rid)
        if resource:
            print(f"\n --- Resource {rid} ---")
            print_resource_summary(resource)

    # There should be at least 4 hits - grip collection and resource
    assert len(result.collected) >= 4
    assert not result.failed


@pytest.mark.asyncio
async def test_raadsinformatie_download(collector):
    print(f"\n{'='*60}")
    print(f"TEST 4: Raadsinformatie download (id={RAADSINFO_RESOURCE_ID})")
    print("=" * 60)

    result = await collector.collect_by_id(RAADSINFO_RESOURCE_ID)
    print(f"Result: {result}")

    resource = collector.load_resource(RAADSINFO_RESOURCE_ID)
    if resource:
        print_resource_summary(resource)

    assert not result.failed
    assert resource is not None
    assert len(resource.raadsinformatie) >= 2


@pytest.mark.asyncio
async def test_enrich_authors(collector):
    """Collect a known author-rich resource, run enrich, verify names + team landed."""
    print(f"\n{'='*60}")
    print(f"TEST 5: Enrich authors (id={AUTHORS_RESOURCE_ID})")
    print("=" * 60)

    collect_result = await collector.collect_by_id(AUTHORS_RESOURCE_ID)
    assert not collect_result.failed

    stats = await collector.enrich_authors()
    print(f"  Enrich stats: {stats}")
    assert stats["failed"] == 0
    assert stats["enriched"] >= 1

    resource = collector.load_resource(AUTHORS_RESOURCE_ID)
    assert resource is not None

    print(f"  Authors ({len(resource.authors)}): {[a.name for a in resource.authors]}")
    print(f"  Teams   ({len(resource.teams)}): {[t.name for t in resource.teams]}")

    assert len(resource.authors) >= 1, "expected at least one author after enrich"
    assert resource.authors[0].id is not None
    assert resource.authors[0].name, "author name should be populated by enrich"
    assert len(resource.teams) >= 1, "expected at least one team (Redactie GGD)"
    assert any(
        t.name == "Redactie GGD" for t in resource.teams
    ), f"expected 'Redactie GGD' in teams, got {[t.name for t in resource.teams]}"


@pytest.mark.asyncio
async def test_enrich_authors_idempotent(collector):
    """A second enrich pass should skip already-enriched records."""
    print(f"\n{'='*60}")
    print(f"TEST 6: Enrich is idempotent (id={AUTHORS_RESOURCE_ID})")
    print("=" * 60)

    await collector.collect_by_id(AUTHORS_RESOURCE_ID)
    first = await collector.enrich_authors()
    second = await collector.enrich_authors()
    print(f"  First run : {first}")
    print(f"  Second run: {second}")

    assert second["failed"] == 0
    # second pass should skip what the first pass enriched
    assert second["skipped"] >= 1
    assert second["enriched"] == 0
