#!/usr/bin/env python3
"""
scripts/sync_wiki.py

Converts and synchronizes Paladio's Diátaxis documentation from `docs/`
into the GitHub Wiki format (_Sidebar.md, _Footer.md, Home.md, and flat wiki pages).
"""

import os
import re
import subprocess
from pathlib import Path

# Mapping from source docs/ relative paths to GitHub Wiki page names
PAGE_MAPPING = {
    # Tutorials
    "tutorials/quickstart-docker.md": "Quickstart-with-Docker",
    "tutorials/first-autonomous-swarm-trip.md": "First-Autonomous-Swarm-Trip",
    # How-To Guides
    "how-to/run-offline-swarm.md": "Run-Offline-Swarm",
    "how-to/add-custom-langgraph-agent.md": "Add-Custom-LangGraph-Agent",
    "how-to/modify-engine-constraints.md": "Modify-Engine-Constraints",
    "how-to/tune-ml-taste-learning.md": "Tune-ML-Taste-Learning",
    "how-to/configure-hybrid-scoring-weights.md": "Configure-Hybrid-Scoring-Weights",
    "how-to/handle-human-in-the-loop.md": "Handle-Human-in-the-Loop",
    "how-to/hydrate-poi-embeddings.md": "Hydrate-POI-Embeddings",
    # Technical Reference
    "reference/langgraph-swarm-architecture.md": "LangGraph-Swarm-Architecture",
    "reference/ml-feature-tensor-16d.md": "16-D-Feature-Tensor",
    "reference/semantic-learning-engine.md": "Semantic-Learning-Engine",
    "reference/poi-database-schema.md": "POI-Database-and-Vault-Schema",
    "reference/frontend-architecture.md": "Next.js-Frontend-Architecture",
    "reference/websocket-gateway-telemetry.md": "WebSocket-Gateway-Telemetry",
    "reference/fastapi-gateway.md": "FastAPI-Gateway",
    "reference/scraper_json_formats.md": "Scraper-JSON-Formats",
    "reference/core-engine.md": "C++-Combinatorial-Core",
    # Architectural Explanation
    "explanation/system-architecture.md": "Macro-System-Architecture",
    "explanation/langgraph-vs-chains.md": "LangGraph-vs-Linear-Chains",
    "explanation/sovereign-ml-and-semantic-rag.md": "Sovereign-ML-and-Semantic-RAG",
    "explanation/continuous-to-discrete-harmonics.md": "Continuous-to-Discrete-Harmonics",
    "explanation/resilient-scraping-architecture.md": "Resilient-Scraping-Architecture",
    "explanation/roadmap-and-future-horizons.md": "Strategic-Roadmap-and-Future-Horizons",
}


def clean_markdown_for_wiki(content: str, current_doc_rel: str) -> str:
    """Adapts MkDocs-flavored markdown to standard GitHub Wiki Markdown."""
    # Remove MkDocs Material emoji / icon extensions like :material-school:{ .lg .middle }
    content = re.sub(r":[a-z0-9_-]+:\{[^}]*\}", "", content)
    content = re.sub(r":(octicons|material)-[a-z0-9_-]+:", "", content)

    # Clean grid cards HTML wrappers
    content = re.sub(r'<div class="grid cards"[^>]*>', "", content)
    content = content.replace("</div>", "")

    # Convert internal relative links to wiki page links
    # Look for [text](relative_path.md)
    def link_replacer(match):
        text = match.group(1)
        target = match.group(2)

        # Strip anchor if present
        anchor = ""
        if "#" in target:
            target_file, anchor = target.split("#", 1)
            anchor = "#" + anchor
        else:
            target_file = target

        # Resolve relative target against current_doc_rel directory
        cur_dir = os.path.dirname(current_doc_rel)
        resolved_rel = os.path.normpath(os.path.join(cur_dir, target_file)).replace(
            "\\", "/"
        )

        if resolved_rel == "index.md":
            return f"[{text}](Home{anchor})"

        if resolved_rel in PAGE_MAPPING:
            wiki_target = PAGE_MAPPING[resolved_rel]
            return f"[{text}]({wiki_target}{anchor})"

        return match.group(0)

    # Regex for markdown links
    content = re.sub(r"\[([^\]]+)\]\(([^)]+\.md(?:#[^)]*)?)\)", link_replacer, content)

    return content.strip()


