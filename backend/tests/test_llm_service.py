from contextlib import asynccontextmanager
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest
from pydantic_ai.models.anthropic import AnthropicModel
from pydantic_ai.models.cerebras import CerebrasModel
from pydantic_ai.models.google import GoogleModel
from pydantic_ai.models.ollama import OllamaModel
from pydantic_ai.models.openai import OpenAIChatModel
from pydantic_ai.models.openrouter import OpenRouterModel
from pydantic_ai.providers.anthropic import AnthropicProvider
from pydantic_ai.providers.cerebras import CerebrasProvider
from pydantic_ai.providers.deepseek import DeepSeekProvider
from pydantic_ai.providers.google import GoogleProvider
from pydantic_ai.providers.ollama import OllamaProvider
from pydantic_ai.providers.openai import OpenAIProvider
from pydantic_ai.providers.openai_compatible import OpenAICompatibleProvider
from pydantic_ai.providers.openrouter import OpenRouterProvider
from pydantic_ai.providers.together import TogetherProvider

from app.services.llm_service import (
    LLMConfig,
    LLMService,
    SUPPORTED_PROVIDERS,
    mask_api_key,
)


class _FakeAsyncSession:
    """In-memory AsyncSession stub for SystemConfigModel persistence tests."""

    def __init__(self, initial_record=None):
        self.record = initial_record

    async def execute(self, _stmt):
        res = MagicMock()
        res.scalar_one_or_none.return_value = self.record
        return res

    def add(self, obj):
        self.record = obj

    async def commit(self):
        return None

    async def refresh(self, _obj):
        return None


def test_mask_api_key():
    assert mask_api_key(None) is None
    assert mask_api_key("") is None
    assert mask_api_key("short") == "******"
    assert mask_api_key("sk-123456") == "sk...56"
    assert mask_api_key("sk-proj-1234567890abcdef") == "sk-p...cdef"


