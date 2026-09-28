"""
Integration tests for the Raadsinformatie (ORI) collector.
Hit the live API - run manually, not in CI.

Usage:
uv run pytest tests/integration/ -m integration -v -s
uv run pytest tests/integration/test_ri_collector.py -m integration -v -s --log-cli-level=WARNING
"""

from __future__ import annotations

import pytest
from src.raadsinformatie import Collector, RaadsStuk, SearchFilters
from src.storage import LocalStorage

pytestmark = pytest.mark.integration

RAADS_STUK_ID = "219610"
DOCUMENT_TYPE = "Voordracht"
TEXT_QUERY = "brede welvaart"
DATE_FROM = "2022-01-01"
DATE_TO = "2024-12-31"


def print_raads_stuk_summary(stuk: RaadsStuk) -> None:
    print(f"  id                : {stuk.id}")
    print(f"  name              : {stuk.name}")
    print(f"  document_type     : {stuk.document_type}")
    print(f"  file_name         : {stuk.file_name}")
    print(f"  content_type      : {stuk.content_type}")
    print(f"  size_in_bytes     : {stuk.size_in_bytes}")
    print(f"  url               : {stuk.url}")
    print(f"  last_discussed_at : {stuk.last_discussed_at}")
    print(f"  parent            : {stuk.parent}")
    print(f"  text_pages        : {len(stuk.text_pages)} pages")
    print(f"  md_text           : {len(stuk.md_text)} pages")
    print(f"  downloaded_file   : {stuk.downloaded_file}")


@pytest.fixture
async def collector(tmp_path):
    storage = LocalStorage(tmp_path / "ori_test_data")
    async with Collector(
        storage=storage,
        download_files=True,
        follow_documents=True,
        skip_existing=False,
        concurrency=3,
    ) as c:
        yield c


@pytest.mark.asyncio
async def test_single_raads_stuk(collector):
    print(f"\n{'='*60}")
    print(f"TEST 1: Single RaadsStuk (id={RAADS_STUK_ID})")
    print("=" * 60)

    result = await collector.collect_by_id(RAADS_STUK_ID)
    print(f"Result: {result}")

    stuk = collector.load_raads_stuk(RAADS_STUK_ID)
    if stuk:
        print_raads_stuk_summary(stuk)
    else:
        print("  !! Could not load raadsstuk from storage")

    assert RAADS_STUK_ID in result.collected
    assert not result.failed
    assert stuk is not None
    assert stuk.id == RAADS_STUK_ID
    assert stuk.url is not None


@pytest.mark.asyncio
async def test_document_type_search(collector):
    print(f"\n{'='*60}")
    print(f"TEST 2: Document type search — '{DOCUMENT_TYPE}' ({DATE_FROM} to {DATE_TO})")
    print("=" * 60)

    filters = SearchFilters(
        document_type=DOCUMENT_TYPE,
        date_from=DATE_FROM,
        date_to=DATE_TO,
        page_size=10,
        max_results=100,
    )
    result = await collector.collect_by_document_type(filters)
    print(f"Result: {result}")
    print(f"  Collected : {result.collected[:5]} ...")
    print(f"  Skipped   : {result.skipped}")
    print(f"  Failed    : {result.failed}")

    for sid in result.collected[:3]:
        stuk = collector.load_raads_stuk(sid)
        if stuk:
            print(f"\n --- RaadsStuk {sid} ---")
            print_raads_stuk_summary(stuk)

    assert len(result.collected) >= 1
    assert not result.failed

    for sid in result.collected:
        stuk = collector.load_raads_stuk(sid)
        assert stuk is not None
        assert stuk.document_type is not None


@pytest.mark.asyncio
async def test_text_search(collector):
    print(f"\n{'='*60}")
    print(f"TEST 3: Full-text search — '{TEXT_QUERY}'")
    print("=" * 60)

    filters = SearchFilters(
        text=TEXT_QUERY,
        date_from=DATE_FROM,
        page_size=10,
        max_results=100,
    )
    result = await collector.collect_by_text_search(filters)
    print(f"Result: {result}")

    for sid in result.collected[:3]:
        stuk = collector.load_raads_stuk(sid)
        if stuk:
            print(f"\n --- RaadsStuk {sid} ---")
            print_raads_stuk_summary(stuk)

    assert len(result.collected) >= 1
    assert not result.failed


@pytest.mark.asyncio
async def test_file_downloaded(collector):
    print(f"\n{'='*60}")
    print(f"TEST 4: File download (id={RAADS_STUK_ID})")
    print("=" * 60)

    result = await collector.collect_by_id(RAADS_STUK_ID)
    print(f"Result: {result}")

    stuk = collector.load_raads_stuk(RAADS_STUK_ID)
    if stuk:
        print_raads_stuk_summary(stuk)

    assert result.files_downloaded >= 1 or RAADS_STUK_ID in result.collected
    assert stuk is not None
    if result.files_downloaded > 0:
        assert stuk.downloaded_file is not None
        assert stuk.downloaded_file.endswith((".pdf", ".doc", ".docx"))


@pytest.mark.asyncio
async def test_skip_existing(tmp_path):
    """Second run with skip_existing=True should skip already-stored objects."""
    print(f"\n{'='*60}")
    print("TEST 5: skip_existing")
    print("=" * 60)

    storage = LocalStorage(tmp_path / "ori_skip_test")

    async with Collector(storage=storage, download_files=False, skip_existing=False) as c:
        result1 = await c.collect_by_id(RAADS_STUK_ID)
        print(f"First run : {result1}")

    async with Collector(storage=storage, download_files=False, skip_existing=True) as c:
        result2 = await c.collect_by_id(RAADS_STUK_ID)
        print(f"Second run: {result2}")

    assert RAADS_STUK_ID in result1.collected
    assert RAADS_STUK_ID in result2.skipped
    assert not result2.collected
