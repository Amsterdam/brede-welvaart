r"""
Inspect a single PDF and explain why it would or would not be skipped by Docling.

Run from the repo root:
    uv run python -m scripts.inspect_individual_doc data/openresearch/openresearch/133047/Informatieoverdracht\ coa.pdf

    # or by OR id:
    uv run python -m scripts.inspect_individual_doc --id 133047 --or-data data/openresearch/openresearch
"""
# flake8: noqa

import argparse
import sys
from pathlib import Path

from src.utils.doc_utils import analyse_pdf, pdf_skip_reason


def check_pdf(path: Path) -> None:
    print(f"\n── {path.parent.name}/{path.name} ──────────────────────────────────────")

    stats = analyse_pdf(path)

    # check skip reason first — avoids hanging on large/corrupt files
    reason = pdf_skip_reason(path)
    if reason and "file too large" in reason:
        print(f"  → WOULD BE SKIPPED: {reason}")
        print("  (skipping page analysis — file too large to open safely)")
        return
    print(f"  size:          {stats['file_size_mb']:.1f} MB")
    print(f"  pages:         {stats['page_count']}")

    if not stats["readable"]:
        print("  (fitz could not open this file)")
        reason = pdf_skip_reason(path)
        if reason:
            print(f"  → WOULD BE SKIPPED: {reason}")
        else:
            print(f"  → would NOT be skipped (passes all checks)")
        return

    print(
        f"  text pages:    {stats['text_pages']}/{stats['valid_pages']} ({stats['text_fraction']:.0%})"
    )
    print(f"  char density:  {stats['char_density']:.4f} chars/byte")
    print()

    # per-page breakdown
    try:
        import fitz  # noqa: PLC0415

        doc = fitz.open(path)
        print(f"  {'page':>4}  {'chars':>6}  {'has_text':>8}  preview")
        print("  " + "-" * 60)
        for i in range(doc.page_count):
            try:
                p = doc.load_page(i)
                text = p.get_text().strip()
                has_text = len(text) > 50
                preview = text[:50].replace("\n", " ") if text else "(empty)"
                print(f"  {i + 1:>4}  {len(text):>6}  {'✓' if has_text else '✗':>8}  {preview}")
            except Exception as e:
                print(f"  {i + 1:>4}  {'ERROR':>6}  {'✗':>8}  {e}")
        doc.close()
    except Exception as e:
        print(f"  Could not load pages: {e}")

    print()
    reason = pdf_skip_reason(path)
    if reason:
        print(f"  → WOULD BE SKIPPED: {reason}")
    else:
        print(f"  → would NOT be skipped (passes all checks)")
    print()


def main() -> None:
    parser = argparse.ArgumentParser(description="Inspect a PDF for Docling skip checks")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("path", nargs="?", type=Path, help="Direct path to PDF file")
    group.add_argument("--id", type=str, help="OR record id (e.g. 133047)")
    parser.add_argument(
        "--or-data",
        type=Path,
        default=Path("data/openresearch/openresearch"),
        help="OR data folder (used with --id)",
    )
    args = parser.parse_args()

    if args.id:
        record_dir = args.or_data / args.id
        if not record_dir.exists():
            print(f"ERROR: {record_dir} not found")
            sys.exit(1)
        pdfs = list(record_dir.glob("*.pdf"))
        if not pdfs:
            print(f"ERROR: no PDFs in {record_dir}")
            sys.exit(1)
        for pdf in pdfs:
            check_pdf(pdf)
    else:
        if not args.path.exists():
            print(f"ERROR: {args.path} not found")
            sys.exit(1)
        check_pdf(args.path)


if __name__ == "__main__":
    main()
