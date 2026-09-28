"""
Currently we support only Azure (foundry) deployments of models.
In the future, we can also add support for HuggingFace models and other providers.
Hense, a dedicated LLMRouter can be used to instantiate the corresponding LLMs.

LLMs take a prompt as input and optionally a system prompt or context and
return a response in the form of a string (excluding original prompt or special tokens).
"""
from .azure import AzureLLM
from .base import BaseLLM
from .model_router import LLMRouter

__all__ = ["BaseLLM", "AzureLLM", "LLMRouter"]
