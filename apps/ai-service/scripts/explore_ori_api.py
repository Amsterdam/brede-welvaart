"""
Test script to see what's possible to collect from the Open Raadsinformatie Amsterdam index.
The repo does not contain setup instructions as it was an exploration script.

Usage:
    python explore_ori_api.py                        # all years
    python explore_ori_api.py --from 2020 --to 2024  # filtered
    python explore_ori_api.py --query "woningbouw"   # with text search
    python explore_ori_api.py --no-text              # skip fetching PDF text (faster)
    python explore_ori_api.py --query "woningbouw" --from 2020 --to 2024
"""

import argparse
import json
import time
from pathlib import Path

import requests

BASE_URL = "https://api.openraadsinformatie.nl/v1/elastic"
INDEX = "ori_amsterdam_20250317151602"
SEARCH_URL = f"{BASE_URL}/{INDEX}/_search"
DOC_URL = f"{BASE_URL}/{INDEX}/_doc"

PAGE_SIZE = 500
REQUESTS_TIMEOUT = 30


def search_documents(year_from=None, year_to=None):
    """Paginate through all documents with 'Voordracht' in name."""
    date_filter = []
    if year_from or year_to:
        date_filter = [
            {
                "range": {
                    "start_date": {
                        **({"gte": f"{year_from}-01-01"} if year_from else {}),
                        **({"lte": f"{year_to}-12-31"} if year_to else {}),
                    }
                }
            }
        ]

    query = {
        "size": PAGE_SIZE,
        "query": {
            "bool": {
                "must": {"match": {"name": "Voordracht"}},
                "filter": date_filter,
            }
        },
        "_source": ["name", "attachment", "start_date", "parent"],
        "sort": [{"start_date": "asc"}, {"_id": "asc"}],
    }

    items = []
    search_after = None
    page = 0

    while True:
        if search_after:
            query["search_after"] = search_after

        resp = requests.post(SEARCH_URL, json=query, timeout=REQUESTS_TIMEOUT)
        resp.raise_for_status()
        data = resp.json()

        hits = data["hits"]["hits"]
        if not hits:
            break

        items.extend(hits)
        page += 1
        print(f"  Page {page}: fetched {len(hits)} items (total so far: {len(items)})")

        if len(hits) < PAGE_SIZE:
            break

        search_after = hits[-1]["sort"]

    return items


def fetch_document(doc_id):
    """Fetch a single document including its extracted PDF text."""
    resp = requests.get(f"{DOC_URL}/{doc_id}", timeout=REQUESTS_TIMEOUT)
    if resp.status_code == 404:
        return None
    resp.raise_for_status()
    data = resp.json()
    src = data.get("_source", {})
    return {
        "url": src.get("url"),
        "original_url": src.get("original_url"),
        "text_pages": src.get("text_pages", []),
        "md_text": src.get("md_text", []),
    }


def fetch_text_search(query_text, year_from=None, year_to=None):
    """Search documents by full text content."""
    date_filter = []
    if year_from or year_to:
        date_filter = [
            {
                "range": {
                    "last_discussed_at": {
                        **({"gte": f"{year_from}-01-01"} if year_from else {}),
                        **({"lte": f"{year_to}-12-31"} if year_to else {}),
                    }
                }
            }
        ]

    query = {
        "size": PAGE_SIZE,
        "query": {
            "bool": {
                "must": {"match": {"text_pages.text": query_text}},
                "filter": date_filter,
            }
        },
        "_source": ["name", "url", "original_url", "last_discussed_at", "is_referenced_by"],
        "sort": [{"last_discussed_at": "asc"}, {"_id": "asc"}],
    }

    results = []
    search_after = None
    page = 0

    while True:
        if search_after:
            query["search_after"] = search_after

        resp = requests.post(SEARCH_URL, json=query, timeout=REQUESTS_TIMEOUT)
        resp.raise_for_status()
        data = resp.json()

        hits = data["hits"]["hits"]
        if not hits:
            break

        results.extend(hits)
        page += 1
        print(f"  Page {page}: fetched {len(hits)} results (total so far: {len(results)})")

        if len(hits) < PAGE_SIZE:
            break

        search_after = hits[-1]["sort"]

    return results


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--from", dest="year_from", type=int, help="Start year (inclusive)")
    parser.add_argument("--to", dest="year_to", type=int, help="End year (inclusive)")
    parser.add_argument("--query", help="Optional text query to search within PDF content")
    parser.add_argument(
        "--no-text", action="store_true", help="Skip fetching PDF text for each document"
    )
    parser.add_argument("--output", default="voordrachten.jsonl", help="Output file (JSONL)")
    args = parser.parse_args()

    output_path = Path(args.output)

    if args.query:
        # Full-text search mode: search documents by PDF content
        print(f"Searching documents for: '{args.query}'")
        results = fetch_text_search(args.query, args.year_from, args.year_to)
        print(f"\nTotal results: {len(results)}")

        with output_path.open("w") as f:
            for hit in results:
                record = {
                    "id": hit["_id"],
                    **hit["_source"],
                }
                f.write(json.dumps(record, ensure_ascii=False) + "\n")

    else:
        # Search by document type name
        print("Collecting documents with 'Voordracht' in name...")
        items = search_documents(args.year_from, args.year_to)
        print(f"\nTotal documents found: {len(items)}")

        with output_path.open("w") as f:
            for i, hit in enumerate(items):
                src = hit["_source"]
                record = {
                    "id": hit["_id"],
                    "name": src.get("name"),
                    "start_date": src.get("start_date"),
                    "parent_meeting_id": src.get("parent"),
                    "attachment_id": src.get("attachment"),
                    "full_document": None,
                }

                if not args.no_text and src.get("attachment"):
                    full_document = fetch_document(src["attachment"])
                    record["full_document"] = full_document
                    # Be polite to the API
                    if i % 50 == 0:
                        time.sleep(0.5)

                f.write(json.dumps(record, ensure_ascii=False) + "\n")

                if (i + 1) % 100 == 0:
                    print(f"  Written {i + 1}/{len(items)} records...")

    print(f"\nDone! Saved to {output_path}")


if __name__ == "__main__":
    main()
