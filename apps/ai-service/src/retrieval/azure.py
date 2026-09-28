"""
Azure retriever module.

Uses Azure OpenAI embeddings to embed documents and queries.
Inherits indexing and retrieval from BaseRetriever.

Usage:
    retriever = AzureRetriever(
        collection_prefix="collections/best_chunks",
        storage=storage,
        deployment_name="text-embedding-3-small",
    )
    retriever.build_index()
    results = retriever.retrieve("effects on housing")
"""
import logging
import re
import time

from openai import APIConnectionError, BadRequestError, RateLimitError
from src.retrieval.base import BaseRetriever
from src.storage import Storage
from src.utils.azure_utils import AzureClient
from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_exponential

logger = logging.getLogger(__name__)

_DEFAULT_MODEL = "text-embedding-3-small"
_BATCH_SIZE = 512
_BATCH_SLEEP = 0.5  # seconds between batches

# Azure has two distinct 400s we need to handle:
#   1. Per-input limit: a single input > 8192 tokens. Error names the offender
#      as 'input[N]' - we drop that one and retry.
#   2. Per-request limit: total tokens across all inputs > 300,000. Error
#      string has no index; we split the batch in half and recurse.
_INPUT_INDEX_RE = re.compile(r"input\[(\d+)\]")
_REQUEST_TOO_BIG_HINTS = ("maximum request size", "max request size")


class AzureRetriever(BaseRetriever):
    """Retriever using Azure OpenAI embeddings."""

    def __init__(
        self,
        collection_prefix: str,
        storage: Storage,
        deployment_name: str = _DEFAULT_MODEL,
        store_prefix: str = "embeddings/summaries",
        azure_client: AzureClient | None = None,
        dimensions: int | None = None,
    ):
        """
        Initialize Azure retriever.

        Credentials can be passed explicitly or via environment variables
        (AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_API_KEY).

        Args:
            collection_prefix: Storage prefix for IndexChunk JSON files to index.
            storage:           Storage backend for both collection input and embedding cache.
            deployment_name:   Name of the Azure OpenAI embedding model deployment.
            store_prefix:      Storage prefix to save/load embeddings.
            azure_client:      Optional explicit AzureClient.
            dimensions:        Optional output dimensions. Supported by text-embedding-3-*
                               models; truncates the embedding to the requested size
                               (1536 -> 512 cuts memory ~3x with ~1-2% MTEB quality drop).
                               When set, the cache dir gets a "-d{dimensions}" suffix so
                               new runs don't collide with existing full-dim caches.
        """
        storage_model_name = (
            deployment_name if dimensions is None else f"{deployment_name}-d{dimensions}"
        )
        super().__init__(
            model_name=storage_model_name,
            collection_prefix=collection_prefix,
            storage=storage,
            store_prefix=store_prefix,
        )
        self.deployment_name = deployment_name
        self.dimensions = dimensions
        self.azure_client = azure_client or AzureClient()
        logger.info(
            "Initialized Azure OpenAI embeddings client: %s%s",
            deployment_name,
            f" (dimensions={dimensions})" if dimensions is not None else "",
        )

    def _embed_documents(self, texts: list[str]) -> list[list[float] | None]:
        """
        Embed all texts. Slots Azure rejects as oversize come back as None - the
        caller (BaseRetriever._embed_new_docs) skips any doc that has a None
        chunk so we don't write a misaligned .npy.
        """
        embeddings: list[list[float] | None] = []
        batches = [texts[i : i + _BATCH_SIZE] for i in range(0, len(texts), _BATCH_SIZE)]
        for i, batch in enumerate(batches):
            logger.info("Embedding batch %d/%d", i + 1, len(batches))
            embeddings.extend(self._embed_batch_safe(batch))
            if i < len(batches) - 1:
                time.sleep(_BATCH_SLEEP)
        return embeddings

    def _embed_batch_safe(self, batch: list[str]) -> list[list[float] | None]:
        """
        Submit batch with adaptive recovery on the two Azure 400s:

          - input[N] too big: drop input N (leaves None in that slot), retry rest.
          - total request too big: split pending list in half, recurse, merge.
        """
        result: list[list[float] | None] = [None] * len(batch)
        pending = list(enumerate(batch))  # (original_idx, text)
        self._embed_pending(pending, result)
        return result

    def _embed_pending(
        self,
        pending: list[tuple[int, str]],
        result: list[list[float] | None],
    ) -> None:
        """Populate result[orig_idx] for each entry in pending. Skipped slots stay None."""
        while pending:
            try:
                embeddings = self._embed_with_retry([t for _, t in pending])
                for (orig_idx, _), vec in zip(pending, embeddings):
                    result[orig_idx] = vec
                return
            except BadRequestError as e:
                err = str(e)
                match = _INPUT_INDEX_RE.search(err)
                if match:
                    pending = self._drop_bad_input(pending, int(match.group(1)), e)
                    continue
                if any(hint in err for hint in _REQUEST_TOO_BIG_HINTS):
                    self._split_and_recurse(pending, result, e)
                    return
                raise  # unknown 400 - propagate

    @staticmethod
    def _drop_bad_input(
        pending: list[tuple[int, str]],
        bad_local: int,
        error: BadRequestError,
    ) -> list[tuple[int, str]]:
        """Drop the input named in the 400 from pending; return the rest."""
        if bad_local >= len(pending):
            raise error  # error index out of range, shouldn't happen
        orig_idx, bad_text = pending[bad_local]
        logger.warning(
            "Azure rejected chunk (chars=%d, original_idx=%d); skipping. Error: %s",
            len(bad_text),
            orig_idx,
            error,
        )
        return pending[:bad_local] + pending[bad_local + 1 :]

    def _split_and_recurse(
        self,
        pending: list[tuple[int, str]],
        result: list[list[float] | None],
        error: BadRequestError,
    ) -> None:
        """Halve pending and recurse on each half. Bail if pending is a single input."""
        if len(pending) <= 1:
            # A single input shouldn't trip the request-size limit (it'd hit
            # the per-input limit first). Bail to avoid an infinite loop.
            raise error
        mid = len(pending) // 2
        logger.warning(
            "Azure rejected batch of %d (total tokens > limit); "
            "splitting %d / %d and retrying. Error: %s",
            len(pending),
            mid,
            len(pending) - mid,
            error,
        )
        self._embed_pending(pending[:mid], result)
        self._embed_pending(pending[mid:], result)

    def _embeddings_kwargs(self, texts: list[str]) -> dict:
        """Build embeddings.create kwargs, including dimensions if configured."""
        kwargs = {"input": texts, "model": self.deployment_name}
        if self.dimensions is not None:
            kwargs["dimensions"] = self.dimensions
        return kwargs

    @retry(
        retry=retry_if_exception_type((RateLimitError, APIConnectionError)),
        wait=wait_exponential(multiplier=1, min=2, max=120),
        stop=stop_after_attempt(5),
    )
    def _embed_with_retry(self, texts: list[str]) -> list[list[float]]:
        response = self.azure_client.client.embeddings.create(**self._embeddings_kwargs(texts))
        return [item.embedding for item in response.data]

    def _embed_query(self, text: str) -> list[float]:
        """Embed a single query text"""
        response = self.azure_client.client.embeddings.create(**self._embeddings_kwargs([text]))
        return response.data[0].embedding
