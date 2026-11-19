"""Deterministic language detection and on-demand translation service for POI descriptions."""

from __future__ import annotations

import logging
import os
import re
from dataclasses import dataclass
from typing import Any

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

_SUPPORTED_TARGET_CODES = {
    "en",
    "es",
    "fr",
    "de",
    "it",
    "pt",
    "ja",
    "zh-CN",
    "zh-TW",
    "ko",
    "ar",
}

_LANGUAGE_NAMES: dict[str, str] = {
    "en": "English",
    "es": "Spanish",
    "fr": "French",
    "de": "German",
    "it": "Italian",
    "pt": "Portuguese",
    "ja": "Japanese",
    "zh": "Simplified Chinese",
    "zh-CN": "Simplified Chinese",
    "zh-TW": "Traditional Chinese",
    "ko": "Korean",
    "ar": "Arabic",
}

_STOPWORDS: dict[str, set[str]] = {
    "en": {
        "the",
        "and",
        "is",
        "in",
        "of",
        "to",
        "a",
        "an",
        "for",
        "with",
        "located",
        "known",
        "from",
        "by",
        "on",
        "that",
        "this",
        "it",
        "its",
        "are",
        "was",
        "as",
        "or",
        "which",
        "over",
        "above",
        "museum",
        "building",
        "centre",
        "center",
    },
    "es": {
        "el",
        "la",
        "los",
        "las",
        "un",
        "una",
        "de",
        "del",
        "en",
        "y",
        "es",
        "son",
        "con",
        "por",
        "para",
        "que",
        "su",
        "sus",
        "al",
        "se",
        "ubicado",
        "situado",
        "conocido",
        "como",
        "entre",
        "sobre",
        "museo",
        "edificio",
    },
    "fr": {
        "le",
        "la",
        "les",
        "un",
        "une",
        "des",
        "du",
        "de",
        "et",
        "est",
        "sont",
        "dans",
        "pour",
        "avec",
        "sur",
        "par",
        "qui",
        "que",
        "au",
        "aux",
        "situé",
        "située",
        "connu",
        "célèbre",
        "musée",
        "bâtiment",
    },
    "de": {
        "der",
        "die",
        "das",
        "ein",
        "eine",
        "und",
        "ist",
        "sind",
        "in",
        "im",
        "von",
        "zu",
        "mit",
        "für",
        "auf",
        "des",
        "dem",
        "den",
        "als",
        "befindet",
        "liegt",
        "bekannt",
        "über",
        "durch",
        "sich",
    },
    "it": {
        "il",
        "lo",
        "la",
        "i",
        "gli",
        "le",
        "un",
        "una",
        "di",
        "del",
        "della",
        "delle",
        "dei",
        "e",
        "è",
        "sono",
        "in",
        "con",
        "per",
        "su",
        "che",
        "al",
        "alla",
        "nel",
        "nella",
        "situato",
        "noto",
        "museo",
    },
    "pt": {
        "o",
        "os",
        "a",
        "as",
        "um",
        "uma",
        "de",
        "do",
        "da",
        "dos",
        "das",
        "em",
        "no",
        "na",
        "e",
        "é",
        "são",
        "com",
        "por",
        "para",
        "que",
        "ao",
        "à",
        "localizado",
        "situado",
        "conhecido",
        "como",
        "entre",
    },
}

_INVALID_BANNER_FRAGMENTS = (
    "mymemory warning",
    "query length limit exceeded",
    "please select two distinct languages",
    "too many requests",
    "<!doctype html",
    "<html",
    "rate limit exceeded",
)


class TranslationError(RuntimeError):
    """Raised when on-demand translation fails or returns invalid output."""


@dataclass(frozen=True)
class TranslationResult:
    translated_text: str
    source_lang: str | None
    target_lang: str
    provider: str


def base_lang_code(lang: str | None) -> str:
    """Returns canonical lowercase base ISO language code (e.g. 'zh-CN' -> 'zh')."""
    if not lang:
        return "en"
    return lang.strip().lower().split("-")[0] or "en"