def test_create_model_all_13_providers_and_custom_urls():
    # 1. OpenAI
    m_openai = LLMService.create_model(
        LLMConfig(provider="openai", model="gpt-6.2-sol", api_key="sk-test")
    )
    assert isinstance(m_openai, OpenAIChatModel)
    assert isinstance(m_openai._provider, OpenAIProvider)
    assert m_openai._provider.base_url.rstrip("/") == "https://api.openai.com/v1"
    m_openai_custom = LLMService.create_model(
        LLMConfig(
            provider="openai",
            model="gpt-6.2-sol",
            api_key="sk-test",
            base_url="https://proxy.example.com/v1",
        )
    )
    assert (
        m_openai_custom._provider.base_url.rstrip("/") == "https://proxy.example.com/v1"
    )

    # 2. Anthropic
    m_anthropic = LLMService.create_model(
        LLMConfig(
            provider="anthropic", model="claude-sonnet-5-5", api_key="sk-ant-test"
        )
    )
    assert isinstance(m_anthropic, AnthropicModel)
    assert isinstance(m_anthropic._provider, AnthropicProvider)
    assert m_anthropic._provider.base_url.rstrip("/") == "https://api.anthropic.com"
    m_anthropic_custom = LLMService.create_model(
        LLMConfig(
            provider="anthropic",
            model="claude-sonnet-5-5",
            api_key="sk-ant-test",
            base_url="https://anthropic-proxy.example.com",
        )
    )
    assert (
        m_anthropic_custom._provider.base_url.rstrip("/")
        == "https://anthropic-proxy.example.com"
    )

    # 3. Google Gemini
    m_google = LLMService.create_model(
        LLMConfig(provider="google", model="gemini-3.8-flash", api_key="AIza-test")
    )
    assert isinstance(m_google, GoogleModel)
    assert isinstance(m_google._provider, GoogleProvider)
    assert (
        m_google._provider.base_url.rstrip("/")
        == "https://generativelanguage.googleapis.com"
    )
    m_google_custom = LLMService.create_model(
        LLMConfig(
            provider="google",
            model="gemini-3.8-flash",
            api_key="AIza-test",
            base_url="https://gemini-proxy.example.com",
        )
    )
    assert (
        m_google_custom._provider.base_url.rstrip("/")
        == "https://gemini-proxy.example.com"
    )

    # 4. Groq
    m_groq = LLMService.create_model(
        LLMConfig(provider="groq", model="openai/gpt-oss-120b", api_key="gsk-test")
    )
    assert isinstance(m_groq, OpenAIChatModel)
    assert isinstance(m_groq._provider, OpenAICompatibleProvider)
    assert m_groq._provider.base_url.rstrip("/") == "https://api.groq.com/openai/v1"

    # 5. DeepSeek
    m_ds = LLMService.create_model(
        LLMConfig(provider="deepseek", model="deepseek-flash", api_key="sk-ds-test")
    )
    assert isinstance(m_ds, OpenAIChatModel)
    assert isinstance(m_ds._provider, DeepSeekProvider)
    assert m_ds._provider.base_url.rstrip("/") == "https://api.deepseek.com"
    assert m_ds.profile.get("openai_chat_supports_max_completion_tokens") is False
    m_ds_custom = LLMService.create_model(
        LLMConfig(
            provider="deepseek",
            model="deepseek-flash",
            api_key="sk-ds-test",
            base_url="https://ds-proxy.example.com/v1",
        )
    )
    assert (
        str(m_ds_custom._provider.client.base_url).rstrip("/")
        == "https://ds-proxy.example.com/v1"
    )

    # 6. Mistral
    m_mistral = LLMService.create_model(
        LLMConfig(
            provider="mistral", model="mistral-large-latest", api_key="sk-mis-test"
        )
    )
    assert isinstance(m_mistral, OpenAIChatModel)
    assert isinstance(m_mistral._provider, OpenAICompatibleProvider)
    assert m_mistral._provider.base_url.rstrip("/") == "https://api.mistral.ai/v1"
    assert m_mistral.profile.get("openai_chat_supports_max_completion_tokens") is False
    assert m_mistral.profile.get("tool_call_id_length") == 9

    # 7. OpenRouter
    m_or = LLMService.create_model(
        LLMConfig(provider="openrouter", model="openrouter/auto", api_key="sk-or-test")
    )
    assert isinstance(m_or, OpenRouterModel)
    assert isinstance(m_or._provider, OpenRouterProvider)
    assert m_or._provider.base_url.rstrip("/") == "https://openrouter.ai/api/v1"
    assert m_or.profile.get("openai_chat_supports_max_completion_tokens") is False
    m_or_custom = LLMService.create_model(
        LLMConfig(
            provider="openrouter",
            model="openrouter/auto",
            api_key="sk-or-test",
            base_url="https://or-proxy.example.com/v1",
        )
    )
    assert (
        str(m_or_custom._provider.client.base_url).rstrip("/")
        == "https://or-proxy.example.com/v1"
    )

    # 8. xAI (Grok)
    m_xai = LLMService.create_model(
        LLMConfig(provider="xai", model="grok-4.7", api_key="xai-test")
    )
    assert isinstance(m_xai, OpenAIChatModel)
    assert isinstance(m_xai._provider, OpenAICompatibleProvider)
    assert m_xai._provider.base_url.rstrip("/") == "https://api.x.ai/v1"

    # 9. Perplexity (Orchestrator API)
    m_pplx = LLMService.create_model(
        LLMConfig(provider="perplexity", model="perplexity/auto", api_key="pplx-test")
    )
    assert isinstance(m_pplx, OpenAIChatModel)
    assert isinstance(m_pplx._provider, OpenAICompatibleProvider)
    assert (
        m_pplx._provider.base_url.rstrip("/")
        == "https://api.perplexity.ai/orchestrator/v1"
    )
    assert m_pplx.profile.get("openai_chat_supports_max_completion_tokens") is False

    # 10. Together AI
    m_together = LLMService.create_model(
        LLMConfig(
            provider="together",
            model="deepseek-ai/DeepSeek-V4.1-Flash",
            api_key="tog-test",
        )
    )
    assert isinstance(m_together, OpenAIChatModel)
    assert isinstance(m_together._provider, TogetherProvider)
    assert m_together._provider.base_url.rstrip("/") == "https://api.together.xyz/v1"
    assert m_together.profile.get("openai_chat_supports_max_completion_tokens") is False
    m_together_us = LLMService.create_model(
        LLMConfig(
            provider="together",
            model="deepseek-ai/DeepSeek-V4.1-Flash",
            api_key="tog-test",
            base_url="https://us-api.together.ai/v1",
        )
    )
    assert (
        str(m_together_us._provider.client.base_url).rstrip("/")
        == "https://us-api.together.ai/v1"
    )

    # 11. Cerebras
    m_cerebras = LLMService.create_model(
        LLMConfig(provider="cerebras", model="gpt-oss-120b", api_key="cer-test")
    )
    assert isinstance(m_cerebras, CerebrasModel)
    assert isinstance(m_cerebras._provider, CerebrasProvider)
    assert m_cerebras._provider.base_url.rstrip("/") == "https://api.cerebras.ai/v1"
    m_cerebras_custom = LLMService.create_model(
        LLMConfig(
            provider="cerebras",
            model="gpt-oss-120b",
            api_key="cer-test",
            base_url="https://cer-proxy.example.com/v1",
        )
    )
    assert (
        str(m_cerebras_custom._provider.client.base_url).rstrip("/")
        == "https://cer-proxy.example.com/v1"
    )

    # 12. Custom OpenAI-compatible
    m_custom = LLMService.create_model(
        LLMConfig(
            provider="custom_openai",
            model="local-model",
            base_url="http://localhost:8000/v1",
        )
    )
    assert isinstance(m_custom, OpenAIChatModel)
    assert isinstance(m_custom._provider, OpenAICompatibleProvider)
    assert m_custom._provider.base_url.rstrip("/") == "http://localhost:8000/v1"
    assert m_custom.profile.get("openai_chat_supports_max_completion_tokens") is False

    # 13. Ollama (including optional API key forwarding)
    m_ollama = LLMService.create_model(
        LLMConfig(
            provider="ollama",
            model="qwen2.5:3b",
            api_key="ollama-cloud-token",
            base_url="http://ollama.internal:11434",
        )
    )
    assert isinstance(m_ollama, OllamaModel)
    assert isinstance(m_ollama._provider, OllamaProvider)
    assert m_ollama._provider.base_url.rstrip("/") == "http://ollama.internal:11434/v1"
    assert m_ollama._provider.client.api_key == "ollama-cloud-token"


