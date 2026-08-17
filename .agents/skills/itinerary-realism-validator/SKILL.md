---
name: itinerary-realism-validator
description: Audits travel optimization engines and itinerary planner logic for human-realism (fatigue, meal spacing, transit logic, idle time). Use whenever generating or validating an itinerary or travel solver output to ensure it respects real-world constraints.
metadata:
  version: "2.0.0"
  domain: domain-travel-optimization
---

# Itinerary Realism Validator

A specialized auditing skill for travel route optimizers, trip planners, and TCOP solvers. The goal is to ensure generated itineraries are not just mathematically optimal, but **physically, temporally, and humanly realistic**.

When optimizing for score/value, travel solvers often exploit loopholes (e.g., eating lunch at 9 AM, running back and forth across a city, or skipping rest). This skill helps you audit outputs and solver logic to prevent these exploits.

## 1. Core Principles (The "Why")

- **Human Fatigue**: People get tired. An itinerary packed with 10 high-effort activities with no breaks is mathematically optimal but physically impossible.
- **Meal Biology**: Humans eat meals at specific times and with minimum spacing. They don't eat lunch right after breakfast just because it minimizes transit time.
- **Geographic Sanity**: Ping-ponging between the North and South ends of a city wastes time and causes frustration. Paths should be geographically clustered.
- **Time is Continuous**: Waiting 2 hours for a museum to open while standing on the street is a bad user experience. Excessive idle time should be penalized.

For detailed invariant matrices and logic traps, read `references/realism-rules.md`.

## 2. Auditing Workflow

When evaluating a travel engine's output or auditing its C++ source code, follow these steps:

1. **Extract the Route**: Get the exact sequence of POIs, arrival times, durations, and transit times.
2. **Run the Automated Validator**:
   Use the provided Python script to parse and audit the itinerary data for violations.
   ```bash
   python scripts/validate_itinerary.py path/to/itinerary.json
   ```
   *(See the script for expected JSON format)*
3. **Analyze Heuristic Traps in Source Code**:
   If auditing the engine logic (e.g., `engine.cpp`), ensure the branch-and-bound pruning respects the rules in `references/realism-rules.md`. Pay special attention to fatigue accumulation, false pruning on meal deadlines, and monotony decay invariants.
4. **Suggest Actionable Fixes**:
   If the itinerary fails the realism check, propose specific code or heuristic modifications to fix the loophole.

## 3. Resources

- **`references/realism-rules.md`**: Detailed matrix of realism rules and common C++ optimization traps.
- **`scripts/validate_itinerary.py`**: Automated audit script.