def normalize_target_lang(lang: str | None) -> str:
    """Normalizes a user locale into a provider-friendly language tag (preserving zh-CN/zh-TW)."""
    raw = (lang or "en").strip()
    if not raw:
        return "en"
    lower = raw.lower()
    if lower in ("zh", "zh-cn", "zh_cn", "zh-hans"):
        return "zh-CN"
    if lower in ("zh-tw", "zh_tw", "zh-hant", "zh-hk"):
        return "zh-TW"
    base = lower.split("-")[0].split("_")[0]
    if base in _SUPPORTED_TARGET_CODES:
        return base
    return base or "en"


def detect_language(text: str | None) -> str | None:
    """Deterministically detects the dominant language of a text snippet.

    Returns a base ISO language code (e.g. 'en', 'es', 'ja', 'zh', 'ko', 'ar', 'th')
    or None when the snippet is too short or ambiguous.
    """
    if not text or not isinstance(text, str):
        return None

    cleaned = text.strip()
    if len(cleaned) < 8:
        return None

    kana_count = 0
    han_count = 0
    hangul_count = 0
    arabic_count = 0
    thai_count = 0
    cyrillic_count = 0
    latin_count = 0

    for ch in cleaned:
        code = ord(ch)
        if (0x3040 <= code <= 0x30FF) or (0x31F0 <= code <= 0x31FF):
            kana_count += 1
        elif 0x4E00 <= code <= 0x9FFF or 0x3400 <= code <= 0x4DBF:
            han_count += 1
        elif 0xAC00 <= code <= 0xD7AF or 0x1100 <= code <= 0x11FF:
            hangul_count += 1
        elif 0x0600 <= code <= 0x06FF or 0x0750 <= code <= 0x077F:
            arabic_count += 1
        elif 0x0E00 <= code <= 0x0E7F:
            thai_count += 1
        elif 0x0400 <= code <= 0x04FF:
            cyrillic_count += 1
        elif ("a" <= ch <= "z") or ("A" <= ch <= "Z") or (0x00C0 <= code <= 0x024F):
            latin_count += 1

    total_alpha = (
        kana_count
        + han_count
        + hangul_count
        + arabic_count
        + thai_count
        + cyrillic_count
        + latin_count
    )
    if total_alpha < 6:
        return None

    # Use script dominance (>35%) so occasional native parentheticals inside
    # an English paragraph—e.g. "Amarin Plaza (อัมรินทร์พลาซ่า)"—don't flip detection.
    if (kana_count + han_count) / total_alpha >= 0.35:
        return "ja" if kana_count > 0 else "zh"
    if hangul_count / total_alpha >= 0.35:
        return "ko"
    if arabic_count / total_alpha >= 0.35:
        return "ar"
    if thai_count / total_alpha >= 0.35:
        return "th"
    if cyrillic_count / total_alpha >= 0.35:
        return "ru"

    if latin_count / total_alpha < 0.5:
        return None

    tokens = re.findall(r"[a-zA-ZÀ-ÿ]+", cleaned.lower())
    if len(tokens) < 4:
        return None

    scores: dict[str, float] = {lang: 0.0 for lang in _STOPWORDS}
    for tok in tokens:
        for lang, sw_set in _STOPWORDS.items():
            if tok in sw_set:
                scores[lang] += 1.0

    # Distinctive orthography signals for Latin languages
    if any(ch in cleaned for ch in ("ñ", "Ñ", "¿", "¡")):
        scores["es"] += 2.5
    if "ß" in cleaned or any(ch in cleaned for ch in ("ä", "ö", "ü", "Ä", "Ö", "Ü")):
        scores["de"] += 2.5
    if any(ch in cleaned for ch in ("ã", "õ", "Ã", "Õ")):
        scores["pt"] += 2.5
    if "œ" in cleaned.lower():
        scores["fr"] += 2.5

    ranked = sorted(scores.items(), key=lambda kv: kv[1], reverse=True)
    top_lang, top_score = ranked[0]
    second_score = ranked[1][1]

    if top_score < 2.0:
        return None
    if top_score - second_score < 1.0:
        return None
    return top_lang


