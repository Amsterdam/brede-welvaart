r"""
Pipeline step 2: assemble final text for all OR articles.

Reads from {or_data_prefix} and {extracted_prefix} on storage.
Writes to {output_prefix} (default: derived from extracted/fallback backend names)
and {collections_prefix} (default: 'collections').

Pure stitching - no PDF extraction. All source files must already be in
{extracted_prefix} (run extract_documents.py first).

Run:
    uv run python -m scripts.assemble_articles \
        --extracted extracted/docling \
        --fallback  extracted/pymupdf

    # explicit output override:
    uv run python -m scripts.assemble_articles \
        --extracted extracted/docling \
        --output    assembled/my-custom-name

Add --force to re-assemble everything even if output already exists.
"""

import argparse
import logging
from itertools import islice
from pathlib import Path

from src.openresearch.assembler import ORAssembler, iter_records
from src.storage import Storage, get_storage
from src.utils.config import load_config
from src.utils.schemas import AssemblyManifest
from tqdm import tqdm

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

DEFAULT_CONFIG_PATH = Path(__file__).parent.parent / "config" / "data_ingestion.yaml"


def _derive_output(extracted_prefix: str, fallback_prefix: str | None) -> str:
    """Derive assembled output prefix from backend folder names."""
    name = extracted_prefix.rstrip("/").rsplit("/", 1)[-1]
    if fallback_prefix:
        fb_name = fallback_prefix.rstrip("/").rsplit("/", 1)[-1]
        name = f"{name}-{fb_name}"
    return f"assembled/{name}"


def _assemble_record(
    storage: Storage,
    assembler: ORAssembler,
    record,
    collections_prefix: str,
    collection_types: list[str],
    min_chars: int,
    chunk_size: int,
    chunk_overlap: int,
    force: bool,
) -> tuple[object | None, bool]:
    """Assemble a single record and compile collections if needed."""
    doc = assembler.assemble_article(record)
    if doc is None:
        return None, False
    doc_filename = doc.id.replace(":", "_")
    collection_keys = [
        f"{collections_prefix.rstrip('/')}/{ct}/{doc_filename}.json" for ct in collection_types
    ]
    if force or any(not storage.exists(k) for k in collection_keys):
        assembler.compile_collections(
            doc,
            collections_prefix=collections_prefix,
            collections=collection_types,
            min_chars=min_chars,
            chunk_size=chunk_size,
            chunk_overlap=chunk_overlap,
        )
        return doc, False
    return doc, True