def build_home_page() -> str:
    return """# Welcome to the Paladio Technical Wiki

> **100% Sovereign Travel Intelligence & Combinatorial Optimization Platform**  
> Sub-millisecond C++20 routing &bull; LangGraph multi-agent swarm &bull; Continuous 768-D semantic taste learning &bull; Zero cloud API dependencies.

---

## 🏛️ Macro Architecture Overview

Paladio bridges the gap between **conversational generative AI** and **provable mathematical optimization**. Large Language Models handle unstructured intent extraction, while compiled C++20 algorithms perform exact routing and scheduling under hard temporal and budgetary constraints.

```mermaid
graph TD
    User(["Traveler / Client"]) <-->|WebSocket & REST| FE["Next.js 15 Frontend + Radar Telemetry"]
    FE <-->|FastAPI Gateway| SWARM["LangGraph Multi-Agent Swarm"]
    
    subgraph SwarmCore ["LangGraph Multi-Agent Engine"]
        PA["Prompt Analyzer Agent"] --> KG["POI Discovery & Vector RAG"]
        KG --> ML["Continuous Taste Engine (EMA 768-D)"]
        ML --> CORE["C++20 Combinatorial Solver (paladio-core)"]
    end
    
    subgraph Storage ["Sovereign Data Storage"]
        PG[("PostgreSQL 16 + pgvector")]
        RD[("Redis State Store")]
    end
    
    KG <--> PG
    SWARM <--> RD
    CORE -->|Deterministic Itinerary| FE
```

---

## 🧭 Diátaxis Documentation Navigator

All Paladio documentation is categorized according to the **Diátaxis framework**:

| Quadrant | Focus | Key Topics |
| :--- | :--- | :--- |
| **🚀 [Tutorials](Quickstart-with-Docker)** | *Learning-oriented* | • [[Quickstart with Docker|Quickstart-with-Docker]]<br>• [[First Autonomous Swarm Trip|First-Autonomous-Swarm-Trip]] |
| **🛠️ [How-To Guides](Run-Offline-Swarm)** | *Problem-oriented* | • [[Run Offline Swarm|Run-Offline-Swarm]]<br>• [[Add Custom LangGraph Agent|Add-Custom-LangGraph-Agent]]<br>• [[Modify Engine Constraints|Modify-Engine-Constraints]]<br>• [[Tune ML Taste Learning|Tune-ML-Taste-Learning]]<br>• [[Configure Hybrid Scoring Weights|Configure-Hybrid-Scoring-Weights]]<br>• [[Handle Human-in-the-Loop|Handle-Human-in-the-Loop]]<br>• [[Hydrate POI Embeddings|Hydrate-POI-Embeddings]] |
| **📖 [Technical Reference](LangGraph-Swarm-Architecture)** | *Information-oriented* | • [[LangGraph Swarm Architecture|LangGraph-Swarm-Architecture]]<br>• [[16-D Feature Tensor|16-D-Feature-Tensor]]<br>• [[Semantic Learning Engine|Semantic-Learning-Engine]]<br>• [[POI Database & Vault Schema|POI-Database-and-Vault-Schema]]<br>• [[Next.js Frontend Architecture|Next.js-Frontend-Architecture]]<br>• [[WebSocket Gateway Telemetry|WebSocket-Gateway-Telemetry]]<br>• [[FastAPI Gateway|FastAPI-Gateway]]<br>• [[Scraper JSON Formats|Scraper-JSON-Formats]]<br>• [[C++ Combinatorial Core|C++-Combinatorial-Core]] |
| **💡 [Architectural Explanations](Macro-System-Architecture)** | *Understanding-oriented* | • [[Macro System Architecture|Macro-System-Architecture]]<br>• [[LangGraph vs. Linear Chains|LangGraph-vs-Linear-Chains]]<br>• [[Sovereign ML & Semantic RAG|Sovereign-ML-and-Semantic-RAG]]<br>• [[Continuous-to-Discrete Harmonics|Continuous-to-Discrete-Harmonics]]<br>• [[Resilient Scraping Architecture|Resilient-Scraping-Architecture]]<br>• [[Strategic Roadmap & Future Horizons|Strategic-Roadmap-and-Future-Horizons]] |

---

## ⚡ Quickstart

Get the entire sovereign cluster running locally in under 5 minutes:

```bash
# 1. Clone repository
git clone https://github.com/Leandro-Juan/Paladio.git
cd Paladio

# 2. Configure environment
cp .env.example .env

# 3. Spin up full container cluster
docker compose up -d
```

For complete instructions, verification healthchecks, and troubleshooting, visit the [[Quickstart with Docker|Quickstart-with-Docker]] guide.

---

## 🔗 Portals & External Links
- **Official Documentation Portal:** [https://leandro-juan.github.io/paladio/](https://leandro-juan.github.io/paladio/)
- **Source Code Repository:** [https://github.com/Leandro-Juan/Paladio](https://github.com/Leandro-Juan/Paladio)
- **Issue Tracker & Roadmaps:** [https://github.com/Leandro-Juan/Paladio/issues](https://github.com/Leandro-Juan/Paladio/issues)
"""


