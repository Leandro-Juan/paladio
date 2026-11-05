#!/usr/bin/env python3
"""
Paladio i18n Validator:
Ensures 100% key parity, valid JSON syntax, and interpolation placeholder integrity
across all locale dictionaries in frontend/public/locales/.
"""

import json
import re
import sys
from pathlib import Path

LOCALES_DIR = (
    Path(__file__).resolve().parent.parent.parent / "frontend" / "public" / "locales"
)
EN_FILE = LOCALES_DIR / "en.json"

PLACEHOLDER_REGEX = re.compile(r"\{(\w+)\}")


def flatten_dict(d: dict, prefix: str = "") -> dict[str, str]:
    items = {}
    for k, v in d.items():
        full_key = f"{prefix}.{k}" if prefix else k
        if isinstance(v, dict):
            items.update(flatten_dict(v, full_key))
        elif isinstance(v, str):
            items[full_key] = v
        else:
            raise ValueError(f"Unexpected value type for key '{full_key}': {type(v)}")
    return items


def extract_placeholders(text: str) -> set[str]:
    return set(PLACEHOLDER_REGEX.findall(text))


def main() -> int:
    if not EN_FILE.exists():
        print(f"❌ Error: Canonical base file {EN_FILE} not found!")
        return 1

    try:
        with open(EN_FILE, "r", encoding="utf-8") as f:
            en_data = json.load(f)
    except Exception as e:
        print(f"❌ Error reading en.json: {e}")
        return 1

    en_flat = flatten_dict(en_data)
    total_keys = len(en_flat)
    print(
        f"📖 Canonical en.json has {total_keys} keys across {len(en_data)} namespaces."
    )

    locale_files = sorted(LOCALES_DIR.glob("*.json"))
    if not locale_files:
        print("❌ No locale files found in", LOCALES_DIR)
        return 1

    has_errors = False

    sync_fallbacks = "--sync-fallbacks" in sys.argv

    for loc_file in locale_files:
        if loc_file.name == "en.json":
            continue

        locale_code = loc_file.stem
        try:
            with open(loc_file, "r", encoding="utf-8") as f:
                loc_data = json.load(f)
        except Exception as e:
            print(f"❌ [{locale_code}] Syntax Error in {loc_file.name}: {e}")
            has_errors = True
            continue

        loc_flat = flatten_dict(loc_data)

        missing_keys = set(en_flat.keys()) - set(loc_flat.keys())
        extra_keys = set(loc_flat.keys()) - set(en_flat.keys())

        if sync_fallbacks and (missing_keys or extra_keys):
            print(
                f"🔄 [{locale_code}] Syncing missing/extra keys with canonical en.json..."
            )

            # Reconstruct loc_data matching en_data structure
            def sync_dict(en_node, loc_node):
                result = {}
                for k, v in en_node.items():
                    if isinstance(v, dict):
                        loc_child = (
                            loc_node.get(k, {}) if isinstance(loc_node, dict) else {}
                        )
                        result[k] = sync_dict(v, loc_child)
                    else:
                        if (
                            isinstance(loc_node, dict)
                            and k in loc_node
                            and isinstance(loc_node[k], str)
                        ):
                            result[k] = loc_node[k]
                        else:
                            result[k] = v  # Fallback to English value
                return result

            loc_data = sync_dict(en_data, loc_data)
            with open(loc_file, "w", encoding="utf-8") as f:
                json.dump(loc_data, f, ensure_ascii=False, indent=2)
            loc_flat = flatten_dict(loc_data)
            missing_keys = set(en_flat.keys()) - set(loc_flat.keys())
            extra_keys = set(loc_flat.keys()) - set(en_flat.keys())

        placeholder_mismatches = []

        for key, en_val in en_flat.items():
            if key in loc_flat:
                loc_val = loc_flat[key]
                en_ph = extract_placeholders(en_val)
                loc_ph = extract_placeholders(loc_val)
                if en_ph != loc_ph:
                    placeholder_mismatches.append(
                        f"Key '{key}': expected {en_ph}, got {loc_ph}"
                    )

        if missing_keys or extra_keys or placeholder_mismatches:
            has_errors = True
            print(f"❌ [{locale_code}] FAILED:")
            if missing_keys:
                print(
                    f"   - Missing {len(missing_keys)} keys: {sorted(missing_keys)[:5]}..."
                )
            if extra_keys:
                print(f"   - Extra {len(extra_keys)} keys: {sorted(extra_keys)[:5]}...")
            if placeholder_mismatches:
                print(
                    f"   - Placeholder errors ({len(placeholder_mismatches)}): {placeholder_mismatches[:3]}..."
                )
        else:
            print(
                f"✅ [{locale_code}] 100% key parity ({total_keys}/{total_keys} keys) and placeholders intact."
            )

    if has_errors:
        print("\n❌ i18n validation failed! Please fix the errors above.")
        return 1

    print("\n🎉 All locale dictionaries passed validation with 100% parity!")
    return 0


if __name__ == "__main__":
    sys.exit(main())
