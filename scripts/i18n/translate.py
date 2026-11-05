#!/usr/bin/env python3
"""
Paladio Sovereign i18n Translation Engine:
Translates canonical en.json into any target language from ALL_LOCALES using a local
air-gapped Ollama model (zero cloud LLM APIs).
"""

import argparse
import json
import os
import re
from pathlib import Path
import urllib.request
import urllib.error

LOCALES_DIR = (
    Path(__file__).resolve().parent.parent.parent / "frontend" / "public" / "locales"
)
EN_FILE = LOCALES_DIR / "en.json"

LLM_BASE_URL = os.getenv(
    "LLM_BASE_URL", os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
).rstrip("/")
MODEL_NAME = os.getenv("LLM_MODEL", os.getenv("TRANSLATION_MODEL", "qwen2.5:7b"))
API_KEY = os.getenv("LLM_API_KEY") or os.getenv("OPENAI_API_KEY")


def call_llm(prompt: str, system: str) -> str:
    headers = {"Content-Type": "application/json"}
    if API_KEY:
        headers["Authorization"] = f"Bearer {API_KEY}"
        url = (
            f"{LLM_BASE_URL}/chat/completions"
            if not LLM_BASE_URL.endswith("/chat/completions")
            else LLM_BASE_URL
        )
        payload = {
            "model": MODEL_NAME,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": prompt},
            ],
            "response_format": {"type": "json_object"},
            "temperature": 0.1,
        }
    else:
        url = f"{LLM_BASE_URL}/api/generate"
        payload = {
            "model": MODEL_NAME,
            "prompt": prompt,
            "system": system,
            "stream": False,
            "format": "json",
        }

    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers=headers,
    )
    with urllib.request.urlopen(req, timeout=120) as resp:
        res_data = json.loads(resp.read().decode("utf-8"))
        if "choices" in res_data:
            return res_data["choices"][0]["message"]["content"]
        return res_data.get("response", "")


def translate_namespace(
    ns_name: str, ns_dict: dict, target_lang: str, target_code: str
) -> dict:
    system_prompt = (
        f"You are a professional software localization engine. Translate the following JSON object into {target_lang} (locale: {target_code}).\n"
        "STRICT RULES:\n"
        "1. Return ONLY a valid JSON object matching the input structure.\n"
        "2. NEVER alter or remove variable placeholders like {username}, {count}, {mode}, {duration}, {number}, {destination}.\n"
        "3. Provide natural, professional UI terminology appropriate for modern web applications.\n"
    )
    prompt = json.dumps(ns_dict, ensure_ascii=False, indent=2)
    response_text = call_llm(prompt, system_prompt)
    try:
        return json.loads(response_text)
    except json.JSONDecodeError:
        # Fallback to regex json extraction if enclosed in markdown
        m = re.search(r"\{.*\}", response_text, re.DOTALL)
        if m:
            return json.loads(m.group(0))
        raise


def translate_locale(target_code: str, target_name: str):
    target_file = LOCALES_DIR / f"{target_code}.json"
    print(f"🌐 Translating {target_name} ({target_code})...")

    with open(EN_FILE, "r", encoding="utf-8") as f:
        en_data = json.load(f)

    result = {}
    for ns_name, ns_content in en_data.items():
        print(f"   Translating namespace: {ns_name}...")
        translated_ns = translate_namespace(
            ns_name, ns_content, target_name, target_code
        )
        result[ns_name] = translated_ns

    with open(target_file, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)

    print(f"✅ Generated {target_file}")


def main():
    parser = argparse.ArgumentParser(description="Sovereign i18n Translation Engine")
    parser.add_argument(
        "--code", required=True, help="Target language code (e.g. ru, nl, pl, hi)"
    )
    parser.add_argument("--name", default="", help="Language name (e.g. Russian)")
    args = parser.parse_args()

    target_name = args.name or args.code
    translate_locale(args.code, target_name)


if __name__ == "__main__":
    main()
