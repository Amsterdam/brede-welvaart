"""
Standalone script to collect custom OpenResearch Amsterdam data through storage.

Storage backend (local or Azure blob) is selected via the storage block in
config/data_ingestion.yaml.

Usage:
    # Collect everything using the default config
    uv run python -m scripts.collect_openresearch_data 2>&1 | tee output.log

    # Collect with a search query
    uv run python -m scripts.collect_openresearch_data --query "grip on llms"

    # Override the storage prefix where records are written
    uv run python -m scripts.collect_openresearch_data --base-path openresearch
"""

from __future__ import annotations

import argparse
import asyncio
import logging
import sys
from pathlib import Path

from src.openresearch import CollectionResult, Collector, SearchFilters
from src.storage import Storage, get_storage
from src.utils.config import load_config

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger(__name__)

DEFAULT_CONFIG_PATH = Path(__file__).parent.parent / "config" / "data_ingestion.yaml"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Collect OpenResearch Amsterdam data to storage.",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    parser.add_argument("--config", type=Path, default=DEFAULT_CONFIG_PATH)
    parser.add_argument(
        "--base-path",
        default=None,
        help="Storage prefix to write records under (default: openresearch.base_path).",
    )
    parser.add_argument("--from-sitemap", dest="from_sitemap", action="store_true", default=False)
    parser.add_argument("--query", default=None)
    parser.add_argument("--lang", default=None)
    parser.add_argument("--concurrency", type=int, default=None)
    parser.add_argument("--pagelen", type=int, default=None)
    parser.add_argument("--no-files", dest="download_files", action="store_false", default=None)
    parser.add_argument("--no-edges", dest="follow_edges", action="store_false", default=None)
    parser.add_argument("--skip-existing", action="store_true", default=None)
    parser.add_argument("--cat", nargs="+", default=None)
    parser.add_argument("--cat-exclude", nargs="+", default=None)
    parser.add_argument("--max-pages", type=int, default=None)
    parser.add_argument("--max-docs", type=int, default=None)
    return parser.parse_args()


async def collect(
    storage: Storage,
    base_path: str,
    lang: str = "nl",
    download_files: bool = True,
    follow_document_edges: bool = True,
    skip_existing: bool = True,
    concurrency: int = 3,
    from_sitemap: bool = False,
    pagelen: int = 100,
    cat: list[str] | None = None,
    cat_exclude: list[str] | None = None,
    query: str | None = None,
    max_pages: int | None = None,
    max_docs: int | None = None,
) -> CollectionResult:
    """Collect OpenResearch data into the configured storage."""
    async with Collector(
        storage=storage,
        base_path=base_path,
        lang=lang,
        download_files=download_files,
        follow_document_edges=follow_document_edges,
        skip_existing=skip_existing,
        concurrency=concurrency,
    ) as collector:
        if from_sitemap:
            return await collector.collect_from_sitemap(collect_categories=cat, max_docs=max_docs)
        filters = SearchFilters(
            text=query,
            pagelen=pagelen,
            cat=cat,
            cat_exclude=cat_exclude,
        )
        return await collector.search_and_collect(filters, max_pages=max_pages, max_docs=max_docs)


async def run(args: argparse.Namespace) -> int:
    cfg = load_config(args.config)
    storage = get_storage(cfg.get("storage", {}))
    c_or = cfg.get("openresearch", {})

    base_path = args.base_path or c_or.get("base_path", "openresearch")
    mode = "sitemap" if args.from_sitemap else "search"
    query_label = f'"{args.query}"' if args.query else "<all>"
    log.info(
        "Starting collection  mode=%s  query=%s  storage=%s  base=%s",
        mode,
        query_label,
        storage.__class__.__name__,
        base_path,
    )

    result = await collect(
        storage=storage,
        base_path=base_path,
        lang=args.lang if args.lang is not None else c_or.get("lang", "nl"),
        download_files=(
            args.download_files
            if args.download_files is not None
            else c_or.get("download_files", True)
        ),
        follow_document_edges=(
            args.follow_edges
            if args.follow_edges is not None
            else c_or.get("follow_document_edges", True)
        ),
        skip_existing=(
            args.skip_existing
            if args.skip_existing is not None
            else c_or.get("skip_existing", True)
        ),
        concurrency=args.concurrency or c_or.get("concurrency", 3),
        from_sitemap=args.from_sitemap,
        pagelen=args.pagelen or c_or.get("pagelen", 100),
        cat=args.cat or c_or.get("cat"),
        cat_exclude=args.cat_exclude or c_or.get("cat_exclude"),
        query=args.query,
        max_pages=args.max_pages,
        max_docs=args.max_docs,
    )

    log.info("Done.")
    log.info("  Collected : %d resource(s)", len(result.collected))
    log.info("  Skipped   : %d resource(s)", len(result.skipped))
    log.info("  Failed    : %d resource(s)", len(result.failed))

    if result.failed:
        log.warning("Failed resource IDs: %s", sorted(result.failed))
        return 1

    return 0


def main() -> None:
    args = parse_args()
    sys.exit(asyncio.run(run(args)))


if __name__ == "__main__":
    main()
