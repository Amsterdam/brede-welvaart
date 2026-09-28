"""
Functionality for routing to different LLMs.
Currently supports Azure deployments, HuggingFace models, and vLLM inference.
vLLM is now the default provider for local models with H100-optimized profiles.

Usage Examples:
    model = LLMRouter.get_model(model_name="llama-3.1-8b-instruct")  # Uses vLLM by default
    model = LLMRouter.get_model(provider="huggingface", model_name="falcon-7b")  # Explicit HF
    model = LLMRouter.get_model(provider="azure", model_name="gpt-4")  # Azure Foundry
"""

import logging

from src.llms.azure import AzureLLM
from src.llms.base import BaseLLM
from src.utils.azure_utils import AzureClient

logger = logging.getLogger(__name__)


class LLMRouter:
    """Route LLMs depending on model and desired provider."""

    @staticmethod
    def get_model(
        model_name: str,
        provider: str | None = None,  # Now optional - defaults to vLLM for local models
        # Azure-specific
        azure_client: AzureClient | None = None,
        # HF-specific
        hf_token: str | None = None,
        hf_cache: str | None = None,
        params: dict | None = None,
        uses_api: bool | None = None,  # Auto-detected based on provider
    ) -> BaseLLM:
        """Get corresponding LLM instance based on model name and optional provider.

        Args:
            model_name (str): The name of the model to load.
            provider (str, optional): The provider of the model.
                Supported: "azure" only (might add "huggingface", "vllm").
            azure_client: AzureClient instance for Azure LLM calls.
                If not provided, will attempt to create one using environment variables.
            hf_token (str, optional): The Hugging Face token for accessing private models.
            hf_cache (str, optional): Path to the local cache for Hugging Face models.
            params (dict, optional): Additional parameters for the model.
            uses_api (bool, optional): Whether the model uses an API. Auto-detected if None.
            tensor_parallel_size (int, optional): Number of GPUs for tensor parallelism.
            trust_remote_code (bool, optional): Whether to trust remote code.

        Returns:
            An instance of `AzureLLM` (or `HuggingFaceLLM`, or `VLLMLlm` in the future)

        Raises:
            NotImplementedError: If an unsupported model is requested on Azure.
            ValueError: If an unknown provider is specified.
        """
        logger.info("Getting a model. Provider: %s. Model: %s", provider, model_name)

        if provider == "azure":
            return AzureLLM(
                model_name=model_name,
                azure_client=azure_client or AzureClient(),
                params=params,
                uses_api=uses_api,
            )

        else:
            raise ValueError(
                f"Unknown provider specified ({provider})." "Current support for azure only"
            )