def _validate_translation(source_text: str, translated_text: str) -> str:
    cleaned = (translated_text or "").strip()
    if not cleaned:
        raise TranslationError("Translation provider returned empty output.")

    lower = cleaned.lower()
    for fragment in _INVALID_BANNER_FRAGMENTS:
        if fragment in lower:
            raise TranslationError(
                f"Translation provider returned an error banner ({fragment})."
            )

    if len(source_text.strip()) >= 30 and len(cleaned) < max(
        5, int(len(source_text) * 0.12)
    ):
        raise TranslationError("Translation output was unexpectedly truncated.")

    if len(cleaned) > max(400, len(source_text) * 6):
        raise TranslationError("Translation output exceeded sanity length limit.")

    return cleaned


class TranslationService:
    """On-demand text translation using configured LLM or free stateless HTTP translators."""

    @classmethod
    async def _translate_via_configured_llm(
        cls,
        text: str,
        target_lang: str,
        session: AsyncSession | None,
    ) -> str | None:
        if session is None:
            return None

        try:
            from pydantic_ai import Agent
            from app.db.models import SystemConfigModel
            from app.services.llm_service import (
                CONFIG_KEY,
                LLMService,
                SUPPORTED_PROVIDERS,
            )

            stmt = select(SystemConfigModel).where(SystemConfigModel.key == CONFIG_KEY)
            res = await session.execute(stmt)
            record = res.scalar_one_or_none()
            if not record or not isinstance(record.value, dict):
                return None

            provider = str(record.value.get("provider") or "").lower()
            api_key = record.value.get("api_key")
            meta = SUPPORTED_PROVIDERS.get(provider, {})
            if meta.get("requires_key", True) and not api_key:
                return None

            cfg = await LLMService.get_config_from_db(session)
            if meta.get("requires_key", True) and not cfg.api_key:
                return None

            model = LLMService.create_model(cfg)
            lang_label = _LANGUAGE_NAMES.get(target_lang, target_lang)
            agent = Agent(
                model,
                system_prompt=(
                    f"Translate the user's attraction description accurately into {lang_label}. "
                    "Preserve proper nouns, place names, and factual details. "
                    "Output ONLY the translated text without commentary or quotes."
                ),
            )
            result = await agent.run(text)
            output = getattr(result, "output", None) or getattr(result, "data", None)
            if isinstance(output, str) and output.strip():
                return _validate_translation(text, output)
        except Exception as err:
            logger.debug(f"Configured LLM translation skipped/failed: {err}")
        return None

    @classmethod
    async def get_secret_credentials(
        cls,
        session: AsyncSession | None,
    ) -> dict[str, dict[str, str]]:
        """Reads DeepL and LibreTranslate credentials from DB secrets with env fallbacks."""
        db_secrets: dict[str, Any] = {}
        if session is not None:
            try:
                from app.db.models import SystemConfigModel

                stmt = select(SystemConfigModel).where(
                    SystemConfigModel.key == "secrets"
                )
                res = await session.execute(stmt)
                record = res.scalar_one_or_none()
                if record and isinstance(record.value, dict):
                    db_secrets = record.value
            except Exception as err:
                logger.debug(f"Failed to load translation secrets from DB: {err}")

        deepl_entry = (
            db_secrets.get("deepl") if isinstance(db_secrets.get("deepl"), dict) else {}
        )
        if "token" in deepl_entry:
            deepl_key = str(deepl_entry.get("token") or "").strip()
        else:
            deepl_key = (os.getenv("DEEPL_API_KEY") or "").strip()

        lt_entry = (
            db_secrets.get("libretranslate")
            if isinstance(db_secrets.get("libretranslate"), dict)
            else {}
        )
        if "base_url" in lt_entry:
            lt_url = str(lt_entry.get("base_url") or "").strip().rstrip("/")
            lt_key = str(lt_entry.get("token") or "").strip()
        else:
            lt_url = (os.getenv("LIBRETRANSLATE_URL") or "").strip().rstrip("/")
            lt_key = (os.getenv("LIBRETRANSLATE_API_KEY") or "").strip()

        return {
            "deepl": {"api_key": deepl_key},
            "libretranslate": {"base_url": lt_url, "api_key": lt_key},
        }

    @classmethod
    async def _translate_via_deepl(
        cls,
        text: str,
        target_lang: str,
        source_lang: str | None,
        api_key: str | None = None,
    ) -> str | None:
        effective_key = (
            api_key if api_key is not None else (os.getenv("DEEPL_API_KEY") or "")
        ).strip()
        if not effective_key:
            return None

        endpoint = (
            "https://api-free.deepl.com/v2/translate"
            if effective_key.endswith(":fx")
            else "https://api.deepl.com/v2/translate"
        )
        dl_target = target_lang.upper()
        if dl_target == "ZH-CN":
            dl_target = "ZH-HANS"
        elif dl_target == "ZH-TW":
            dl_target = "ZH-HANT"

        payload: dict[str, str] = {"text": text, "target_lang": dl_target}
        if source_lang:
            payload["source_lang"] = base_lang_code(source_lang).upper()

        try:
            async with httpx.AsyncClient(timeout=8.0) as client:
                resp = await client.post(
                    endpoint,
                    headers={"Authorization": f"DeepL-Auth-Key {effective_key}"},
                    data=payload,
                )
                if resp.status_code == 200:
                    translations = resp.json().get("translations") or []
                    if translations and translations[0].get("text"):
                        return _validate_translation(text, translations[0]["text"])
        except Exception as err:
            logger.debug(f"DeepL translation failed: {err}")
        return None

    @classmethod
    async def _translate_via_libretranslate(
        cls,
        text: str,
        target_lang: str,
        source_lang: str | None,
        base_url: str | None = None,
        api_key: str | None = None,
    ) -> str | None:
        effective_url = (
            (
                base_url
                if base_url is not None
                else (os.getenv("LIBRETRANSLATE_URL") or "")
            )
            .strip()
            .rstrip("/")
        )
        if not effective_url:
            return None

        payload: dict[str, str] = {
            "q": text,
            "source": base_lang_code(source_lang) if source_lang else "auto",
            "target": base_lang_code(target_lang),
            "format": "text",
        }
        effective_key = (
            api_key
            if api_key is not None
            else (os.getenv("LIBRETRANSLATE_API_KEY") or "")
        ).strip()
        if effective_key:
            payload["api_key"] = effective_key

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.post(f"{effective_url}/translate", json=payload)
                if resp.status_code == 200:
                    translated = resp.json().get("translatedText")
                    if isinstance(translated, str) and translated.strip():
                        return _validate_translation(text, translated)
        except Exception as err:
            logger.debug(f"LibreTranslate translation failed: {err}")
        return None

    @classmethod
    async def _translate_via_google_gtx(
        cls,
        text: str,
        target_lang: str,
        source_lang: str | None,
    ) -> tuple[str, str | None] | None:
        url = "https://translate.googleapis.com/translate_a/single"
        sl = normalize_target_lang(source_lang) if source_lang else "auto"
        tl = normalize_target_lang(target_lang)
        params = {
            "client": "gtx",
            "sl": sl,
            "tl": tl,
            "dt": "t",
            "q": text,
        }
        try:
            async with httpx.AsyncClient(
                timeout=8.0,
                headers={"User-Agent": "Paladio/2.0"},
            ) as client:
                resp = await client.get(url, params=params)
                if resp.status_code != 200:
                    logger.debug(f"Google gtx HTTP {resp.status_code}")
                    return None
                data = resp.json()
                if (
                    not isinstance(data, list)
                    or not data
                    or not isinstance(data[0], list)
                ):
                    return None
                chunks = [
                    str(seg[0])
                    for seg in data[0]
                    if isinstance(seg, list) and seg and seg[0]
                ]
                if not chunks:
                    return None
                detected_src = (
                    str(data[2]).strip()
                    if len(data) > 2 and isinstance(data[2], str) and data[2].strip()
                    else source_lang
                )
                validated = _validate_translation(text, "".join(chunks))
                return validated, detected_src
        except Exception as err:
            logger.debug(f"Google gtx translation failed: {err}")
        return None

    @classmethod
    async def _translate_via_mymemory(
        cls,
        text: str,
        target_lang: str,
        source_lang: str | None,
    ) -> str | None:
        if not source_lang or len(text) > 500:
            return None
        sl = normalize_target_lang(source_lang)
        tl = normalize_target_lang(target_lang)
        if base_lang_code(sl) == base_lang_code(tl):
            return text
        try:
            async with httpx.AsyncClient(timeout=8.0) as client:
                resp = await client.get(
                    "https://api.mymemory.translated.net/get",
                    params={"q": text, "langpair": f"{sl}|{tl}"},
                )
                if resp.status_code != 200:
                    return None
                payload = resp.json()
                if int(payload.get("responseStatus") or 0) != 200:
                    return None
                translated = (payload.get("responseData") or {}).get("translatedText")
                if isinstance(translated, str) and translated.strip():
                    return _validate_translation(text, translated)
        except Exception as err:
            logger.debug(f"MyMemory translation failed: {err}")
        return None

    @classmethod
    async def translate_text(
        cls,
        text: str,
        target_lang: str,
        source_lang: str | None = None,
        session: AsyncSession | None = None,
    ) -> TranslationResult:
        """Translates text into target_lang using configured backends or free HTTP fallbacks."""
        clean_text = (text or "").strip()
        if not clean_text:
            raise TranslationError("Cannot translate an empty description.")

        norm_target = normalize_target_lang(target_lang)
        detected_source = (
            normalize_target_lang(source_lang)
            if source_lang
            else detect_language(clean_text)
        )

        if detected_source and base_lang_code(detected_source) == base_lang_code(
            norm_target
        ):
            return TranslationResult(
                translated_text=clean_text,
                source_lang=base_lang_code(detected_source),
                target_lang=norm_target,
                provider="noop",
            )

        creds = await cls.get_secret_credentials(session)

        if deepl_out := await cls._translate_via_deepl(
            clean_text,
            norm_target,
            detected_source,
            api_key=creds["deepl"]["api_key"],
        ):
            return TranslationResult(
                translated_text=deepl_out,
                source_lang=base_lang_code(detected_source)
                if detected_source
                else None,
                target_lang=norm_target,
                provider="deepl",
            )

        if lt_out := await cls._translate_via_libretranslate(
            clean_text,
            norm_target,
            detected_source,
            base_url=creds["libretranslate"]["base_url"],
            api_key=creds["libretranslate"]["api_key"],
        ):
            return TranslationResult(
                translated_text=lt_out,
                source_lang=base_lang_code(detected_source)
                if detected_source
                else None,
                target_lang=norm_target,
                provider="libretranslate",
            )

        if llm_out := await cls._translate_via_configured_llm(
            clean_text, norm_target, session
        ):
            return TranslationResult(
                translated_text=llm_out,
                source_lang=base_lang_code(detected_source)
                if detected_source
                else None,
                target_lang=norm_target,
                provider="llm",
            )

        if gtx_res := await cls._translate_via_google_gtx(
            clean_text, norm_target, detected_source
        ):
            gtx_text, gtx_src = gtx_res
            return TranslationResult(
                translated_text=gtx_text,
                source_lang=base_lang_code(gtx_src) if gtx_src else None,
                target_lang=norm_target,
                provider="google_translate",
            )

        if mm_out := await cls._translate_via_mymemory(
            clean_text, norm_target, detected_source
        ):
            return TranslationResult(
                translated_text=mm_out,
                source_lang=base_lang_code(detected_source)
                if detected_source
                else None,
                target_lang=norm_target,
                provider="mymemory",
            )

        raise TranslationError(
            "Unable to translate description right now. Please try again later or configure an LLM/translation provider."
        )
