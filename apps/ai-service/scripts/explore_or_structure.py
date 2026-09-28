"""
Exploratory script to understand the OpenResearch data structure.

Run from the repo root:
    uv run python -m scripts.explore_or_structure --data-path data/openresearch

Answers:
  - Do any records have grandchildren (children that themselves have children)?
  - Do any leaves belong to more than one parent?
  - How many leaves vs articles (and other categories)?
  - Do leaves ever have body/summary text?
  - Can articles be children of other articles?
  - Per-category breakdown of files / children / text
  - Raadsinformatie attachment stats
"""
# flake8: noqa

import argparse
import json
from collections import Counter, defaultdict
from pathlib import Path

from src.openresearch.models import Resource
from tqdm import tqdm


def load_records(data_path: Path) -> dict[int, Resource]:
    records = {}
    failed = []
    paths = sorted(
        tqdm(
            data_path.rglob("metadata.json"),
            desc="Globbing files",
            unit="file",
        )
    )

    for meta_path in tqdm(paths, desc="Loading records", unit="file"):
        try:
            raw = json.loads(meta_path.read_text(encoding="utf-8"))
            records[raw["id"]] = Resource.model_validate(raw)
        except Exception as e:
            failed.append((meta_path, str(e)))

    if failed:
        print(f"\n  Failed to load {len(failed)} metadata files:")
        for path, err in failed:
            print(f"   {path}: {err}")

    return records


def is_leaf(r: Resource) -> bool:
    """Has attached files — the actual documents to extract text from."""
    return bool(r.downloaded_files)


def is_parent(r: Resource) -> bool:
    """Has children (document_ids)."""
    return bool(r.document_ids)


def is_standalone(r: Resource) -> bool:
    """No files, no children — just own body/summary text."""
    return not is_leaf(r) and not is_parent(r)


def has_own_text(r: Resource) -> bool:
    return bool(r.body or r.summary)


