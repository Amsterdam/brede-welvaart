from __future__ import annotations

from src.utils import azure_utils


def test_azure_client_uses_api_key_auth_when_configured(monkeypatch):
    captured = {}

    def fake_azure_openai(**kwargs):
        captured.update(kwargs)
        return object()

    monkeypatch.setattr(azure_utils, "AzureOpenAI", fake_azure_openai)
    monkeypatch.setenv("FOUNDRY_ENDPOINT", "https://example.openai.azure.com/")
    monkeypatch.setenv("FOUNDRY_API_VERSION", "2024-12-01-preview")
    monkeypatch.setenv("FOUNDRY_AUTH_MODE", "api_key")
    monkeypatch.setenv("FOUNDRY_API_KEY", "test-key")

    client = azure_utils.AzureClient()

    assert client.auth_mode == "api_key"
    assert captured["azure_endpoint"] == "https://example.openai.azure.com/"
    assert captured["api_version"] == "2024-12-01-preview"
    assert captured["api_key"] == "test-key"
    assert "azure_ad_token_provider" not in captured


def test_azure_client_defaults_to_managed_identity(monkeypatch):
    captured = {}

    def fake_azure_openai(**kwargs):
        captured.update(kwargs)
        return object()

    monkeypatch.setattr(azure_utils, "AzureOpenAI", fake_azure_openai)
    monkeypatch.setenv("FOUNDRY_ENDPOINT", "https://example.openai.azure.com/")
    monkeypatch.setenv("FOUNDRY_API_VERSION", "2024-12-01-preview")
    monkeypatch.delenv("FOUNDRY_AUTH_MODE", raising=False)
    monkeypatch.delenv("FOUNDRY_API_KEY", raising=False)
    monkeypatch.delenv("AZURE_OPENAI_API_KEY", raising=False)

    client = azure_utils.AzureClient()

    assert client.auth_mode == "managed_identity"
    assert captured["azure_endpoint"] == "https://example.openai.azure.com/"
    assert captured["api_version"] == "2024-12-01-preview"
    assert captured["azure_ad_token_provider"] is azure_utils._token_provider
    assert "api_key" not in captured
