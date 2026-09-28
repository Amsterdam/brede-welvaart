"""Config loader with ${var} substitution from top-level scalar keys."""
from pathlib import Path

import yaml


def load_config(path: Path) -> dict:
    """
    Load a YAML config file with ${var} substitution.

    Any top-level scalar field (string/int/float) can be referenced as ${field}
    anywhere else in the YAML. Example:

        source_root: openresearch
        extraction:
          output_dir: ${source_root}/extracted    # -> openresearch/extracted
    """
    raw = path.read_text(encoding="utf-8")
    cfg = yaml.safe_load(raw)

    if not isinstance(cfg, dict):
        raise ValueError(f"Config file {path} must contain a top-level mapping")

    for key, value in cfg.items():
        if isinstance(value, (str, int, float)) and not isinstance(value, bool):
            raw = raw.replace(f"${{{key}}}", str(value))

    return yaml.safe_load(raw)
