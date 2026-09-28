"""
Helpers for handing a Storage-backed file to libraries that need a real filesystem path
(e.g. PyMuPDF, pdfplumber, docling, python-docx open files by path, not bytes).

with_local_path:
    Local backend  - yields the real path under storage.base_dir, no copy.
    Other backends - downloads to a tempfile, yields its path, deletes on exit.
"""
from __future__ import annotations

import os
import tempfile
from contextlib import contextmanager
from pathlib import Path

from .base import Storage
from .local import LocalStorage


@contextmanager
def with_local_path(storage: Storage, key: str, suffix: str | None = None):
    """
    Yield a real filesystem Path for the given storage key.

    For LocalStorage this is zero-copy. For any other backend we download
    the file to a NamedTemporaryFile (with the original suffix preserved so
    libraries can format-detect by extension) and delete it on exit.

    Args:
        storage:  Any Storage instance.
        key:      The storage-relative path / blob key.
        suffix:   File suffix to use for the tempfile. Defaults to the suffix of key.
    """
    if isinstance(storage, LocalStorage):
        yield storage.base_dir / key
        return

    if suffix is None:
        suffix = Path(key).suffix or ""

    data = storage.read_file(key)
    fd, tmp_path = tempfile.mkstemp(suffix=suffix)
    try:
        with os.fdopen(fd, "wb") as f:
            f.write(data)
        yield Path(tmp_path)
    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass
