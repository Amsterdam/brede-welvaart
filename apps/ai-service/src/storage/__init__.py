"""Storage module for handling file storage operations."""
from .azure import AzureBlobStorage
from .base import Storage
from .local import LocalStorage
from .tempfile import with_local_path


def get_storage(cfg: dict | None = None) -> Storage:
    """
    Build a Storage instance from a config dict.

    Expected shape (typically nested under `storage:` in data_ingestion.yaml):
        backend: local | azure
        base_dir: <path>     # used for local
        container: <name>    # used for azure

    Defaults to LocalStorage at the current directory.
    """
    cfg = cfg or {}
    backend = cfg.get("backend", "local").lower()
    if backend == "azure":
        container = cfg.get("container")
        if not isinstance(container, str) or not container.strip():
            raise ValueError("Azure storage backend requires a non-empty 'container' config value")
        return AzureBlobStorage(default_container=container.strip())
    if backend == "local":
        return LocalStorage(cfg.get("base_dir", "."))
    raise ValueError(f"Unknown storage backend: {backend!r}")


__all__ = ["Storage", "LocalStorage", "AzureBlobStorage", "get_storage", "with_local_path"]