def test_missing_api_key_raises_error():
    cfg = LLMConfig(provider="openai", model="gpt-6.2-sol", api_key=None)
    with pytest.raises(ValueError, match="OpenAI API key is required"):
        LLMService.create_model(cfg)

    cfg_ant = LLMConfig(provider="anthropic", model="claude-sonnet-5-5", api_key=None)
    with pytest.raises(ValueError, match="Anthropic API key is required"):
        LLMService.create_model(cfg_ant)

    cfg_g = LLMConfig(provider="google", model="gemini-3.8-flash", api_key=None)
    with pytest.raises(ValueError, match="Google Gemini API key is required"):
        LLMService.create_model(cfg_g)


@pytest.mark.parametrize(
    ("env_var", "expected_provider"),
    [
        ("OPENAI_API_KEY", "openai"),
        ("ANTHROPIC_API_KEY", "anthropic"),
        ("GEMINI_API_KEY", "google"),
        ("GOOGLE_API_KEY", "google"),
        ("GROQ_API_KEY", "groq"),
        ("DEEPSEEK_API_KEY", "deepseek"),
        ("MISTRAL_API_KEY", "mistral"),
        ("OPENROUTER_API_KEY", "openrouter"),
        ("XAI_API_KEY", "xai"),
        ("PERPLEXITY_API_KEY", "perplexity"),
        ("TOGETHER_API_KEY", "together"),
        ("CEREBRAS_API_KEY", "cerebras"),
    ],
)
def test_get_fallback_config_all_env_keys(env_var, expected_provider):
    with patch.dict("os.environ", {env_var: "test-secret-key"}, clear=True):
        LLMService._cached_config = None
        cfg = LLMService.get_fallback_config()
        assert cfg.provider == expected_provider
        assert cfg.api_key == "test-secret-key"
        assert cfg.model == SUPPORTED_PROVIDERS[expected_provider]["default_model"]


@pytest.mark.asyncio
async def test_gemini_25_not_rewritten_in_fallback_or_db():
    with patch.dict(
        "os.environ",
        {
            "LLM_PROVIDER": "google",
            "LLM_MODEL": "gemini-2.5-flash",
            "GEMINI_API_KEY": "AIza-test",
        },
        clear=True,
    ):
        cfg = LLMService.get_fallback_config()
        assert cfg.provider == "google"
        assert cfg.model == "gemini-2.5-flash"

    record = SimpleNamespace(
        key="llm_config",
        value={
            "provider": "google",
            "model": "gemini-2.5-flash",
            "api_key": "AIza-db",
            "base_url": None,
        },
    )
    session = _FakeAsyncSession(initial_record=record)
    db_cfg = await LLMService.get_config_from_db(session)
    assert db_cfg.provider == "google"
    assert db_cfg.model == "gemini-2.5-flash"


