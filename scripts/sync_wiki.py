#!/usr/bin/env python3
"""
scripts/sync_wiki.py

Synchronizes Paladio's documentation from `mkdocs.yml` and `docs/` into
GitHub Wiki format (`Home.md`, `_Sidebar.md`, `_Footer.md`, and flat `.md`
pages), rewriting MkDocs Material syntax into GitHub Flavored Markdown and
pruning retired wiki pages.
"""

from __future__ import annotations

import argparse
import os
import re
import subprocess
from pathlib import Path
from typing import Any

import yaml

RAW_ASSETS_BASE = (
    "https://raw.githubusercontent.com/Leandro-Juan/paladio/main/docs/assets"
)

ADMONITION_MAP = {
    "note": "NOTE",
    "info": "NOTE",
    "abstract": "NOTE",
    "tip": "TIP",
    "hint": "TIP",
    "success": "TIP",
    "important": "IMPORTANT",
    "warning": "WARNING",
    "attention": "WARNING",
    "caution": "CAUTION",
    "danger": "CAUTION",
    "error": "CAUTION",
    "bug": "CAUTION",
}


class _MkDocsYamlLoader(yaml.SafeLoader):
    """Safe YAML loader that ignores MkDocs Python-extension tags like !!python/name:."""


_MkDocsYamlLoader.add_multi_constructor("", lambda loader, tag_suffix, node: None)


def make_wiki_slug(rel_path: str, title: str) -> str:
    """Builds a clean, non-hidden GitHub Wiki page slug from nav title and path."""
    cleaned = title.replace("&", "and")
    cleaned = re.sub(r"\.trip\b", "Trip", cleaned, flags=re.IGNORECASE)
    cleaned = cleaned.replace("/engine", "Engine")
    cleaned = re.sub(r"[():,/`]", " ", cleaned)
    cleaned = re.sub(r"\s+", "-", cleaned.strip())
    cleaned = re.sub(r"-{2,}", "-", cleaned).strip(".-")
    if not cleaned:
        cleaned = Path(rel_path).stem.replace("_", "-")
    return cleaned


def load_mkdocs_nav(
    mkdocs_path: Path,
) -> tuple[list[tuple[str, list[tuple[str, str, str]]]], dict[str, str]]:
    """
    Parses `mkdocs.yml` `nav:` into ordered `(section, [(title, rel_path, slug)])`
    plus a `rel_path -> slug` lookup map.
    """
    raw = yaml.load(mkdocs_path.read_text(encoding="utf-8"), Loader=_MkDocsYamlLoader)
    nav_entries: list[Any] = raw.get("nav", [])

    sections: list[tuple[str, list[tuple[str, str, str]]]] = []
    slug_map: dict[str, str] = {}
    used_slugs: set[str] = {"Home"}

    for item in nav_entries:
        if not isinstance(item, dict) or len(item) != 1:
            continue
        sec_title, sec_val = next(iter(item.items()))
        if isinstance(sec_val, str):
            norm_rel = sec_val.replace("\\", "/")
            if norm_rel == "index.md":
                slug_map[norm_rel] = "Home"
            continue

        if isinstance(sec_val, list):
            pages: list[tuple[str, str, str]] = []
            for sub in sec_val:
                if not isinstance(sub, dict) or len(sub) != 1:
                    continue
                page_title, page_rel = next(iter(sub.items()))
                if not isinstance(page_rel, str):
                    continue
                norm_rel = page_rel.replace("\\", "/")
                slug = make_wiki_slug(norm_rel, page_title)
                if slug in used_slugs:
                    raise ValueError(
                        f"Duplicate wiki slug '{slug}' generated for {norm_rel}"
                    )
                used_slugs.add(slug)
                slug_map[norm_rel] = slug
                pages.append((page_title, norm_rel, slug))
            if pages:
                sections.append((sec_title, pages))

    return sections, slug_map


def _dedent_4(line: str) -> str:
    return line[4:] if line.startswith("    ") else line.lstrip()


