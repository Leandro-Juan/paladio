import logging
import os
import time
from typing import Any, Dict, Optional, Type, TypeVar
import httpx
from pydantic import BaseModel
from pydantic_ai import Agent
from pydantic_ai.models import Model
from pydantic_ai.models.anthropic import AnthropicModel
from pydantic_ai.models.google import GoogleModel
from pydantic_ai.models.ollama import OllamaModel
from pydantic_ai.models.openai import OpenAIChatModel
from pydantic_ai.providers.anthropic import AnthropicProvider
from pydantic_ai.providers.google import GoogleProvider
from pydantic_ai.providers.ollama import OllamaProvider
from pydantic_ai.providers.openai import OpenAIProvider
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

T = TypeVar("T", bound=BaseModel)

CONFIG_KEY = "llm_config"

SUPPORTED_PROVIDERS: Dict[str, Dict[str, Any]] = {
    "openai": {
        "name": "OpenAI",
        "default_base_url": "https://api.openai.com/v1",
        "requires_key": True,
        "recommended_models": ["gpt-4o", "gpt-4o-mini", "o3-mini", "o1"],
        "default_model": "gpt-4o-mini",
    },
    "anthropic": {
        "name": "Anthropic (Claude)",
        "default_base_url": None,
        "requires_key": True,
        "recommended_models": [
            "claude-3-5-sonnet-latest",
            "claude-3-5-haiku-latest",
            "claude-3-opus-latest",
        ],
        "default_model": "claude-3-5-sonnet-latest",
    },
    "google": {
        "name": "Google Gemini",
        "default_base_url": None,
        "requires_key": True,
        "recommended_models": [
            "gemini-3-flash-preview",
            "gemini-3.8-flash",
            "gemini-3.1-pro-preview",
        ],
        "default_model": "gemini-3-flash-preview",
    },
    "groq": {
        "name": "Groq",
        "default_base_url": "https://api.groq.com/openai/v1",
        "requires_key": True,
        "recommended_models": [
            "openai/gpt-oss-120b",
            "openai/gpt-oss-20b",
            "qwen/qwen3.8-27b",
        ],
        "default_model": "openai/gpt-oss-120b",
    },
    "deepseek": {
        "name": "DeepSeek",
        "default_base_url": "https://api.deepseek.com",
        "requires_key": True,
        "recommended_models": ["deepseek-chat", "deepseek-reasoner"],
        "default_model": "deepseek-chat",
    },
    "mistral": {
        "name": "Mistral AI",
        "default_base_url": "https://api.mistral.ai/v1",
        "requires_key": True,
        "recommended_models": [
            "mistral-large-latest",
            "codestral-latest",
            "open-mistral-nemo",
        ],
        "default_model": "mistral-large-latest",
    },
    "openrouter": {
        "name": "OpenRouter",
        "default_base_url": "https://openrouter.ai/api/v1",
        "requires_key": True,
        "recommended_models": [
            "anthropic/claude-3.5-sonnet",
            "openai/gpt-4o",
            "meta-llama/llama-3.3-70b-instruct",
            "google/gemini-2.0-flash-exp:free",
        ],
        "default_model": "anthropic/claude-3.5-sonnet",
    },
    "xai": {
        "name": "xAI (Grok)",
        "default_base_url": "https://api.x.ai/v1",
        "requires_key": True,
        "recommended_models": ["grok-2-latest", "grok-beta"],
        "default_model": "grok-2-latest",
    },
    "perplexity": {
        "name": "Perplexity",
        "default_base_url": "https://api.perplexity.ai",
        "requires_key": True,
        "recommended_models": ["sonar-pro", "sonar"],
        "default_model": "sonar-pro",
    },
    "together": {
        "name": "Together AI",
        "default_base_url": "https://api.together.xyz/v1",
        "requires_key": True,
        "recommended_models": [
            "meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo",
            "mistralai/Mixtral-8x7B-Instruct-v0.1",
        ],
        "default_model": "meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo",
    },
    "cerebras": {
        "name": "Cerebras",
        "default_base_url": "https://api.cerebras.ai/v1",
        "requires_key": True,
        "recommended_models": ["llama-3.3-70b", "llama3.1-8b"],
        "default_model": "llama-3.3-70b",
    },
    "custom_openai": {
        "name": "Custom OpenAI Compatible / vLLM / LocalAI",
        "default_base_url": "http://localhost:8000/v1",
        "requires_key": False,
        "recommended_models": ["default", "qwen2.5-7b-instruct", "llama-3.1-8b"],
        "default_model": "default",
    },
    "ollama": {
        "name": "Ollama (Local)",
        "default_base_url": "http://localhost:11434/v1",
        "requires_key": False,
        "recommended_models": [
            "qwen2.5:3b",
            "llama3.2:latest",
            "qwen2.5:latest",
            "llama3.1:latest",
        ],
        "default_model": "qwen2.5:3b",
    },
}


