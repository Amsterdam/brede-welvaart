"""
Module for handling of retrievers and enabling search over documents.
Defines the abstract interface for all retriever implementations.
Any retriever must be able to embed documents and queries, and search.
The base class builds and stores a searchable index through a Storage backend.
"""
import io
import json
import logging
import os
import sqlite3
import tempfile
import time
from abc import ABC, abstractmethod
from functools import cached_property

import psutil

import joblib
import numpy as np
from src.storage import Storage
from src.utils.schemas import IndexChunk, RetrievalItem, RetrievalMetadata, RetrievalResults
from tqdm import tqdm

logger = logging.getLogger(__name__)

# Embeddings are stored and assembled as float32: half the RAM of numpy's default
# float64, with no meaningful retrieval-quality loss (cosine similarity is
# unaffected). Normalising on both write and read also stops older float64 caches
# from silently re-promoting the whole index back to float64 on concatenate.
_EMBED_DTYPE = np.float32


def _npy_to_bytes(arr: np.ndarray) -> bytes:
    """Serialize a numpy array into the .npy binary format as bytes."""
    buf = io.BytesIO()
    np.save(buf, arr, allow_pickle=False)
    return buf.getvalue()


def _bytes_to_npy(data: bytes) -> np.ndarray:
    """Deserialize a .npy bytes payload back into a numpy array (as float32)."""
    return np.load(io.BytesIO(data), allow_pickle=False).astype(_EMBED_DTYPE, copy=False)


def _rss_mb() -> int:
    """Resident memory of this process in MB — logged per load phase so an
    OOMKill points at the exact phase (kubectl top samples too slowly to see it)."""
    return psutil.Process().memory_info().rss // 1_000_000


