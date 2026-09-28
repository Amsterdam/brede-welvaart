"""
Enrich article metadata with author name, affiliation, expertise and teams.

Routes through the storage backend configured in config/data_ingestion.yaml.
Delegates to Collector.enrich_authors() which iterates resources via storage.

Run standalone (backfill):
    uv run python -m scripts.enrich_author_expertise

Force re-fetch even if already enriched:
    uv run python -m scripts.enrich_author_expertise --force

Override the base path (storage-relative prefix where records live):
    uv run python -m scripts.enrich_author_expertise --base-path openresearch/openresearch

Called automatically by run_pipeline.py as the "enrich" step.
"""

from __future__ import annotations

import argparse
import asyncio
import logging
from pathlib import Path

from src.openresearch.collector import Collector
from src.storage import Storage, get_storage
from src.utils.config import load_config

log = logging.getLogger(__name__)

DEFAULT_CONFIG_PATH = Path(__file__).parent.parent / "config" / "data_ingestion.yaml"


async def enrich(
    storage: Storage,
    base_path: str = "openresearch",
    lang: str = "nl",
    concurrency: int = 5,
    force: bool = False,
) -> dict[str, int]:
    """
    Backfill author and team info into existing metadata via the Collector.

    Parameters
    ----------
    storage:
        Configured Storage backend (local or azure).
    base_path:
        Storage-relative prefix where the collector wrote resource folders.
    lang:
        Language preference for field extraction (nl or en).
    concurrency:
        Max concurrent API requests.
    force:
        Re-fetch even if author fields are already present.

    Returns
    -------
    Stats dict with keys: enriched, skipped, failed
    """
    async with Collector(
        storage=storage,
        base_path=base_path,
        lang=lang,
        concurrency=concurrency,
    ) as collector:
        return await collector.enrich_authors(force=force)


def main() -> None:
    """Entry point for standalone backfill runs."""
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s  %(levelname)-8s  %(message)s",
        datefmt="%H:%M:%S",
    )
    parser = argparse.ArgumentParser(
        description="Backfill author name, affiliation, expertise and teams into OR metadata"
    )
    parser.add_argument("--config", type=Path, default=DEFAULT_CONFIG_PATH)
    parser.add_argument("--base-path", default=None, help="Storage prefix for OR records")
    parser.add_argument("--lang", default=None)
    parser.add_argument("--concurrency", type=int, default=None)
    parser.add_argument("--force", action="store_true", help="Re-fetch even if already enriched")
    args = parser.parse_args()

    cfg = load_config(args.config)
    storage = get_storage(cfg.get("storage", {}))
    c_or = cfg.get("openresearch", {})

    asyncio.run(
        enrich(
            storage=storage,
            base_path=args.base_path or c_or.get("base_path", "openresearch"),
            lang=args.lang or c_or.get("lang", "nl"),
            concurrency=args.concurrency or c_or.get("concurrency", 5),
            force=args.force,
        )
    )


if __name__ == "__main__":
    main()
