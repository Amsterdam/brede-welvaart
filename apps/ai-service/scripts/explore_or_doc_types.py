r"""
Exploratory analysis of OR record titles, doc-type signals, and file stats.

Run from the repo root:
    uv run python -m scripts.explore_or_doc_types \
        --or-data data/openresearch/openresearch

    uv run python -m scripts.explore_or_doc_types \
        --or-data data/openresearch/openresearch \
        --manifest data/openresearch/extracted/pymupdf/manifest.json

    uv run python -m scripts.explore_or_doc_types \
        --or-data data/openresearch/openresearch \
        --manifest data/openresearch/extracted/docling/manifest.json

Available analyses (all run by default):
    categories       - record count by category
    extensions       - file extension breakdown
    file-sizes       - PDF size distribution and per-backend skip counts
    name-hints       - doc type hint distribution from titles
    title-keywords   - keyword frequency in titles
    hint-conflicts   - layout vs name hint disagreements (needs --manifest)
    docling-check    - which PDFs would be skipped by each backend (slow)

Examples:
    # run everything except the slow docling check
    uv run python -m scripts.explore_or_doc_types --skip docling-check

    # only file sizes and hint conflicts
    uv run python -m scripts.explore_or_doc_types --only file-sizes hint-conflicts

Add --show N to control how many example titles are shown per keyword (default 5).
"""
# flake8: noqa

import argparse
import json
import re
import signal
from collections import Counter, defaultdict
from pathlib import Path

from src.preprocessing.extractor import _TITLE_PATTERNS
from src.utils.doc_utils import pdf_skip_reason
from src.utils.schemas import DocTypeHint

ANALYSES = [
    "categories",
    "extensions",
    "file-sizes",
    "name-hints",
    "title-keywords",
    "hint-conflicts",
    "docling-check",
]

TITLE_KEYWORDS: dict[str, re.Pattern] = {
    "factsheet": re.compile(r"\bfactsheet\b", re.IGNORECASE),
    "poster": re.compile(r"\bposter\b", re.IGNORECASE),
    "thesis": re.compile(r"\b(thesis|proefschrift|dissertat\w+)\b", re.IGNORECASE),
    "rapport": re.compile(r"rapport(age)?\b|reports?\b", re.IGNORECASE),
    "monitor": re.compile(r"\bmonitor\b", re.IGNORECASE),
    "onderzoek": re.compile(r"\bonderzoek\b", re.IGNORECASE),
    "nota": re.compile(r"\bnota\b", re.IGNORECASE),
    "presentatie": re.compile(r"\b(presentat(ie[ns]?|ions?)|slides?|deck)\b", re.IGNORECASE),
    "brief": re.compile(r"\bbrief\b", re.IGNORECASE),
}


# ---------------------------------------------------------------------------
# Analysis functions
# ---------------------------------------------------------------------------


def analyse_categories(records: list[dict]) -> None:
    """Break down record counts by category."""
    counts: Counter = Counter(r.get("category", "unknown") for r in records)
    total = len(records)
    print(f"\n── Category breakdown (n={total}) ─────────────────────────────────────")
    for cat, count in counts.most_common():
        print(f"  {cat:<20} {count:>6}  ({100 * count / total:.1f}%)")
    print()


def analyse_extensions(records: list[dict]) -> None:
    """Count file extensions across all downloaded_files."""
    ext_counts: Counter = Counter()
    for raw in records:
        for rel_path in raw.get("downloaded_files") or []:
            ext = Path(rel_path).suffix.lower() if rel_path else ""
            ext_counts[ext or "(none)"] += 1
    total = sum(ext_counts.values())
    print(f"\n── File extensions across downloaded_files (n={total} files) ──────────")
    for ext, count in ext_counts.most_common():
        print(f"  {ext:<12} {count:>6}  ({100 * count / total:.1f}%)")
    print()