def run(
    storage: Storage,
    or_data_prefix: str,
    extracted_prefix: str,
    fallback_prefix: str | None = None,
    output_prefix: str | None = None,
    collections_prefix: str = "collections",
    collection_types: list[str] | None = None,
    min_chars: int = 100,
    chunk_size: int = 1000,
    chunk_overlap: int = 200,
    force: bool = False,
    max_docs: int | None = None,
) -> None:
    """Assemble OR articles into indexable text. Called by run_pipeline and main()."""
    if collection_types is None:
        collection_types = ["summaries", "best_chunks"]

    output_prefix = output_prefix or _derive_output(extracted_prefix, fallback_prefix)

    logger.info("OR data:     %s", or_data_prefix)
    logger.info("Extracted:   %s", extracted_prefix)
    if fallback_prefix:
        logger.info("Fallback:    %s", fallback_prefix)
    logger.info("Output:      %s", output_prefix)
    logger.info("Collections: %s", collections_prefix)

    article_iter = iter_records(storage, or_data_prefix, category="article")
    if max_docs is not None:
        logger.info("Limiting to %d articles to assemble", max_docs)
        article_iter = islice(article_iter, max_docs)

    assembler = ORAssembler(
        storage=storage,
        extracted_prefix=extracted_prefix,
        output_prefix=output_prefix,
        fallback_prefix=fallback_prefix,
        force=force,
    )

    results = []
    skipped = 0
    already_assembled = 0
    for record in tqdm(article_iter, desc="Assembling", unit="article"):
        tqdm.write(f"  -> {record.id} {record.title or ''}")  # noqa: E221
        doc, was_cached = _assemble_record(
            storage,
            assembler,
            record,
            collections_prefix,
            collection_types,
            min_chars,
            chunk_size,
            chunk_overlap,
            force,
        )
        if doc is None:
            skipped += 1
        else:
            results.append(doc)
            if was_cached:
                already_assembled += 1

    succeeded = sum(1 for d in results if not d.extraction_failed)
    failed = sum(1 for d in results if d.extraction_failed)
    extractors_used = sorted({e for d in results for e in d.extractors_used})

    manifest = AssemblyManifest(
        source="openresearch",
        extractors_used=extractors_used,
        total=len(results) + skipped,
        succeeded=succeeded,
        failed=failed,
        skipped=skipped,
        documents=[d.id for d in results],
    )
    manifest_key = f"{output_prefix.rstrip('/')}/manifest.json"
    storage.write_file(manifest.model_dump_json(indent=2), manifest_key)

    logger.info(
        "Done — succeeded=%d  failed=%d  skipped(empty)=%d  already_assembled=%d",
        succeeded,
        failed,
        skipped,
        already_assembled,
    )
    logger.info("Manifest -> %s", manifest_key)
    logger.info("Collections -> %s", collections_prefix)


def main() -> None:
    parser = argparse.ArgumentParser(description="Assemble OR articles into indexable text")
    parser.add_argument("--config", type=Path, default=DEFAULT_CONFIG_PATH)
    parser.add_argument("--or-data", default=None, help="Storage prefix for OR records")
    parser.add_argument("--extracted", default=None, help="Storage prefix for extracted docs")
    parser.add_argument("--fallback", default=None, help="Optional fallback extracted prefix")
    parser.add_argument(
        "--output",
        default=None,
        help="Output prefix (default: derived from --extracted/--fallback)",
    )
    parser.add_argument("--collections", default=None, help="Collections root prefix")
    parser.add_argument(
        "--collection-types",
        nargs="+",
        default=None,
        help="Which collections to compile",
    )
    parser.add_argument("--min-chars", type=int, default=None)
    parser.add_argument("--chunk-size", type=int, default=None)
    parser.add_argument("--chunk-overlap", type=int, default=None)
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--max-docs", type=int, default=None)
    args = parser.parse_args()

    cfg = load_config(args.config)
    storage = get_storage(cfg.get("storage", {}))
    c_or = cfg.get("openresearch", {})
    c_ext = cfg.get("extraction", {})
    c_idx = cfg.get("indexing", {})

    primary = c_ext.get("primary_backend", "docling")
    fallback_backend = c_ext.get("fallback_backend")
    extract_root = c_ext.get("output_dir", "extracted").rstrip("/")
    or_data_prefix = args.or_data or c_or.get("base_path", "openresearch")
    extracted_prefix = args.extracted or f"{extract_root}/{primary}"
    fallback_prefix = args.fallback or (
        f"{extract_root}/{fallback_backend}" if fallback_backend else None
    )

    run(
        storage=storage,
        or_data_prefix=or_data_prefix,
        extracted_prefix=extracted_prefix,
        fallback_prefix=fallback_prefix,
        output_prefix=args.output,
        collections_prefix=args.collections or c_idx.get("collections_dir", "collections"),
        collection_types=args.collection_types
        or c_idx.get("collections")
        or ["summaries", "best_chunks"],
        min_chars=args.min_chars or c_idx.get("min_chars", 100),
        chunk_size=args.chunk_size or c_idx.get("chunk_size", 1000),
        chunk_overlap=args.chunk_overlap or c_idx.get("chunk_overlap", 200),
        force=args.force,
        max_docs=args.max_docs,
    )


if __name__ == "__main__":
    main()
