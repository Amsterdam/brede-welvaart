"""Handles Azure connections and utilities for the AI service."""

import logging
import os
from dataclasses import dataclass
from enum import Enum

from azure.identity import DefaultAzureCredential
from azure.keyvault.secrets import SecretClient
from dotenv import load_dotenv
from openai import AzureOpenAI

logger = logging.getLogger(__name__)

logger.info("Loading environment")
load_dotenv()
load_dotenv(".env.local", override=True)

# Scope for Azure Cognitive Services (Foundry / Azure OpenAI).
_COGNITIVE_SERVICES_SCOPE = "https://cognitiveservices.azure.com/.default"
_FOUNDRY_AUTH_MODE_MANAGED_IDENTITY = "managed_identity"
_FOUNDRY_AUTH_MODE_API_KEY = "api_key"
_FOUNDRY_AUTH_MODES = {
    _FOUNDRY_AUTH_MODE_MANAGED_IDENTITY,
    _FOUNDRY_AUTH_MODE_API_KEY,
}
_AZURITE_CONNECTION_MARKERS = (
    "devstoreaccount1",
    "usedevelopmentstorage=true",
    "localhost",
    "127.0.0.1",
    "azurite",
)


def _is_local_debug() -> bool:
    return os.getenv("AISERVICE_DEBUG", "false").lower() == "true"


def _build_azure_credential() -> DefaultAzureCredential:
    """
    Build the shared Azure SDK credential.

    DefaultAzureCredential is the right primitive for AKS and local dev, but its
    full developer chain probes optional tools such as PowerShell and brokered
    login. Excluding those keeps Linux/container logs clean while preserving the
    useful credentials: environment, workload identity, managed identity, Azure
    CLI and Azure Developer CLI.
    """
    options = {
        "exclude_powershell_credential": True,
        "exclude_visual_studio_code_credential": True,
        "exclude_shared_token_cache_credential": True,
        "exclude_interactive_browser_credential": True,
        "exclude_broker_credential": True,
    }

    if _is_local_debug():
        # Local development should use env vars, `az login`, or `azd auth login`.
        # Avoid managed identity probes against IMDS on developer machines.
        options.update(
            {
                "exclude_workload_identity_credential": True,
                "exclude_managed_identity_credential": True,
            }
        )

    logger.info("Using DefaultAzureCredential for Azure SDK auth")
    return DefaultAzureCredential(**options)


azure_credential = _build_azure_credential()


def _token_provider() -> str:
    return azure_credential.get_token(_COGNITIVE_SERVICES_SCOPE).token


def _normalize_foundry_auth_mode(auth_mode: str) -> str:
    auth_mode = auth_mode.strip().lower()
    if auth_mode not in _FOUNDRY_AUTH_MODES:
        supported = ", ".join(sorted(_FOUNDRY_AUTH_MODES))
        raise EnvironmentError(
            f"Unsupported FOUNDRY_AUTH_MODE '{auth_mode}'. Expected one of: {supported}."
        )
    return auth_mode


def _foundry_auth_mode() -> str:
    return _normalize_foundry_auth_mode(
        os.getenv(
            "FOUNDRY_AUTH_MODE",
            _FOUNDRY_AUTH_MODE_MANAGED_IDENTITY,
        )
    )


def _foundry_api_key() -> str | None:
    return os.getenv("FOUNDRY_API_KEY") or os.getenv("AZURE_OPENAI_API_KEY")


def get_azure_secrets():
    logging.info("Getting azure secrets")

    # TODO: implement support for different endpoints (e.g. openai + mistral) # noqa: T101
    api_endpoint = os.getenv("FOUNDRY_ENDPOINT")
    api_version = os.getenv("FOUNDRY_API_VERSION")
    auth_mode = _foundry_auth_mode()

    return {
        "API_ENDPOINT": api_endpoint,
        "API_VERSION": api_version,
        "AUTH_MODE": auth_mode,
        "API_KEY": _foundry_api_key(),
        "TOKEN_PROVIDER": (
            _token_provider
            if auth_mode == _FOUNDRY_AUTH_MODE_MANAGED_IDENTITY
            else None
        ),
    }


def _is_azurite_connection_string(connection_string: str | None) -> bool:
    if not connection_string:
        return False
    value = connection_string.lower()
    return any(marker in value for marker in _AZURITE_CONNECTION_MARKERS)


class StorageAuth(str, Enum):
    """How AzureBlobStorage should authenticate to blob storage."""

    CONNECTION_STRING = "connection_string"  # Azurite or a real account key
    MANAGED_IDENTITY = "managed_identity"  # account URL + DefaultAzureCredential


@dataclass(frozen=True)
class AzureStorageConfig:
    """Resolved blob-storage connection settings."""

    auth: StorageAuth
    connection_string: str | None = None
    account_url: str | None = None
    is_azurite: bool = False


