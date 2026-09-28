r"""
Wrapper that keeps restarting run_pipeline until it succeeds.

Restarts on crash or non-zero exit, stops when the pipeline exits cleanly.
Each pipeline step handles its own resumption (skip_existing, force=False),
so restarting is safe.

Run from the repo root:
    uv run python -m scripts.loop_pipeline
    uv run python -m scripts.loop_pipeline --steps extract assemble
    uv run python -m scripts.loop_pipeline --steps extract assemble --max-restarts 20
"""

import argparse
import logging
import subprocess
import sys
import time
from pathlib import Path

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
logger = logging.getLogger(__name__)

STEPS = ["collect", "extract", "assemble", "embed"]


def main() -> None:
    parser = argparse.ArgumentParser(description="Run run_pipeline until it completes")
    parser.add_argument(
        "--steps",
        nargs="+",
        choices=STEPS,
        default=STEPS,
        help="Pipeline steps to run (default: all).",
    )
    parser.add_argument(
        "--config",
        type=Path,
        default=None,
        help="Path to data ingestion config (default: config/data_ingestion.yaml)",
    )
    parser.add_argument("--max-restarts", type=int, default=50)
    parser.add_argument("--restart-delay", type=int, default=5, help="Seconds between restarts")
    args = parser.parse_args()

    cmd = [sys.executable, "-m", "scripts.run_pipeline", "--steps", *args.steps]
    if args.config:
        cmd += ["--config", str(args.config)]

    for attempt in range(1, args.max_restarts + 1):
        logger.info(
            "Attempt %d/%d — running pipeline steps: %s",
            attempt,
            args.max_restarts,
            " ".join(args.steps),
        )

        result = subprocess.run(cmd)

        if result.returncode == 0:
            logger.info("Pipeline completed successfully after %d attempt(s)", attempt)
            return

        logger.warning(
            "Pipeline exited with code %d — restarting in %ds",
            result.returncode,
            args.restart_delay,
        )
        time.sleep(args.restart_delay)
    else:
        logger.error("Reached max restarts (%d) without completing", args.max_restarts)
        sys.exit(1)


if __name__ == "__main__":
    main()
