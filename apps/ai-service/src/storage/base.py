"""
Base class for storage implementations.
Defines the interface that all storage classes should implement.
Idea is to be able to swap out storage (local, azure, etc) without changing the codebase.
"""
from abc import ABC, abstractmethod
from typing import List


class Storage(ABC):
    """Base class for storage implementations."""

    @abstractmethod
    def read_file(self, file_path: str, **kwargs) -> bytes:
        """Read a file. Raises FileNotFoundError (or subclass-specific equivalent)."""
        raise NotImplementedError("Implement read_file function")

    @abstractmethod
    def write_file(self, content: str | bytes, file_path: str, **kwargs) -> None:
        """Write a file. Creates parent folders / containers as needed."""
        raise NotImplementedError("Implement write_file function")

    @abstractmethod
    def exists(self, file_path: str, **kwargs) -> bool:
        """Return True if the file exists."""
        raise NotImplementedError("Implement exists function")

    @abstractmethod
    def get_size(self, file_path: str, **kwargs) -> int:
        """Return the size of the file in bytes. Raises if missing."""
        raise NotImplementedError("Implement get_size function")

    @abstractmethod
    def get_subfolders(self, folder: str, **kwargs) -> List[str]:
        """Get immediate subfolders in a folder, as names (no leading prefix)."""
        raise NotImplementedError("Implement get_subfolders function")

    @abstractmethod
    def get_folder_contents(self, folder: str, **kwargs) -> List[str]:
        """Get immediate files (and folders, for local) in a folder, as names."""
        raise NotImplementedError("Implement get_folder_contents function")

    def download_to_file(self, file_path: str, dest_path: str, **kwargs) -> None:
        """
        Stream a stored object to a local file. Backends override this to avoid
        materialising the whole payload in memory; this default keeps custom
        backends working by falling back to read_file (one in-memory copy).
        """
        with open(dest_path, "wb") as fh:
            fh.write(self.read_file(file_path, **kwargs))

    def upload_from_file(self, local_path: str, file_path: str, **kwargs) -> None:
        """
        Stream a local file into storage — the upload counterpart of
        download_to_file. Default falls back to one in-memory copy.
        """
        with open(local_path, "rb") as fh:
            self.write_file(fh.read(), file_path, **kwargs)
