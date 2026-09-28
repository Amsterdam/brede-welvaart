"""Wrapper around azure blob storage"""
from typing import List

from azure.core.exceptions import ResourceExistsError, ResourceNotFoundError
from azure.storage.blob import BlobClient, BlobServiceClient, ContainerClient
from src.utils.azure_utils import (
    StorageAuth,
    _is_azurite_connection_string as _looks_like_azurite_connection_string,
    azure_credential,
    get_azure_storage_config,
)

from .base import Storage


def _is_azurite_connection_string(connection_string: str | None) -> bool:
    return _looks_like_azurite_connection_string(connection_string)


class AzureBlobStorage(Storage):
    """Azure Blob Storage implementation of the Storage interface."""

    def __init__(self, account_url: str | None = None, default_container: str = "") -> None:
        config = get_azure_storage_config()

        if config.auth is StorageAuth.CONNECTION_STRING:
            # Azurite or a real account key — authenticate with the embedded key.
            self.blob_service_client = BlobServiceClient.from_connection_string(
                config.connection_string
            )
        else:  # StorageAuth.MANAGED_IDENTITY
            self.blob_service_client = BlobServiceClient(
                account_url=account_url or config.account_url,
                credential=azure_credential,
            )

        self.default_container = default_container

    def get_containers(self):
        """List all containers in the Azure Blob Storage account."""
        containers = list(self.blob_service_client.list_containers())
        return containers

    def get_blob_client(self, target_file: str, container: str | None = None) -> BlobClient:
        """Get a blob client for the specified file and (default) container."""
        if not container:
            container = self.default_container

        blob_client = self.blob_service_client.get_blob_client(container, blob=target_file)
        return blob_client

    def get_container_client(self, container: str | None = None) -> ContainerClient:
        """Get a container client for the specified (default) container."""
        if not container:
            container = self.default_container

        container_client = self.blob_service_client.get_container_client(container)
        return container_client

    def ensure_container(self, container: str | None = None) -> None:
        """Create the container if it doesn't exist. Idempotent."""
        container = container or self.default_container
        try:
            self.blob_service_client.create_container(container)
        except ResourceExistsError:
            pass

    def upload_file(self, local_file: str, target_file: str, container: str | None = None) -> None:
        """Upload a local file to Azure Blob Storage."""
        self.ensure_container(container)
        blob_client = self.get_blob_client(target_file, container)
        with open(local_file, "rb") as upload_file:
            blob_client.upload_blob(upload_file, overwrite=True)

    def download_file(
        self, target_file: str, local_file: str, container: str | None = None
    ) -> None:
        """Download a file from Azure Blob Storage to a local path."""
        self.download_to_file(target_file, local_file, container=container)

    def upload_from_file(
        self, local_path: str, file_path: str, container: str | None = None, **kwargs
    ) -> None:
        """Stream a local file to a blob without loading it into memory."""
        self.ensure_container(container)
        blob_client = self.get_blob_client(file_path, container)
        with open(local_path, "rb") as fh:
            blob_client.upload_blob(fh, overwrite=True)

    def download_to_file(
        self, file_path: str, dest_path: str, container: str | None = None, **kwargs
    ) -> None:
        """
        Stream a blob to a local file without holding the whole payload in RAM.
        readinto() copies in chunks straight to the file handle — used for the
        multi-GB embedding index, where read_file().readall() would spike memory.
        """
        blob_client = self.get_blob_client(file_path, container)
        with open(dest_path, "wb") as fh:
            blob_client.download_blob().readinto(fh)

    def read_file(self, file_path: str, container: str | None = None) -> bytes:
        """Read a file"""
        blob_client = self.get_blob_client(file_path, container)
        return blob_client.download_blob().readall()

    def write_file(
        self, content: str | bytes, file_path: str, container: str | None = None
    ) -> None:
        """Write a file"""
        self.ensure_container(container)
        blob_client = self.get_blob_client(file_path, container)
        blob_client.upload_blob(content, overwrite=True)

    def exists(self, file_path: str, container: str | None = None) -> bool:
        """Return True if the blob exists."""
        return self.get_blob_client(file_path, container).exists()

    def get_size(self, file_path: str, container: str | None = None) -> int:
        """Return blob size in bytes. Raises ResourceNotFoundError if missing."""
        try:
            return self.get_blob_client(file_path, container).get_blob_properties().size
        except ResourceNotFoundError as e:
            raise FileNotFoundError(file_path) from e

    def get_folder_contents(self, folder: str, container: str | None = None) -> List[str]:
        """Get files and folders in a folder"""
        container_client = self.get_container_client(container)
        blobs = container_client.list_blobs(name_starts_with=folder)
        content_names = [blob.name.removeprefix(folder).strip("/") for blob in blobs]
        return content_names

    def get_subfolders(self, folder: str, container: str | None = None) -> List[str]:
        """Get subfolders in a folder"""
        container_client = self.get_container_client(container)
        blobs = container_client.list_blobs(name_starts_with=folder)

        subfolders = set()

        for blob in blobs:
            # Remove the specific folder prefix and split by '/' to identify subfolders
            relative_path = blob.name.removeprefix(folder).strip("/")
            path_parts = relative_path.split("/")
            if len(path_parts) > 1:
                # Add the first part as a subfolder name
                subfolders.add(path_parts[0])

        return sorted(subfolders)