class BaseRetriever(ABC):
    """
    Base class for all retrievers.

    Subclasses must implement _embed_documents() and _embed_query().
    Everything else - incremental caching, retrieval - is handled here.

    Cache layout (all keys live under {store_prefix}/{model_name}/ on storage):
        {doc_id}.npy     - per-doc embeddings, re-written when source JSON size changes
        {doc_id}.size    - size of source JSON when last embedded
        index.npy        - full concatenated matrix, rebuilt when collection changes
        index.json       - full chunk metadata parallel to index.npy
        index.hash       - hash of current collection file list
    """

    def __init__(
        self,
        model_name: str,
        collection_prefix: str,
        storage: Storage,
        store_prefix: str = "embeddings",
    ):
        """
        Initialize the retriever.

        Args:
            model_name:        Name of the embedding model.
            collection_prefix: Storage prefix for IndexChunk JSON files to index.
            storage:           Storage backend for both collection input and embedding cache.
            store_prefix:      Storage prefix where embeddings are saved.
        """
        self.model_name = model_name
        self.collection_prefix = collection_prefix.rstrip("/")
        self.store_prefix = store_prefix.rstrip("/")
        self.storage = storage
        self._embeddings: np.ndarray | None = None
        # Per-row L2 norms, cached so cosine is a single dot-product per query
        # instead of re-normalising the whole (memory-mapped) matrix each time.
        self._norms: np.ndarray | None = None
        # Temp file backing a memory-mapped index; kept for the pod's lifetime.
        self._index_npy_tmp: str | None = None
        # Local path of the SQLite metadata index (downloaded at load). When set,
        # chunk metadata stays on disk and is SELECTed per query — _chunks stays
        # empty, so pod heap no longer scales with corpus size.
        self._meta_path: str | None = None
        self._meta_rows: int = 0
        self._chunks: list[IndexChunk] = []
        self._chunks_by_doc: dict[str, list[IndexChunk]] = {}

    @abstractmethod
    def _embed_documents(self, texts: list[str]) -> list[list[float]]:
        """Embed a list of texts. Implemented by subclasses."""

    @abstractmethod
    def _embed_query(self, text: str) -> list[float]:
        """Embed a single query. Implemented by subclasses."""

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        """Embed a whole list of passed docs at once"""
        logger.info("Embedding %d texts...", len(texts))
        vectors = self._embed_documents(texts)
        logger.info("Done embedding.")
        return vectors

    def embed_query(self, text: str) -> list[float]:
        """Embed a single query text"""
        logger.debug("Embedding query: %s", text[:50])
        return self._embed_query(text)

    def build_index(
        self,
        save: bool = True,
        doc_batch_size: int = 50,
        load_only: bool = False,
        max_docs: int | None = None,
    ) -> None:
        """
        Build a searchable index from IndexChunk JSON files in collection_prefix.

        Fast path: if index.hash matches the current collection, loads index.npy directly.
        Incremental path:
        - docs with a stale or missing .npy are embedded in batches, kept in memory
        - docs with a valid .npy are loaded from storage
        - index.npy + index.json + index.hash written at the end
        """
        logger.info("Preparing index for collection: %s", self.collection_prefix)

        # Serving path: trust the prebuilt index and load it directly. Crucially,
        # skip the _index_hash_matches() freshness check first — cache_key does one
        # storage.get_size() per collection file (~14k serial blob round-trips here),
        # which is the dominant cost of a serving-pod boot (the ~10-min hang).
        # Keeping the corpus in sync is the build job's concern, not the serving
        # pod's: re-seed the index offline and pods pick it up on restart.
        if load_only:
            self._load_index_if_exists()
            return

        if self._index_hash_matches():
            if max_docs:
                logger.warning(
                    "max_docs=%d is set but loading full index from cache - "
                    "delete index.hash to force a limited re-embed if desired",
                    max_docs,
                )
            self._load_index()
            return

        collection_files = self._get_collection_files()
        to_embed, cached = self._split_cached(collection_files, max_docs=max_docs)
        logger.info(
            "%d total - %d need embedding, %d cached",
            len(collection_files),
            len(to_embed),
            len(cached),
        )

        new_chunks, new_vectors = self._embed_new_docs(to_embed, doc_batch_size, save)
        cached_chunks, cached_vectors = self._load_cached_docs(cached)

        all_chunks = new_chunks + cached_chunks
        all_vectors = new_vectors + cached_vectors
        # Drop the duplicate references so _assemble_index can free each per-doc
        # array as it copies it into the final matrix, rather than holding the
        # whole set a second time through the concatenate.
        del new_vectors, cached_vectors
        self._assemble_index(all_chunks, all_vectors, save)

    def retrieve(
        self,
        query: str,
        top_n: int = 5,
        score_threshold: float | None = None,
    ) -> RetrievalResults:
        """Retrieve the most relevant documents for a query."""
        try:
            self._require_index()

            if self._embeddings.size == 0:
                logger.warning("Empty index - returning no results")
                return RetrievalResults(
                    query=query,
                    results=[],
                    n_retrieved=0,
                    score_threshold=score_threshold,
                    top_n=top_n,
                )

            # Cosine via a single dot-product against cached row norms, so the
            # memory-mapped matrix is read (paged) but never copied/normalised in
            # full — unlike cosine_similarity, which materialises the whole matrix.
            if self._norms is None:
                self._norms = self._row_norms(self._embeddings)
            query_vector = np.asarray(self.embed_query(query), dtype=np.float32)
            q_norm = float(np.sqrt(query_vector @ query_vector))
            raw = self._embeddings @ query_vector  # (n,), reads the memmap
            denom = self._norms * q_norm
            scores = np.divide(
                raw, denom, out=np.zeros_like(raw, dtype=np.float32), where=denom > 0
            )
            top_indices = np.argsort(scores)[::-1][: min(top_n, scores.shape[0])]
            if self._meta_path is not None:
                by_row = self._fetch_chunk_rows([int(i) for i in top_indices])
                chunks_and_scores = [
                    (by_row[int(i)], float(scores[i])) for i in top_indices if int(i) in by_row
                ]
            else:
                chunks_and_scores = [(self._chunks[i], float(scores[i])) for i in top_indices]

            if score_threshold is not None:
                chunks_and_scores = [
                    (chunk, score)
                    for chunk, score in chunks_and_scores
                    if score >= score_threshold
                ]

            items = [
                RetrievalItem.from_chunk(chunk, score=round(score, 4))
                for chunk, score in chunks_and_scores
            ]
            return RetrievalResults(
                query=query,
                results=items,
                n_retrieved=len(chunks_and_scores),
                score_threshold=score_threshold,
                top_n=top_n,
            )

        except Exception as e:
            logger.error("Retrieval failed: %s", e)
            return RetrievalResults(query=query, results=[], error=True, exception=str(e))

    def _build_doc_index(self) -> None:
        """Build doc_id lookup map from loaded chunks."""
        self._chunks_by_doc = {}
        for chunk in self._chunks:
            self._chunks_by_doc.setdefault(chunk.doc_id, []).append(chunk)
        logger.info("Built doc index for %d docs", len(self._chunks_by_doc))

    def get_chunks_by_doc_id(self, doc_id: str) -> list[IndexChunk]:
        """Return all indexed chunks for a given doc_id."""
        if self._meta_path is not None:
            with self._meta_connect() as conn:
                got = conn.execute(
                    "SELECT payload FROM chunks WHERE doc_id = ? ORDER BY row", (doc_id,)
                ).fetchall()
            return [IndexChunk.model_validate_json(payload) for (payload,) in got]
        return self._chunks_by_doc.get(doc_id, [])

    def count(self) -> int:
        """Number of indexed chunks, independent of metadata backend."""
        if self._meta_path is not None:
            return self._meta_rows
        return len(self._chunks)

    @cached_property
    def cache_key(self) -> str:
        """Compute a cache key based on the current collection file list."""
        return joblib.hash(
            [
                (name, self.storage.get_size(f"{self.collection_prefix}/{name}"))
                for name in self._get_collection_files()
            ]
        )

    def _get_collection_files(self) -> list[str]:
        """Return sorted list of IndexChunk JSON file names under collection_prefix."""
        names = [
            n
            for n in self.storage.get_folder_contents(self.collection_prefix)
            if n.endswith(".json")
        ]
        return sorted(names)

    def _collection_key(self, name: str) -> str:
        return f"{self.collection_prefix}/{name}"

    def _load_chunks(self) -> list[IndexChunk]:
        """Load all IndexChunk JSON files from collection_prefix."""
        chunks = []
        for name in self._get_collection_files():
            chunks.extend(IndexChunk.load_file(self.storage, self._collection_key(name)))
        logger.info("Loaded %d chunks from %s", len(chunks), self.collection_prefix)
        return chunks

    # -------------------------- cache key helpers --------------------------

    @cached_property
    def _cache_prefix(self) -> str:
        return f"{self.store_prefix}/{self.model_name.replace('/', '__')}"

    def _doc_embedding_key(self, stem: str) -> str:
        return f"{self._cache_prefix}/{stem}.npy"

    def _doc_size_key(self, stem: str) -> str:
        return f"{self._cache_prefix}/{stem}.size"

    @property
    def _index_npy_key(self) -> str:
        return f"{self._cache_prefix}/index.npy"

    @property
    def _index_json_key(self) -> str:
        return f"{self._cache_prefix}/index.json"

    @property
    def _index_hash_key(self) -> str:
        return f"{self._cache_prefix}/index.hash"

    @property
    def _index_sqlite_key(self) -> str:
        return f"{self._cache_prefix}/index.sqlite"

    # -------------------------- cache freshness ----------------------------

    def _doc_size_matches(self, name: str) -> bool:
        """Return True if the stored size matches the current source JSON size."""
        stem = name.rsplit(".", 1)[0]
        size_key = self._doc_size_key(stem)
        if not self.storage.exists(size_key):
            return False
        stored = self.storage.read_file(size_key).decode("utf-8").strip()
        current = str(self.storage.get_size(self._collection_key(name)))
        return stored == current

    def _save_doc_size(self, name: str) -> None:
        """Save the current source JSON size for this doc."""
        stem = name.rsplit(".", 1)[0]
        size = self.storage.get_size(self._collection_key(name))
        self.storage.write_file(str(size), self._doc_size_key(stem))

    def _index_hash_matches(self) -> bool:
        """Return True if the saved index hash matches the current collection."""
        if not (
            self.storage.exists(self._index_npy_key)
            and self.storage.exists(self._index_json_key)
            and self.storage.exists(self._index_hash_key)
        ):
            return False
        stored = self.storage.read_file(self._index_hash_key).decode("utf-8").strip()
        return stored == self.cache_key

    # -------------------------- load paths ---------------------------------

    def _download_to_temp(self, key: str, suffix: str) -> str:
        """Stream a stored object to a temp file on local disk, return its path.
        Logs size/duration/RSS so a kill mid-download is attributable from logs."""
        size_mb = self.storage.get_size(key) // 1_000_000
        logger.info("Downloading %s (%d MB) to local disk...", key, size_mb)
        start = time.monotonic()
        fd, tmp = tempfile.mkstemp(suffix=suffix, dir=tempfile.gettempdir())
        os.close(fd)
        self.storage.download_to_file(key, tmp)
        logger.info(
            "Downloaded %s in %.1fs (rss=%d MB)", key, time.monotonic() - start, _rss_mb()
        )
        return tmp

    @staticmethod
    def _row_norms(emb: np.ndarray, block: int = 100_000) -> np.ndarray:
        """L2 norm of each row, block-wise so a memmap is never fully materialised
        (peak ~ one block, not the whole matrix)."""
        norms = np.empty(emb.shape[0], dtype=np.float32)
        for i in range(0, emb.shape[0], block):
            blk = np.asarray(emb[i : i + block], dtype=np.float32)
            norms[i : i + block] = np.sqrt(np.einsum("ij,ij->i", blk, blk))
        return norms

    def _load_index(self) -> None:
        # Vectors: stream to disk and MEMORY-MAP — never materialise the matrix on
        # the heap. The old load (read_file -> bytes -> array -> float32 copy) held
        # ~3 copies of a 2.5GB index at once and OOMKilled the pod at 8Gi. A memmap
        # stays file-backed (reclaimable page cache), so even a full-matrix scan
        # can't OOM, and there's no per-query cosine_similarity copy.
        self._index_npy_tmp = self._download_to_temp(self._index_npy_key, ".npy")
        self._embeddings = np.load(self._index_npy_tmp, mmap_mode="r", allow_pickle=False)
        logger.info(
            "Vector index memory-mapped: %d vectors x %d dims (rss=%d MB)",
            self._embeddings.shape[0],
            self._embeddings.shape[1] if self._embeddings.ndim > 1 else 0,
            _rss_mb(),
        )
        start = time.monotonic()
        self._norms = self._row_norms(self._embeddings)
        logger.info(
            "Row norms computed in %.1fs (rss=%d MB)", time.monotonic() - start, _rss_mb()
        )

        # Metadata: prefer the SQLite index — chunks stay ON DISK and retrieve()
        # SELECTs only the top-k rows, so heap no longer scales with corpus size.
        # (json.load of the 1.46GB index.json ballooned to several GB of dicts
        # before any conversion could free them — unfixable under the 8Gi cap.)
        if self.storage.exists(self._index_sqlite_key):
            self._meta_path = self._download_to_temp(self._index_sqlite_key, ".sqlite")
            with self._meta_connect() as conn:
                self._meta_rows = conn.execute("SELECT COUNT(*) FROM chunks").fetchone()[0]
            if self._meta_rows != self._embeddings.shape[0]:
                raise ValueError(
                    f"index.sqlite has {self._meta_rows} rows but index.npy has "
                    f"{self._embeddings.shape[0]} vectors - re-run the index build"
                )
            logger.info(
                "Index ready: %d chunks, metadata on disk via SQLite (rss=%d MB)",
                self._meta_rows,
                _rss_mb(),
            )
            return

        # Fallback (no index.sqlite yet): parse index.json fully in memory. Only
        # viable for small corpora — run scripts/build_sqlite_index.py for prod.
        logger.warning(
            "index.sqlite not found - falling back to in-memory metadata. "
            "For large corpora run scripts/build_sqlite_index.py to avoid OOM."
        )
        json_tmp = self._download_to_temp(self._index_json_key, ".json")
        try:
            logger.info("Parsing index.json into memory (rss=%d MB)...", _rss_mb())
            with open(json_tmp, "r", encoding="utf-8") as f:
                raw = json.load(f)
            logger.info("JSON parsed: %d chunks (rss=%d MB), validating...", len(raw), _rss_mb())
            self._chunks = []
            for i in range(len(raw)):
                self._chunks.append(IndexChunk.model_validate(raw[i]))
                raw[i] = None
                if (i + 1) % 100_000 == 0:
                    logger.info("  validated %d/%d chunks (rss=%d MB)", i + 1, len(raw), _rss_mb())
            del raw
        finally:
            os.unlink(json_tmp)

        logger.info("Loaded %d chunks from cache (rss=%d MB)", len(self._chunks), _rss_mb())
        self._build_doc_index()

    def _save_sqlite_index(self, chunks: list[IndexChunk]) -> None:
        """Write chunks to a SQLite metadata index and upload it next to index.npy.
        row aligns 1:1 with the vector row in index.npy."""
        fd, tmp = tempfile.mkstemp(suffix=".sqlite", dir=tempfile.gettempdir())
        os.close(fd)
        os.unlink(tmp)  # sqlite3 must create the file itself
        try:
            conn = sqlite3.connect(tmp)
            conn.execute(
                "CREATE TABLE chunks (row INTEGER PRIMARY KEY, "
                "doc_id TEXT NOT NULL, payload TEXT NOT NULL)"
            )
            conn.execute("CREATE INDEX idx_chunks_doc_id ON chunks(doc_id)")
            conn.executemany(
                "INSERT INTO chunks (row, doc_id, payload) VALUES (?, ?, ?)",
                (
                    (i, c.doc_id, json.dumps(c.model_dump(mode="json"), ensure_ascii=False))
                    for i, c in enumerate(chunks)
                ),
            )
            conn.commit()
            conn.close()
            self.storage.upload_from_file(tmp, self._index_sqlite_key)
        finally:
            if os.path.exists(tmp):
                os.unlink(tmp)

    def _meta_connect(self) -> sqlite3.Connection:
        """Read-only connection to the local SQLite metadata index. Opened
        per-operation: cheap (file already on disk) and thread-safe by design.
        immutable=1: our copy is a private download that never changes, so
        SQLite skips locking and journal files entirely — no write syscalls,
        which also keeps it safe under readOnlyRootFilesystem (the file lives
        on the /tmp emptyDir, the only writable mount)."""
        return sqlite3.connect(f"file:{self._meta_path}?mode=ro&immutable=1", uri=True)

    def _fetch_chunk_rows(self, rows: list[int]) -> dict[int, IndexChunk]:
        """Fetch chunks for the given vector row indices from the SQLite index."""
        placeholders = ",".join("?" * len(rows))
        with self._meta_connect() as conn:
            got = conn.execute(
                f"SELECT row, payload FROM chunks WHERE row IN ({placeholders})",  # nosec B608
                [int(r) for r in rows],
            ).fetchall()
        return {row: IndexChunk.model_validate_json(payload) for row, payload in got}

    def _load_index_if_exists(self) -> None:
        has_meta = self.storage.exists(self._index_sqlite_key) or self.storage.exists(
            self._index_json_key
        )
        if self.storage.exists(self._index_npy_key) and has_meta:
            self._load_index()
            logger.warning("load_only=True - index may be incomplete or stale")
            return

        # fallback: load individual per-doc embeddings from cache
        cache_files = self.storage.get_folder_contents(self._cache_prefix)
        doc_npys = sorted(n for n in cache_files if n.endswith(".npy") and n != "index.npy")
        if not doc_npys:
            logger.warning("load_only=True - no index found, retrieval will fail")
            return

        logger.warning(
            "load_only=True - no full index found, loading %d individual doc caches",
            len(doc_npys),
        )
        all_chunks: list[IndexChunk] = []
        all_vectors: list[np.ndarray] = []
        for npy_name in doc_npys:
            stem = npy_name.rsplit(".", 1)[0]
            json_key = self._collection_key(f"{stem}.json")
            if not self.storage.exists(json_key):
                logger.debug("Skipping %s - no matching collection JSON", stem)
                continue
            chunks = IndexChunk.load_file(self.storage, json_key)
            vecs = _bytes_to_npy(self.storage.read_file(f"{self._cache_prefix}/{npy_name}"))
            if not chunks or len(chunks) != vecs.shape[0]:
                logger.warning("Skipping %s - chunk/vector count mismatch", stem)
                continue
            all_chunks.extend(chunks)
            all_vectors.append(vecs)
        if all_vectors:
            self._embeddings = np.concatenate(all_vectors, axis=0)
            self._chunks = all_chunks
            logger.info(
                "Loaded partial index from %d doc caches (%d chunks)",
                len(all_vectors),
                len(all_chunks),
            )
            self._build_doc_index()
        else:
            logger.warning("load_only=True - no usable doc caches found, retrieval will fail")

    def _load_cached_docs(self, cached: list) -> tuple[list, list]:
        chunks: list[IndexChunk] = []
        vectors: list[np.ndarray] = []
        for name, doc_chunks in cached:
            stem = name.rsplit(".", 1)[0]
            vecs = _bytes_to_npy(self.storage.read_file(self._doc_embedding_key(stem)))
            if len(doc_chunks) != vecs.shape[0]:
                logger.warning(
                    "Embedding count mismatch for %s: %d chunks but %d vectors - skipping",
                    stem,
                    len(doc_chunks),
                    vecs.shape[0],
                )
                continue
            chunks.extend(doc_chunks)
            vectors.append(vecs)
        return chunks, vectors

    def _split_cached(self, names: list[str], max_docs: int | None = None) -> tuple[list, list]:
        if max_docs:
            names = names[:max_docs]
            logger.info("Test mode: limiting to %d doc files", max_docs)
        to_embed: list[tuple[str, list[IndexChunk]]] = []
        cached: list[tuple[str, list[IndexChunk]]] = []
        for name in tqdm(names, desc="Checking doc cache", unit="doc"):
            chunks = IndexChunk.load_file(self.storage, self._collection_key(name))
            if not chunks:
                continue
            stem = name.rsplit(".", 1)[0]
            if not self.storage.exists(
                self._doc_embedding_key(stem)
            ) or not self._doc_size_matches(name):
                to_embed.append((name, chunks))
            else:
                cached.append((name, chunks))
        return to_embed, cached

    def _embed_new_docs(self, to_embed: list, batch_size: int, save: bool) -> tuple[list, list]:
        all_chunks: list[IndexChunk] = []
        all_vectors: list[np.ndarray] = []

        for batch_start in tqdm(
            range(0, len(to_embed), batch_size), desc="Embedding batches", unit="batch"
        ):
            batch = to_embed[batch_start : batch_start + batch_size]
            batch_chunks = [c for _, chunks in batch for c in chunks]
            logger.info(
                "Embedding doc batch %d-%d / %d (%d chunks)",
                batch_start + 1,
                min(batch_start + batch_size, len(to_embed)),
                len(to_embed),
                len(batch_chunks),
            )
            batch_vectors = self.embed_documents([c.content for c in batch_chunks])
            idx = 0
            for name, chunks in batch:
                n = len(chunks)
                doc_chunk_vectors = batch_vectors[idx : idx + n]
                idx += n
                # AzureRetriever may return None for chunks the API rejects
                # (oversize). Local backends never return None. Skip the whole
                # doc on any None - a partial .npy would misalign with the
                # collection JSON's chunk count and trip the size check later.
                if any(v is None for v in doc_chunk_vectors):
                    n_failed = sum(1 for v in doc_chunk_vectors if v is None)
                    logger.warning(
                        "Skipping doc %s: %d/%d chunks rejected by embedder",
                        name,
                        n_failed,
                        n,
                    )
                    continue
                doc_vectors = np.array(doc_chunk_vectors, dtype=_EMBED_DTYPE)
                if save:
                    stem = name.rsplit(".", 1)[0]
                    self.storage.write_file(
                        _npy_to_bytes(doc_vectors), self._doc_embedding_key(stem)
                    )
                    self._save_doc_size(name)
                all_chunks.extend(chunks)
                all_vectors.append(doc_vectors)
        return all_chunks, all_vectors

    def _assemble_index(self, all_chunks: list, all_vectors: list, save: bool) -> None:
        if not all_vectors:
            logger.warning("No embeddings to index")
            self._embeddings = np.empty((0, 0))
            self._norms = None
            self._chunks = []
            return
        # Preallocate the final matrix and copy each per-doc array into place,
        # releasing the source as we go. Peak stays ~= final matrix + one doc,
        # instead of np.concatenate's final matrix + every source at once.
        total_rows = sum(v.shape[0] for v in all_vectors)
        embeddings = np.empty((total_rows, all_vectors[0].shape[1]), dtype=_EMBED_DTYPE)
        row = 0
        for i, vec in enumerate(all_vectors):
            embeddings[row : row + vec.shape[0]] = vec
            row += vec.shape[0]
            all_vectors[i] = None  # free the per-doc array now that it's copied
        self._embeddings = embeddings
        self._norms = None  # recomputed lazily on first retrieve for the new matrix
        self._chunks = all_chunks
        if save:
            self.storage.write_file(_npy_to_bytes(self._embeddings), self._index_npy_key)
            IndexChunk.save_file(self._chunks, self.storage, self._index_json_key)
            self._save_sqlite_index(self._chunks)
            self.storage.write_file(self.cache_key, self._index_hash_key)
            logger.info("Saved index (%d chunks) to %s", len(self._chunks), self._cache_prefix)
        else:
            logger.info("Built in-memory index (%d chunks), not saved to disk", len(self._chunks))
        self._build_doc_index()

    @property
    def is_initialized(self) -> bool:
        """True once an index is loaded/built and queries can be served."""
        return self._embeddings is not None

    def _require_index(self) -> None:
        if self._embeddings is None:
            raise ValueError("Index not initialized. Call build_index() first.")

    def get_metadata(self) -> RetrievalMetadata:
        """Return metadata about the llm and retriever configuration."""
        return RetrievalMetadata(
            model_name=self.model_name,
            type=self.__class__.__name__,
        )
