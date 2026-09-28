r"""
Compare extraction results across backends for OR documents.

Shows which docs failed in one backend but succeeded in another,
and how much text was recovered. Useful for tuning fallback strategy.

Run from the repo root:
    uv run python -m scripts.compare_extraction \
        --primary   data/openresearch/extracted/docling \
        --secondary data/openresearch/extracted/pymupdf

    # show only docs where primary failed but secondary succeeded
    uv run python -m scripts.compare_extraction \
        --primary   data/openresearch/extracted/docling \
        --secondary data/openresearch/extracted/pymupdf \
        --only-recoverable

    # show detail for a specific doc
    uv run python -m scripts.compare_extraction \
        --primary   data/openresearch/extracted/docling \
        --secondary data/openresearch/extracted/pymupdf \
        --id 123371
"""
# flake8: noqa

import argparse
import json
from collections import Counter
from pathlib import Path


def load_manifest(path: Path) -> dict[str, dict]:
    """Load manifest and return dict keyed by numeric OR id."""
    manifest_path = path / "manifest.json"
    if not manifest_path.exists():
        return {}
    raw = json.loads(manifest_path.read_text(encoding="utf-8"))
    return {d["id"].split(":")[-1]: d for d in raw.get("documents", [])}


def get_extracted_chars(doc_dir: Path) -> int:
    """Count total chars across all .txt files in an extracted doc folder."""
    if not doc_dir.exists():
        return 0
    return sum(len(f.read_text(encoding="utf-8").strip()) for f in doc_dir.glob("*.txt"))


def _reason_type(err: str) -> str:
    if "image-heavy" in err or "low text density" in err:
        return "image-heavy / low density"
    if "file too large" in err:
        return "file too large"
    if "too many pages" in err:
        return "too many pages"
    if "No text extracted" in err:
        return "no text extracted"
    if "No downloaded files" in err:
        return "no downloaded files"
    if "Unsupported format" in err:
        return "unsupported format"
    return "other"


def compare(primary: Path, secondary: Path, only_recoverable: bool, doc_id: str | None) -> None:
    pri = load_manifest(primary)
    sec = load_manifest(secondary)

    if not pri:
        print(f"ERROR: no manifest found at {primary}")
        return

    if doc_id:
        _inspect_doc(doc_id, pri, sec, primary, secondary)
        return

    all_ids = set(pri) | set(sec)
    categories: Counter = Counter()
    recoverable = []
    unrecoverable = []

    for id_ in sorted(all_ids):
        p = pri.get(id_)
        s = sec.get(id_)
        pri_failed = p is None or p.get("extraction_failed", True)
        sec_failed = s is None or s.get("extraction_failed", True)

        if not pri_failed:
            categories["primary ok"] += 1
        elif not sec_failed:
            categories["primary failed, secondary ok"] += 1
            recoverable.append((id_, p, s))
        else:
            categories["both failed"] += 1
            unrecoverable.append((id_, p, s))

    print(f"\n── Extraction comparison ───────────────────────────────────────")
    print(f"  primary:    {primary}")
    print(f"  secondary:  {secondary}")
    print(f"  total docs: {len(all_ids)}\n")

    print("  Results:")
    for cat, count in categories.most_common():
        print(f"    {count:>5}  {cat}")

    print(f"\n── Recoverable by secondary ({len(recoverable)}) ────────────────────────")
    if not recoverable:
        print("  none")
    else:
        reason_counts: Counter = Counter(
            _reason_type((p or {}).get("extraction_error") or "") for _, p, _ in recoverable
        )
        print("  Primary failure reasons:")
        for reason, count in reason_counts.most_common():
            print(f"    {count:>5}  {reason}")

        if only_recoverable:
            print(f"\n  {'id':<12} {'pri_chars':>10} {'sec_chars':>10}  primary error")
            print("  " + "-" * 70)
            for id_, p, s in sorted(recoverable, key=lambda x: x[0]):
                pri_chars = get_extracted_chars(primary / id_)
                sec_chars = get_extracted_chars(secondary / id_)
                err = ((p or {}).get("extraction_error") or "")[:50]
                print(f"  {id_:<12} {pri_chars:>10} {sec_chars:>10}  {err}")

    if not only_recoverable:
        print(f"\n── Both failed ({len(unrecoverable)}) ──────────────────────────────────────")
        reason_counts2: Counter = Counter(
            _reason_type((p or {}).get("extraction_error") or "") for _, p, _ in unrecoverable
        )
        for reason, count in reason_counts2.most_common():
            print(f"    {count:>5}  {reason}")


def _inspect_doc(
    doc_id: str,
    pri: dict,
    sec: dict,
    primary: Path,
    secondary: Path,
) -> None:
    print(f"\n── Doc {doc_id} ─────────────────────────────────────────────────")
    for label, manifest, base_path in [
        ("primary  ", pri, primary),
        ("secondary", sec, secondary),
    ]:
        doc = manifest.get(doc_id)
        if doc is None:
            print(f"  {label}: not in manifest")
            continue
        failed = doc.get("extraction_failed", True)
        chars = get_extracted_chars(base_path / doc_id)
        err = (doc.get("extraction_error") or "")[:60]
        print(f"  {label}: {'FAILED' if failed else 'ok':>6}  {chars:>8} chars  {err}")
        doc_dir = base_path / doc_id
        if doc_dir.exists():
            for f in sorted(doc_dir.glob("*.txt")):
                text = f.read_text(encoding="utf-8").strip()
                preview = text[:100].replace("\n", " ") if text else "(empty)"
                print(f"    {f.name}: {len(text)} chars — {preview}")
    print()


def main() -> None:
    parser = argparse.ArgumentParser(description="Compare extraction results across backends")
    parser.add_argument(
        "--primary",
        type=Path,
        default=Path("data/openresearch/extracted/docling"),
    )
    parser.add_argument(
        "--secondary",
        type=Path,
        default=Path("data/openresearch/extracted/pymupdf"),
    )
    parser.add_argument(
        "--only-recoverable",
        action="store_true",
        help="List all docs where primary failed but secondary succeeded",
    )
    parser.add_argument(
        "--id",
        type=str,
        default=None,
        help="Inspect a single OR doc id",
    )
    args = parser.parse_args()
    compare(args.primary, args.secondary, args.only_recoverable, args.id)


if __name__ == "__main__":
    main()