def get_azure_storage_config() -> AzureStorageConfig:
    """
    Decide how to reach blob storage from the environment.

    A connection string wins and authenticates with its embedded key — this
    covers both Azurite (flagged via ``is_azurite``) and a real account key.
    Otherwise an account URL authenticates with managed identity
    (DefaultAzureCredential), which is the path used on AKS.
    """
    connection_string = os.getenv("AZURE_STORAGE_CONNECTION_STRING")
    if connection_string:
        return AzureStorageConfig(
            auth=StorageAuth.CONNECTION_STRING,
            connection_string=connection_string,
            is_azurite=_is_azurite_connection_string(connection_string),
        )

    account_url = os.getenv("AZURE_STORAGE_ACCOUNT_BLOB_ENDPOINT") or os.getenv(
        "AZURE_STORAGE_ACCOUNT_URL"
    )
    if account_url:
        return AzureStorageConfig(
            auth=StorageAuth.MANAGED_IDENTITY,
            account_url=account_url,
        )

    raise EnvironmentError(
        "Configure blob storage with AZURE_STORAGE_CONNECTION_STRING (Azurite or "
        "a real account key) or AZURE_STORAGE_ACCOUNT_BLOB_ENDPOINT / "
        "AZURE_STORAGE_ACCOUNT_URL (managed identity)."
    )


class KeyVault:
    """Connect to the key vault using uri and DefaultAzureCredential"""

    def __init__(self, kv_uri, credential):
        self.keyvault_client = SecretClient(vault_url=kv_uri, credential=credential)

    def get_secret(self, secret_name):
        """Get a secret out of the vault given its name"""
        retrieved_secret = self.keyvault_client.get_secret(secret_name)
        return retrieved_secret.value


class AzureClient:
    """Azure OpenAI client wrapper to handle authentication and requests."""

    def __init__(
        self,
        api_endpoint=None,
        token_provider=None,
        api_version=None,
        api_key=None,
        auth_mode=None,
    ):
        self.reset_credentials(api_endpoint, token_provider, api_version, api_key, auth_mode)

    def _get_client(self):
        client_args = {
            "azure_endpoint": self.api_endpoint,
            "api_version": self.api_version,
        }
        if self.auth_mode == _FOUNDRY_AUTH_MODE_API_KEY:
            client_args["api_key"] = self.api_key
            logger.info("Initialized Azure OpenAI client using api_key auth")
        else:
            client_args["azure_ad_token_provider"] = self.token_provider
            logger.info("Initialized Azure OpenAI client using managed_identity auth")

        client = AzureOpenAI(**client_args)
        return client

    @staticmethod
    def _missing_credentials(
        api_endpoint,
        api_version,
        auth_mode,
        api_key,
        token_provider,
    ):
        missing = []
        if not api_endpoint:
            missing.append("FOUNDRY_ENDPOINT")
        if not api_version:
            missing.append("FOUNDRY_API_VERSION")
        if auth_mode == _FOUNDRY_AUTH_MODE_API_KEY:
            if not api_key:
                missing.append("FOUNDRY_API_KEY")
        elif not token_provider:
            missing.append("TOKEN_PROVIDER")
        return missing

    def reset_credentials(
        self,
        api_endpoint=None,
        token_provider=None,
        api_version=None,
        api_key=None,
        auth_mode=None,
    ):
        """
        Reset Azure credentials and the client,
        either by fetching new ones or using provided ones.
        """
        logging.info("Resetting Azure credentials.")

        if auth_mode is None and api_key and not token_provider:
            auth_mode = _FOUNDRY_AUTH_MODE_API_KEY
        if auth_mode is not None:
            auth_mode = _normalize_foundry_auth_mode(auth_mode)

        missing = self._missing_credentials(
            api_endpoint,
            api_version,
            auth_mode or _FOUNDRY_AUTH_MODE_MANAGED_IDENTITY,
            api_key,
            token_provider,
        )
        if missing:
            credentials = get_azure_secrets()
            api_endpoint = api_endpoint or credentials["API_ENDPOINT"]
            api_version = api_version or credentials["API_VERSION"]
            auth_mode = auth_mode or credentials["AUTH_MODE"]
            api_key = api_key or credentials["API_KEY"]
            token_provider = token_provider or credentials["TOKEN_PROVIDER"]

            missing = self._missing_credentials(
                api_endpoint,
                api_version,
                auth_mode,
                api_key,
                token_provider,
            )
            if missing:
                raise EnvironmentError(f"Missing required env vars: {missing}")

        self.api_endpoint = api_endpoint
        self.auth_mode = auth_mode or _FOUNDRY_AUTH_MODE_MANAGED_IDENTITY
        self.api_key = api_key
        self.token_provider = token_provider
        self.api_version = api_version
        self.client = self._get_client()
