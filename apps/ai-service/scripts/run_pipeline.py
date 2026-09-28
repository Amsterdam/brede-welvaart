"""
Brede Welvaart data pipeline.

All I/O routes through the storage backend in config/data_ingestion.yaml.

Usage:
    uv run python -m scripts.run_pipeline
    uv run python -m scripts.run_pipeline --steps collect
    uv run python -m scripts.run_pipeline --steps collect extract assemble
    uv run python -m scripts.run_pipeline --steps extract assemble embed
"""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
import sys
import time
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

from scripts.collect_openresearch_data import collect
from src.storage import Storage, get_storage
from src.utils.config import load_config

log = logging.getLogger(__name__)

DEFAULT_CONFIG_PATH = Path(__file__).parent.parent / "config" / "data_ingestion.yaml"
STEPS = ["collect", "enrich", "extract", "assemble", "embed"]


@dataclass
class StepResult:
    """Outcome of a single pipeline step."""

    name: str
    success: bool = False
    duration: float | None = None
    error: str | None = None


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Brede Welvaart data pipeline.",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    parser.add_argument("--steps", nargs="+", choices=STEPS, default=STEPS)
    parser.add_argument("--config", type=Path, default=DEFAULT_CONFIG_PATH)
    parser.add_argument("--test-size", type=int, default=None)
    return parser.parse_args()


async def run_collect(storage: Storage, cfg: dict, test_size: int | None = None) -> None:
    """Collect OpenResearch data."""
    c = cfg["openresearch"]
    result = await collect(
        storage=storage,
        base_path=c.get("base_path", "openresearch"),
        lang=c["lang"],
        download_files=c["download_files"],
        follow_document_edges=c["follow_document_edges"],
        skip_existing=c["skip_existing"],
        concurrency=c["concurrency"],
        pagelen=c["pagelen"],
        cat=c["cat"],
        cat_exclude=c.get("cat_exclude"),
        max_docs=test_size,
    )
    log.info("Collect done: %s", result)


async def run_enrich(storage: Storage, cfg: dict, test_size: int | None = None) -> None:
    """Enrich collected metadata with author name, affiliation, expertise and teams."""
    from scripts.enrich_author_expertise import enrich

    c = cfg["openresearch"]
    stats = await enrich(
        storage=storage,
        base_path=c.get("base_path", "openresearch"),
        lang=c["lang"],
        concurrency=c["concurrency"],
    )
    log.info("Enrich done: %s", stats)


async def run_extract(storage: Storage, cfg: dict, test_size: int | None = None) -> None:
    """Extract text from downloaded OR source files."""
    from scripts.extract_documents import run as extract_run

    c = cfg["extraction"]
    or_data_prefix = cfg["openresearch"].get("base_path", "openresearch")
    output_root = c.get("output_dir", "extracted").rstrip("/")
    primary = c["primary_backend"]
    fallback = c.get("fallback_backend")

    primary_cfg = c.get(primary, {})
    extract_run(
        storage=storage,
        or_data_prefix=or_data_prefix,
        output_prefix=f"{output_root}/{primary}",
        backend=primary,
        max_file_mb=primary_cfg.get("max_file_mb"),
        max_pages=primary_cfg.get("max_pages"),
        min_text_fraction=primary_cfg.get("min_text_fraction"),
        min_char_density=primary_cfg.get("min_char_density"),
        max_docs=test_size,
    )

    if fallback:
        log.info("Running fallback backend=%s on primary failures", fallback)
        fallback_cfg = c.get(fallback, {})
        # find docs that failed in primary by scanning meta.json files
        primary_prefix = f"{output_root}/{primary}"
        failed_ids: set[str] = set()
        for sub in storage.get_subfolders(primary_prefix):
            meta_key = f"{primary_prefix}/{sub}/meta.json"
            if not storage.exists(meta_key):
                continue
            try:
                meta = json.loads(storage.read_file(meta_key).decode("utf-8"))
                if meta.get("extraction_failed"):
                    failed_ids.add(sub)
            except Exception:
                pass
        log.info("Fallback: %d docs failed in primary", len(failed_ids))
        extract_run(
            storage=storage,
            or_data_prefix=or_data_prefix,
            output_prefix=f"{output_root}/{fallback}",
            backend=fallback,
            max_file_mb=fallback_cfg.get("max_file_mb"),
            max_pages=fallback_cfg.get("max_pages"),
            min_text_fraction=fallback_cfg.get("min_text_fraction"),
            min_char_density=fallback_cfg.get("min_char_density"),
            max_docs=test_size,
        )


