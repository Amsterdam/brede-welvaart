"""
Storage path conventions and identifier helpers for uploaded documents.

Pure string functions — no I/O. Used by both src/preprocessing/upload.py
(which writes these paths) and BWAnalyzer.find_statements (which receives
blob paths from the HTTP request).

Layout under storage:
    uploads/{project_id}/documents/{document_id}/original.pdf      # backend writes
    uploads/{project_id}/documents/{document_id}/extracted.json    # ExtractedDocument
    uploads/{project_id}/documents/{document_id}/meta.json         # UploadDocumentMeta
    uploads/{project_id}/documents/{document_id}/chunks.json       # list[IndexChunk]
    uploads/{project_id}/documents/{document_id}/analysis.json     # DocumentSummary

Conventions:
    doc_id for an upload chunk = f"upload:{project_id}:{document_id}"
"""

from __future__ import annotations

SOURCE = "upload"

# Reject segments that could escape the storage root or be misinterpreted as a path.
# LocalStorage._resolve() also blocks traversal, but defense-in-depth: validate the
# id at parse time so we never construct an exploitable key in the first place.
_FORBIDDEN_ID_VALUES = {"", ".", ".."}
_FORBIDDEN_ID_CHARS = ("/", "\\", "\0")


def _validate_id(name: str, value: str) -> None:
    if value in _FORBIDDEN_ID_VALUES or any(c in value for c in _FORBIDDEN_ID_CHARS):
        raise ValueError(f"Invalid {name}: {value!r}")


def upload_doc_prefix(project_id: str, document_id: str) -> str:
    """Folder under storage holding the original + per-doc extraction artifacts."""
    _validate_id("project_id", project_id)
    _validate_id("document_id", document_id)
    return f"uploads/{project_id}/documents/{document_id}"


def upload_chunks_key(project_id: str, document_id: str) -> str:
    """Storage key for the chunked output — read directly by find_statements."""
    return f"{upload_doc_prefix(project_id, document_id)}/chunks.json"


def upload_extracted_key(project_id: str, document_id: str) -> str:
    """Storage key for the ExtractedDocument JSON written by the upload pipeline."""
    return f"{upload_doc_prefix(project_id, document_id)}/extracted.json"


def upload_analysis_key(project_id: str, document_id: str) -> str:
    """Storage key for the cached DocumentSummary (generic per upload)."""
    return f"{upload_doc_prefix(project_id, document_id)}/analysis.json"


def upload_doc_id(project_id: str, document_id: str) -> str:
    """Composite doc_id stored on every IndexChunk for an uploaded document."""
    return f"{SOURCE}:{project_id}:{document_id}"  # noqa: E231


def parse_upload_blob_path(blob_path: str) -> tuple[str, str, str]:
    """
    Parse a blob path into (project_id, document_id, filename).

    Expected shape: uploads/{project_id}/documents/{document_id}/{filename}
    (typically the filename is "original.pdf" but anything goes).

    Raises ValueError if the path doesn't match the expected layout.
    """
    parts = blob_path.strip("/").split("/")
    if len(parts) < 5 or parts[0] != "uploads" or parts[2] != "documents":
        raise ValueError(
            f"Unexpected upload blob path layout: {blob_path!r}. "
            f"Expected: uploads/{{project_id}}/documents/{{document_id}}/{{filename}}"
        )
    project_id, document_id = parts[1], parts[3]
    _validate_id("project_id", project_id)
    _validate_id("document_id", document_id)
    return project_id, document_id, "/".join(parts[4:])


__all__ = [
    "SOURCE",
    "upload_doc_prefix",
    "upload_chunks_key",
    "upload_extracted_key",
    "upload_analysis_key",
    "upload_doc_id",
    "parse_upload_blob_path",
]
