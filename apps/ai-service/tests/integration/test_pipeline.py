r"""
Integration tests for the data pipeline — exercises both storage backends.

Runs the full 5-step pipeline (collect -> enrich -> extract -> assemble -> embed)
once per backend, then asserts the output structure and that retrieval works,
including that author/team metadata propagates from enrich all the way to
retrieved chunks.

The `pipeline_output` fixture is parametrized over ["local", "azure"]:
  - local : tmp dir via pytest's tmp_path_factory
  - azure : a unique container (cleaned up after the test) on whatever Azure /
            Azurite endpoint the env vars point to. Skipped if unreachable.

SAFETY GUARANTEES
-----------------
By design, these tests cannot touch production data:

  * Local: the fixture uses pytest's tmp_path_factory (e.g. %TEMP%\\pytest-of-USER\\...).
    A defensive assertion also rejects any path that overlaps `data/openresearch`.

  * Azure: by default, only runs against an Azurite connection string. If the
    env vars point at real Azure, the test is SKIPPED unless you explicitly
    opt in with `RUN_AZURE_TESTS_AGAINST_REAL_AZURE=1`. Even with opt-in, the
    test only creates and deletes a uniquely-named `test-pipeline-*` container —
    it never reads or writes other containers.

Run manually (slow — downloads & embeds N docs end-to-end):

    # full end-to-end (both backends, pipeline + retrieval):
    uv run pytest tests/integration/test_pipeline.py -m integration -v -s

    # local backend only:
    uv run pytest tests/integration/test_pipeline.py -m integration -v -s \\
        -k local

    # pipeline only (skip the retrieval assertions):
    uv run pytest tests/integration/test_pipeline.py -m integration -v -s \\
        -k "not retrieval"

    # retrieval only (still runs the pipeline once per backend, via fixture):
    uv run pytest tests/integration/test_pipeline.py -m integration -v -s \\
        -k retrieval


Verifying the safety net
------------------------
1. With only a non-Azurite endpoint configured (e.g. AZURE_STORAGE_ACCOUNT_BLOB_ENDPOINT
   set, no AZURE_STORAGE_CONNECTION_STRING), the azure params should SKIP:

       uv run pytest tests/integration/test_pipeline.py -m integration -v -s -k azure
       # expected: SKIPPED with "refusing to run Azure tests against non-Azurite target"

2. With Azurite running and AZURE_STORAGE_CONNECTION_STRING pointed at it, the test runs
   against Azurite and deletes its 'test-pipeline-*' container at teardown:

       docker run -d --name azurite -p 10000:10000 mcr.microsoft.com/azure-storage/azurite:latest
       uv run pytest tests/integration/test_pipeline.py -m integration -v -s -k azure

3. Explicit opt-in for running against REAL Azure (only do this if you really mean it).
   Note: temporarily empties AZURE_STORAGE_CONNECTION_STRING so the backend falls
   through to RBAC auth via AZURE_STORAGE_ACCOUNT_BLOB_ENDPOINT. Requires `az login`
   plus 'Storage Account Contributor' + 'Storage Blob Data Contributor' on the target:

       AZURE_STORAGE_CONNECTION_STRING= RUN_AZURE_TESTS_AGAINST_REAL_AZURE=1 \\
           uv run pytest tests/integration/test_pipeline.py -m integration -v -s -k azure

See the project README ("Local storage with Azurite") for how to spin up Azurite.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import time
from pathlib import Path

import pytest
from scripts.run_pipeline import run
from src.storage import AzureBlobStorage, Storage, get_storage
from src.storage.azure import _is_azurite_connection_string
from src.utils.config import load_config

pytestmark = pytest.mark.integration

_CONFIG_DIR = Path(__file__).parent.parent.parent / "config"
_CONFIG = _CONFIG_DIR / "data_ingestion_test.yaml"
TEST_SIZE = 10

STORAGE_BACKENDS = ["local", "azure"]

# Paths the test fixture must NEVER point storage at.
_FORBIDDEN_LOCAL_ROOTS = ("data/openresearch", "data\\openresearch")

# Opt-in flag for running the Azure backend against real Azure (not Azurite).
_ALLOW_REAL_AZURE_ENV = "RUN_AZURE_TESTS_AGAINST_REAL_AZURE"


def _probe_azure() -> tuple[bool, str]:
    """
    Return (ok, reason) for whether the Azure backend is safe + reachable.

    By default this only OKs Azurite connection strings. Real Azure is allowed
    iff the user explicitly opts in via RUN_AZURE_TESTS_AGAINST_REAL_AZURE=1.
    """
    conn_str = os.getenv("AZURE_STORAGE_CONNECTION_STRING")
    allow_real = os.getenv(_ALLOW_REAL_AZURE_ENV, "").lower() in ("1", "true", "yes")

    if conn_str and _is_azurite_connection_string(conn_str):
        target = "Azurite"
    elif allow_real:
        target = "real Azure (opted in)"
    else:
        return False, (
            "refusing to run Azure tests against non-Azurite target. "
            "Set AZURE_STORAGE_CONNECTION_STRING to an Azurite connection string "
            f"(see .env.example), or set {_ALLOW_REAL_AZURE_ENV}=1 to allow real "
            "Azure (creates and deletes a 'test-pipeline-*' container)."
        )

    try:
        s = AzureBlobStorage(default_container="")
        # eagerly hit the service so connection / auth errors surface here
        next(iter(s.blob_service_client.list_containers(results_per_page=1)), None)
        return True, f"target={target}"
    except Exception as e:
        return False, f"{type(e).__name__}: {e}"


def _assert_safe_local_base(tmp: Path) -> None:
    """Defensive: refuse to use the fixture if the resolved base overlaps prod data."""
    s = str(tmp).replace("\\", "/")
    for forbidden in _FORBIDDEN_LOCAL_ROOTS:
        forbidden_norm = forbidden.replace("\\", "/")
        if forbidden_norm in s:
            pytest.fail(
                f"Refusing to run pipeline tests against production data dir: {tmp}. "
                f"tmp_path_factory should land in a temp location, never under "
                f"{_FORBIDDEN_LOCAL_ROOTS}."
            )


def _make_storage_cfg(request, tmp_path_factory) -> tuple[dict, Storage, str]:
    """
    Build a storage-section dict for the requested backend and an instance.
    Returns (storage_cfg_block, storage, label) where label is for logging.
    """
    backend = request.param
    if backend == "local":
        tmp = tmp_path_factory.mktemp("pipeline-local")
        _assert_safe_local_base(tmp)
        cfg_block = {"backend": "local", "base_dir": str(tmp)}
        return cfg_block, get_storage(cfg_block), f"local @ {tmp}"

    if backend == "azure":
        ok, reason = _probe_azure()
        if not ok:
            pytest.skip(f"Azure storage not reachable / not safe: {reason}")
        # unique container per run so parallel runs don't collide
        container = f"test-pipeline-{int(time.time())}"
        cfg_block = {"backend": "azure", "container": container}
        return cfg_block, get_storage(cfg_block), f"azure container={container} ({reason})"

    raise ValueError(f"Unknown backend: {backend}")


@pytest.fixture(scope="module", params=STORAGE_BACKENDS)
def pipeline_output(request, tmp_path_factory):
    """Run the full pipeline once per backend, return (storage, cfg)."""
    cfg = load_config(_CONFIG)
    storage_cfg, storage, label = _make_storage_cfg(request, tmp_path_factory)
    cfg["storage"] = storage_cfg

    print(f"\n>>> Running pipeline against {label}")

    args = argparse.Namespace(
        steps=["collect", "enrich", "extract", "assemble", "embed"],
        config=_CONFIG,
        test_size=TEST_SIZE,
    )

    exit_code = asyncio.run(run(args, cfg))
    assert exit_code == 0, f"Pipeline exited with non-zero status (backend={request.param})"

    yield storage, cfg

    # cleanup: for azure, delete the container we created so we don't leak
    if request.param == "azure" and isinstance(storage, AzureBlobStorage):
        try:
            storage.blob_service_client.delete_container(storage.default_container)
            print(f"\n<<< Deleted azure container {storage.default_container}")
        except Exception as e:
            print(f"\n<<< Failed to delete container {storage.default_container}: {e}")


# ----------------------------------------------------------------------------- structural checks


def test_openresearch_docs_collected(pipeline_output):
    storage, cfg = pipeline_output
    base = cfg["openresearch"].get("base_path", "openresearch")
    doc_dirs = storage.get_subfolders(base)
    print(f"  Collected {len(doc_dirs)} doc dirs under '{base}'")
    assert len(doc_dirs) >= 1


def test_authors_enriched(pipeline_output):
    """At least one collected resource should have authors/teams populated by the enrich step."""
    storage, cfg = pipeline_output
    base = cfg["openresearch"].get("base_path", "openresearch")
    doc_dirs = storage.get_subfolders(base)

    sampled_with_authors = 0
    sample_size = min(20, len(doc_dirs))
    for doc_id in doc_dirs[:sample_size]:
        meta_key = f"{base}/{doc_id}/metadata.json"
        if not storage.exists(meta_key):
            continue
        meta = json.loads(storage.read_file(meta_key).decode("utf-8"))
        if meta.get("authors") or meta.get("teams"):
            sampled_with_authors += 1
            if sampled_with_authors == 1:
                # print one example for visibility
                print(
                    f"  Sample enriched record {doc_id}: "
                    f"{len(meta.get('authors', []))} authors, "
                    f"{len(meta.get('teams', []))} teams"
                )

    print(f"  Enriched: {sampled_with_authors}/{sample_size} sampled records")
    assert sampled_with_authors >= 1, (
        "No sampled resource has authors/teams populated — the enrich step "
        "may have failed silently or no docs in this batch have creators."
    )


def test_extracted_output_exists(pipeline_output):
    storage, cfg = pipeline_output
    ext_root = cfg["extraction"].get("output_dir", "extracted")
    backends = storage.get_subfolders(ext_root)
    print(f"  Extraction backends: {backends}")
    assert len(backends) >= 1


def test_collections_created(pipeline_output):
    storage, cfg = pipeline_output
    collections_root = cfg["indexing"].get("collections_dir", "collections")
    found = storage.get_subfolders(collections_root)
    print(f"  Collections: {found}")
    assert "summaries" in found


def test_embeddings_created(pipeline_output):
    storage, cfg = pipeline_output
    store_root = cfg["embedding"].get("store_path", "embeddings")
    # collection-level subfolder should exist (e.g. embeddings/summaries)
    collections = storage.get_subfolders(store_root)
    print(f"  Embedding collections: {collections}")
    assert any(c in collections for c in ("summaries", "best_chunks"))

    # at least one model subfolder under embeddings/{collection}
    c_emb = cfg["embedding"]
    collection_store = f"{store_root.rstrip('/')}/{c_emb['collection']}"
    models = storage.get_subfolders(collection_store)
    print(f"  Embedding models under {collection_store}: {models}")
    assert len(models) >= 1

    # and an index.npy under that
    model_dir = f"{collection_store}/{models[0]}"
    index_key = f"{model_dir}/index.npy"
    print(f"  Checking index file: {index_key}")
    assert storage.exists(index_key), f"index.npy missing at {index_key}"


# ----------------------------------------------------------------------------- retrieval


@pytest.fixture(scope="module")
def retriever(pipeline_output):
    """Build a retriever against the freshly-built pipeline index."""
    storage, cfg = pipeline_output
    from src.retrieval import RetrieverRouter

    c_emb = cfg["embedding"]
    r = RetrieverRouter.get_retriever(
        provider=c_emb["backend"],
        collection_prefix=f"{c_emb['collections_dir'].rstrip('/')}/{c_emb['collection']}",
        storage=storage,
        store_prefix=f"{c_emb['store_path'].rstrip('/')}/{c_emb['collection']}",
        model_name=c_emb["model"],
        dimensions=c_emb.get("dimensions"),
    )
    r.build_index(load_only=True)
    return r


def test_index_loadable_after_pipeline(retriever):
    print(f"  Chunks in index: {len(retriever._chunks)}")
    assert len(retriever._chunks) >= 1


# Generic Dutch queries — OR's first N docs vary per run, so we query for broad
# terms that should match the brede-welvaart corpus regardless of which specific
# docs were collected.
RETRIEVAL_QUERIES = [
    "Amsterdam beleid",
    "onderzoek bewoners",
    "stad gemeente",
]


@pytest.mark.parametrize("query", RETRIEVAL_QUERIES)
def test_retrieval_returns_hits(retriever, query):
    """End-to-end: pipeline output is actually searchable."""
    results = retriever.retrieve(query, top_n=5)

    print(f"\n  Query: '{query}' -> n_retrieved={results.n_retrieved}")
    for i, hit in enumerate(results.results[:3]):
        print(f"    [{i+1}] score={hit.score:.4f}  doc_id={hit.doc_id}")  # noqa: E231

    assert not results.error, f"Retrieval errored: {results.exception}"
    assert results.n_retrieved >= 1, "expected at least one result for a generic Dutch query"
    top = results.results[0]
    assert top.doc_id.startswith("openresearch:"), f"unexpected doc_id format: {top.doc_id}"
    assert top.score > 0, "top result has non-positive score - embedding model likely broken"


def test_retrieval_top_score_above_floor(retriever):
    """Sanity floor on similarity for at least one query — catches embedding regressions."""
    best_score = 0.0
    best_query = None
    for q in RETRIEVAL_QUERIES:
        results = retriever.retrieve(q, top_n=1)
        if results.results and results.results[0].score > best_score:
            best_score = results.results[0].score
            best_query = q
    score_str = format(best_score, ".4f")
    print(f"  Best top-1 score across queries: {score_str} (query='{best_query}')")
    # Multilingual-e5 typically lands relevant hits at 0.4+; 0.3 is a comfortable floor.
    assert best_score > 0.3, (
        f"No query scored above 0.3 (best={score_str}) - " "embedding model may be misconfigured"
    )


def _gather_authors_teams(chunk, seen_authors: dict[int, str], seen_teams: dict[int, str]) -> bool:
    """Merge a chunk's authors/teams into the seen-maps. Return True if it had any."""
    for a in chunk.authors:
        if a.id is not None:
            seen_authors.setdefault(a.id, a.name or "")
    for t in chunk.teams:
        if t.id is not None:
            seen_teams.setdefault(t.id, t.name or "")
    return bool(chunk.authors or chunk.teams)


