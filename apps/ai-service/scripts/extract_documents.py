r"""
Pipeline step 1: extract text from all OR source files.

Processes two record types:
  - document records  -> extract text from downloaded_files
  - article records   -> extract raadsinformatie files (if any)

Both write into {output_prefix}/{id}/ using the same layout, so step 2
(assemble_articles) can stitch everything without touching a PDF.

All input/output is routed through the storage backend configured in
config/data_ingestion.yaml. Prefixes are storage-relative.

Run:
    uv run python -m scripts.extract_documents \
        --or-data openresearch \
        --output extracted/pymupdf \
        --backend pymupdf

Add --force to re-extract everything even if output already exists.
The optional --in-progress-marker is a LOCAL file (script coordination, not data).
"""

import argparse
import logging
from datetime import datetime, timezone
from pathlib import Path

from src.openresearch.assembler import ORExtractor, iter_records
from src.preprocessing.extractor import DocumentExtractor
from src.storage import Storage, get_storage
from src.utils.config import load_config
from src.utils.schemas import ExtractionManifest, ExtractionRecord
from tqdm import tqdm

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

DEFAULT_CONFIG_PATH = Path(__file__).parent.parent / "config" / "data_ingestion.yaml"


def _load_existing_manifest(
    storage: Storage, manifest_key: str, force: bool
) -> dict[str, ExtractionRecord]:
    if not force and storage.exists(manifest_key):
        try:
            raw = storage.read_file(manifest_key).decode("utf-8")
            old = ExtractionManifest.model_validate_json(raw)
            logger.info("Loaded %d existing records from manifest", len(old.documents))
            return {r.id: r for r in old.documents}
        except Exception as e:
            logger.warning("Could not load existing manifest: %s", e)
    return {}


def _make_write_manifest(
    storage: Storage,
    manifest_key: str,
    existing_records: dict[str, ExtractionRecord],
    started_at: datetime,
    backend: str,
):
    def _to_record(doc) -> ExtractionRecord:
        return ExtractionRecord(
            id=doc.id,
            title=doc.title,
            extractor=doc.extractors_used[0] if doc.extractors_used else backend,
            layout_hint=doc.layout_hint,
            name_hint=doc.name_hint,
            doc_type_hint=doc.doc_type_hint,
            page_count=doc.page_count,
            extraction_failed=doc.extraction_failed,
            extraction_error=doc.extraction_error,
        )

    def write_manifest(results: list, finished: bool = False) -> None:
        merged = {**existing_records, **{_to_record(d).id: _to_record(d) for d in results}}
        all_records = list(merged.values())
        succeeded = sum(1 for r in all_records if not r.extraction_failed)
        failed = sum(1 for r in all_records if r.extraction_failed)
        manifest = ExtractionManifest(
            source="openresearch",
            started_at=started_at,
            finished_at=datetime.now(timezone.utc) if finished else None,
            extractor=backend,
            total=len(all_records),
            succeeded=succeeded,
            failed=failed,
            skipped=0,
            documents=all_records,
        )
        storage.write_file(manifest.model_dump_json(indent=2), manifest_key)

    return write_manifest


def _extract_leaves(
    storage: Storage,
    extractor: ORExtractor,
    or_data_prefix: str,
    write_manifest,
    marker: Path | None,
    skip_first: int,
    max_docs: int | None = None,
) -> list:
    leaves = list(iter_records(storage, or_data_prefix, category="document"))
    if skip_first:
        leaves = leaves[skip_first:]
        logger.info("Skipping first %d leaf records", skip_first)
    if max_docs:
        leaves = leaves[:max_docs]
        logger.info("Test mode: limiting to %d leaf records", max_docs)
    results = []
    for record in tqdm(leaves, desc="Extracting leaves", unit="doc"):
        tqdm.write(f" -> {record.id} {record.title or ''}")
        if marker:
            marker.write_text(str(record.id), encoding="utf-8")
        results.append(extractor.extract_leaf(record))
        if marker:
            marker.unlink(missing_ok=True)
        write_manifest(results)
    return results


def _extract_raadsinformatie(
    storage: Storage,
    extractor: ORExtractor,
    or_data_prefix: str,
    write_manifest,
    marker: Path | None,
    leaf_results: list,
) -> list:
    results = []
    for record in tqdm(
        (
            r
            for r in iter_records(storage, or_data_prefix, category="article")
            if r.raadsinformatie
        ),
        desc="Extracting RI",
        unit="article",
    ):
        tqdm.write(f" -> {record.id} {record.title or ''}")
        if marker:
            marker.write_text(str(record.id), encoding="utf-8")
        result = extractor.extract_raadsinformatie(record)
        if marker:
            marker.unlink(missing_ok=True)
        if result is not None:
            results.append(result)
        write_manifest(leaf_results + results)
    return results