def analyse_file_sizes(or_data_path: Path, top: int = 20) -> None:
    """Show PDF size distribution and per-backend skip counts."""
    pdfs = [f for d in or_data_path.iterdir() if d.is_dir() for f in d.glob("*.pdf")]
    if not pdfs:
        print("\n── File sizes: no PDFs found ──")
        return

    sizes = sorted(
        [(p.stat().st_size / 1024 / 1024, p) for p in pdfs],
        reverse=True,
    )
    total_mb = sum(s for s, _ in sizes)

    buckets = {
        "< 1 MB": 0,
        "1–10 MB": 0,
        "10–50 MB": 0,
        "50–100 MB": 0,
        "100–200 MB": 0,
        "> 200 MB": 0,
    }
    for mb, _ in sizes:
        if mb < 1:
            buckets["< 1 MB"] += 1
        elif mb < 10:
            buckets["1–10 MB"] += 1
        elif mb < 50:
            buckets["10–50 MB"] += 1
        elif mb < 100:
            buckets["50–100 MB"] += 1
        elif mb < 200:
            buckets["100–200 MB"] += 1
        else:
            buckets["> 200 MB"] += 1

    print(f"\n── File size distribution (n={len(pdfs)} PDFs, total={total_mb:.0f} MB) ────")
    for bucket, count in buckets.items():
        bar = "█" * (count * 30 // len(pdfs)) if pdfs else ""
        print(f"  {bucket:<12}  {count:>5}  {bar}")

    print(f"\n  Thresholds:")
    print(
        f"    docling:            > 100 MB  → {sum(1 for s, _ in sizes if s > 100):>4} files skipped"
    )
    print(
        f"    pymupdf/pdfplumber: > 200 MB  → {sum(1 for s, _ in sizes if s > 200):>4} files skipped"
    )

    print(f"\n  Top {top} largest files:")
    for mb, path in sizes[:top]:
        print(f"    {mb:>7.1f} MB  {path.parent.name}/{path.name}")
    print()


def analyse_name_hints(records: list[dict], show: int = 5) -> None:
    """Compute name_hint for every record and show distribution."""
    hint_counts: Counter = Counter()
    hint_examples: defaultdict = defaultdict(list)
    for raw in records:
        title = raw.get("title") or ""
        hint = DocTypeHint.unknown.value
        for pattern, doc_type in _TITLE_PATTERNS:
            if pattern.search(title):
                hint = doc_type.value
                break
        hint_counts[hint] += 1
        if len(hint_examples[hint]) < show:
            hint_examples[hint].append(title)
    total = len(records)
    print(f"\n── Name hint distribution from titles (n={total}) ─────────────────────")
    for hint, count in hint_counts.most_common():
        pct = 100 * count / total
        print(f"  {hint:<16} {count:>6}  ({pct:.1f}%)")
        for ex in hint_examples[hint][:show]:
            print(f"      {ex[:65]}")
    print()


def analyse_title_keywords(records: list[dict], show: int = 5) -> None:
    """Count how often doc-type keywords appear in OR record titles."""
    total = len(records)
    counts: Counter = Counter()
    examples: defaultdict = defaultdict(list)
    for raw in records:
        title = raw.get("title") or ""
        for kw, pattern in TITLE_KEYWORDS.items():
            if pattern.search(title):
                counts[kw] += 1
                if len(examples[kw]) < show:
                    examples[kw].append(title)
    print(f"\n── Title keyword frequencies (n={total}) ──────────────────────────────")
    print(f"{'keyword':<15} {'count':>6}  {'%':>5}")
    print("-" * 40)
    for kw, count in counts.most_common():
        pct = 100 * count / total
        print(f"{kw:<15} {count:>6}  {pct:>4.1f}%")
        for ex in examples[kw]:
            print(f"    {ex[:72]}")
        print()


def analyse_hint_conflicts(manifest_path: Path, show: int = 5) -> None:
    """Show where layout_hint and name_hint disagree (needs extraction manifest)."""
    if not manifest_path.exists():
        print(f"\n── Hint conflicts: manifest not found at {manifest_path} ──")
        return
    raw = json.loads(manifest_path.read_text(encoding="utf-8"))
    docs = raw.get("documents", [])
    if not docs:
        print("\n── Hint conflicts: manifest has no documents ──")
        return

    conflicts: defaultdict = defaultdict(list)
    agreements = 0
    unknown_both = 0
    for doc in docs:
        layout = doc.get("layout_hint", "unknown")
        name = doc.get("name_hint", "unknown")
        title = doc.get("title", "")
        if layout == "unknown" and name == "unknown":
            unknown_both += 1
            continue
        if layout == name:
            agreements += 1
            continue
        key = (layout, name)
        if len(conflicts[key]) < show:
            conflicts[key].append(title)
        else:
            conflicts[key].append(None)

    total = len(docs)
    n_conflicts = sum(len(v) for v in conflicts.values())
    print(f"\n── Hint conflicts (n={total} docs) ────────────────────────────────────")
    print(f"  both unknown:  {unknown_both:>5}  ({100 * unknown_both / total:.1f}%)")
    print(f"  in agreement:  {agreements:>5}  ({100 * agreements / total:.1f}%)")
    print(f"  conflicting:   {n_conflicts:>5}  ({100 * n_conflicts / total:.1f}%)")
    print()
    if not conflicts:
        print("  No conflicts found.")
        return
    print(f"  {'layout_hint':<16} {'name_hint':<16}  count  examples")
    print("  " + "-" * 70)
    for (layout, name), titles in sorted(conflicts.items(), key=lambda x: -len(x[1])):
        count = len(titles)
        examples = [t for t in titles if t is not None][:show]
        print(f"  {layout:<16} {name:<16}  {count:>5}")
        for ex in examples:
            print(f"      {ex[:65]}")
    print()


def analyse_docling_check(or_data_path: Path, threshold: float = 0.2, timeout: int = 10) -> None:
    """Check which PDFs would be skipped by each backend and why."""

    def _timeout_handler(signum, frame):
        raise TimeoutError()

    pdfs = [f for d in or_data_path.iterdir() if d.is_dir() for f in d.glob("*.pdf")]
    print(f"\n── Docling skip check (n={len(pdfs)} PDFs) ─────────────────────────────")

    skipped: list[tuple[Path, str]] = []
    kept: list[Path] = []
    timeouts: list[Path] = []
    errors: list[tuple[Path, str]] = []

    for pdf in pdfs:
        try:
            signal.signal(signal.SIGALRM, _timeout_handler)
            signal.alarm(timeout)
            reason = pdf_skip_reason(pdf, min_text_fraction=threshold)
            signal.alarm(0)
            if reason:
                skipped.append((pdf, reason))
            else:
                kept.append(pdf)
        except TimeoutError:
            signal.alarm(0)
            timeouts.append(pdf)
        except Exception as e:
            signal.alarm(0)
            errors.append((pdf, str(e)))

    def _reason_type(r: str) -> str:
        if r.startswith("file too large"):
            return "file too large"
        if r.startswith("too many pages"):
            return "too many pages"
        if r.startswith("image-heavy"):
            return "image-heavy"
        if r.startswith("low text density"):
            return "low text density"
        return r

    print(f"  total:    {len(pdfs):>5}")
    print(f"  skipped:  {len(skipped):>5}")
    print(f"  kept:     {len(kept):>5}")
    if timeouts:
        print(f"  timeouts: {len(timeouts):>5}")
    if errors:
        print(f"  errors:   {len(errors):>5}")
    print()

    if skipped:
        grouped: defaultdict = defaultdict(list)
        for path, reason in skipped:
            grouped[_reason_type(reason)].append((path, reason))
        for reason_type, items in sorted(grouped.items(), key=lambda x: -len(x[1])):
            print(f"  {reason_type} ({len(items)}):")
            for path, reason in sorted(items, key=lambda x: x[1]):
                print(f"    {path.parent.name}/{path.name}  ({reason})")
            print()

    for path in timeouts:
        print(f"  TIMEOUT   {path.parent.name}/{path.name}")
    for path, err in errors:
        print(f"  ERROR     {path.parent.name}/{path.name}: {err}")


# ---------------------------------------------------------------------------
# Entrypoint
# ---------------------------------------------------------------------------


def load_records(or_data_path: Path) -> list[dict]:
    paths = [
        d / "metadata.json"
        for d in or_data_path.iterdir()
        if d.is_dir() and (d / "metadata.json").exists()
    ]
    records = []
    for p in paths:
        try:
            records.append(json.loads(p.read_text(encoding="utf-8")))
        except Exception:
            pass
    return records


def main() -> None:
    parser = argparse.ArgumentParser(description="Explore OR record doc-type signals")
    parser.add_argument("--or-data", type=Path, default=Path("data/openresearch/openresearch"))
    parser.add_argument("--show", type=int, default=5, help="Example titles per keyword")
    parser.add_argument(
        "--manifest",
        type=Path,
        default=Path("data/openresearch/extracted/pymupdf/manifest.json"),
        help="Extraction manifest (for hint-conflicts analysis)",
    )
    parser.add_argument(
        "--density-threshold",
        type=float,
        default=0.2,
        help="Min text fraction for docling-check (default 0.2)",
    )
    parser.add_argument(
        "--density-timeout",
        type=int,
        default=10,
        help="Per-file timeout for docling-check in seconds (default 10)",
    )
    parser.add_argument(
        "--only",
        nargs="+",
        choices=ANALYSES,
        metavar="ANALYSIS",
        help=f"Run only these analyses. Choices: {', '.join(ANALYSES)}",
    )
    parser.add_argument(
        "--skip",
        nargs="+",
        choices=ANALYSES,
        metavar="ANALYSIS",
        help=f"Skip these analyses. Choices: {', '.join(ANALYSES)}",
    )
    args = parser.parse_args()

    if not args.or_data.exists():
        print(f"ERROR: {args.or_data} not found")
        return

    to_run = set(args.only) if args.only else set(ANALYSES)
    if args.skip:
        to_run -= set(args.skip)

    # load records only if needed
    needs_records = to_run & {"categories", "extensions", "name-hints", "title-keywords"}
    records = []
    if needs_records:
        records = load_records(args.or_data)
        print(f"Loaded {len(records)} records from {args.or_data}")

    if "categories" in to_run:
        analyse_categories(records)
    if "extensions" in to_run:
        analyse_extensions(records)
    if "file-sizes" in to_run:
        analyse_file_sizes(args.or_data)
    if "name-hints" in to_run:
        analyse_name_hints(records, show=args.show)
    if "title-keywords" in to_run:
        analyse_title_keywords(records, show=args.show)
    if "hint-conflicts" in to_run:
        analyse_hint_conflicts(args.manifest, show=args.show)
    if "docling-check" in to_run:
        analyse_docling_check(
            args.or_data,
            threshold=args.density_threshold,
            timeout=args.density_timeout,
        )


if __name__ == "__main__":
    main()