@pytest.mark.asyncio
async def test_save_config_validation_and_per_provider_persistence():
    session = _FakeAsyncSession()

    with pytest.raises(ValueError, match="Unsupported LLM provider"):
        await LLMService.save_config(session, "unknown_vendor", "some-model")

    with pytest.raises(ValueError, match="Model identifier cannot be empty"):
        await LLMService.save_config(session, "ollama", "   ")

    with pytest.raises(ValueError, match="API key is required"):
        with patch.dict("os.environ", {}, clear=True):
            await LLMService.save_config(session, "anthropic", "claude-sonnet-5-5")

    # Keyless custom_openai saves cleanly with custom base_url
    saved_custom = await LLMService.save_config(
        session,
        provider="custom_openai",
        model="my-local-qwen",
        api_key=None,
        base_url="http://127.0.0.1:9000/v1",
    )
    assert saved_custom.provider == "custom_openai"
    assert saved_custom.model == "my-local-qwen"
    assert saved_custom.base_url == "http://127.0.0.1:9000/v1"

    # Save Anthropic with key + custom proxy URL
    saved_ant = await LLMService.save_config(
        session,
        provider="anthropic",
        model="claude-opus-5-5",
        api_key="sk-ant-saved-1234",
        base_url="https://ant-proxy.internal",
    )
    assert saved_ant.provider == "anthropic"
    assert saved_ant.api_key == "sk-ant-saved-1234"

    # Switch to env-configured Groq without passing key
    with patch.dict("os.environ", {"GROQ_API_KEY": "gsk-env-9999"}, clear=True):
        saved_groq = await LLMService.save_config(
            session,
            provider="groq",
            model="qwen/qwen3.8-27b",
        )
        assert saved_groq.provider == "groq"
        assert saved_groq.api_key == "gsk-env-9999"
        assert saved_groq.model == "qwen/qwen3.8-27b"

    # Switching back to Anthropic without key or base_url preserves BOTH saved key & custom URL
    resumed_ant = await LLMService.save_config(
        session,
        provider="anthropic",
        model="claude-sonnet-5-5",
    )
    assert resumed_ant.api_key == "sk-ant-saved-1234"
    assert resumed_ant.base_url == "https://ant-proxy.internal"

    # Verify configured_providers preserves custom_openai & anthropic metadata
    with patch.dict("os.environ", {}, clear=True):
        with patch("httpx.AsyncClient") as mock_client:
            mock_client.return_value.__aenter__.return_value.get = AsyncMock(
                side_effect=httpx.ConnectError("no local ollama")
            )
            configured = await LLMService.get_configured_providers(session)
    assert configured["custom_openai"]["active_model"] == "my-local-qwen"
    assert configured["custom_openai"]["base_url"] == "http://127.0.0.1:9000/v1"
    assert configured["anthropic"]["has_saved_key"] is True
    assert configured["anthropic"]["base_url"] == "https://ant-proxy.internal"


@pytest.mark.asyncio
async def test_delete_provider_credentials_falls_back_to_ollama():
    session = _FakeAsyncSession()
    await LLMService.save_config(
        session,
        provider="anthropic",
        model="claude-sonnet-5-5",
        api_key="sk-ant-to-delete",
    )
    with patch.dict("os.environ", {}, clear=True):
        next_cfg = await LLMService.delete_provider_credentials(session, "anthropic")
        assert next_cfg.provider == "ollama"
        assert "anthropic" not in session.record.value["provider_keys"]
        assert "anthropic" not in session.record.value["provider_models"]