def run(
    storage: Storage,
    or_data_prefix: str,
    output_prefix: str,
    backend: str = "pymupdf",
    max_file_mb: float | None = None,
    max_pages: int | None = None,
    min_text_fraction: float | None = None,
    min_char_density: float | None = None,
    force: bool = False,
    skip_existing: bool = False,
    skip_first: int = 0,
    in_progress_marker: Path | None = None,
    max_docs: int | None = None,
) -> None:
    """Extract text from OR source files. Called by run_pipeline and main()."""
    logger.info("OR data prefix: %s", or_data_prefix)
    logger.info("Output prefix:  %s", output_prefix)
    logger.info("Backend:        %s", backend)
    logger.info("Storage:        %s", storage.__class__.__name__)

    extractor = ORExtractor(
        storage=storage,
        or_data_prefix=or_data_prefix,
        extracted_prefix=output_prefix,
        extractor=DocumentExtractor(
            backend=backend,
            max_file_mb=max_file_mb,
            max_pages=max_pages,
            min_text_fraction=min_text_fraction,
            min_char_density=min_char_density,
        ),
        force=force,
        skip_existing=skip_existing,
    )

    started_at = datetime.now(timezone.utc)
    manifest_key = f"{output_prefix.rstrip('/')}/manifest.json"
    existing_records = _load_existing_manifest(storage, manifest_key, force)
    write_manifest = _make_write_manifest(
        storage, manifest_key, existing_records, started_at, backend
    )

    leaf_results = _extract_leaves(
        storage,
        extractor,
        or_data_prefix,
        write_manifest,
        in_progress_marker,
        skip_first,
        max_docs=max_docs,
    )
    ri_results = _extract_raadsinformatie(
        storage, extractor, or_data_prefix, write_manifest, in_progress_marker, leaf_results
    )

    all_results = leaf_results + ri_results
    write_manifest(all_results, finished=True)

    logger.info(
        "Done — leaves=%d  ri=%d  succeeded=%d  failed=%d  skipped=%d",
        len(leaf_results),
        len(ri_results),
        sum(1 for d in all_results if not d.extraction_failed and d.text),
        sum(1 for d in all_results if d.extraction_failed),
        sum(1 for d in all_results if not d.extraction_failed and not d.text),
    )
    logger.info("Manifest -> %s", manifest_key)


def main() -> None:
    parser = argparse.ArgumentParser(description="Extract text from OR source files")
    parser.add_argument("--config", type=Path, default=DEFAULT_CONFIG_PATH)
    parser.add_argument("--or-data", default=None, help="Storage prefix for OR records")
    parser.add_argument("--output", default=None, help="Storage prefix for extracted output")
    parser.add_argument("--backend", choices=["pymupdf", "docling", "pdfplumber"], default=None)
    parser.add_argument("--max-file-mb", type=float, default=None)
    parser.add_argument("--max-pages", type=int, default=None)
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--skip-existing", action="store_true")
    parser.add_argument("--skip-first", type=int, default=0)
    parser.add_argument(
        "--in-progress-marker",
        type=Path,
        default=None,
        help="LOCAL file path to write current record id before extraction (script coord)",
    )
    parser.add_argument("--max-docs", type=int, default=None)
    args = parser.parse_args()

    cfg = load_config(args.config)
    storage = get_storage(cfg.get("storage", {}))
    c_or = cfg.get("openresearch", {})
    c_ext = cfg.get("extraction", {})

    or_data_prefix = args.or_data or c_or.get("base_path", "openresearch")
    backend = args.backend or c_ext.get("primary_backend", "docling")
    output_prefix = args.output or f"{c_ext.get('output_dir', 'extracted').rstrip('/')}/{backend}"
    backend_cfg = c_ext.get(backend, {})

    run(
        storage=storage,
        or_data_prefix=or_data_prefix,
        output_prefix=output_prefix,
        backend=backend,
        max_file_mb=args.max_file_mb or backend_cfg.get("max_file_mb"),
        max_pages=args.max_pages or backend_cfg.get("max_pages"),
        min_text_fraction=backend_cfg.get("min_text_fraction"),
        min_char_density=backend_cfg.get("min_char_density"),
        force=args.force,
        skip_existing=args.skip_existing,
        skip_first=args.skip_first,
        in_progress_marker=args.in_progress_marker,
        max_docs=args.max_docs,
    )


if __name__ == "__main__":
    main()
