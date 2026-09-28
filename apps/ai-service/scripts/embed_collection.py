r"""
Pipeline step 4: embed a collection of IndexChunk JSON files into a searchable index.

Reads from {collection_prefix} on storage, writes embeddings under {store_prefix}.

Run:
    uv run python -m scripts.embed_collection \
        --collection collections/summaries \
        --store-path embeddings/summaries

    # use Azure embeddings:
    uv run python -m scripts.embed_collection \
        --collection collections/summaries \
        --backend azure \
        --model text-embedding-3-small
"""

import argparse
import logging
from pathlib import Path

from src.storage import Storage, get_storage
from src.utils.config import load_config

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

DEFAULT_CONFIG_PATH = Path(__file__).parent.parent / "config" / "data_ingestion.yaml"

_DEFAULT_LOCAL_MODEL = "intfloat/multilingual-e5-large"
_DEFAULT_AZURE_MODEL = "text-embedding-3-small"


def run(
    storage: Storage,
    collection_prefix: str,
    store_prefix: str,
    backend: str = "local",
    model: str | None = None,
    doc_batch_size: int = 50,
    max_docs: int | None = None,
    dimensions: int | None = None,
) -> None:
    logger.info("Collection prefix: %s", collection_prefix)
    logger.info("Store prefix:     %s", store_prefix)
    logger.info("Backend:          %s", backend)
    logger.info("Storage:          %s", storage.__class__.__name__)

    if backend == "local":
        from src.retrieval.local import LocalRetriever

        model_name = model or _DEFAULT_LOCAL_MODEL
        logger.info("Model:            %s", model_name)

        retriever = LocalRetriever(
            collection_prefix=collection_prefix,
            storage=storage,
            model_name=model_name,
            store_prefix=store_prefix,
        )

    else:
        from src.retrieval.azure import AzureRetriever

        model_name = model or _DEFAULT_AZURE_MODEL
        logger.info(
            "Model:            %s%s",
            model_name,
            f" (dimensions={dimensions})" if dimensions is not None else "",
        )

        retriever = AzureRetriever(
            collection_prefix=collection_prefix,
            storage=storage,
            deployment_name=model_name,
            store_prefix=store_prefix,
            dimensions=dimensions,
        )

    retriever.build_index(doc_batch_size=doc_batch_size, max_docs=max_docs)
    logger.info("Done — index saved to %s", store_prefix)


def main() -> None:
    parser = argparse.ArgumentParser(description="Embed a collection of IndexChunk JSON files")
    parser.add_argument("--config", type=Path, default=DEFAULT_CONFIG_PATH)
    parser.add_argument(
        "--collection", default=None, help="Storage prefix of IndexChunk JSON files"
    )
    parser.add_argument("--store-path", default=None, help="Storage prefix to save embeddings")
    parser.add_argument("--backend", choices=["local", "azure"], default=None)
    parser.add_argument("--model", default=None)
    parser.add_argument("--doc-batch-size", type=int, default=50)
    parser.add_argument("--max-docs", type=int, default=None)
    parser.add_argument(
        "--dimensions",
        type=int,
        default=None,
        help="Output embedding dimensions for text-embedding-3-* (e.g. 512). "
        "When set, cache dir gets a '-d{dimensions}' suffix to avoid clobbering "
        "existing full-dim caches. Azure-only; ignored for local backend.",
    )
    args = parser.parse_args()

    cfg = load_config(args.config)
    storage = get_storage(cfg.get("storage", {}))
    c_emb = cfg.get("embedding", {})
    c_idx = cfg.get("indexing", {})

    backend = args.backend or c_emb.get("backend", "local")
    collection_name = c_emb.get("collection", "summaries")
    collections_root = (args.collection or c_idx.get("collections_dir", "collections")).rstrip("/")
    # if user passed --collection as a full prefix (e.g. "collections/best_chunks"), use it as-is;
    # otherwise build from collections_dir + collection name from config.
    if args.collection:
        collection_prefix = args.collection.rstrip("/")
    else:
        collection_prefix = f"{collections_root}/{collection_name}"

    if args.store_path:
        store_prefix = args.store_path.rstrip("/")
    else:
        store_root = c_emb.get("store_path", "embeddings").rstrip("/")
        store_prefix = f"{store_root}/{collection_name}"

    run(
        storage=storage,
        collection_prefix=collection_prefix,
        store_prefix=store_prefix,
        backend=backend,
        model=args.model or c_emb.get("model"),
        doc_batch_size=args.doc_batch_size,
        max_docs=args.max_docs,
        dimensions=args.dimensions if args.dimensions is not None else c_emb.get("dimensions"),
    )


if __name__ == "__main__":
    main()
