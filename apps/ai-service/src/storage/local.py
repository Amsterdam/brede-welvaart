"""Wrapper around local file storage for consistency"""
import shutil
from pathlib import Path
from typing import List

from .base import Storage


class LocalStorage(Storage):
    """Local file storage implementation of the Storage interface."""

    def __init__(self, base_dir: str | Path):
        self.base_dir = Path(base_dir)
        # cache the absolute, symlink-resolved base for the path-traversal check
        self._base_resolved = self.base_dir.resolve()

    def _resolve(self, file_path: str | Path) -> Path:
        """
        Resolve a storage-relative path under base_dir, rejecting traversal attempts.

        Raises ValueError if the resulting path escapes base_dir — e.g. via an
        absolute key, a "../" component, or a symlink that points outside.
        """
        resolved = (self.base_dir / file_path).resolve()
        if not resolved.is_relative_to(self._base_resolved):
            raise ValueError(f"Path {str(file_path)!r} escapes storage root {self.base_dir}")
        return resolved

    def read_file(self, file_path: str | Path, **kwargs) -> bytes:
        """Read a file"""
        return self._resolve(file_path).read_bytes()

    def write_file(self, content: str | bytes, file_path: str | Path, **kwargs) -> None:
        """Write a file"""
        full_path = self._resolve(file_path)
        full_path.parent.mkdir(parents=True, exist_ok=True)
        if isinstance(content, str):
            full_path.write_text(content, encoding="utf-8")
        else:
            full_path.write_bytes(content)

    def exists(self, file_path: str | Path, **kwargs) -> bool:
        """Return True if the file exists."""
        return self._resolve(file_path).exists()

    def get_size(self, file_path: str | Path, **kwargs) -> int:
        """Return the file size in bytes."""
        return self._resolve(file_path).stat().st_size

    def get_subfolders(self, folder: str | Path, **kwargs) -> List[str]:
        """Get subfolders in a folder"""
        root = self._resolve(folder)
        if not root.exists():
            return []
        return [f.name for f in root.iterdir() if f.is_dir()]

    def get_folder_contents(self, folder: str | Path, **kwargs) -> List[str]:
        """Get files and folders in a folder"""
        root = self._resolve(folder)
        if not root.exists():
            return []
        return [f.name for f in root.iterdir()]

    def download_to_file(self, file_path: str | Path, dest_path: str, **kwargs) -> None:
        """Copy a stored file to a local path (no full read into memory)."""
        shutil.copyfile(self._resolve(file_path), dest_path)

    def upload_from_file(self, local_path: str, file_path: str | Path, **kwargs) -> None:
        """Copy a local file into storage (no full read into memory)."""
        dest = self._resolve(file_path)
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(local_path, dest)