async def run_assemble(storage: Storage, cfg: dict, test_size: int | None = None) -> None:
    """Assemble extracted text into indexable documents and compile collections."""
    from scripts.assemble_articles import run as assemble_run

    c_ext = cfg["extraction"]
    c_asm = cfg["assembly"]
    c_idx = cfg.get("indexing", {})
    or_data_prefix = cfg["openresearch"].get("base_path", "openresearch")
    extract_root = c_ext.get("output_dir", "extracted").rstrip("/")
    asm_root = c_asm.get("output_dir", "assembled").rstrip("/")
    primary = c_ext["primary_backend"]
    fallback = c_ext.get("fallback_backend")

    assemble_run(
        storage=storage,
        or_data_prefix=or_data_prefix,
        extracted_prefix=f"{extract_root}/{primary}",
        fallback_prefix=f"{extract_root}/{fallback}" if fallback else None,
        output_prefix=f"{asm_root}/{primary}-{fallback}" if fallback else f"{asm_root}/{primary}",
        collections_prefix=c_idx.get("collections_dir", "collections"),
        collection_types=c_idx.get("collections") or ["summaries", "best_chunks"],
        min_chars=c_idx.get("min_chars", 100),
        chunk_size=c_idx.get("chunk_size", 1000),
        chunk_overlap=c_idx.get("chunk_overlap", 200),
        max_docs=test_size,
    )


async def run_embed(storage: Storage, cfg: dict, test_size: int | None = None) -> None:
    """Embed collection chunks into a searchable index."""
    from scripts.embed_collection import run as embed_run

    c_idx = cfg.get("indexing", {})
    c_emb = cfg.get("embedding", {})

    collections_root = c_idx.get("collections_dir", "collections").rstrip("/")
    store_root = c_emb.get("store_path", "embeddings").rstrip("/")

    backend = c_emb.get("backend", "local")
    model = c_emb.get("model")
    dimensions = c_emb.get("dimensions")

    collections = c_idx.get("collections", ["summaries", "best_chunks"])

    for collection in collections:
        collection_prefix = f"{collections_root}/{collection}"
        if not storage.get_folder_contents(collection_prefix):
            log.warning("Collection empty or not found, skipping: %s", collection_prefix)
            continue

        log.info("Embedding collection: %s", collection)

        embed_run(
            storage=storage,
            collection_prefix=collection_prefix,
            store_prefix=f"{store_root}/{collection}",
            backend=backend,
            model=model,
            max_docs=test_size,
            dimensions=dimensions,
        )

        log.info("Done - %s", collection)


STEP_FNS = {
    "collect": run_collect,
    "enrich": run_enrich,
    "extract": run_extract,
    "assemble": run_assemble,
    "embed": run_embed,
}


async def _run_step(step: str, storage: Storage, cfg: dict, test_size: int | None) -> StepResult:
    result = StepResult(name=step)
    start = time.time()
    log.info("--- Step: %s ---", step)
    try:
        await STEP_FNS[step](storage, cfg, test_size=test_size)
        result.success = True
    except NotImplementedError:
        result.success = False
        result.error = "Not yet implemented"
        log.warning("Step '%s' is not yet implemented - stopping.", step)
    except Exception as exc:
        result.success = False
        result.error = str(exc)
        log.error("Step '%s' failed: %s", step, exc)
    result.duration = time.time() - start
    return result


async def run(args: argparse.Namespace, cfg: dict) -> int:
    storage = get_storage(cfg.get("storage", {}))

    log.info("=" * 60)
    log.info("Brede Welvaart Data Pipeline")
    log.info("Started: %s", datetime.now().isoformat())
    log.info("Steps:   %s", ", ".join(args.steps))
    log.info("Storage: %s", storage.__class__.__name__)
    if args.test_size:
        log.info("Test mode: limiting to %d documents per step", args.test_size)
    log.info("=" * 60)

    results: list[StepResult] = []

    for step in STEPS:
        if step not in args.steps:
            continue

        result = await _run_step(step, storage, cfg, args.test_size)
        results.append(result)

        if not result.success:
            log.warning("Stopping pipeline after failed step.")
            break

    _print_run_summary(results)

    failed = [r for r in results if not r.success]
    if failed:
        log.error("Pipeline FAILED - %d step(s) failed", len(failed))
        return 1

    log.info("Pipeline COMPLETED successfully")
    return 0


def _print_run_summary(results: list[StepResult]) -> None:
    """Print pipeline execution summary."""
    log.info("=" * 60)
    log.info("Pipeline Summary")
    log.info("=" * 60)
    for r in results:
        status = "✓" if r.success else "✗"
        duration = f"{r.duration:.1f}s" if r.duration else "N/A"  # noqa: E231
        log.info("%s  %-15s %s", status, r.name, duration)
        if r.error:
            log.info("   Error: %s", r.error)
    total = sum(r.duration or 0 for r in results)
    log.info("-" * 60)
    log.info("Total: %.1fs", total)  # noqa: E231


def main() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s  %(levelname)-8s  %(message)s",
        datefmt="%H:%M:%S",
    )
    args = parse_args()
    cfg = load_config(args.config)
    sys.exit(asyncio.run(run(args, cfg)))


if __name__ == "__main__":
    main()
