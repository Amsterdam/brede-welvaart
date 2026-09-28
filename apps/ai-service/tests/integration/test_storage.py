"""
Integration tests for storage backends.

Covers LocalStorage (path resolution, traversal-guard, basic I/O) and
AzureBlobStorage (live Azure / Azurite). Both happily live here so all storage
behaviour is in one place; LocalStorage doesn't strictly need the integration
marker but the cost is negligible.

Usage:
    uv run pytest tests/integration/test_storage.py -m integration -v -s
    uv run pytest tests/integration/test_storage.py -m integration -k azure -v -s
    uv run pytest tests/integration/test_storage.py -m integration -k local -v -s
"""

from __future__ import annotations

import time

import pytest
from src.storage import AzureBlobStorage, LocalStorage

pytestmark = pytest.mark.integration

TEST_FILE_CONTENT = b"hello from integration test"
TEST_FILE_NAME = "test_integration_write.txt"
TEST_RUN_ID = str(int(time.time()))
TEST_PREFIX = f"_integration_test/{TEST_RUN_ID}"


# ---------------------------------------------------------------------------
# LocalStorage
# ---------------------------------------------------------------------------


@pytest.fixture
def local_storage(tmp_path):
    return LocalStorage(tmp_path / "storage_test")


def test_local_write_and_read(local_storage):
    local_storage.write_file(TEST_FILE_CONTENT, TEST_FILE_NAME)
    assert local_storage.read_file(TEST_FILE_NAME) == TEST_FILE_CONTENT


def test_local_exists_and_get_size(local_storage):
    local_storage.write_file(TEST_FILE_CONTENT, TEST_FILE_NAME)
    assert local_storage.exists(TEST_FILE_NAME)
    assert local_storage.get_size(TEST_FILE_NAME) == len(TEST_FILE_CONTENT)
    assert not local_storage.exists("nope.txt")


def test_local_list_folder(local_storage):
    local_storage.write_file(b"a", "subfolder/a.txt")
    local_storage.write_file(b"b", "subfolder/b.txt")
    contents = local_storage.get_folder_contents("subfolder")
    assert len(contents) == 2
    assert any("a.txt" in p for p in contents)
    assert any("b.txt" in p for p in contents)


def test_local_subfolders(local_storage):
    local_storage.write_file(b"x", "alpha/file.txt")
    local_storage.write_file(b"x", "beta/file.txt")
    subfolders = local_storage.get_subfolders("")
    assert any("alpha" in s for s in subfolders)
    assert any("beta" in s for s in subfolders)


def test_local_allows_paths_inside_base(local_storage):
    """Sanity: a legitimate nested path resolves and round-trips."""
    key = "openresearch/openresearch/123/metadata.json"
    local_storage.write_file(b"hi", key)
    assert local_storage.read_file(key) == b"hi"


@pytest.mark.parametrize(
    "evil_path",
    [
        "../etc/passwd",
        "../../etc/passwd",
        "subdir/../../escape.txt",
        "/etc/passwd",
        "/tmp/absolute.txt",
    ],
)
def test_local_rejects_path_traversal_on_read(local_storage, evil_path):
    """Path-traversal guard: refuse keys that escape base_dir.

    AzureBlobStorage doesn't have this class of bug — blob names are flat
    strings within a container and can't escape it — so the test is local-only.
    """
    with pytest.raises(ValueError, match="escapes storage root"):
        local_storage.read_file(evil_path)


def test_local_rejects_path_traversal_on_write(local_storage):
    """The guard fires on write_file too (writes are the real attack)."""
    with pytest.raises(ValueError, match="escapes storage root"):
        local_storage.write_file(b"pwn", "../escaped.txt")


# ---------------------------------------------------------------------------
# AzureBlobStorage
# ---------------------------------------------------------------------------


@pytest.fixture
def azure_storage():
    try:
        storage = AzureBlobStorage(default_container="integration-test")
    except EnvironmentError as e:
        pytest.skip(str(e))
    storage.ensure_container()
    yield storage

    # cleanup: delete this test run's blobs
    container_client = storage.get_container_client()
    for blob in container_client.list_blobs(name_starts_with=TEST_PREFIX):
        container_client.delete_blob(blob.name)


def test_azure_get_containers(azure_storage):
    print(f"\n{'='*60}")
    print("TEST: AzureBlobStorage get_containers")
    print("=" * 60)

    containers = azure_storage.get_containers()
    print(f"  Containers: {containers}")

    assert isinstance(containers, list)


def test_azure_get_subfolders(azure_storage):
    print(f"\n{'='*60}")
    print(f"TEST: AzureBlobStorage get_subfolders (prefix='{TEST_PREFIX}')")
    print("=" * 60)

    azure_storage.write_file(TEST_FILE_CONTENT, f"{TEST_PREFIX}/sub/file.txt")
    subfolders = azure_storage.get_subfolders(TEST_PREFIX)
    print(f"  Subfolders: {subfolders}")

    assert isinstance(subfolders, list)
    assert any("sub" in s for s in subfolders)


def test_azure_get_folder_contents(azure_storage):
    print(f"\n{'='*60}")
    print(f"TEST: AzureBlobStorage get_folder_contents (prefix='{TEST_PREFIX}')")
    print("=" * 60)

    path = f"{TEST_PREFIX}/{TEST_FILE_NAME}"
    azure_storage.write_file(TEST_FILE_CONTENT, path)
    contents = azure_storage.get_folder_contents(TEST_PREFIX)
    print(f"  Contents ({len(contents)} items): {contents[:5]}")

    assert isinstance(contents, list)
    assert any(TEST_FILE_NAME in c for c in contents)


def test_azure_write_and_read(azure_storage):
    print(f"\n{'='*60}")
    print("TEST: AzureBlobStorage write + read")
    print("=" * 60)

    path = f"{TEST_PREFIX}/{TEST_FILE_NAME}"
    azure_storage.write_file(TEST_FILE_CONTENT, path)
    result = azure_storage.read_file(path)

    print(f"  Written : {len(TEST_FILE_CONTENT)} bytes to {path}")
    print(f"  Read    : {len(result)} bytes")

    assert result == TEST_FILE_CONTENT
