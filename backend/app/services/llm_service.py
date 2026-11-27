import asyncio
import logging
import os
import time
from typing import Any, Dict, List, Optional, Tuple, Type, TypeVar
import httpx
from openai import AsyncOpenAI
from pydantic import BaseModel
from pydantic_ai import Agent
from pydantic_ai.models import Model
from pydantic_ai.models.anthropic import AnthropicModel
from pydantic_ai.models.cerebras import CerebrasModel
from pydantic_ai.models.google import GoogleModel
from pydantic_ai.models.ollama import OllamaModel
from pydantic_ai.models.openai import OpenAIChatModel
from pydantic_ai.models.openrouter import OpenRouterModel
from pydantic_ai.profiles import merge_profile
from pydantic_ai.profiles.grok import grok_model_profile
from pydantic_ai.profiles.groq import groq_model_profile
from pydantic_ai.profiles.mistral import mistral_model_profile
from pydantic_ai.profiles.openai import OpenAIModelProfile
from pydantic_ai.providers.anthropic import AnthropicProvider
from pydantic_ai.providers.cerebras import CerebrasProvider
from pydantic_ai.providers.deepseek import DeepSeekProvider
from pydantic_ai.providers.google import GoogleProvider
from pydantic_ai.providers.ollama import OllamaProvider
from pydantic_ai.providers.openai import OpenAIProvider
from pydantic_ai.providers.openai_compatible import OpenAICompatibleProvider
from pydantic_ai.providers.openrouter import OpenRouterProvider
from pydantic_ai.providers.together import TogetherProvider
from pydantic_ai.settings import ModelSettings
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.hardware_service import HardwareProfile, HardwareService

logger = logging.getLogger(__name__)

T = TypeVar("T", bound=BaseModel)

CONFIG_KEY = "llm_config"

