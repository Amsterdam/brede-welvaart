"""
Integration tests for retrieval — hits the actual vector index.
Uses RetrieverRouter directly (same init path as main.py lifespan).
Run manually, not in CI.

Usage:
    uv run pytest tests/integration/test_retrieval.py -m integration -v -s
"""

from __future__ import annotations

from pathlib import Path

import pytest
from src.retrieval import RetrieverRouter
from src.storage import LocalStorage, get_storage
from src.utils.config import load_config

pytestmark = pytest.mark.integration

_CONFIG_DIR = Path(__file__).parent.parent.parent / "config"

QUERY = "effecten van toerisme op woningmarkt Amsterdam"
TOP_N = 5


def print_hit(rank: int, hit) -> None:
    print(f"  [{rank}] score={hit.score:.4f}  doc_id={hit.doc_id}")  # noqa: E231
    title = getattr(hit, "title", "")
    if title:
        print(f"       title={title[:80]}")


@pytest.fixture(scope="module")
def retriever():
    cfg = load_config(_CONFIG_DIR / "data_ingestion_test.yaml")
    storage = get_storage(cfg.get("storage", {}))
    c_emb = cfg["embedding"]
    collection_prefix = f"{c_emb['collections_dir'].rstrip('/')}/{c_emb['collection']}"
    store_prefix = f"{c_emb['store_path'].rstrip('/')}/{c_emb['collection']}"

    if isinstance(storage, LocalStorage):
        store_abs = storage.base_dir / store_prefix
        if not store_abs.exists():
            pytest.skip(f"Test index not found at {store_abs} — run the pipeline first")

    r = RetrieverRouter.get_retriever(
        provider=c_emb["backend"],
        collection_prefix=collection_prefix,
        storage=storage,
        store_prefix=store_prefix,
        model_name=c_emb["model"],
        dimensions=c_emb.get("dimensions"),
    )
    r.build_index(load_only=True)
    r.embed_query("warmup")  # load model before tests start
    return r


def test_index_non_empty(retriever):
    print(f"\n{'='*60}")
    print("TEST: index is non-empty after build_index")
    print("=" * 60)

    n = retriever.count()
    print(f"  Chunks in index : {n}")
    assert n > 0


def test_retrieve_returns_results(retriever):
    print(f"\n{'='*60}")
    print(f"TEST: retrieve — '{QUERY}'")
    print("=" * 60)

    results = retriever.retrieve(QUERY, top_n=TOP_N)
    print(f"  Returned {results.n_retrieved} hits")
    for i, hit in enumerate(results.results):
        print_hit(i + 1, hit)

    assert not results.error
    assert len(results.results) == TOP_N
    assert all(hasattr(h, "doc_id") for h in results.results)
    assert all(hasattr(h, "score") for h in results.results)


def test_results_sorted_by_score(retriever):
    print(f"\n{'='*60}")
    print("TEST: results sorted by score descending")
    print("=" * 60)

    results = retriever.retrieve(QUERY, top_n=TOP_N)
    scores = [h.score for h in results.results]
    print(f"  Scores: {scores}")

    assert not results.error
    assert scores == sorted(scores, reverse=True)


def test_scores_are_valid(retriever):
    print(f"\n{'='*60}")
    print("TEST: scores are valid cosine similarities")
    print("=" * 60)

    results = retriever.retrieve(QUERY, top_n=TOP_N)
    scores = [h.score for h in results.results]
    print(f"  Scores: {scores}")

    assert not results.error
    assert all(-1.0 <= score <= 1.0 for score in scores)


def test_top_n_respected(retriever):
    print(f"\n{'='*60}")
    print("TEST: top_n parameter respected")
    print("=" * 60)

    available_chunks = retriever.count()
    for k in [1, 3, 10]:
        results = retriever.retrieve(QUERY, top_n=k)
        expected_hits = min(k, available_chunks)
        print(f"  top_n={k} → {len(results.results)} hits (expected {expected_hits})")
        assert not results.error
        assert len(results.results) == expected_hits


def test_different_queries_differ(retriever):
    print(f"\n{'='*60}")
    print("TEST: different queries return different top results")
    print("=" * 60)

    results_a = retriever.retrieve(QUERY, top_n=3)
    results_b = retriever.retrieve("luchtvervuiling gezondheid kinderen", top_n=3)

    top_a = {h.doc_id for h in results_a.results}
    top_b = {h.doc_id for h in results_b.results}

    print(f"  Query A top-3 : {top_a}")
    print(f"  Query B top-3 : {top_b}")

    assert not results_a.error
    assert not results_b.error
    assert top_a != top_b