def _transform_blocks_outside_fences(content: str) -> str:
    """
    Transforms MkDocs Material admonitions (`!!!`, `???`) and content tabs
    (`=== "..."`) into GitHub Flavored Markdown without touching fenced code blocks.
    """
    lines = content.splitlines()
    out: list[str] = []
    i = 0
    in_fence = False
    fence_marker = ""

    admonition_re = re.compile(
        r'^(\!{3}|\?{3})\s+([a-zA-Z0-9_-]+)(?:\s+"([^"]*)")?\s*$'
    )
    tab_re = re.compile(r'^===\s+"([^"]+)"\s*$')

    while i < len(lines):
        line = lines[i]
        stripped = line.lstrip()

        if stripped.startswith(("```", "~~~")):
            marker = stripped[:3]
            if not in_fence:
                in_fence = True
                fence_marker = marker
            elif stripped.startswith(fence_marker):
                in_fence = False
                fence_marker = ""
            out.append(line)
            i += 1
            continue

        if in_fence:
            out.append(line)
            i += 1
            continue

        adm_match = admonition_re.match(line)
        if adm_match:
            prefix, adm_type, custom_title = adm_match.groups()
            gh_alert = ADMONITION_MAP.get(adm_type.lower(), "NOTE")
            body_lines: list[str] = []
            i += 1
            while i < len(lines):
                nxt = lines[i]
                if nxt.startswith("    "):
                    body_lines.append(nxt[4:])
                    i += 1
                elif (
                    nxt.strip() == ""
                    and i + 1 < len(lines)
                    and lines[i + 1].startswith("    ")
                ):
                    body_lines.append("")
                    i += 1
                else:
                    break

            if prefix == "???":
                summary = custom_title or adm_type.title()
                out.append(f"<details><summary>{summary}</summary>")
                out.append("")
                out.extend(body_lines)
                out.append("")
                out.append("</details>")
            else:
                out.append(f"> [!{gh_alert}]")
                if custom_title:
                    out.append(f"> **{custom_title}**")
                    out.append(">")
                for b_line in body_lines:
                    out.append(f"> {b_line}" if b_line else ">")
            continue

        tab_match = tab_re.match(line)
        if tab_match:
            tab_title = tab_match.group(1)
            body_lines = []
            i += 1
            while i < len(lines):
                nxt = lines[i]
                if nxt.startswith("    "):
                    body_lines.append(_dedent_4(nxt))
                    i += 1
                elif (
                    nxt.strip() == ""
                    and i + 1 < len(lines)
                    and lines[i + 1].startswith("    ")
                ):
                    body_lines.append("")
                    i += 1
                else:
                    break
            out.append(f"#### {tab_title}")
            out.append("")
            out.extend(body_lines)
            continue

        out.append(line)
        i += 1

    return "\n".join(out)


def clean_markdown_for_wiki(
    content: str, current_doc_rel: str, slug_map: dict[str, str]
) -> str:
    """Adapts MkDocs Material Markdown into GitHub Wiki Markdown."""
    # Remove Material icon shortcodes and card grid HTML wrappers
    content = re.sub(r":[a-z0-9_-]+:\{[^}]*\}", "", content)
    content = re.sub(r":(octicons|material)-[a-z0-9_-]+:", "", content)
    content = re.sub(r'<div class="grid cards"[^>]*>', "", content)
    content = content.replace("</div>", "")

    content = _transform_blocks_outside_fences(content)

    # Rewrite relative image links pointing into docs/assets/
    def img_replacer(match: re.Match[str]) -> str:
        alt = match.group(1)
        target = match.group(2)
        if target.startswith(("http://", "https://")):
            return match.group(0)
        cur_dir = os.path.dirname(current_doc_rel)
        resolved = os.path.normpath(os.path.join(cur_dir, target)).replace("\\", "/")
        if resolved.startswith("assets/"):
            rel_asset = resolved[len("assets/") :]
            return f"![{alt}]({RAW_ASSETS_BASE}/{rel_asset})"
        return match.group(0)

    content = re.sub(r"!\[([^\]]*)\]\(([^)]+)\)", img_replacer, content)

    # Rewrite relative markdown links to GitHub Wiki page slugs
    def link_replacer(match: re.Match[str]) -> str:
        text = match.group(1)
        target = match.group(2)
        if target.startswith(("http://", "https://")):
            return match.group(0)

        anchor = ""
        if "#" in target:
            target_file, anchor = target.split("#", 1)
            anchor = "#" + anchor
        else:
            target_file = target

        cur_dir = os.path.dirname(current_doc_rel)
        resolved_rel = os.path.normpath(os.path.join(cur_dir, target_file)).replace(
            "\\", "/"
        )

        if resolved_rel == "index.md":
            return f"[{text}](Home{anchor})"
        if resolved_rel in slug_map:
            return f"[{text}]({slug_map[resolved_rel]}{anchor})"
        return match.group(0)

    content = re.sub(r"\[([^\]]+)\]\(([^)]+\.md(?:#[^)]*)?)\)", link_replacer, content)
    return content.strip()


