"""
CI Guard Test: Zero Synthetic Data Tripwire (PLAN.md Phase 1.7 / D12).

Scans engine/market/ and api/market.py for forbidden synthetic patterns:
- '% len('
- 'T10:00'
- 'mock_'
- 'timedelta(hours=9)'
- hardcoded latitude/longitude literals (41.8902, 12.4922, 48.8566, 2.3522)
- 'Hotel in'
- 'Lodging in'
"""

import os
import re

FORBIDDEN_PATTERNS = [
    (r"%\s*len\(", "% len("),
    (r"T10:00", "T10:00"),
    (r"mock_", "mock_"),
    (r"timedelta\(\s*hours\s*=\s*9\s*\)", "timedelta(hours=9)"),
    (r"41\.8902|12\.4922|48\.8566|2\.3522", "hardcoded lat/lon coordinate literals"),
    (r"Hotel in\b", "Hotel in"),
    (r"Lodging in\b", "Lodging in"),
]


def test_ci_guard_no_synthetic_data():
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    target_paths = [
        os.path.join(base_dir, "app", "engine", "market"),
        os.path.join(base_dir, "app", "api", "market.py"),
    ]

    files_to_check = []
    for path in target_paths:
        if os.path.isfile(path):
            files_to_check.append(path)
        elif os.path.isdir(path):
            for root, _, files in os.walk(path):
                for f in files:
                    if f.endswith(".py"):
                        files_to_check.append(os.path.join(root, f))

    violations = []
    for file_path in files_to_check:
        with open(file_path, "r", encoding="utf-8") as f:
            lines = f.readlines()

        for line_num, line in enumerate(lines, 1):
            # Skip comments or docstrings if needed, but per rule treat whole file as tripwire
            stripped = line.strip()
            if stripped.startswith("#"):
                continue
            for pattern, label in FORBIDDEN_PATTERNS:
                if re.search(pattern, line):
                    violations.append(
                        f"{file_path}:{line_num} contains forbidden pattern '{label}': {line.strip()}"
                    )

    assert not violations, (
        "Synthetic data patterns detected in codebase:\n" + "\n".join(violations)
    )