class LLMConfig(BaseModel):
    provider: str = "ollama"
    model: str = "qwen2.5:3b"
    api_key: Optional[str] = None
    base_url: Optional[str] = None


def mask_api_key(key: Optional[str]) -> Optional[str]:
    if not key or len(key) < 6:
        return "******" if key else None
    if len(key) <= 10:
        return f"{key[:2]}...{key[-2:]}"
    return f"{key[:4]}...{key[-4:]}"


def resolve_ollama_base_url(custom_url: Optional[str] = None) -> str:
    env_url = os.getenv("OLLAMA_BASE_URL")
    if not custom_url or (
        env_url
        and ("localhost" in custom_url or "127.0.0.1" in custom_url)
        and "localhost" not in env_url
        and "127.0.0.1" not in env_url
    ):
        url = env_url or "http://localhost:11434"
    else:
        url = custom_url
    url = url.rstrip("/")
    if not url.endswith("/v1"):
        url = f"{url}/v1"
    return url


class LLMService:
    """
    Central service for multi-provider LLM resolution, configuration,
    and structured task execution across Paladio.

    Behavior Invariant:
    - Default is local Ollama just as before.
    - If an API key is configured (via UI or environment), it completely uses
      that provider and model, and dispatches Ollama.
    - If no API key is configured, it falls back to local Ollama.
    """

    _cached_config: Optional[LLMConfig] = None

    @classmethod
    def get_default_ollama_config(cls, model_name: Optional[str] = None) -> LLMConfig:
        model = (
            model_name
            or os.getenv("TRIP_AGENT_MODEL")
            or os.getenv("VALIDATOR_MODEL")
            or "qwen2.5:3b"
        )
        if model.startswith("ollama:"):
            model = model.replace("ollama:", "")
        return LLMConfig(
            provider="ollama",
            model=model,
            api_key=None,
            base_url=resolve_ollama_base_url(),
        )

    @classmethod
    def get_fallback_config(cls) -> LLMConfig:
        """
        Derive configuration from environment variables or default to local Ollama.
        If an API key is configured, the system dispatches Ollama and uses that provider.
        Otherwise, it defaults to local Ollama.
        """
        provider = os.getenv("LLM_PROVIDER", "").lower()
        model = os.getenv("LLM_MODEL", "")
        api_key = os.getenv("LLM_API_KEY", "")
        base_url = os.getenv("LLM_BASE_URL", "")

        # Check provider-specific API keys if general LLM_API_KEY is not set
        if not api_key:
            if os.getenv("OPENAI_API_KEY"):
                provider = provider or "openai"
                api_key = os.getenv("OPENAI_API_KEY")
            elif os.getenv("ANTHROPIC_API_KEY"):
                provider = provider or "anthropic"
                api_key = os.getenv("ANTHROPIC_API_KEY")
            elif os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY"):
                provider = provider or "google"
                api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
            elif os.getenv("GROQ_API_KEY"):
                provider = provider or "groq"
                api_key = os.getenv("GROQ_API_KEY")
            elif os.getenv("DEEPSEEK_API_KEY"):
                provider = provider or "deepseek"
                api_key = os.getenv("DEEPSEEK_API_KEY")
            elif os.getenv("MISTRAL_API_KEY"):
                provider = provider or "mistral"
                api_key = os.getenv("MISTRAL_API_KEY")
            elif os.getenv("OPENROUTER_API_KEY"):
                provider = provider or "openrouter"
                api_key = os.getenv("OPENROUTER_API_KEY")

        # If NO API key is configured and not explicitly custom_openai, default to local Ollama!
        if not api_key and provider != "custom_openai":
            return cls.get_default_ollama_config(model_name=model)

        if provider not in SUPPORTED_PROVIDERS:
            provider = "custom_openai" if base_url else "openai"

        provider_meta = SUPPORTED_PROVIDERS.get(provider, {})
        effective_model = model or provider_meta.get("default_model", "gpt-4o-mini")
        effective_base_url = base_url or provider_meta.get("default_base_url")

        # Automatically upgrade decommissioned Google Gemini models
        if provider == "google" and (
            effective_model.startswith("gemini-2.")
            or effective_model.startswith("gemini-1.")
            or effective_model == "gemini-pro"
        ):
            effective_model = provider_meta.get(
                "default_model", "gemini-3-flash-preview"
            )

        return LLMConfig(
            provider=provider,
            model=effective_model,
            api_key=api_key or None,
            base_url=effective_base_url or None,
        )

    @classmethod
    async def get_config_from_db(cls, session: AsyncSession) -> LLMConfig:
        """Fetch active configuration from system_config table or initialize with fallback."""
        from app.db.models import SystemConfigModel

        stmt = select(SystemConfigModel).where(SystemConfigModel.key == CONFIG_KEY)
        result = await session.execute(stmt)
        record = result.scalar_one_or_none()

        if record is None or not record.value:
            fallback = cls.get_fallback_config()
            new_record = SystemConfigModel(
                key=CONFIG_KEY,
                value=fallback.model_dump(mode="json"),
            )
            session.add(new_record)
            await session.commit()
            await session.refresh(new_record)
            cls._cached_config = fallback
            return fallback

        val = record.value
        provider = val.get("provider", "ollama")
        api_key = val.get("api_key")
        model = val.get("model", "qwen2.5:latest")
        base_url = val.get("base_url")

        meta = SUPPORTED_PROVIDERS.get(provider, {})

        # Automatically upgrade decommissioned Google Gemini models in persisted database config
        if provider == "google" and (
            model.startswith("gemini-2.")
            or model.startswith("gemini-1.")
            or model == "gemini-pro"
        ):
            model = meta.get("default_model", "gemini-3-flash-preview")
            val["model"] = model
            record.value = val
            session.add(record)
            await session.commit()
            await session.refresh(record)

        # If the provider requires an API key but no key is configured,
        # automatically fallback to local Ollama
        if meta.get("requires_key", False) and not api_key:
            ollama_cfg = cls.get_default_ollama_config()
            cls._cached_config = ollama_cfg
            return ollama_cfg

        if provider == "ollama":
            base_url = resolve_ollama_base_url(base_url)

        config = LLMConfig(
            provider=provider,
            model=model,
            api_key=api_key,
            base_url=base_url,
        )
        cls._cached_config = config
        return config

    @classmethod
    async def save_config(
        cls,
        session: AsyncSession,
        provider: str,
        model: str,
        api_key: Optional[str] = None,
        base_url: Optional[str] = None,
    ) -> LLMConfig:
        """Update and persist active LLM configuration in PostgreSQL."""
        from app.db.models import SystemConfigModel

        clean_provider = provider.lower().strip()
        clean_model = model.strip()

        provider_meta = SUPPORTED_PROVIDERS.get(clean_provider, {})
        if clean_provider == "ollama":
            effective_base_url = resolve_ollama_base_url(base_url)
        else:
            effective_base_url = (
                base_url.strip() if base_url else provider_meta.get("default_base_url")
            )

        stmt = select(SystemConfigModel).where(SystemConfigModel.key == CONFIG_KEY)
        result = await session.execute(stmt)
        record = result.scalar_one_or_none()

        provider_keys: Dict[str, str] = {}
        if record and record.value:
            provider_keys = dict(record.value.get("provider_keys", {}))
        existing_key = record.value.get("api_key") if record and record.value else None

        # Preserve existing API key if user passed None or masked representation
        final_key = api_key
        if final_key is None or (
            final_key and ("..." in final_key or final_key == "******")
        ):
            final_key = provider_keys.get(clean_provider) or (
                existing_key
                if record
                and record.value
                and record.value.get("provider") == clean_provider
                else None
            )

        if final_key:
            provider_keys[clean_provider] = final_key

        new_config = LLMConfig(
            provider=clean_provider,
            model=clean_model,
            api_key=final_key or None,
            base_url=effective_base_url or None,
        )

        data = new_config.model_dump(mode="json")
        data["provider_keys"] = provider_keys

        if record is None:
            record = SystemConfigModel(key=CONFIG_KEY, value=data)
            session.add(record)
        else:
            record.value = data

        await session.commit()
        await session.refresh(record)
        cls._cached_config = new_config
        return new_config

    @classmethod
    async def get_configured_providers(
        cls, session: AsyncSession
    ) -> Dict[str, Dict[str, Any]]:
        """
        Scan database records, active configuration, and environment variables
        to return an exhaustive map of all ready/configured providers and their available models.
        """
        from app.db.models import SystemConfigModel

        stmt = select(SystemConfigModel).where(SystemConfigModel.key == CONFIG_KEY)
        result = await session.execute(stmt)
        record = result.scalar_one_or_none()

        provider_keys: Dict[str, str] = {}
        active_provider = "ollama"
        active_model = "qwen2.5:latest"

        if record and record.value:
            val = record.value
            active_provider = val.get("provider", "ollama")
            active_model = val.get("model", "qwen2.5:latest")
            provider_keys = dict(val.get("provider_keys", {}))
            if val.get("provider") and val.get("api_key"):
                provider_keys[val.get("provider")] = val.get("api_key")

        # Also inspect environment variables
        env_map = {
            "google": os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY"),
            "openai": os.getenv("OPENAI_API_KEY"),
            "anthropic": os.getenv("ANTHROPIC_API_KEY"),
            "groq": os.getenv("GROQ_API_KEY"),
            "deepseek": os.getenv("DEEPSEEK_API_KEY"),
            "mistral": os.getenv("MISTRAL_API_KEY"),
            "openrouter": os.getenv("OPENROUTER_API_KEY"),
            "xai": os.getenv("XAI_API_KEY"),
            "perplexity": os.getenv("PERPLEXITY_API_KEY"),
            "together": os.getenv("TOGETHER_API_KEY"),
            "cerebras": os.getenv("CEREBRAS_API_KEY"),
        }
        for prov, key in env_map.items():
            if key and prov not in provider_keys:
                provider_keys[prov] = key

        # Probe local sovereign Ollama service for running status and installed models
        ollama_reachable = False
        ollama_installed_models: list[str] = []
        try:
            ollama_url = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434").rstrip(
                "/"
            )
            if ollama_url.endswith("/v1"):
                ollama_url = ollama_url[:-3]
            async with httpx.AsyncClient(timeout=1.0) as client:
                resp = await client.get(f"{ollama_url}/api/tags")
                if resp.status_code == 200:
                    data = resp.json()
                    ollama_reachable = True
                    for m in data.get("models", []):
                        m_name = m.get("name")
                        if m_name and "embed" not in m_name:
                            ollama_installed_models.append(m_name)
        except Exception:
            ollama_reachable = False

        result_map: Dict[str, Dict[str, Any]] = {}
        for prov_key, meta in SUPPORTED_PROVIDERS.items():
            is_active = prov_key == active_provider
            has_key = bool(provider_keys.get(prov_key))
            is_configured = False

            if prov_key == "ollama":
                is_configured = (
                    ollama_reachable or is_active or bool(provider_keys.get("ollama"))
                )
            elif prov_key == "custom_openai":
                is_configured = bool(
                    has_key or (is_active and active_provider == "custom_openai")
                )
            elif not meta.get("requires_key", True):
                is_configured = is_active or bool(provider_keys.get(prov_key))
            elif has_key:
                is_configured = True

            if is_configured:
                raw_key = provider_keys.get(prov_key)
                models_to_use = meta.get("recommended_models", [])
                if prov_key == "ollama" and ollama_installed_models:
                    models_to_use = ollama_installed_models

                result_map[prov_key] = {
                    "provider": prov_key,
                    "name": meta.get("name", prov_key),
                    "is_active": is_active,
                    "active_model": active_model
                    if is_active
                    else (
                        models_to_use[0] if models_to_use else meta.get("default_model")
                    ),
                    "available_models": models_to_use,
                    "masked_key": mask_api_key(raw_key) if raw_key else None,
                    "requires_key": meta.get("requires_key", True),
                }

        return result_map

    @classmethod
    def create_model(cls, config: LLMConfig) -> Model:
        """Instantiate a Pydantic AI Model for the given LLMConfig."""
        provider = config.provider.lower()
        model_name = config.model

        if provider == "ollama":
            url = resolve_ollama_base_url(config.base_url)
            clean_name = model_name.replace("ollama:", "")
            ollama_provider = OllamaProvider(base_url=url)
            return OllamaModel(clean_name, provider=ollama_provider)

        elif provider == "anthropic":
            if not config.api_key:
                raise ValueError(
                    "Anthropic API key is required. Please set it in Configuration."
                )
            p = AnthropicProvider(api_key=config.api_key)
            return AnthropicModel(model_name, provider=p)

        elif provider == "google":
            if not config.api_key:
                raise ValueError(
                    "Google Gemini API key is required. Please set it in Configuration."
                )
            p = GoogleProvider(api_key=config.api_key)
            return GoogleModel(model_name, provider=p)

        elif provider == "openai":
            if not config.api_key:
                raise ValueError(
                    "OpenAI API key is required. Please set it in Configuration."
                )
            p = OpenAIProvider(
                api_key=config.api_key,
                base_url=config.base_url or "https://api.openai.com/v1",
            )
            return OpenAIChatModel(model_name, provider=p)

        else:
            meta = SUPPORTED_PROVIDERS.get(provider, {})
            base_url = config.base_url or meta.get("default_base_url")
            if not base_url:
                raise ValueError(f"Base URL is required for provider '{provider}'.")
            key = config.api_key or "none"
            if meta.get("requires_key", True) and not config.api_key:
                raise ValueError(
                    f"API key is required for provider '{meta.get('name', provider)}'."
                )
            p = OpenAIProvider(api_key=key, base_url=base_url)
            return OpenAIChatModel(model_name, provider=p)

    @classmethod
    def get_model(
        cls,
        config: Optional[LLMConfig] = None,
        model_name: Optional[str] = None,
    ) -> Model:
        """
        Synchronously resolves the active Model.
        Uses cached config or fallback if not explicitly provided.
        If the resolved provider requires an API key but no key is present,
        it automatically falls back to local Ollama.
        """
        active_config = config or cls._cached_config or cls.get_fallback_config()
        meta = SUPPORTED_PROVIDERS.get(active_config.provider, {})
        if meta.get("requires_key", False) and not active_config.api_key:
            active_config = cls.get_default_ollama_config(model_name=model_name)
        elif model_name:
            active_config = LLMConfig(
                provider=active_config.provider,
                model=model_name,
                api_key=active_config.api_key,
                base_url=active_config.base_url,
            )
        return cls.create_model(active_config)

    @classmethod
    async def get_model_async(
        cls,
        session: Optional[AsyncSession] = None,
        model_name: Optional[str] = None,
    ) -> Model:
        """Asynchronously resolves the active Model, refreshing from database if session is provided."""
        if session is not None:
            config = await cls.get_config_from_db(session)
        else:
            config = cls._cached_config or cls.get_fallback_config()

        meta = SUPPORTED_PROVIDERS.get(config.provider, {})
        if meta.get("requires_key", False) and not config.api_key:
            config = cls.get_default_ollama_config(model_name=model_name)
        elif model_name:
            config = LLMConfig(
                provider=config.provider,
                model=model_name,
                api_key=config.api_key,
                base_url=config.base_url,
            )
        return cls.create_model(config)

    @classmethod
    async def test_connection(
        cls,
        provider: str,
        model: str,
        api_key: Optional[str] = None,
        base_url: Optional[str] = None,
        session: Optional[AsyncSession] = None,
    ) -> Dict[str, Any]:
        """
        Executes a lightweight verification prompt against the designated LLM endpoint.
        If api_key is omitted or masked, reuses the currently saved key for this provider.
        """
        effective_key = api_key.strip() if api_key and api_key.strip() else None
        effective_base_url = base_url.strip() if base_url and base_url.strip() else None

        if not effective_key or "..." in effective_key or effective_key == "******":
            current_cfg = None
            if session is not None:
                current_cfg = await cls.get_config_from_db(session)
            else:
                current_cfg = cls._cached_config or cls.get_fallback_config()

            if (
                current_cfg
                and current_cfg.provider.lower() == provider.lower()
                and current_cfg.api_key
            ):
                effective_key = current_cfg.api_key
                if not effective_base_url:
                    effective_base_url = current_cfg.base_url

        test_config = LLMConfig(
            provider=provider,
            model=model,
            api_key=effective_key,
            base_url=effective_base_url,
        )
        start_time = time.time()
        try:
            model_instance = cls.create_model(test_config)
            agent = Agent(
                name="connection_tester",
                instructions="Answer with exactly one word: OK",
            )
            res = await agent.run("ping", model=model_instance)
            elapsed_ms = int((time.time() - start_time) * 1000)
            return {
                "success": True,
                "latency_ms": elapsed_ms,
                "response": str(res.output).strip(),
                "provider": provider,
                "model": model,
            }
        except Exception as e:
            elapsed_ms = int((time.time() - start_time) * 1000)
            logger.warning(f"LLM connection test failed for {provider}/{model}: {e}")
            return {
                "success": False,
                "latency_ms": elapsed_ms,
                "error": str(e),
                "provider": provider,
                "model": model,
            }

    @classmethod
    async def run_structured_extraction(
        cls,
        output_type: Type[T],
        prompt: str,
        instructions: str,
        session: Optional[AsyncSession] = None,
        retries: int = 2,
    ) -> Optional[T]:
        """
        Universally executes a structured extraction task using the currently configured LLM.
        """
        try:
            model = await cls.get_model_async(session=session)
            agent = Agent(
                name="structured_extractor",
                output_type=output_type,
                instructions=instructions,
                retries=retries,
            )
            res = await agent.run(prompt, model=model)
            return res.output
        except Exception as e:
            logger.warning(f"Structured extraction failed via LLM: {e}")
            return None
