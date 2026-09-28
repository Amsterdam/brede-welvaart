"""
Unit tests for the memmap index load + SQLite metadata + dot-product retrieval
that replaced the materialise-everything load (which OOMKilled the serving pod:
2.5GB vectors on the heap + json.load of the 1.46GB index.json). Uses
LocalStorage so no blob/cluster is needed. The key invariant: scoring stays
identical to the old sklearn cosine_similarity path.
"""
import json

import numpy as np
from sklearn.metrics.pairwise import cosine_similarity

from scripts.build_sqlite_index import build_sqlite
from src.retrieval.base import BaseRetriever, _npy_to_bytes
from src.storage.local import LocalStorage
from src.utils.schemas import IndexChunk


class _StubRetriever(BaseRetriever):
    """Minimal concrete retriever; query embedding is injected per-test."""

    def _embed_documents(self, texts):
        return [[0.0] * 8 for _ in texts]

    def _embed_query(self, text):
        return self._q


def _make(tmp_path):
    return _StubRetriever(
        model_name="m", collection_prefix="c", storage=LocalStorage(tmp_path), store_prefix="s"
    )


def _chunk(i):
    return IndexChunk(content=f"chunk {i}", doc_id=f"d{i}", source="or", chunk_type="summary")


def _seed(r, emb, chunks):
    r.storage.write_file(_npy_to_bytes(emb), r._index_npy_key)
    IndexChunk.save_file(chunks, r.storage, r._index_json_key)


def test_load_uses_memmap_and_matches_cosine(tmp_path):
    r = _make(tmp_path)
    rng = np.random.default_rng(1)
    emb = rng.random((25, 8), dtype=np.float32)
    _seed(r, emb, [_chunk(i) for i in range(25)])

    r._load_index()

    # Vectors are memory-mapped, not a heap array.
    assert isinstance(r._embeddings, np.memmap)
    assert len(r._chunks) == 25

    q = rng.random(8, dtype=np.float32)
    r._q = q.tolist()
    res = r.retrieve("query", top_n=5)

    # Reference: the old cosine_similarity path.
    ref = cosine_similarity(q.reshape(1, -1), emb)[0]
    ref_order = np.argsort(ref)[::-1][:5]
    assert [it.doc_id for it in res.results] == [f"d{i}" for i in ref_order]
    np.testing.assert_allclose(
        [it.score for it in res.results], [round(float(ref[i]), 4) for i in ref_order], atol=1e-4
    )


def test_score_threshold_and_top_n(tmp_path):
    r = _make(tmp_path)
    emb = np.eye(4, 8, dtype=np.float32)  # orthogonal rows
    _seed(r, emb, [_chunk(i) for i in range(4)])
    r._load_index()

    r._q = [1.0, 0, 0, 0, 0, 0, 0, 0]  # aligned with row 0 only
    res = r.retrieve("q", top_n=4, score_threshold=0.5)

    assert res.n_retrieved == 1
    assert res.results[0].doc_id == "d0"
    assert res.results[0].score == 1.0


def test_empty_index_returns_no_results(tmp_path):
    r = _make(tmp_path)
    _seed(r, np.zeros((0, 8), dtype=np.float32), [])
    r._load_index()

    r._q = [1.0] + [0.0] * 7
    res = r.retrieve("q")

    assert res.error is False
    assert res.n_retrieved == 0


def test_download_to_file_streams_local(tmp_path):
    storage = LocalStorage(tmp_path)
    storage.write_file(b"hello-bytes", "src.bin")
    dest = tmp_path / "out.bin"
    storage.download_to_file("src.bin", str(dest))
    assert dest.read_bytes() == b"hello-bytes"


# ----------------------------------------------------------- SQLite metadata mode

def _seed_sqlite(r, emb, chunks):
    """Seed npy + sqlite (no json) — the production layout after migration."""
    r.storage.write_file(_npy_to_bytes(emb), r._index_npy_key)
    r._save_sqlite_index(chunks)


def test_sqlite_mode_keeps_metadata_off_heap(tmp_path):
    r = _make(tmp_path)
    rng = np.random.default_rng(2)
    emb = rng.random((25, 8), dtype=np.float32)
    _seed_sqlite(r, emb, [_chunk(i) for i in range(25)])

    r._load_index()

    # Metadata stays on disk: no chunk objects on the heap.
    assert r._meta_path is not None
    assert r._chunks == []
    assert r.count() == 25

    q = rng.random(8, dtype=np.float32)
    r._q = q.tolist()
    res = r.retrieve("query", top_n=5)

    ref = cosine_similarity(q.reshape(1, -1), emb)[0]
    ref_order = np.argsort(ref)[::-1][:5]
    assert [it.doc_id for it in res.results] == [f"d{i}" for i in ref_order]
    np.testing.assert_allclose(
        [it.score for it in res.results], [round(float(ref[i]), 4) for i in ref_order], atol=1e-4
    )


def test_sqlite_mode_get_chunks_by_doc_id(tmp_path):
    r = _make(tmp_path)
    emb = np.eye(3, 8, dtype=np.float32)
    _seed_sqlite(r, emb, [_chunk(0), _chunk(1), _chunk(1)])

    r._load_index()

    got = r.get_chunks_by_doc_id("d1")
    assert len(got) == 2
    assert all(c.doc_id == "d1" for c in got)
    assert r.get_chunks_by_doc_id("missing") == []


def test_sqlite_mode_rejects_row_vector_mismatch(tmp_path):
    r = _make(tmp_path)
    emb = np.eye(4, 8, dtype=np.float32)
    r.storage.write_file(_npy_to_bytes(emb), r._index_npy_key)
    r._save_sqlite_index([_chunk(i) for i in range(3)])  # 3 rows vs 4 vectors

    import pytest

    with pytest.raises(ValueError, match="re-run the index build"):
        r._load_index()


def test_build_sqlite_converter_roundtrip(tmp_path):
    # The one-off migration: index.json -> index.sqlite, streamed.
    chunks = [_chunk(i) for i in range(7)]
    json_path = tmp_path / "index.json"
    json_path.write_text(
        json.dumps([c.model_dump(mode="json") for c in chunks], ensure_ascii=False)
    )
    sqlite_path = tmp_path / "index.sqlite"

    rows = build_sqlite(str(json_path), str(sqlite_path))

    assert rows == 7
    r = _make(tmp_path)
    emb = np.random.default_rng(3).random((7, 8), dtype=np.float32)
    r.storage.write_file(_npy_to_bytes(emb), r._index_npy_key)
    r.storage.upload_from_file(str(sqlite_path), r._index_sqlite_key)
    r._load_index()
    assert r.count() == 7
    assert r.get_chunks_by_doc_id("d3")[0].content == "chunk 3"