def analyze(records: dict[int, Resource]) -> None:
    all_ids = set(records)
    category_counts = Counter(r.category for r in records.values())

    leaves = {r.id for r in records.values() if is_leaf(r)}
    parents = {r.id for r in records.values() if is_parent(r)}
    both = {r.id for r in records.values() if is_leaf(r) and is_parent(r)}
    standalone = {r.id for r in records.values() if is_standalone(r)}

    # child -> list of parents that claim it
    child_to_parents: dict[int, list[int]] = defaultdict(list)
    for r in records.values():
        for child_id in r.document_ids:
            child_to_parents[child_id].append(r.id)

    shared_leaves = {
        child_id: parent_ids
        for child_id, parent_ids in child_to_parents.items()
        if len(parent_ids) > 1 and child_id in leaves
    }

    grandchildren = {
        child_id
        for r in records.values()
        for child_id in r.document_ids
        if child_id in records and is_parent(records[child_id])
    }

    missing_children = {
        child_id
        for r in records.values()
        for child_id in r.document_ids
        if child_id not in all_ids
    }

    orphan_leaves = leaves - set(child_to_parents.keys())

    article_children = {
        child_id
        for r in records.values()
        for child_id in r.document_ids
        if child_id in records and records[child_id].category == "article"
    }

    leaves_with_text = [r for r in records.values() if is_leaf(r) and has_own_text(r)]
    parents_with_text = [r for r in records.values() if is_parent(r) and has_own_text(r)]
    standalone_with_text = [r for r in records.values() if is_standalone(r) and has_own_text(r)]
    standalone_empty = [r for r in records.values() if is_standalone(r) and not has_own_text(r)]

    # raadsinformatie
    ri_records = [r for r in records.values() if r.raadsinformatie]
    ri_by_category = Counter(r.category for r in ri_records)
    ri_also_has_files = [r for r in ri_records if r.downloaded_files]
    ri_only = [r for r in ri_records if not r.downloaded_files]
    # collect all value types to understand what the dict contains
    ri_value_sample: list[tuple[str, str]] = []
    for r in ri_records[:20]:
        for k, v in r.raadsinformatie.items():
            if v:
                ri_value_sample.append((k, str(v)[:80]))

    # ------------------------------------------------------------------ report
    print("\n" + "=" * 60)
    print("  OpenResearch data structure report")
    print("=" * 60)

    print(f"\nTotal records loaded: {len(records)}")

    print("\n  By category:")
    for cat, count in category_counts.most_common():
        print(f"    {cat or 'unknown':<25} {count:>5}")

    print("\n  By structure:")
    print(f"    Leaves     (have files):          {len(leaves):>5}")
    print(f"    Parents    (have document_ids):   {len(parents):>5}")
    print(f"    Both       (files AND children):  {len(both):>5}")
    print(f"    Standalone (no files, no kids):   {len(standalone):>5}")

    print("\n  Category x structure breakdown:")
    header = (
        f"  {'category':<20} {'total':>7} {'has_files':>10} {'has_children':>13} {'has_text':>9}"
    )
    print(header)
    print("  " + "-" * (len(header) - 2))
    for cat in sorted(category_counts):
        cat_records = [r for r in records.values() if r.category == cat]
        has_files = sum(1 for r in cat_records if r.downloaded_files)
        has_children = sum(1 for r in cat_records if r.document_ids)
        has_text = sum(1 for r in cat_records if has_own_text(r))
        print(
            f"  {cat or 'unknown':<20} {len(cat_records):>7} {has_files:>10} {has_children:>13} {has_text:>9}"
        )

    print(f"\n  Leaves with body/summary:            {len(leaves_with_text):>5}")
    if leaves_with_text:
        for r in leaves_with_text[:5]:
            print(f"    -> {r.id} '{r.title}' body={bool(r.body)} summary={bool(r.summary)}")
        if len(leaves_with_text) > 5:
            print(f"    ... and {len(leaves_with_text) - 5} more")

    print(f"  Parents with body/summary:           {len(parents_with_text):>5}")
    print(f"  Standalone with body/summary:        {len(standalone_with_text):>5}")
    print(f"  Standalone truly empty:              {len(standalone_empty):>5}")

    # ------------------------------------------------------------------ raadsinformatie
    print(f"\n{'=' * 60}")
    print(f"  Raadsinformatie attachments")
    print(f"{'=' * 60}")
    print(f"\n  Records with raadsinformatie:        {len(ri_records):>5}")
    print(f"  By category:")
    for cat, count in ri_by_category.most_common():
        print(f"    {cat or 'unknown':<25} {count:>5}")
    print(f"  Also have downloaded_files:          {len(ri_also_has_files):>5}")
    print(f"  Raadsinformatie only (no other files):{len(ri_only):>5}")

    if ri_value_sample:
        print(f"\n  Sample raadsinformatie keys/values (first 20 records):")
        seen_keys: set[str] = set()
        for k, v in ri_value_sample:
            if k not in seen_keys:
                print(f"    key='{k}' → '{v}'")
                seen_keys.add(k)

    if ri_records:
        print(f"\n  Sample records:")
        for r in ri_records[:3]:
            print(f"    -> {r.id} [{r.category}] '{r.title}'")
            print(f"       downloaded_files: {r.downloaded_files}")
            print(f"       raadsinformatie:  {r.raadsinformatie}")

    # ------------------------------------------------------------------ rest
    print(f"\n{'=' * 60}")

    print(f"\nGrandchildren (children with their own children): {len(grandchildren)}")
    if grandchildren:
        for rid in sorted(grandchildren):
            r = records[rid]
            print(f"    -> {rid} [{r.category}] '{r.title}'")
            print(f"       parent(s): {child_to_parents.get(rid, [])}")
            print(f"       own children: {r.document_ids}")
    else:
        print("    None — structure is flat (max depth 2)")

    print(f"\nArticle records used as children: {len(article_children)}")
    if article_children:
        for rid in sorted(article_children):
            r = records[rid]
            print(f"    -> {rid} '{r.title}' child of: {child_to_parents[rid]}")
    else:
        print("    None — only document-category records appear as children")

    print(f"\nLeaves belonging to more than one parent: {len(shared_leaves)}")
    if shared_leaves:
        for leaf_id, parent_ids in sorted(shared_leaves.items()):
            r = records[leaf_id]
            print(f"    -> leaf {leaf_id} '{r.title}' claimed by: {parent_ids}")
    else:
        print("    None — each leaf has at most one parent")

    print(f"\nMissing children (referenced but not collected): {len(missing_children)}")
    if missing_children:
        for child_id in sorted(missing_children):
            print(f"    -> {child_id} claimed by {child_to_parents[child_id]}")

    print(f"\nOrphan leaves (have files, no parent claims them): {len(orphan_leaves)}")
    if orphan_leaves:
        for rid in sorted(orphan_leaves):
            r = records[rid]
            print(f"    -> {rid} [{r.category}] '{r.title}'")
            print(f"       files: {r.downloaded_files}")

    print("\n" + "=" * 60 + "\n")


def main() -> None:
    parser = argparse.ArgumentParser(description="Explore OR data structure")
    parser.add_argument(
        "--data-path",
        type=Path,
        default=Path("data/openresearch"),
        help="Path to the openresearch data folder (default: data/openresearch)",
    )
    args = parser.parse_args()

    if not args.data_path.exists():
        print(f"Path not found: {args.data_path}")
        return

    print(f"Loading records from {args.data_path} ...")
    records = load_records(args.data_path)
    print(f"Loaded {len(records)} records")

    analyze(records)


if __name__ == "__main__":
    main()