@pytest.mark.asyncio
async def test_test_connection_resolves_non_active_db_and_env_keys():
    session = _FakeAsyncSession()
    await LLMService.save_config(
        session,
        provider="anthropic",
        model="claude-sonnet-5-5",
        api_key="sk-ant-dormant",
        base_url="https://ant-dormant.example.com",
    )
    # Switch active provider to ollama
    await LLMService.save_config(session, provider="ollama", model="qwen2.5:3b")

    captured_models = []

    async def fake_run(self, _prompt, model=None, **_kwargs):
        captured_models.append(model)
        res = MagicMock()
        res.output = "OK"
        return res

    with patch("app.services.llm_service.Agent.run", new=fake_run):
        # 1. Inactive DB-saved Anthropic key + custom URL
        res_ant = await LLMService.test_connection(
            provider="anthropic",
            model="claude-haiku-5-5",
            session=session,
        )
        assert res_ant["success"] is True
        assert (
            captured_models[-1]._provider.base_url.rstrip("/")
            == "https://ant-dormant.example.com"
        )

        # 2. Inactive env-configured xAI key
        with patch.dict("os.environ", {"XAI_API_KEY": "xai-env-secret"}, clear=True):
            res_xai = await LLMService.test_connection(
                provider="xai",
                model="grok-4.7",
                session=session,
            )
            assert res_xai["success"] is True
            assert captured_models[-1]._provider.client.api_key == "xai-env-secret"


@pytest.mark.asyncio
async def test_test_connection_failure():
    with patch.dict("os.environ", {}, clear=True):
        LLMService._cached_config = None
        result = await LLMService.test_connection(
            provider="openai",
            model="gpt-6.2-sol",
            api_key="",
        )
    assert result["success"] is False
    assert "required" in result["error"].lower()


@pytest.mark.asyncio
async def test_list_provider_models_parsers_and_validation():
    with patch.dict("os.environ", {}, clear=True):
        LLMService._cached_config = None
        missing_key_res = await LLMService.list_provider_models(provider="anthropic")
        assert missing_key_res["success"] is False
        assert "API key is required" in missing_key_res["error"]

    async def run_mock_list(
        provider, payload, expected_url, expected_headers=None, api_key="secret"
    ):
        seen = {}

        class FakeResp:
            status_code = 200

            def raise_for_status(self):
                return None

            def json(self):
                return payload

        async def fake_get(url, headers=None):
            seen["url"] = url
            seen["headers"] = headers or {}
            return FakeResp()

        mock_client = MagicMock()
        mock_client.get = AsyncMock(side_effect=fake_get)
        mock_cm = MagicMock()
        mock_cm.__aenter__ = AsyncMock(return_value=mock_client)
        mock_cm.__aexit__ = AsyncMock(return_value=False)

        with patch("app.services.llm_service.httpx.AsyncClient", return_value=mock_cm):
            res = await LLMService.list_provider_models(
                provider=provider,
                api_key=api_key,
            )
        assert seen["url"] == expected_url
        if expected_headers:
            for k, v in expected_headers.items():
                assert seen["headers"].get(k) == v
        return res

    # Anthropic
    res_ant = await run_mock_list(
        "anthropic",
        {"data": [{"id": "claude-sonnet-5-5"}, {"id": "claude-opus-5-5"}]},
        "https://api.anthropic.com/v1/models",
        {"x-api-key": "secret", "anthropic-version": "2023-06-01"},
    )
    assert res_ant["models"] == ["claude-sonnet-5-5", "claude-opus-5-5"]

    # Google
    res_goog = await run_mock_list(
        "google",
        {
            "models": [
                {
                    "name": "models/gemini-3.8-flash",
                    "supportedGenerationMethods": ["generateContent"],
                },
                {
                    "name": "models/gemini-embedding-001",
                    "supportedGenerationMethods": ["embedContent"],
                },
                {
                    "name": "models/imagen-4",
                    "supportedGenerationMethods": ["generateContent"],
                },
            ]
        },
        "https://generativelanguage.googleapis.com/v1beta/models",
        {"x-goog-api-key": "secret"},
    )
    assert res_goog["models"] == ["gemini-3.8-flash"]

    # OpenAI (filters out non-chat models)
    res_oai = await run_mock_list(
        "openai",
        {
            "data": [
                {"id": "gpt-6.2-sol"},
                {"id": "whisper-1"},
                {"id": "text-embedding-3-small"},
                {"id": "gpt-4.1"},
            ]
        },
        "https://api.openai.com/v1/models",
    )
    assert res_oai["models"] == ["gpt-6.2-sol", "gpt-4.1"]

    # Together AI (top-level list filtering type == chat/language)
    res_tog = await run_mock_list(
        "together",
        [
            {"id": "deepseek-ai/DeepSeek-V4.1-Flash", "type": "chat"},
            {"id": "black-forest-labs/FLUX.1", "type": "image"},
        ],
        "https://api.together.xyz/v1/models",
    )
    assert res_tog["models"] == ["deepseek-ai/DeepSeek-V4.1-Flash"]

    # Perplexity (prepends perplexity/auto)
    res_pplx = await run_mock_list(
        "perplexity",
        {"data": [{"id": "perplexity/sonar"}]},
        "https://api.perplexity.ai/orchestrator/v1/models",
    )
    assert res_pplx["models"] == ["perplexity/auto", "perplexity/sonar"]

    # OpenRouter (excludes :batch and prioritizes openrouter/auto)
    res_or = await run_mock_list(
        "openrouter",
        {
            "data": [
                {"id": "anthropic/claude-sonnet-5.5"},
                {"id": "anthropic/claude-sonnet-5.5:batch"},
                {"id": "openrouter/auto"},
            ]
        },
        "https://openrouter.ai/api/v1/models",
        api_key=None,
    )
    assert res_or["models"] == ["openrouter/auto", "anthropic/claude-sonnet-5.5"]

    # Ollama (/api/tags excluding embed models)
    res_ol = await run_mock_list(
        "ollama",
        {"models": [{"name": "qwen2.5:3b"}, {"name": "nomic-embed-text:latest"}]},
        "http://localhost:11434/api/tags",
        api_key=None,
    )
    assert res_ol["models"] == ["qwen2.5:3b"]


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
    cfg = LLMConfig(provider="anthropic", model="claude-sonnet-5-5", api_key=None)
    model = LLMService.get_model(config=cfg)
    assert isinstance(model, OllamaModel)