def build_home_page(
    sections: list[tuple[str, list[tuple[str, str, str]]]],
) -> str:
    nav_rows: list[str] = []
    for sec_title, pages in sections:
        links = "<br>".join(f"• [[{p_title}|{slug}]]" for p_title, _, slug in pages)
        first_slug = pages[0][2]
        nav_rows.append(f"| **[{sec_title}]({first_slug})** | {links} |")
    nav_table = "\n".join(nav_rows)

    return f"""# Paladio Technical Wiki

> **Self-Hosted Travel Intelligence & Combinatorial Optimization**
> Deterministic C++20 routing (`paladio_core`) &bull; 9-node LLM-free LangGraph swarm &bull; CPU ONNX semantic search (`fastembed`) &bull; TimescaleDB Deal Engine &bull; Optional 13-provider AI assistant and 82-tool MCP server.

## Platform architecture overview

Paladio isolates probabilistic conversational interfaces from deterministic route math so travel times, opening hours, meal spacing, and budget limits remain provably valid across every edit.

```mermaid
flowchart LR
    Client["Next.js 16 + React 19 UI"] <-->|"REST & WebSockets"| API["FastAPI Gateway"]
    MCPClient["External MCP Clients"] <-->|"Streamable HTTP / stdio"| MCP["FastMCP Server (82 tools)"]

    subgraph Core["Deterministic Trip Engine (Zero LLM)"]
        Swarm["9-Node LangGraph Swarm"] --> Pipe["8-Stage Itinerary v2 Pipeline"]
        Pipe --> RAG["CPU ONNX fastembed + Hybrid RRF"]
        Pipe --> CPP["C++20 paladio_core (TCOPTW / TSPTW)"]
    end

    subgraph OptionalAI["Optional Chat Assistant"]
        Agent["TripAgentRunner (13 LLM Providers)"] --> MCP
    end

    API <--> Core
    API <--> OptionalAI
    API <--> Storage["PostgreSQL 16 + TimescaleDB + pgvector"]
    API <--> Redis["Redis 7 Broker & Pub/Sub"]
    Worker["Celery Worker & Beat"] <--> Storage
    Worker <--> Redis
    API <--> Valhalla["Valhalla Street & Transit Router"]
    Worker <--> Valhalla
```

## Documentation navigator

| Section | Pages |
| :--- | :--- |
{nav_table}

## Quickstart with Docker Compose

Clone the repository, generate `.env` secrets, and launch the 7-container cluster (`api`, `frontend`, `db`, `redis`, `valhalla`, `worker`, `beat`):

```bash
git clone https://github.com/Leandro-Juan/paladio.git
cd paladio
./install.sh
```

Read [[Install with Docker|Install-with-Docker]] for hardware sizing, Windows PowerShell instructions, database migrations, and `/setup` provisioning.

## Portals and links

- **Documentation Portal**: [https://leandro-juan.github.io/paladio/](https://leandro-juan.github.io/paladio/)
- **Source Code Repository**: [https://github.com/Leandro-Juan/Paladio](https://github.com/Leandro-Juan/Paladio)
- **Issue Tracker**: [https://github.com/Leandro-Juan/Paladio/issues](https://github.com/Leandro-Juan/Paladio/issues)
"""


def build_sidebar(
    sections: list[tuple[str, list[tuple[str, str, str]]]],
) -> str:
    parts = ["### Navigation", "- [[Home]]", ""]
    for sec_title, pages in sections:
        parts.append(f"### {sec_title}")
        for page_title, _, slug in pages:
            parts.append(f"- [[{page_title}|{slug}]]")
        parts.append("")
    parts.extend(
        [
            "### External Links",
            "- [Documentation Portal](https://leandro-juan.github.io/paladio/)",
            "- [Source Repository](https://github.com/Leandro-Juan/Paladio)",
            "- [Issue Tracker](https://github.com/Leandro-Juan/Paladio/issues)",
        ]
    )
    return "\n".join(parts).strip() + "\n"


