#!/usr/bin/env python3
"""
Paladio Sovereign i18n String Discovery Engine:
Scans frontend/src/ for untranslated JSX text nodes, placeholders, aria-labels,
and titles that are not yet wrapped in t('...').
"""

import json
import re
from pathlib import Path

FRONTEND_SRC = Path(__file__).resolve().parent.parent.parent / "frontend" / "src"
LOCALES_DIR = (
    Path(__file__).resolve().parent.parent.parent / "frontend" / "public" / "locales"
)
EN_FILE = LOCALES_DIR / "en.json"

# Patterns
JSX_TEXT_PATTERN = re.compile(
    r">\s*([A-Za-z][A-Za-z0-9\s,\.\'\"\!\?\:\;\-\(\)\/]{2,})\s*<"
)
ATTR_PATTERN = re.compile(r'(placeholder|aria-label|title|alt)=["\']([^"\']{2,})["\']')
TOAST_PATTERN = re.compile(
    r'(?:toast\.(?:error|success|info|warning)|alert)\(["\']([^"\']{3,})["\']\)'
)

IGNORE_PATTERNS = [
    re.compile(
        r"^(var|rgba?|hsla?|calc|translate|rotate|flex|grid|auto|none|block|inline|absolute|relative|fixed)\b"
    ),
    re.compile(r"^(https?:\/\/|\/|#|[0-9]+(\.[0-9]+)?(px|rem|em|%|ms|s)?$)"),
    re.compile(r"^[A-Z0-9_-]+$"),  # CONSTANTS or single words like ID, POI, GTFS
    re.compile(r"^&[a-z]+;$"),  # HTML entities
    re.compile(r"^\s*\{\s*"),  # JSX expressions
]


def should_ignore(text: str) -> bool:
    clean = text.strip()
    if len(clean) < 3:
        return True
    if any(p.match(clean) for p in IGNORE_PATTERNS):
        return True
    # Ignore if pure symbols or numbers
    if not re.search(r"[a-zA-Z]", clean):
        return True
    # Ignore typical code tokens
    if clean in {
        "use client",
        "use strict",
        "hidden",
        "true",
        "false",
        "null",
        "undefined",
        "POST",
        "GET",
        "PUT",
        "DELETE",
        "Content-Type",
        "application/json",
        "font-mono",
        "font-display",
        "text-muted",
    }:
        return True
    return False


def load_en_values() -> set[str]:
    if not EN_FILE.exists():
        return set()
    with open(EN_FILE, "r", encoding="utf-8") as f:
        data = json.load(f)

    def extract_vals(d):
        vals = set()
        for v in d.values():
            if isinstance(v, dict):
                vals.update(extract_vals(v))
            elif isinstance(v, str):
                vals.add(v.strip().lower())
        return vals

    return extract_vals(data)


def scan_file(file_path: Path, en_values: set[str]):
    try:
        content = file_path.read_text(encoding="utf-8")
    except Exception:
        return []

    lines = content.splitlines()
    findings = []

    for idx, line in enumerate(lines, start=1):
        # Skip import lines and comments
        trimmed = line.strip()
        if trimmed.startswith(
            ("import ", "//", "/*", "*", "export type ", "interface ")
        ):
            continue

        # 1. JSX Text
        for m in JSX_TEXT_PATTERN.finditer(line):
            text = m.group(1).strip()
            if not should_ignore(text):
                findings.append(
                    {
                        "line": idx,
                        "type": "jsx_text",
                        "text": text,
                        "already_in_en": text.lower() in en_values,
                    }
                )

        # 2. Attributes
        for m in ATTR_PATTERN.finditer(line):
            attr_name = m.group(1)
            text = m.group(2).strip()
            if not should_ignore(text):
                findings.append(
                    {
                        "line": idx,
                        "type": f"attr:{attr_name}",
                        "text": text,
                        "already_in_en": text.lower() in en_values,
                    }
                )

        # 3. Toast / Alert
        for m in TOAST_PATTERN.finditer(line):
            text = m.group(1).strip()
            if not should_ignore(text):
                findings.append(
                    {
                        "line": idx,
                        "type": "toast",
                        "text": text,
                        "already_in_en": text.lower() in en_values,
                    }
                )

    return findings


def main():
    en_values = load_en_values()
    print(f"Loaded {len(en_values)} existing strings from {EN_FILE.name}")

    all_results = {}
    total_findings = 0
    total_new = 0

    for p in sorted(FRONTEND_SRC.rglob("*.tsx")):
        # Skip test files and node_modules
        rel_path = str(p.relative_to(FRONTEND_SRC))
        if "__tests__" in rel_path or ".test." in rel_path or ".spec." in rel_path:
            continue

        findings = scan_file(p, en_values)
        if findings:
            all_results[rel_path] = findings
            total_findings += len(findings)
            total_new += sum(1 for f in findings if not f["already_in_en"])

    print("\n🔍 Scan Summary:")
    print(f"Files scanned with findings: {len(all_results)}")
    print(
        f"Total potential strings found: {total_findings} (new to en.json: {total_new})\n"
    )

    # Group by top directory
    by_category = {}
    for rel_path, items in all_results.items():
        cat = rel_path.split("/")[0]
        if cat == "components":
            sub = rel_path.split("/")[1]
            cat = f"components/{sub}" if not sub.endswith(".tsx") else "components"
        by_category.setdefault(cat, []).extend(items)

    print("Breakdown by area:")
    for cat, items in sorted(
        by_category.items(), key=lambda x: len(x[1]), reverse=True
    ):
        new_cnt = sum(1 for i in items if not i["already_in_en"])
        print(f"  - {cat:30s}: {len(items):3d} strings ({new_cnt:3d} new)")

    # Save output to json for reference
    out_file = Path(__file__).resolve().parent / "untranslated_inventory.json"
    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(all_results, f, ensure_ascii=False, indent=2)
    print(f"\nSaved detailed inventory to {out_file}")


if __name__ == "__main__":
    main()
