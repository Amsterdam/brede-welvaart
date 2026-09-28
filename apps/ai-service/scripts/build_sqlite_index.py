r"""
One-off converter: build index.sqlite from an existing index.json, streaming.

The serving pod no longer parses index.json (1.46GB -> several GB of Python
objects -> OOM). It reads chunk metadata from index.sqlite instead. This script
creates that file from the index.json already on storage — NO re-embedding.
ijson streams the array element-by-element, so peak memory is ~one chunk
regardless of corpus size; it can run anywhere with blob access.

Run (uses config defaults for store path/model/dimensions):
    uv run python -m scripts.build_sqlite_index

Future index builds write index.sqlite automatically (see
BaseRetriever._assemble_index); this script is only needed to migrate an
existing index without rebuilding it.
"""

import argparse
import json
import logging
import os
import sqlite3
import tempfile
from pathlib import Path

import ijson
from src.storage import get_storage
from src.utils.config import load_config

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

DEFAULT_CONFIG_PATH = Path(__file__).parent.parent / "config" / "data_ingestion.yaml"

_BATCH = 5000


def build_sqlite(json_path: str, sqlite_path: str) -> int:
    """Stream index.json into a SQLite metadata index. Returns row count."""
    conn = sqlite3.connect(sqlite_path)
    conn.execute(
        "CREATE TABLE chunks (row INTEGER PRIMARY KEY, "
        "doc_id TEXT NOT NULL, payload TEXT NOT NULL)"
    )
    conn.execute("CREATE INDEX idx_chunks_doc_id ON chunks(doc_id)")

    rows = 0
    batch: list[tuple[int, str, str]] = []
    with open(json_path, "rb") as f:
        # use_float=True: ijson yields Decimal otherwise, which json.dumps rejects.
        for obj in ijson.items(f, "item", use_float=True):
            batch.append((rows, obj["doc_id"], json.dumps(obj, ensure_ascii=False)))
            rows += 1
            if len(batch) >= _BATCH:
                conn.executemany(
                    "INSERT INTO chunks (row, doc_id, payload) VALUES (?, ?, ?)", batch
                )
                batch = []
                if rows % 100_000 == 0:
                    logger.info("  %d chunks converted...", rows)
    if batch:
        conn.executemany("INSERT INTO chunks (row, doc_id, payload) VALUES (?, ?, ?)", batch)
    conn.commit()
    conn.close()
    return rows


def main() -> None:
    parser = argparse.ArgumentParser(description="Build index.sqlite from index.json")
    parser.add_argument("--config", type=Path, default=DEFAULT_CONFIG_PATH)
    parser.add_argument("--store-path", default=None, help="Storage prefix of the embeddings")
    parser.add_argument("--model", default=None)
    parser.add_argument("--dimensions", type=int, default=None)
    parser.add_argument(
        "--storage-backend",
        choices=["local", "azure"],
        default=None,
        help="Override config storage backend. For azure, set "
        "AZURE_STORAGE_ACCOUNT_BLOB_ENDPOINT and be logged in (az login).",
    )
    args = parser.parse_args()

    cfg = load_config(args.config)
    storage_cfg = cfg.get("storage", {})
    if args.storage_backend:
        storage_cfg["backend"] = args.storage_backend
    storage = get_storage(storage_cfg)
    c_emb = cfg.get("embedding", {})

    collection = c_emb.get("collection", "summaries")
    store_root = (args.store_path or c_emb.get("store_path", "embeddings")).rstrip("/")
    store_prefix = store_root if args.store_path else f"{store_root}/{collection}"
    model = args.model or c_emb.get("model")
    dimensions = args.dimensions if args.dimensions is not None else c_emb.get("dimensions")
    model_name = model if dimensions is None else f"{model}-d{dimensions}"
    cache_prefix = f"{store_prefix}/{model_name.replace('/', '__')}"

    json_key = f"{cache_prefix}/index.json"
    sqlite_key = f"{cache_prefix}/index.sqlite"
    logger.info("Source: %s", json_key)
    logger.info("Target: %s", sqlite_key)
    if not storage.exists(json_key):
        raise SystemExit(f"{json_key} not found on storage")

    workdir = tempfile.mkdtemp()
    json_tmp = os.path.join(workdir, "index.json")
    sqlite_tmp = os.path.join(workdir, "index.sqlite")
    try:
        logger.info("Downloading index.json (streaming to disk)...")
        storage.download_to_file(json_key, json_tmp)
        logger.info("Converting to SQLite (streaming parse)...")
        rows = build_sqlite(json_tmp, sqlite_tmp)
        size_mb = os.path.getsize(sqlite_tmp) / 1e6
        logger.info("Built index.sqlite: %d chunks, %.0f MB. Uploading...", rows, size_mb)
        storage.upload_from_file(sqlite_tmp, sqlite_key)
        logger.info("Done — %s is live. Restart ai-service pods to pick it up.", sqlite_key)
    finally:
        for p in (json_tmp, sqlite_tmp):
            if os.path.exists(p):
                os.unlink(p)
        os.rmdir(workdir)


if __name__ == "__main__":
    main()
