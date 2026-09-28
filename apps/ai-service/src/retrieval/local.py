"""
Local retriever module.

Uses a SentenceTransformer model running locally to embed documents and queries.
Inherits indexing and retrieval from BaseRetriever.

Example Usage:
    retriever = LocalRetriever(
        collection_prefix="collections/best_chunks",
        storage=storage,
        model_name="intfloat/multilingual-e5-large",
    )
    retriever.build_index()
    results = retriever.retrieve("effects on housing")
"""
import logging

from sentence_transformers import SentenceTransformer
from src.retrieval.base import BaseRetriever
from src.storage import Storage

logger = logging.getLogger(__name__)

_DEFAULT_MODEL = "intfloat/multilingual-e5-large"


class LocalRetriever(BaseRetriever):
    """Retriever using a local SentenceTransformer model."""

    def __init__(
        self,
        collection_prefix: str,
        storage: Storage,
        model_name: str = _DEFAULT_MODEL,
        store_prefix: str = "embeddings/summaries",
        trust_remote_code: bool = True,
    ):
        """
        Initialize local retriever.

        Args:
            collection_prefix: Storage prefix for IndexChunk JSON files to index.
            storage:           Storage backend for both collection input and embedding cache.
            model_name:        HuggingFace model name or path.
            store_prefix:      Storage prefix to save/load embeddings.
            trust_remote_code: Whether to trust remote code for custom models.
        """
        super().__init__(
            model_name=model_name,
            collection_prefix=collection_prefix,
            storage=storage,
            store_prefix=store_prefix,
        )
        logger.info("Loading local embedding model: %s", model_name)
        self.model = SentenceTransformer(model_name, trust_remote_code=trust_remote_code)
        logger.info("Loaded SentenceTransformer model: %s", model_name)

    def _embed_documents(self, texts: list[str]) -> list[list[float]]:
        """Embed a whole list of passed docs at once"""
        return self.model.encode(texts, convert_to_numpy=True, show_progress_bar=True).tolist()

    def _embed_query(self, text: str) -> list[float]:
        """Embed a single query text"""
        return self.model.encode(text, convert_to_numpy=True).tolist()
