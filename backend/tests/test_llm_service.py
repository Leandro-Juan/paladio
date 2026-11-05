import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from app.services.llm_service import (
    LLMService,
    LLMConfig,
    mask_api_key,
)
from pydantic_ai.models.openai import OpenAIChatModel
from pydantic_ai.models.anthropic import AnthropicModel
from pydantic_ai.models.google import GoogleModel
from pydantic_ai.models.ollama import OllamaModel


def test_mask_api_key():
    assert mask_api_key(None) is None
    assert mask_api_key("") is None
    assert mask_api_key("short") == "******"
    assert mask_api_key("sk-123456") == "sk...56"
    assert mask_api_key("sk-proj-1234567890abcdef") == "sk-p...cdef"


def test_create_model_all_providers():
    # OpenAI
    cfg_openai = LLMConfig(provider="openai", model="gpt-4o", api_key="sk-test-key")
    m_openai = LLMService.create_model(cfg_openai)
    assert isinstance(m_openai, OpenAIChatModel)

    # Anthropic
    cfg_anthropic = LLMConfig(
        provider="anthropic", model="claude-3-5-sonnet-latest", api_key="sk-ant-test"
    )
    m_anthropic = LLMService.create_model(cfg_anthropic)
    assert isinstance(m_anthropic, AnthropicModel)

    # Google
    cfg_google = LLMConfig(
        provider="google", model="gemini-3.8-flash", api_key="AIza-test"
    )
    m_google = LLMService.create_model(cfg_google)
    assert isinstance(m_google, GoogleModel)

    # Groq (OpenAI-compatible)
    cfg_groq = LLMConfig(
        provider="groq", model="llama-3.3-70b-versatile", api_key="gsk-test"
    )
    m_groq = LLMService.create_model(cfg_groq)
    assert isinstance(m_groq, OpenAIChatModel)

    # DeepSeek
    cfg_ds = LLMConfig(provider="deepseek", model="deepseek-chat", api_key="sk-ds-test")
    m_ds = LLMService.create_model(cfg_ds)
    assert isinstance(m_ds, OpenAIChatModel)

    # Mistral
    cfg_mistral = LLMConfig(
        provider="mistral", model="mistral-large-latest", api_key="sk-mis-test"
    )
    m_mistral = LLMService.create_model(cfg_mistral)
    assert isinstance(m_mistral, OpenAIChatModel)

    # OpenRouter
    cfg_or = LLMConfig(
        provider="openrouter", model="anthropic/claude-3.5-sonnet", api_key="sk-or-test"
    )
    m_or = LLMService.create_model(cfg_or)
    assert isinstance(m_or, OpenAIChatModel)

    # Ollama
    cfg_ollama = LLMConfig(provider="ollama", model="qwen2.5:3b")
    m_ollama = LLMService.create_model(cfg_ollama)
    assert isinstance(m_ollama, OllamaModel)

    # Custom OpenAI compatible
    cfg_custom = LLMConfig(
        provider="custom_openai",
        model="local-model",
        base_url="http://localhost:8000/v1",
    )
    m_custom = LLMService.create_model(cfg_custom)
    assert isinstance(m_custom, OpenAIChatModel)


def test_missing_api_key_raises_error():
    cfg = LLMConfig(provider="openai", model="gpt-4o", api_key=None)
    with pytest.raises(ValueError, match="OpenAI API key is required"):
        LLMService.create_model(cfg)

    cfg_ant = LLMConfig(
        provider="anthropic", model="claude-3-5-sonnet-latest", api_key=None
    )
    with pytest.raises(ValueError, match="Anthropic API key is required"):
        LLMService.create_model(cfg_ant)

    cfg_g = LLMConfig(provider="google", model="gemini-1.5-flash", api_key=None)
    with pytest.raises(ValueError, match="Google Gemini API key is required"):
        LLMService.create_model(cfg_g)


@pytest.mark.asyncio
async def test_test_connection_success():
    with patch(
        "app.services.llm_service.Agent.run", new_callable=AsyncMock
    ) as mock_run:
        mock_result = MagicMock()
        mock_result.output = "OK"
        mock_run.return_value = mock_result

        result = await LLMService.test_connection(
            provider="openai",
            model="gpt-4o-mini",
            api_key="sk-test-key",
        )
        assert result["success"] is True
        assert result["response"] == "OK"
        assert result["provider"] == "openai"


@pytest.mark.asyncio
async def test_test_connection_failure():
    result = await LLMService.test_connection(
        provider="openai",
        model="gpt-4o-mini",
        api_key="",  # Missing key triggers validation error
    )
    assert result["success"] is False
    assert "required" in result["error"].lower()


def test_default_is_local_ollama_without_api_key():
    with patch.dict("os.environ", {}, clear=True):
        LLMService._cached_config = None
        cfg = LLMService.get_fallback_config()
        assert cfg.provider == "ollama"
        assert "qwen" in cfg.model.lower()

        model = LLMService.get_model()
        assert isinstance(model, OllamaModel)


def test_configured_api_key_dispatches_ollama():
    with patch.dict("os.environ", {"OPENAI_API_KEY": "sk-test-live"}, clear=True):
        LLMService._cached_config = None
        cfg = LLMService.get_fallback_config()
        assert cfg.provider == "openai"
        assert cfg.api_key == "sk-test-live"

        model = LLMService.get_model()
        assert isinstance(model, OpenAIChatModel)


def test_unconfigured_cloud_provider_falls_back_to_ollama():
    LLMService._cached_config = None
    cfg = LLMConfig(
        provider="anthropic", model="claude-3-5-sonnet-latest", api_key=None
    )
    model = LLMService.get_model(config=cfg)
    assert isinstance(model, OllamaModel)
