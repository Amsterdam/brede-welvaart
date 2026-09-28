"""
Test script for local exploration; not part of the BW data ingestion pipeline.
Print all OpenResearch categories with an example resource for each.

Usage:
    uv run python scripts/inspect_openresearch_data.py
"""

from __future__ import annotations

import asyncio
import logging

from src.openresearch.client import OpenResearchClient
from src.openresearch.models import SearchFilters

logging.basicConfig(level=logging.WARNING)


async def main() -> None:
    async with OpenResearchClient() as client:
        await client.load_category_map()

        for cat_id, cat_name in sorted(client._category_cache.items(), key=lambda x: x[1]):
            page = await client.search(
                SearchFilters(cat=[cat_name], is_published="all", pagelen=1)
            )
            cat_label = f"{cat_name:<25} id={cat_id}"  # noqa: E231
            if page.ids:
                resource = await client.get_resource(page.ids[0])
                title = resource.title or resource.name or "—"
                print(f"{cat_label}  example: [{resource.id}] {title}")
            else:
                print(f"{cat_label}  (no resources)")


if __name__ == "__main__":
    asyncio.run(main())