@pytest.mark.asyncio
async def test_trip_agent_runner_omits_parallel_tool_calls_for_google_model():
    from app.agent.runner import TripAgentRunner

    captured_settings = []

    class FakeStreamRes:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *_args):
            return False

        async def stream_text(self, delta=True):
            yield "ok"

    class FakeAgent:
        def __init__(self, **kwargs):
            captured_settings.append(
                (type(kwargs.get("model")), kwargs.get("model_settings"))
            )

        def run_stream(self, _prompt):
            return FakeStreamRes()

    @asynccontextmanager
    async def fake_user_ctx(**_kwargs):
        yield

    fake_user = SimpleNamespace(id="user-1")
    fake_trip = SimpleNamespace(destination="Tokyo")
    fake_doc = SimpleNamespace()
    fake_session = MagicMock()

    with (
        patch("app.agent.runner.acquire_turn_lock", AsyncMock(return_value=True)),
        patch("app.agent.runner.release_turn_lock", AsyncMock()),
        patch(
            "app.agent.runner.HardwareService.check_memory_safety",
            return_value=(True, "ok"),
        ),
        patch(
            "app.agent.runner.TripService.get_trip", AsyncMock(return_value=fake_trip)
        ),
        patch("app.agent.runner.TripService.get_document", return_value=fake_doc),
        patch(
            "app.agent.runner.ItineraryValidator.validate_itinerary", return_value=[]
        ),
        patch(
            "app.agent.runner.ExpenseService.list_expenses", AsyncMock(return_value=[])
        ),
        patch("app.agent.runner.build_system_prompt", return_value="sys"),
        patch("app.agent.runner.build_trip_digest", return_value="digest"),
        patch("app.agent.runner.get_session_history", AsyncMock(return_value=[])),
        patch("app.agent.runner.append_session_message", AsyncMock()),
        patch("app.agent.runner.with_user_context", new=fake_user_ctx),
        patch("app.agent.runner.InstrumentedMCPToolset"),
        patch("app.agent.runner.Agent", new=FakeAgent),
    ):
        google_model = GoogleModel(
            "gemini-3.8-flash", provider=GoogleProvider(api_key="k")
        )
        runner_google = TripAgentRunner(model=google_model)
        async for _ in runner_google.run_turn("t1", fake_user, fake_session, "hello"):
            pass

        openai_model = OpenAIChatModel(
            "gpt-6.2-sol", provider=OpenAIProvider(api_key="k")
        )
        runner_openai = TripAgentRunner(model=openai_model)
        async for _ in runner_openai.run_turn("t1", fake_user, fake_session, "hello"):
            pass

    assert captured_settings[0][0] is GoogleModel
    assert "parallel_tool_calls" not in captured_settings[0][1]
    assert captured_settings[1][0] is OpenAIChatModel
    assert captured_settings[1][1]["parallel_tool_calls"] is False
