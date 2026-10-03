#!/usr/bin/env python3
"""
scripts/import_backlog_to_github.py

Imports items from BACKLOG.md as structured GitHub Issues with epic and priority labels.
"""

import subprocess
import time

ISSUES = [
    # CI
    {
        "title": "[CI] Comprehensive test suite manual revision and hardening",
        "body": "Manually revise all test suites (unit, integration, and e2e) across backend, cpp_core, and frontend to ensure full test isolation, deterministic execution, and complete coverage.",
        "labels": ["epic:ci", "priority:high"],
    },
    # Algorithms
    {
        "title": "[Algorithms] Continuous Relaxation and Multivariable Calculus in Cost Function",
        "body": "Implement Lagrange multipliers to optimize routing and scoring weights dynamically within the cost function.",
        "labels": ["epic:algorithms", "priority:medium"],
    },
    {
        "title": "[Algorithms] Measure Theory and Real Analysis for Anomaly Detection",
        "body": "Utilize Wasserstein distance / optimal transport metrics to measure price distribution shifts and detect travel fare anomalies.",
        "labels": ["epic:algorithms", "priority:medium"],
    },
    {
        "title": "[Algorithms] Differential Geometry for Transit Matrix Modeling",
        "body": "Apply Differential Geometry principles to model transit matrices as Riemannian manifolds, treating optimal itineraries as geodesics.",
        "labels": ["epic:algorithms", "priority:low"],
    },
    {
        "title": "[Algorithms] In-Memory Inference Engine with Automatic Differentiation in C++",
        "body": "Build an Autograd engine in C++ to automatically calibrate cost weights via gradient descent during optimization.",
        "labels": ["epic:algorithms", "priority:low"],
    },
    # Backend
    {
        "title": "[Backend] Enforce Mandatory General POIs during Itinerary Generation",
        "body": "Ensure essential city landmarks (e.g., El Retiro, Puerta del Sol for Madrid) are guaranteed to be visited when generating itineraries for a destination.",
        "labels": ["epic:backend", "priority:high"],
    },
    {
        "title": "[Backend] Dynamic Proportional Subset Logic for Restaurant & Cuisine Distribution",
        "body": "Expand dynamic proportional subset selection logic to balance restaurant cuisine types and taste distribution across varying trip durations.",
        "labels": ["epic:backend", "priority:low"],
    },
    {
        "title": "[Backend] Multi-Airport Search Support for Destination Cities",
        "body": "Support searching all available metropolitan airports for origin and destination cities to identify the lowest fares rather than restricting search to primary hub.",
        "labels": ["epic:backend", "priority:low"],
    },
    {
        "title": "[Backend] Refactor TravelConstraints and Mandatory Field Clarification Workflow",
        "body": "Evaluate optional vs mandatory fields in the TravelConstraints schema and implement an interactive clarification loop when mandatory fields are missing.",
        "labels": ["epic:backend", "priority:low"],
    },
    {
        "title": "[Backend] Explicit User-Input Budgeting vs Prompt Extraction",
        "body": "Allow travelers to explicitly input budget parameters through dedicated UI controls rather than relying solely on LLM prompt extraction.",
        "labels": ["epic:backend", "priority:low"],
    },
    {
        "title": "[Backend] Post-Itinerary Interactive Swarm Refinement",
        "body": "Enable interactive trip refinement after initial itinerary creation (e.g. swap a specific POI, increase museum visits, adjust pacing, insert custom attractions).",
        "labels": ["epic:backend", "priority:low"],
    },
    {
        "title": "[Backend] Hotel Meal Flexibility & Budget-Saving Prompts",
        "body": "Support flexible meal preferences (e.g. dining at hotel on select evenings for budget savings) without requiring strict calendar dates.",
        "labels": ["epic:backend", "priority:low"],
    },
    # Frontend / Ecosystem
    {
        "title": "[Frontend] Integrated Trip Expense & Budget Wallet System",
        "body": "Implement a dedicated in-app wallet and expense tracker for active and planned trips to monitor real-time spending against budget.",
        "labels": ["epic:frontend", "priority:low"],
    },
    {
        "title": "[Frontend] Self-Hosted Photos Vault Integration (Immich / Syncthing)",
        "body": "Connect trip itineraries to self-hosted photo storage platforms (Immich, Syncthing) to automatically catalog and map geo-tagged photos to visited POIs.",
        "labels": ["epic:frontend", "priority:low"],
    },
    {
        "title": "[Ecosystem] Paladio Model Context Protocol (MCP) Server",
        "body": "Expose Paladio's core travel intelligence, POI retrieval, and itinerary solvers as an MCP server for third-party AI assistants and agent frameworks.",
        "labels": ["epic:frontend", "priority:low"],
    },
    {
        "title": "[Routing] Weather & Urban Sun/Shadow-Aware Itinerary Routing",
        "body": "Incorporate real-time weather forecasts and street shadow geometry into walking route computations to optimize comfort during extreme temperatures.",
        "labels": ["epic:frontend", "priority:low"],
    },
    {
        "title": "[Engine] Granular Cultural Meal Windows (Merienda, Almuerzo, Aperitivo)",
        "body": "Expand daily scheduling constraints with customizable regional meal windows (e.g., Spanish merienda, aperitivo, late-night dinners).",
        "labels": ["epic:frontend", "priority:low"],
    },
]


def main():
    print(f"Importing {len(ISSUES)} issues into Leandro-Juan/Paladio...")
    created = []
    for idx, item in enumerate(ISSUES, 1):
        cmd = [
            "gh",
            "issue",
            "create",
            "--repo",
            "Leandro-Juan/Paladio",
            "--title",
            item["title"],
            "--body",
            item["body"],
        ]
        for label in item["labels"]:
            cmd.extend(["--label", label])

        res = subprocess.run(cmd, capture_output=True, text=True, check=True)
        url = res.stdout.strip()
        print(f"[{idx}/{len(ISSUES)}] Created: {item['title']} -> {url}")
        created.append((item["title"], url))
        time.sleep(0.5)

    print("\nAll issues created successfully!")


if __name__ == "__main__":
    main()
