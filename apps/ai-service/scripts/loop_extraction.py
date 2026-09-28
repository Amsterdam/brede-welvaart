r"""
Wrapper that keeps restarting extract_documents until it finishes.

Restarts on crash, stops when manifest has finished_at set.
After a crash, marks the last in-progress document as failed so it
is skipped on the next run instead of crashing again.

The in-progress marker is a LOCAL file (script coordination only).
Everything else (manifest, fake-failed meta.json) routes through storage.

Run from the repo root:
    uv run python scripts/loop_extraction.py \
        --or-data openresearch \
        --output extracted/docling \
        --backend docling
"""

import argparse
import json
import logging
import subprocess
import sys
import time
from pathlib import Path

from src.storage import Storage, get_storage
from src.utils.config import load_config

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
logger = logging.getLogger(__name__)

DEFAULT_CONFIG_PATH = Path(__file__).parent.parent / "config" / "data_ingestion.yaml"

IN_PROGRESS_FILENAME = ".in_progress"


def is_finished(storage: Storage, manifest_key: str) -> bool:
    if not storage.exists(manifest_key):
        return False
    try:
        m = json.loads(storage.read_file(manifest_key).decode("utf-8"))
        return m.get("finished_at") is not None
    except Exception:
        return False


def _read_manifest_total(storage: Storage, manifest_key: str) -> int:
    if not storage.exists(manifest_key):
        return 0
    try:
        m = json.loads(storage.read_file(manifest_key).decode("utf-8"))
        return m.get("total", 0)
    except Exception:
        return 0


def _skip_crashed_doc(
    storage: Storage, output_prefix: str, marker_path: Path, backend: str
) -> None:
    """
    If a crash marker exists, write a failed meta.json for that doc so
    the next run skips it instead of crashing again.
    """
    if not marker_path.exists():
        return

    try:
        record_id = marker_path.read_text(encoding="utf-8").strip()
    except Exception:
        return

    if not record_id:
        marker_path.unlink(missing_ok=True)
        return

    meta_key = f"{output_prefix.rstrip('/')}/{record_id}/meta.json"

    if storage.exists(meta_key):
        # already has a meta -- crash happened after write, nothing to do
        marker_path.unlink(missing_ok=True)
        return

    meta = {
        "id": f"openresearch:{record_id}",  # noqa: E231
        "source": "openresearch",
        "text": "",
        "extractors_used": [],
        "extraction_failed": True,
        "extraction_error": f"Auto-skipped after process crash ({backend})",
    }
    storage.write_file(json.dumps(meta, indent=2), meta_key)
    logger.warning("Skipping crashed doc %s -> %s", record_id, meta_key)
    marker_path.unlink(missing_ok=True)


def main() -> None:  # noqa: C901
    parser = argparse.ArgumentParser(description="Run extract_documents until completion")
    parser.add_argument("--config", type=Path, default=DEFAULT_CONFIG_PATH)
    parser.add_argument("--or-data", default=None, help="Storage prefix for OR records")
    parser.add_argument("--output", default=None, help="Storage prefix for extracted output")
    parser.add_argument("--backend", choices=["pymupdf", "docling", "pdfplumber"], default=None)
    parser.add_argument(
        "--marker-dir",
        type=Path,
        default=Path("."),
        help="LOCAL directory where the in-progress marker file lives (script coord)",
    )
    parser.add_argument("--max-restarts", type=int, default=50)
    parser.add_argument("--restart-delay", type=int, default=5)
    parser.add_argument("--skip-existing", action="store_true")
    parser.add_argument("--max-file-mb", type=float, default=None)
    parser.add_argument("--max-pages", type=int, default=None)
    parser.add_argument("--skip-first", type=int, default=0)
    args = parser.parse_args()

    cfg = load_config(args.config)
    storage = get_storage(cfg.get("storage", {}))
    c_or = cfg.get("openresearch", {})
    c_ext = cfg.get("extraction", {})

    or_data_prefix = args.or_data or c_or.get("base_path", "openresearch")
    backend = args.backend or c_ext.get("primary_backend", "docling")
    output_prefix = args.output or f"{c_ext.get('output_dir', 'extracted').rstrip('/')}/{backend}"

    args.marker_dir.mkdir(parents=True, exist_ok=True)
    marker_path = args.marker_dir / IN_PROGRESS_FILENAME

    manifest_key = f"{output_prefix.rstrip('/')}/manifest.json"

    cmd = [
        sys.executable,
        "-m",
        "scripts.extract_documents",
        "--config",
        str(args.config),
        "--or-data",
        or_data_prefix,
        "--output",
        output_prefix,
        "--backend",
        backend,
        "--in-progress-marker",
        str(marker_path),
    ]
    if args.skip_existing:
        cmd.append("--skip-existing")
    if args.max_file_mb is not None:
        cmd += ["--max-file-mb", str(args.max_file_mb)]
    if args.max_pages is not None:
        cmd += ["--max-pages", str(args.max_pages)]

    for attempt in range(1, args.max_restarts + 1):
        if is_finished(storage, manifest_key):
            logger.info("Manifest shows finished_at — extraction complete!")
            break

        total = _read_manifest_total(storage, manifest_key)
        logger.info(
            "Attempt %d/%d — manifest has %d docs so far", attempt, args.max_restarts, total
        )

        attempt_cmd = cmd.copy()
        if args.skip_first:
            attempt_cmd += ["--skip-first", str(args.skip_first)]

        result = subprocess.run(attempt_cmd)

        if is_finished(storage, manifest_key):
            logger.info("Extraction completed after %d attempt(s)", attempt)
            break

        if result.returncode == 0:
            logger.info("Process exited cleanly — checking manifest...")
            if not is_finished(storage, manifest_key):
                logger.warning("Process exited 0 but manifest has no finished_at — restarting")
        else:
            logger.warning(
                "Process crashed (exit code %d) — restarting in %ds",
                result.returncode,
                args.restart_delay,
            )
            _skip_crashed_doc(storage, output_prefix, marker_path, backend)

        time.sleep(args.restart_delay)
    else:
        logger.error("Reached max restarts (%d) without completing", args.max_restarts)
        sys.exit(1)


if __name__ == "__main__":
    main()
