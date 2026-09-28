"""
Functionality for routing to different embedding and retrieval models.
Currently supports Azure OpenAI embeddings and local embeddings.

Usage Examples:
    retriever = RetrieverRouter.get_retriever(
        provider="azure",
        collection_prefix="collections/summaries",
        storage=storage,
        model_name="text-embedding-3-small",
    )
    retriever = RetrieverRouter.get_retriever(
        provider="local",
        collection_prefix="collections/summaries",
        storage=storage,
        model_name="intfloat/multilingual-e5-large",
    )
"""
import logging

from src.retrieval import AzureRetriever, BaseRetriever, LocalRetriever
from src.storage import Storage
from src.utils.azure_utils import AzureClient

logging.basicConfig(level=logging.INFO)

logger = logging.getLogger(__name__)


class RetrieverRouter:
    """Route to different retrieval backends depending on provider and model."""

    @staticmethod
    def get_retriever(
        model_name: str,
        provider: str,
        collection_prefix: str,
        storage: Storage,
        store_prefix: str = "embeddings/summaries",
        # Azure-specific
        azure_client: AzureClient | None = None,
        dimensions: int | None = None,
    ) -> BaseRetriever:
        """
        Get a retriever instance for the given provider and model.

        Args:
            provider:          Embedding backend to use. Supported: "azure", "local".
            collection_prefix: Storage prefix for IndexChunk JSON files to index.
            storage:           Storage backend.
            model_name:        Name of the embedding model or Azure deployment.
            store_prefix:      Storage prefix to save/load embeddings.
            azure_client:      AzureClient instance for Azure retriever.
            dimensions:        Optional output dim for text-embedding-3-* models. When
                               set, cache dir gets "-d{dimensions}" suffix so smaller
                               embeds don't collide with existing full-dim caches.
                               Ignored by the local provider.
        """
        logger.info(
            "Getting retriever. Provider: %s. Model: %s%s",
            provider,
            model_name,
            f" (dimensions={dimensions})" if dimensions is not None else "",
        )

        if provider == "azure":
            return AzureRetriever(
                collection_prefix=collection_prefix,
                storage=storage,
                deployment_name=model_name,
                azure_client=azure_client,
                store_prefix=store_prefix,
                dimensions=dimensions,
            )

        if provider == "local":
            return LocalRetriever(
                collection_prefix=collection_prefix,
                storage=storage,
                model_name=model_name,
                store_prefix=store_prefix,
            )

        raise ValueError(f"Unknown provider '{provider}'. Supported providers: 'azure' & 'local'.")