def build_footer() -> str:
    return (
        '<div align="center">\n'
        "  <sub>Paladio &copy; 2026 Leandro Juan &bull; GNU AGPLv3 &bull; "
        '<a href="https://leandro-juan.github.io/paladio/">Documentation Portal</a> &bull; '
        '<a href="https://github.com/Leandro-Juan/Paladio">Source Code</a></sub>\n'
        "</div>\n"
    )


def sync_wiki(docs_dir: Path, mkdocs_path: Path, output_dir: Path) -> None:
    sections, slug_map = load_mkdocs_nav(mkdocs_path)
    output_dir.mkdir(parents=True, exist_ok=True)

    print(f"Syncing {len(slug_map)} pages from {docs_dir} into {output_dir}…")

    expected_files: set[str] = {"Home.md", "_Sidebar.md", "_Footer.md"}
    (output_dir / "Home.md").write_text(build_home_page(sections), encoding="utf-8")
    (output_dir / "_Sidebar.md").write_text(build_sidebar(sections), encoding="utf-8")
    (output_dir / "_Footer.md").write_text(build_footer(), encoding="utf-8")

    for rel_src, wiki_slug in slug_map.items():
        if rel_src == "index.md":
            continue
        src_path = docs_dir / rel_src
        if not src_path.exists():
            raise FileNotFoundError(
                f"Missing source doc referenced in mkdocs.yml: {src_path}"
            )

        raw_content = src_path.read_text(encoding="utf-8")
        cleaned = clean_markdown_for_wiki(raw_content, rel_src, slug_map)
        target_name = f"{wiki_slug}.md"
        expected_files.add(target_name)
        (output_dir / target_name).write_text(cleaned + "\n", encoding="utf-8")
        print(f"  + {rel_src} -> {target_name}")

    # Prune legacy or retired markdown pages from the wiki repository
    pruned = 0
    for md_file in output_dir.rglob("*.md"):
        if ".git" in md_file.parts:
            continue
        rel_out = md_file.relative_to(output_dir).as_posix()
        if rel_out not in expected_files:
            md_file.unlink()
            pruned += 1
            print(f"  - Pruned legacy page {rel_out}")

    print(f"Wiki sync complete ({len(expected_files)} pages written, {pruned} pruned).")


def main() -> None:
    parser = argparse.ArgumentParser(description="Synchronize docs/ to GitHub Wiki")
    parser.add_argument("--docs-dir", default="docs", help="Path to docs directory")
    parser.add_argument("--mkdocs", default="mkdocs.yml", help="Path to mkdocs.yml")
    parser.add_argument(
        "--wiki-dir",
        default="/tmp/paladio_wiki_sync",
        help="Path to cloned wiki repository",
    )
    parser.add_argument(
        "--push", action="store_true", help="Commit and push changes to origin master"
    )
    args = parser.parse_args()

    repo_root = Path(__file__).resolve().parent.parent
    docs_path = (repo_root / args.docs_dir).resolve()
    mkdocs_path = (repo_root / args.mkdocs).resolve()
    wiki_path = Path(args.wiki_dir).resolve()

    sync_wiki(docs_path, mkdocs_path, wiki_path)

    if args.push:
        subprocess.run(["git", "add", "-A"], cwd=wiki_path, check=True)
        status = subprocess.run(
            ["git", "status", "--porcelain"],
            cwd=wiki_path,
            capture_output=True,
            text=True,
            check=True,
        )
        if status.stdout.strip():
            subprocess.run(
                [
                    "git",
                    "commit",
                    "-m",
                    "docs(wiki): rebuild complete v2.0 documentation and prune legacy pages",
                ],
                cwd=wiki_path,
                check=True,
            )
            subprocess.run(
                ["git", "push", "origin", "master"], cwd=wiki_path, check=True
            )
            print("Successfully pushed renovated GitHub Wiki.")
        else:
            print("No changes to commit in wiki repository.")


if __name__ == "__main__":
    main()