SUPPORTED_PROVIDERS: Dict[str, Dict[str, Any]] = {
    "openai": {
        "name": "OpenAI",
        "default_base_url": "https://api.openai.com/v1",
        "requires_key": True,
        "recommended_models": [
            "gpt-6.2-sol",
            "gpt-6.1-sol",
            "gpt-6-luna",
            "gpt-6.2-astra",
            "gpt-4.1",
        ],
        "default_model": "gpt-6.2-sol",
    },
    "anthropic": {
        "name": "Anthropic (Claude)",
        "default_base_url": "https://api.anthropic.com",
        "requires_key": True,
        "recommended_models": [
            "claude-sonnet-5-5",
            "claude-opus-5-5",
            "claude-haiku-5-5",
            "claude-fable-5-2",
        ],
        "default_model": "claude-sonnet-5-5",
    },
    "google": {
        "name": "Google Gemini",
        "default_base_url": "https://generativelanguage.googleapis.com",
        "requires_key": True,
        "recommended_models": [
            "gemini-3.8-flash",
            "gemini-3.5-flash-lite",
            "gemini-4-argon",
            "gemini-4-carbon",
            "gemini-3.1-pro-preview",
        ],
        "default_model": "gemini-3.8-flash",
    },
    "groq": {
        "name": "Groq",
        "default_base_url": "https://api.groq.com/openai/v1",
        "requires_key": True,
        "recommended_models": [
            "openai/gpt-oss-120b",
            "openai/gpt-oss-20b",
            "qwen/qwen3.8-27b",
            "llama-3.3-70b-versatile",
            "llama-3.1-8b-instant",
        ],
        "default_model": "openai/gpt-oss-120b",
    },
    "deepseek": {
        "name": "DeepSeek",
        "default_base_url": "https://api.deepseek.com",
        "requires_key": True,
        "recommended_models": ["deepseek-flash", "deepseek-v4-pro"],
        "default_model": "deepseek-flash",
    },
    "mistral": {
        "name": "Mistral AI",
        "default_base_url": "https://api.mistral.ai/v1",
        "requires_key": True,
        "recommended_models": [
            "mistral-large-latest",
            "mistral-medium-latest",
            "mistral-small-latest",
            "ministral-8b-latest",
            "codestral-latest",
        ],
        "default_model": "mistral-large-latest",
    },
    "openrouter": {
        "name": "OpenRouter",
        "default_base_url": "https://openrouter.ai/api/v1",
        "requires_key": True,
        "recommended_models": [
            "openrouter/auto",
            "anthropic/claude-sonnet-5.5",
            "openai/gpt-6.2-sol",
            "google/gemini-3.8-flash",
            "deepseek/deepseek-v4.1-flash",
        ],
        "default_model": "openrouter/auto",
    },
    "xai": {
        "name": "xAI (Grok)",
        "default_base_url": "https://api.x.ai/v1",
        "requires_key": True,
        "recommended_models": ["grok-4.7", "grok-4.3", "grok-3", "grok-3-mini"],
        "default_model": "grok-4.7",
    },
    "perplexity": {
        "name": "Perplexity",
        "default_base_url": "https://api.perplexity.ai/orchestrator/v1",
        "requires_key": True,
        "recommended_models": ["perplexity/auto", "perplexity/sonar"],
        "default_model": "perplexity/auto",
    },
    "together": {
        "name": "Together AI",
        "default_base_url": "https://api.together.xyz/v1",
        "requires_key": True,
        "recommended_models": [
            "deepseek-ai/DeepSeek-V4.1-Flash",
            "meta-llama/Llama-3.3-70B-Instruct-Turbo",
            "Qwen/Qwen3.6-35B-A3B",
            "meta-llama/Llama-4-Maverick-17B-128E-Instruct",
        ],
        "default_model": "deepseek-ai/DeepSeek-V4.1-Flash",
    },
    "cerebras": {
        "name": "Cerebras",
        "default_base_url": "https://api.cerebras.ai/v1",
        "requires_key": True,
        "recommended_models": ["gpt-oss-120b", "qwen-3.8-27b"],
        "default_model": "gpt-oss-120b",
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

_ENV_KEY_PRIORITY: Tuple[str, ...] = (
    "openai",
    "anthropic",
    "google",
    "groq",
    "deepseek",
    "mistral",
    "openrouter",
    "xai",
    "perplexity",
    "together",
    "cerebras",
)

_PROVIDER_ENV_VARS: Dict[str, Tuple[str, ...]] = {
    "openai": ("OPENAI_API_KEY",),
    "anthropic": ("ANTHROPIC_API_KEY",),
    "google": ("GEMINI_API_KEY", "GOOGLE_API_KEY"),
    "groq": ("GROQ_API_KEY",),
    "deepseek": ("DEEPSEEK_API_KEY",),
    "mistral": ("MISTRAL_API_KEY",),
    "openrouter": ("OPENROUTER_API_KEY",),
    "xai": ("XAI_API_KEY",),
    "perplexity": ("PERPLEXITY_API_KEY",),
    "together": ("TOGETHER_API_KEY",),
    "cerebras": ("CEREBRAS_API_KEY",),
    "ollama": ("OLLAMA_API_KEY",),
}

_OPENAI_NON_CHAT_PREFIXES: Tuple[str, ...] = (
    "whisper",
    "tts-",
    "dall-e",
    "text-embedding",
    "omni-moderation",
    "babbage",
    "davinci",
    "sora",
    "gpt-image",
    "gpt-audio",
    "gpt-realtime",
    "ft:",
)

_GOOGLE_NON_CHAT_TOKENS: Tuple[str, ...] = (
    "embedding",
    "imagen",
    "veo",
    "lyria",
    "-tts",
    "aqa",
)


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


def _is_masked_key(key: Optional[str]) -> bool:
    if not key:
        return True
    cleaned = key.strip()
    return not cleaned or cleaned == "******" or "..." in cleaned


def _get_env_api_key(provider: str) -> Optional[str]:
    for env_name in _PROVIDER_ENV_VARS.get(provider.lower().strip(), ()):
        val = os.getenv(env_name)
        if val and val.strip():
            return val.strip()
    return None


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


def _resolve_ollama_root_url(custom_url: Optional[str] = None) -> str:
    v1_url = resolve_ollama_base_url(custom_url)
    return v1_url[:-3] if v1_url.endswith("/v1") else v1_url


def _custom_openai_client(
    base_url: Optional[str],
    default_url: str,
    api_key: Optional[str],
) -> Optional[AsyncOpenAI]:
    clean_url = base_url.strip().rstrip("/") if base_url else ""
    if not clean_url or clean_url == default_url.rstrip("/"):
        return None
    return AsyncOpenAI(api_key=api_key or "api-key-not-set", base_url=clean_url)


def _dedupe_preserve_order(items: List[str]) -> List[str]:
    seen: set[str] = set()
    out: List[str] = []
    for item in items:
        if item and item not in seen:
            seen.add(item)
            out.append(item)
    return out


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
        hardware = HardwareService.get_hardware_profile()
        model = (
            model_name
            or os.getenv("TRIP_AGENT_MODEL")
            or os.getenv("VALIDATOR_MODEL")
            or hardware.recommended_model
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
        provider = os.getenv("LLM_PROVIDER", "").lower().strip()
        model = os.getenv("LLM_MODEL", "").strip()
        api_key = os.getenv("LLM_API_KEY", "").strip()
        base_url = os.getenv("LLM_BASE_URL", "").strip()

        # Check provider-specific API keys if general LLM_API_KEY is not set
        if not api_key:
            if provider and provider in SUPPORTED_PROVIDERS:
                api_key = _get_env_api_key(provider) or ""
            else:
                for cand_provider in _ENV_KEY_PRIORITY:
                    cand_key = _get_env_api_key(cand_provider)
                    if cand_key:
                        provider = provider or cand_provider
                        api_key = cand_key
                        break

        if provider == "ollama":
            return LLMConfig(
                provider="ollama",
                model=model or cls.get_default_ollama_config().model,
                api_key=api_key or _get_env_api_key("ollama"),
                base_url=resolve_ollama_base_url(base_url or None),
            )

        # If NO API key is configured and not explicitly custom_openai, default to local Ollama
        if not api_key and provider != "custom_openai":
            return cls.get_default_ollama_config(model_name=model or None)

        if provider not in SUPPORTED_PROVIDERS:
            provider = "custom_openai" if base_url else "openai"

        provider_meta = SUPPORTED_PROVIDERS.get(provider, {})
        effective_model = model or provider_meta.get("default_model", "gpt-6.2-sol")
        effective_base_url = base_url or provider_meta.get("default_base_url")

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
        provider = str(val.get("provider", "ollama")).lower().strip()
        if provider not in SUPPORTED_PROVIDERS:
            ollama_cfg = cls.get_default_ollama_config()
            cls._cached_config = ollama_cfg
            return ollama_cfg

        meta = SUPPORTED_PROVIDERS[provider]
        provider_keys = val.get("provider_keys") or {}
        provider_base_urls = val.get("provider_base_urls") or {}
        provider_models = val.get("provider_models") or {}

        api_key = (
            val.get("api_key")
            or provider_keys.get(provider)
            or _get_env_api_key(provider)
        )
        model = (
            val.get("model")
            or provider_models.get(provider)
            or meta.get("default_model", "qwen2.5:3b")
        )
        base_url = (
            val.get("base_url")
            or provider_base_urls.get(provider)
            or meta.get("default_base_url")
        )

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
        if clean_provider not in SUPPORTED_PROVIDERS:
            raise ValueError(f"Unsupported LLM provider '{provider}'.")

        clean_model = model.strip()
        if not clean_model:
            raise ValueError("Model identifier cannot be empty.")

        provider_meta = SUPPORTED_PROVIDERS[clean_provider]

        stmt = select(SystemConfigModel).where(SystemConfigModel.key == CONFIG_KEY)
        result = await session.execute(stmt)
        record = result.scalar_one_or_none()

        val: Dict[str, Any] = dict(record.value) if record and record.value else {}
        provider_keys: Dict[str, str] = dict(val.get("provider_keys", {}))
        provider_base_urls: Dict[str, str] = dict(val.get("provider_base_urls", {}))
        provider_models: Dict[str, str] = dict(val.get("provider_models", {}))
        existing_key = (
            val.get("api_key") if val.get("provider") == clean_provider else None
        )

        explicit_key = None if _is_masked_key(api_key) else api_key.strip()  # type: ignore[union-attr]
        db_key = explicit_key or provider_keys.get(clean_provider) or existing_key
        final_key = db_key or _get_env_api_key(clean_provider)

        if provider_meta.get("requires_key", True) and not final_key:
            raise ValueError(
                f"API key is required for {provider_meta.get('name', clean_provider)}."
            )

        if db_key:
            provider_keys[clean_provider] = db_key

        if base_url is not None:
            stripped_url = base_url.strip()
            if stripped_url:
                if clean_provider == "ollama":
                    effective_base_url: Optional[str] = resolve_ollama_base_url(
                        stripped_url
                    )
                else:
                    effective_base_url = stripped_url
                provider_base_urls[clean_provider] = effective_base_url
            else:
                provider_base_urls.pop(clean_provider, None)
                effective_base_url = (
                    resolve_ollama_base_url(None)
                    if clean_provider == "ollama"
                    else provider_meta.get("default_base_url")
                )
        else:
            saved_url = provider_base_urls.get(clean_provider)
            if clean_provider == "ollama":
                effective_base_url = resolve_ollama_base_url(saved_url)
            else:
                effective_base_url = saved_url or provider_meta.get("default_base_url")

        provider_models[clean_provider] = clean_model

        persisted_config = LLMConfig(
            provider=clean_provider,
            model=clean_model,
            api_key=db_key or None,
            base_url=effective_base_url or None,
        )
        data = persisted_config.model_dump(mode="json")
        data["provider_keys"] = provider_keys
        data["provider_base_urls"] = provider_base_urls
        data["provider_models"] = provider_models

        if record is None:
            record = SystemConfigModel(key=CONFIG_KEY, value=data)
            session.add(record)
        else:
            record.value = data

        await session.commit()
        await session.refresh(record)

        effective_config = LLMConfig(
            provider=clean_provider,
            model=clean_model,
            api_key=final_key or None,
            base_url=effective_base_url or None,
        )
        cls._cached_config = effective_config
        return effective_config

    @classmethod
    async def delete_provider_credentials(
        cls,
        session: AsyncSession,
        provider: str,
    ) -> LLMConfig:
        """Remove stored credentials, custom base URL, and saved model for a provider."""
        from app.db.models import SystemConfigModel

        clean_provider = provider.lower().strip()
        if clean_provider not in SUPPORTED_PROVIDERS:
            raise ValueError(f"Unsupported LLM provider '{provider}'.")

        stmt = select(SystemConfigModel).where(SystemConfigModel.key == CONFIG_KEY)
        result = await session.execute(stmt)
        record = result.scalar_one_or_none()

        if record is None or not record.value:
            return await cls.get_config_from_db(session)

        val: Dict[str, Any] = dict(record.value)
        provider_keys: Dict[str, str] = dict(val.get("provider_keys", {}))
        provider_base_urls: Dict[str, str] = dict(val.get("provider_base_urls", {}))
        provider_models: Dict[str, str] = dict(val.get("provider_models", {}))

        provider_keys.pop(clean_provider, None)
        provider_base_urls.pop(clean_provider, None)
        provider_models.pop(clean_provider, None)

        active_provider = str(val.get("provider", "ollama")).lower().strip()
        if active_provider == clean_provider:
            env_key = _get_env_api_key(clean_provider)
            meta = SUPPORTED_PROVIDERS[clean_provider]
            if meta.get("requires_key", True) and not env_key:
                fallback = cls.get_default_ollama_config()
                val.update(fallback.model_dump(mode="json"))
            else:
                val["api_key"] = None
                val["base_url"] = (
                    resolve_ollama_base_url(None)
                    if clean_provider == "ollama"
                    else meta.get("default_base_url")
                )

        val["provider_keys"] = provider_keys
        val["provider_base_urls"] = provider_base_urls
        val["provider_models"] = provider_models
        record.value = val

        await session.commit()
        await session.refresh(record)
        return await cls.get_config_from_db(session)

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

        db_provider_keys: Dict[str, str] = {}
        provider_base_urls: Dict[str, str] = {}
        provider_models: Dict[str, str] = {}
        hardware = HardwareService.get_hardware_profile()
        active_provider = "ollama"
        active_model = hardware.recommended_model
        active_base_url: Optional[str] = None

        if record and record.value:
            val = record.value
            active_provider = str(val.get("provider", "ollama")).lower().strip()
            active_model = val.get("model", hardware.recommended_model)
            active_base_url = val.get("base_url")
            db_provider_keys = dict(val.get("provider_keys", {}))
            provider_base_urls = dict(val.get("provider_base_urls", {}))
            provider_models = dict(val.get("provider_models", {}))
            if val.get("provider") and val.get("api_key"):
                db_provider_keys[active_provider] = val["api_key"]
            if val.get("provider") and active_base_url:
                provider_base_urls[active_provider] = active_base_url

        provider_keys: Dict[str, str] = dict(db_provider_keys)
        for prov_key in SUPPORTED_PROVIDERS:
            env_key = _get_env_api_key(prov_key)
            if env_key and prov_key not in provider_keys:
                provider_keys[prov_key] = env_key

        # Probe Ollama service using saved DB base_url or env default
        ollama_reachable = False
        ollama_installed_models: list[str] = []
        ollama_custom_url = provider_base_urls.get("ollama") or (
            active_base_url if active_provider == "ollama" else None
        )
        ollama_root_url = _resolve_ollama_root_url(ollama_custom_url)
        ollama_headers: Dict[str, str] = {}
        if provider_keys.get("ollama"):
            ollama_headers["Authorization"] = f"Bearer {provider_keys['ollama']}"
        try:
            async with httpx.AsyncClient(timeout=1.5) as client:
                resp = await client.get(
                    f"{ollama_root_url}/api/tags", headers=ollama_headers
                )
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
            has_saved_key = bool(db_provider_keys.get(prov_key))
            is_configured = False

            if prov_key == "ollama":
                is_configured = (
                    ollama_reachable
                    or is_active
                    or has_key
                    or bool(provider_base_urls.get("ollama"))
                    or bool(provider_models.get("ollama"))
                )
            elif prov_key == "custom_openai":
                is_configured = bool(
                    has_key
                    or provider_base_urls.get("custom_openai")
                    or provider_models.get("custom_openai")
                    or is_active
                )
            elif not meta.get("requires_key", True):
                is_configured = is_active or has_key
            elif has_key:
                is_configured = True

            if is_configured:
                raw_key = provider_keys.get(prov_key)
                saved_model = (
                    active_model if is_active else provider_models.get(prov_key)
                )
                base_models = (
                    list(ollama_installed_models)
                    if prov_key == "ollama" and ollama_installed_models
                    else list(meta.get("recommended_models", []))
                )
                if saved_model and saved_model not in base_models:
                    models_to_use = [saved_model, *base_models]
                else:
                    models_to_use = base_models

                resolved_base_url = (
                    resolve_ollama_base_url(provider_base_urls.get("ollama"))
                    if prov_key == "ollama"
                    else (
                        provider_base_urls.get(prov_key) or meta.get("default_base_url")
                    )
                )

                result_map[prov_key] = {
                    "provider": prov_key,
                    "name": meta.get("name", prov_key),
                    "is_active": is_active,
                    "active_model": saved_model
                    or (
                        models_to_use[0] if models_to_use else meta.get("default_model")
                    ),
                    "available_models": models_to_use,
                    "masked_key": mask_api_key(raw_key) if raw_key else None,
                    "has_saved_key": has_saved_key,
                    "base_url": resolved_base_url,
                    "requires_key": meta.get("requires_key", True),
                }

        return result_map

    @classmethod
    def create_model(cls, config: LLMConfig) -> Model:
        """Instantiate a Pydantic AI Model for the given LLMConfig."""
        provider = config.provider.lower().strip()
        model_name = config.model.strip()
        if not model_name:
            raise ValueError("Model identifier cannot be empty.")

        if provider == "ollama":
            url = resolve_ollama_base_url(config.base_url)
            clean_name = model_name.replace("ollama:", "")
            ollama_provider = OllamaProvider(
                base_url=url,
                api_key=config.api_key or None,
            )
            hardware = HardwareService.get_hardware_profile()
            settings = ModelSettings(
                extra_body={
                    "options": {
                        "num_ctx": hardware.recommended_num_ctx,
                        "num_thread": hardware.recommended_num_thread,
                    },
                    "keep_alive": hardware.keep_alive,
                }
            )
            return OllamaModel(clean_name, provider=ollama_provider, settings=settings)

        if provider == "anthropic":
            if not config.api_key:
                raise ValueError(
                    "Anthropic API key is required. Please set it in Configuration."
                )
            p = AnthropicProvider(
                api_key=config.api_key,
                base_url=config.base_url.strip() if config.base_url else None,
            )
            return AnthropicModel(model_name, provider=p)

        if provider == "google":
            if not config.api_key:
                raise ValueError(
                    "Google Gemini API key is required. Please set it in Configuration."
                )
            p = GoogleProvider(
                api_key=config.api_key,
                base_url=config.base_url.strip() if config.base_url else None,
            )
            return GoogleModel(model_name, provider=p)

        if provider == "openai":
            if not config.api_key:
                raise ValueError(
                    "OpenAI API key is required. Please set it in Configuration."
                )
            p = OpenAIProvider(
                api_key=config.api_key,
                base_url=config.base_url or "https://api.openai.com/v1",
            )
            return OpenAIChatModel(model_name, provider=p)

        if provider == "deepseek":
            if not config.api_key:
                raise ValueError(
                    "DeepSeek API key is required. Please set it in Configuration."
                )
            client = _custom_openai_client(
                config.base_url, "https://api.deepseek.com", config.api_key
            )
            p = (
                DeepSeekProvider(openai_client=client)
                if client is not None
                else DeepSeekProvider(api_key=config.api_key)
            )
            return OpenAIChatModel(model_name, provider=p)

        if provider == "openrouter":
            if not config.api_key:
                raise ValueError(
                    "OpenRouter API key is required. Please set it in Configuration."
                )
            client = _custom_openai_client(
                config.base_url, "https://openrouter.ai/api/v1", config.api_key
            )
            p = (
                OpenRouterProvider(openai_client=client)
                if client is not None
                else OpenRouterProvider(api_key=config.api_key)
            )
            return OpenRouterModel(model_name, provider=p)

        if provider == "cerebras":
            if not config.api_key:
                raise ValueError(
                    "Cerebras API key is required. Please set it in Configuration."
                )
            client = _custom_openai_client(
                config.base_url, "https://api.cerebras.ai/v1", config.api_key
            )
            p = (
                CerebrasProvider(openai_client=client)
                if client is not None
                else CerebrasProvider(api_key=config.api_key)
            )
            return CerebrasModel(model_name, provider=p)

        if provider == "together":
            if not config.api_key:
                raise ValueError(
                    "Together AI API key is required. Please set it in Configuration."
                )
            client = _custom_openai_client(
                config.base_url, "https://api.together.xyz/v1", config.api_key
            )
            p = (
                TogetherProvider(openai_client=client)
                if client is not None
                else TogetherProvider(api_key=config.api_key)
            )
            base_profile = p.model_profile(model_name)
            return OpenAIChatModel(
                model_name,
                provider=p,
                profile=merge_profile(
                    base_profile,
                    OpenAIModelProfile(
                        openai_chat_supports_max_completion_tokens=False
                    ),
                ),
            )

        if provider == "mistral":
            if not config.api_key:
                raise ValueError(
                    "Mistral AI API key is required. Please set it in Configuration."
                )
            base_url = config.base_url or "https://api.mistral.ai/v1"
            p = OpenAICompatibleProvider(
                "mistral",
                base_url=base_url,
                api_key=config.api_key,
                profile=lambda m: merge_profile(
                    mistral_model_profile(m),
                    OpenAIModelProfile(
                        openai_chat_supports_max_completion_tokens=False
                    ),
                ),
            )
            return OpenAIChatModel(model_name, provider=p)

        if provider == "groq":
            if not config.api_key:
                raise ValueError(
                    "Groq API key is required. Please set it in Configuration."
                )
            base_url = config.base_url or "https://api.groq.com/openai/v1"
            p = OpenAICompatibleProvider(
                "groq",
                base_url=base_url,
                api_key=config.api_key,
                profile=groq_model_profile,
            )
            return OpenAIChatModel(model_name, provider=p)

        if provider == "xai":
            if not config.api_key:
                raise ValueError(
                    "xAI (Grok) API key is required. Please set it in Configuration."
                )
            base_url = config.base_url or "https://api.x.ai/v1"
            p = OpenAICompatibleProvider(
                "xai",
                base_url=base_url,
                api_key=config.api_key,
                profile=grok_model_profile,
            )
            return OpenAIChatModel(model_name, provider=p)

        if provider == "perplexity":
            if not config.api_key:
                raise ValueError(
                    "Perplexity API key is required. Please set it in Configuration."
                )
            base_url = config.base_url or "https://api.perplexity.ai/orchestrator/v1"
            p = OpenAICompatibleProvider(
                "perplexity",
                base_url=base_url,
                api_key=config.api_key,
                profile=OpenAIModelProfile(
                    openai_chat_supports_max_completion_tokens=False
                ),
            )
            return OpenAIChatModel(model_name, provider=p)

        meta = SUPPORTED_PROVIDERS.get(provider, {})
        base_url = config.base_url or meta.get("default_base_url")
        if not base_url:
            raise ValueError(f"Base URL is required for provider '{provider}'.")
        if meta.get("requires_key", True) and not config.api_key:
            raise ValueError(
                f"API key is required for provider '{meta.get('name', provider)}'."
            )
        p = OpenAICompatibleProvider(
            provider,
            base_url=base_url,
            api_key=config.api_key or None,
            profile=OpenAIModelProfile(
                openai_chat_supports_max_completion_tokens=False
            ),
        )
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
    async def _resolve_provider_credentials(
        cls,
        provider: str,
        api_key: Optional[str] = None,
        base_url: Optional[str] = None,
        session: Optional[AsyncSession] = None,
    ) -> Tuple[Optional[str], Optional[str]]:
        """Resolve effective API key and base URL from explicit inputs, DB, cache, or env."""
        clean_provider = provider.lower().strip()
        meta = SUPPORTED_PROVIDERS.get(clean_provider, {})

        effective_key = (
            api_key.strip()
            if isinstance(api_key, str) and not _is_masked_key(api_key)
            else None
        )
        explicit_key = effective_key is not None
        explicit_base_url = (
            base_url.strip() if isinstance(base_url, str) and base_url.strip() else None
        )
        effective_base_url = explicit_base_url

        db_val: Dict[str, Any] = {}
        if session is not None and (not effective_key or not effective_base_url):
            from app.db.models import SystemConfigModel

            stmt = select(SystemConfigModel).where(SystemConfigModel.key == CONFIG_KEY)
            result = await session.execute(stmt)
            record = result.scalar_one_or_none()
            if record and record.value:
                db_val = dict(record.value)

        provider_base_urls = db_val.get("provider_base_urls") or {}
        active_db_prov = str(db_val.get("provider", "")).lower().strip()
        saved_base_url = (
            provider_base_urls.get(clean_provider)
            or (db_val.get("base_url") if active_db_prov == clean_provider else None)
            or (
                cls._cached_config.base_url
                if cls._cached_config
                and cls._cached_config.provider.lower().strip() == clean_provider
                else None
            )
        )

        if not effective_base_url:
            effective_base_url = saved_base_url or meta.get("default_base_url")

        if clean_provider == "ollama":
            effective_base_url = resolve_ollama_base_url(effective_base_url)

        # Prevent stored/env API keys from being sent to an arbitrary caller-supplied base_url
        allow_stored_key = True
        if explicit_base_url and not explicit_key:
            norm_requested = (effective_base_url or "").rstrip("/")
            known_urls = {
                str(u).strip().rstrip("/")
                for u in (saved_base_url, meta.get("default_base_url"))
                if u and str(u).strip()
            }
            if clean_provider == "ollama":
                known_urls = {
                    resolve_ollama_base_url(u).rstrip("/") for u in known_urls
                }
            if norm_requested not in known_urls:
                allow_stored_key = False

        if not effective_key and allow_stored_key:
            provider_keys = db_val.get("provider_keys") or {}
            effective_key = (
                provider_keys.get(clean_provider)
                or (db_val.get("api_key") if active_db_prov == clean_provider else None)
                or (
                    cls._cached_config.api_key
                    if cls._cached_config
                    and cls._cached_config.provider.lower().strip() == clean_provider
                    else None
                )
                or _get_env_api_key(clean_provider)
            )
        elif (
            not effective_key
            and not allow_stored_key
            and meta.get("requires_key", True)
        ):
            raise ValueError(
                "Explicit API key is required when querying a custom base URL."
            )

        return effective_key, effective_base_url

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
        If api_key is omitted or masked, reuses the saved or environment key for this provider.
        """
        clean_provider = provider.lower().strip()
        clean_model = model.strip()
        start_time = time.time()

        if clean_provider not in SUPPORTED_PROVIDERS:
            return {
                "success": False,
                "latency_ms": 0,
                "error": f"Unsupported LLM provider '{provider}'.",
                "provider": provider,
                "model": model,
            }
        if not clean_model:
            return {
                "success": False,
                "latency_ms": 0,
                "error": "Model identifier cannot be empty.",
                "provider": clean_provider,
                "model": model,
            }

        effective_key, effective_base_url = await cls._resolve_provider_credentials(
            clean_provider,
            api_key=api_key,
            base_url=base_url,
            session=session,
        )

        test_config = LLMConfig(
            provider=clean_provider,
            model=clean_model,
            api_key=effective_key,
            base_url=effective_base_url,
        )
        try:
            model_instance = cls.create_model(test_config)
            agent = Agent(
                name="connection_tester",
                instructions="Answer with exactly one word: OK",
            )
            res = await asyncio.wait_for(
                agent.run("ping", model=model_instance),
                timeout=25.0,
            )
            elapsed_ms = int((time.time() - start_time) * 1000)
            return {
                "success": True,
                "latency_ms": elapsed_ms,
                "response": str(res.output).strip(),
                "provider": clean_provider,
                "model": clean_model,
            }
        except Exception as e:
            elapsed_ms = int((time.time() - start_time) * 1000)
            logger.warning(
                f"LLM connection test failed for {clean_provider}/{clean_model}: {e}"
            )
            return {
                "success": False,
                "latency_ms": elapsed_ms,
                "error": str(e),
                "provider": clean_provider,
                "model": clean_model,
            }

    @classmethod
    async def list_provider_models(
        cls,
        provider: str,
        api_key: Optional[str] = None,
        base_url: Optional[str] = None,
        session: Optional[AsyncSession] = None,
    ) -> Dict[str, Any]:
        """Query the live provider models catalog endpoint and return normalized model IDs."""
        clean_provider = provider.lower().strip()
        if clean_provider not in SUPPORTED_PROVIDERS:
            return {
                "success": False,
                "provider": provider,
                "models": [],
                "error": f"Unsupported LLM provider '{provider}'.",
            }

        meta = SUPPORTED_PROVIDERS[clean_provider]
        effective_key, effective_base_url = await cls._resolve_provider_credentials(
            clean_provider,
            api_key=api_key,
            base_url=base_url,
            session=session,
        )

        key_optional_for_listing = clean_provider in (
            "openrouter",
            "ollama",
            "custom_openai",
        )
        if (
            meta.get("requires_key", True)
            and not key_optional_for_listing
            and not effective_key
        ):
            return {
                "success": False,
                "provider": clean_provider,
                "models": [],
                "error": f"API key is required to list models for {meta.get('name', clean_provider)}.",
            }

        target_base = (effective_base_url or meta.get("default_base_url") or "").rstrip(
            "/"
        )
        if not target_base:
            return {
                "success": False,
                "provider": clean_provider,
                "models": [],
                "error": f"Base URL is required to list models for {meta.get('name', clean_provider)}.",
            }

        try:
            async with httpx.AsyncClient(
                timeout=10.0,
                headers={"User-Agent": "Paladio/3.0"},
            ) as client:
                models: List[str] = []

                if clean_provider == "anthropic":
                    resp = await client.get(
                        f"{target_base}/v1/models",
                        headers={
                            "x-api-key": effective_key or "",
                            "anthropic-version": "2023-06-01",
                        },
                    )
                    resp.raise_for_status()
                    payload = resp.json()
                    models = [
                        str(item["id"])
                        for item in payload.get("data", [])
                        if isinstance(item, dict) and item.get("id")
                    ]

                elif clean_provider == "google":
                    resp = await client.get(
                        f"{target_base}/v1beta/models",
                        headers={"x-goog-api-key": effective_key or ""},
                    )
                    resp.raise_for_status()
                    payload = resp.json()
                    for item in payload.get("models", []):
                        if not isinstance(item, dict):
                            continue
                        methods = item.get("supportedGenerationMethods")
                        if methods is not None and "generateContent" not in methods:
                            continue
                        raw_name = str(item.get("name") or "")
                        model_id = (
                            raw_name[len("models/") :]
                            if raw_name.startswith("models/")
                            else raw_name
                        )
                        if model_id and not any(
                            tok in model_id.lower() for tok in _GOOGLE_NON_CHAT_TOKENS
                        ):
                            models.append(model_id)

                elif clean_provider == "ollama":
                    root_url = _resolve_ollama_root_url(target_base)
                    headers = (
                        {"Authorization": f"Bearer {effective_key}"}
                        if effective_key
                        else {}
                    )
                    resp = await client.get(f"{root_url}/api/tags", headers=headers)
                    resp.raise_for_status()
                    payload = resp.json()
                    models = [
                        str(item["name"])
                        for item in payload.get("models", [])
                        if isinstance(item, dict)
                        and item.get("name")
                        and "embed" not in str(item["name"]).lower()
                    ]

                else:
                    headers = (
                        {"Authorization": f"Bearer {effective_key}"}
                        if effective_key
                        else {}
                    )
                    resp = await client.get(f"{target_base}/models", headers=headers)
                    resp.raise_for_status()
                    payload = resp.json()

                    if clean_provider == "together" and isinstance(payload, list):
                        raw_items = payload
                        filtered = [
                            str(item["id"])
                            for item in raw_items
                            if isinstance(item, dict)
                            and item.get("id")
                            and item.get("type") in ("chat", "language", None)
                        ]
                        models = filtered or [
                            str(item["id"])
                            for item in raw_items
                            if isinstance(item, dict) and item.get("id")
                        ]
                    else:
                        data_items = (
                            payload.get("data", []) if isinstance(payload, dict) else []
                        )
                        raw_ids = [
                            str(item["id"])
                            for item in data_items
                            if isinstance(item, dict) and item.get("id")
                        ]
                        if clean_provider == "openai":
                            filtered = [
                                mid
                                for mid in raw_ids
                                if not mid.lower().startswith(_OPENAI_NON_CHAT_PREFIXES)
                            ]
                            models = filtered or raw_ids
                        elif clean_provider == "openrouter":
                            models = [
                                mid for mid in raw_ids if not mid.endswith(":batch")
                            ]
                            if "openrouter/auto" in models:
                                models = [
                                    "openrouter/auto",
                                    *[m for m in models if m != "openrouter/auto"],
                                ]
                        elif clean_provider == "perplexity":
                            models = ["perplexity/auto", *raw_ids]
                        else:
                            models = raw_ids

            clean_models = _dedupe_preserve_order(models)
            return {
                "success": True,
                "provider": clean_provider,
                "models": clean_models,
                "source": "live",
            }
        except httpx.HTTPStatusError as e:
            detail = e.response.text[:240].strip() if e.response is not None else str(e)
            msg = (
                f"HTTP {e.response.status_code}: {detail}"
                if e.response is not None
                else str(e)
            )
            logger.warning(f"Live model listing failed for {clean_provider}: {msg}")
            return {
                "success": False,
                "provider": clean_provider,
                "models": [],
                "error": msg,
            }
        except Exception as e:
            logger.warning(f"Live model listing failed for {clean_provider}: {e}")
            return {
                "success": False,
                "provider": clean_provider,
                "models": [],
                "error": str(e),
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

    @classmethod
    def get_hardware_profile(cls) -> HardwareProfile:
        """Returns dynamic machine hardware profile and safe parameters."""
        return HardwareService.get_hardware_profile()

    @classmethod
    async def unload_ollama_model(
        cls,
        model_name: Optional[str] = None,
        base_url: Optional[str] = None,
    ) -> bool:
        """
        Signals local Ollama daemon to immediately unload a resident model
        from RAM/VRAM by issuing keep_alive=0.
        """
        try:
            cached_url = (
                cls._cached_config.base_url
                if cls._cached_config
                and cls._cached_config.provider.lower().strip() == "ollama"
                else None
            )
            ollama_url = _resolve_ollama_root_url(base_url or cached_url)

            target_model = model_name
            if not target_model:
                hardware = HardwareService.get_hardware_profile()
                target_model = hardware.recommended_model

            clean_name = target_model.replace("ollama:", "")
            async with httpx.AsyncClient(timeout=3.0) as client:
                resp = await client.post(
                    f"{ollama_url}/api/generate",
                    json={"model": clean_name, "keep_alive": 0},
                )
                return resp.status_code == 200
        except Exception as e:
            logger.debug(f"Failed to unload Ollama model '{model_name}': {e}")
            return False
