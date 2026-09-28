"""Currently support for Azure Foundry deployments and local models via Sentence Transformers."""
from .azure import AzureRetriever
from .base import BaseRetriever
from .local import LocalRetriever
from .retriever_router import RetrieverRouter

__all__ = ["BaseRetriever", "AzureRetriever", "LocalRetriever", "RetrieverRouter"]