def build_sidebar() -> str:
    return """### 🧭 Navigation
- [[Home]]

### 🚀 Tutorials
- [[Quickstart with Docker|Quickstart-with-Docker]]
- [[First Autonomous Swarm Trip|First-Autonomous-Swarm-Trip]]

### 🛠️ How-To Guides
- [[Run Offline Swarm|Run-Offline-Swarm]]
- [[Add Custom LangGraph Agent|Add-Custom-LangGraph-Agent]]
- [[Modify Engine Constraints|Modify-Engine-Constraints]]
- [[Tune ML Taste Learning|Tune-ML-Taste-Learning]]
- [[Configure Hybrid Scoring Weights|Configure-Hybrid-Scoring-Weights]]
- [[Handle Human-in-the-Loop|Handle-Human-in-the-Loop]]
- [[Hydrate POI Embeddings|Hydrate-POI-Embeddings]]

### 📖 Technical Reference
- [[LangGraph Swarm Architecture|LangGraph-Swarm-Architecture]]
- [[16-D Feature Tensor|16-D-Feature-Tensor]]
- [[Semantic Learning Engine|Semantic-Learning-Engine]]
- [[POI Database & Vault Schema|POI-Database-and-Vault-Schema]]
- [[Next.js Frontend Architecture|Next.js-Frontend-Architecture]]
- [[WebSocket Gateway Telemetry|WebSocket-Gateway-Telemetry]]
- [[FastAPI Gateway|FastAPI-Gateway]]
- [[Scraper JSON Formats|Scraper-JSON-Formats]]
- [[C++ Combinatorial Core|C++-Combinatorial-Core]]

### 💡 Architectural Explanations
- [[Macro System Architecture|Macro-System-Architecture]]
- [[LangGraph vs. Linear Chains|LangGraph-vs-Linear-Chains]]
- [[Sovereign ML & Semantic RAG|Sovereign-ML-and-Semantic-RAG]]
- [[Continuous-to-Discrete Harmonics|Continuous-to-Discrete-Harmonics]]
- [[Resilient Scraping Architecture|Resilient-Scraping-Architecture]]
- [[Strategic Roadmap & Future Horizons|Strategic-Roadmap-and-Future-Horizons]]

---
### 🔗 External Links
- [Main GitHub Repository](https://github.com/Leandro-Juan/Paladio)
- [Official Documentation Site](https://leandro-juan.github.io/paladio/)
- [Issue Tracker](https://github.com/Leandro-Juan/Paladio/issues)
"""


def build_footer() -> str:
    return """---
<div align="center">
  <sub>Paladio &copy; 2026 Leandro Juan &bull; Released under GNU AGPLv3 &bull; <a href="https://leandro-juan.github.io/paladio/">Documentation Portal</a> &bull; <a href="https://github.com/Leandro-Juan/Paladio">Source Code</a></sub>
</div>
"""


def sync_wiki(docs_dir: Path, output_dir: Path):
    output_dir.mkdir(parents=True, exist_ok=True)

    print(f"Generating Wiki files from {docs_dir} into {output_dir}...")

    # 1. Generate Home.md
    home_path = output_dir / "Home.md"
    home_path.write_text(build_home_page(), encoding="utf-8")
    print(f"  + Generated {home_path.name}")

    # 2. Generate _Sidebar.md
    sidebar_path = output_dir / "_Sidebar.md"
    sidebar_path.write_text(build_sidebar(), encoding="utf-8")
    print(f"  + Generated {sidebar_path.name}")

    # 3. Generate _Footer.md
    footer_path = output_dir / "_Footer.md"
    footer_path.write_text(build_footer(), encoding="utf-8")
    print(f"  + Generated {footer_path.name}")

    # 4. Generate all mapped pages
    for rel_src, wiki_name in PAGE_MAPPING.items():
        src_path = docs_dir / rel_src
        if not src_path.exists():
            print(f"  ! Warning: Source file {src_path} does not exist. Skipping.")
            continue

        raw_content = src_path.read_text(encoding="utf-8")
        cleaned_content = clean_markdown_for_wiki(raw_content, rel_src)

        target_file = output_dir / f"{wiki_name}.md"
        target_file.write_text(cleaned_content + "\n", encoding="utf-8")
        print(f"  + Synced {rel_src} -> {target_file.name}")

    print("\nWiki generation completed successfully!")


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Synchronize docs to GitHub Wiki")
    parser.add_argument("--docs-dir", default="docs", help="Path to docs directory")
    parser.add_argument(
        "--wiki-dir", default="/tmp/paladio_wiki", help="Path to cloned wiki repository"
    )
    parser.add_argument(
        "--push", action="store_true", help="Automatically commit and push to git"
    )

    args = parser.parse_args()

    repo_root = Path(__file__).resolve().parent.parent
    docs_path = (repo_root / args.docs_dir).resolve()
    wiki_path = Path(args.wiki_dir).resolve()

    sync_wiki(docs_path, wiki_path)

    if args.push:
        print("\nCommitting and pushing to remote wiki repository...")
        subprocess.run(["git", "add", "."], cwd=wiki_path, check=True)
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
                    "docs(wiki): synchronize full documentation suite and navigation",
                ],
                cwd=wiki_path,
                check=True,
            )
            subprocess.run(
                ["git", "push", "origin", "master"], cwd=wiki_path, check=True
            )
            print("Successfully pushed to GitHub Wiki!")
        else:
            print("No changes to commit in wiki repository.")
