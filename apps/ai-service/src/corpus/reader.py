"""
Read corpus content (AssembledDocument) by doc_id.

Symmetric counterpart to src.preprocessing.upload.UploadProcessor:
  - UploadProcessor: lazy-extract one uploaded blob -> ExtractedDocument
  - CorpusReader: load one assembled corpus article -> AssembledDocument

Source-agnostic: doc_id is "{source}:{article_id}" (e.g. "openresearch:15907").
A per-source prefix mapping tells the reader where each source's assembled
artifacts live. Adding a new source (e.g. raadsinformatie) = add an entry to
the mapping, no code change.
"""

from __future__ import annotations

import logging

from src.storage import Storage
from src.utils.schemas import AssembledDocument

logger = logging.getLogger(__name__)


class CorpusReader:
    """
    Resolve doc_id -> AssembledDocument from the storage layout written by the
    pipeline's assembler step.

    Path layout per source: {prefixes[source]}/{article_id}/meta.json, where
    meta.json is the pydantic-serialized AssembledDocument.
    """

    def __init__(self, storage: Storage, prefixes: dict[str, str]):
        if not prefixes:
            raise ValueError("CorpusReader requires at least one source prefix")
        self.storage = storage
        self.prefixes = {k: v.rstrip("/") for k, v in prefixes.items()}

    def load_assembled(self, doc_id: str) -> AssembledDocument:
        """
        Load the AssembledDocument for a given doc_id.

        Raises ValueError if the doc_id has no source prefix, the source is not
        configured, or no meta.json exists at the resolved path.
        """
        if ":" not in doc_id:
            raise ValueError(
                "doc_id must have the form '{source}:{article_id}', "  # noqa: E231
                f"got {doc_id!r}"
            )
        source, article_id = doc_id.split(":", 1)
        prefix = self.prefixes.get(source)
        if prefix is None:
            raise ValueError(
                f"No assembled-prefix configured for source {source!r} "
                f"(configured sources: {sorted(self.prefixes.keys())})"
            )
        meta_key = f"{prefix}/{article_id}/meta.json"
        if not self.storage.exists(meta_key):
            raise ValueError(f"No assembled document found at {meta_key}")
        return AssembledDocument.model_validate_json(
            self.storage.read_file(meta_key).decode("utf-8")
        )