def test_retrieved_chunks_carry_author_info(retriever):
    """
    Validates the full author-data path: enrich -> metadata -> assembler ->
    chunking -> IndexChunk -> embeddings -> retrieved chunks. If this passes,
    BWAnalyzer.find_authors will work too (it just aggregates these fields).
    """
    seen_authors: dict[int, str] = {}
    seen_teams: dict[int, str] = {}
    docs_with_metadata = 0

    for q in RETRIEVAL_QUERIES:
        results = retriever.retrieve(q, top_n=10)
        for chunk in results.results:
            if _gather_authors_teams(chunk, seen_authors, seen_teams):
                docs_with_metadata += 1

    print(f"  Retrieved chunks with author/team metadata: {docs_with_metadata}")
    print(f"  Unique authors seen: {len(seen_authors)}")
    print(f"  Unique teams seen:   {len(seen_teams)}")
    if seen_authors:
        print(f"  Sample authors: {list(seen_authors.items())[:3]}")
    if seen_teams:
        print(f"  Sample teams:   {list(seen_teams.items())[:3]}")

    assert docs_with_metadata >= 1, (
        "No retrieved chunk carries author/team metadata. "
        "Likely causes: enrich step didn't run, chunking didn't propagate, "
        "or this batch of docs has no creators."
    )
