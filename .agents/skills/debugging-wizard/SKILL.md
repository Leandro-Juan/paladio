---
name: debugging-wizard
description: Parses error logs, traces execution flow, correlates inputs with unexpected outputs, and applies systematic hypothesis-driven debugging to isolate root causes and formulate rock-solid fixes. Use when diagnosing crashes, debugging failing tests, tracking down unexpected algorithm outputs, solving performance regressions, or isolating non-deterministic behavior.
license: MIT
metadata:
  author: https://github.com/Jeffallan
  version: "1.1.0"
  domain: quality
  triggers: debug, isolate bug, fix bug, root cause, diagnose, unexpected output, assertion failure, test failure, crash
  role: specialist
  scope: analysis
  output-format: analysis
  related-skills: code-reviewer, cpp-pro, cpp-unit-testing
---

# Debugging Wizard

Senior troubleshooting and debugging specialist applying hypothesis-driven analysis and scientific deduction to isolate bugs, identify root causes, and provide permanent solutions.

## Core Workflow

```
1. Reproduce  ──>  2. Isolate  ──>  3. Hypothesize  ──>  4. Verify  ──>  5. Fix & Prevent
 (Minimal Case)     (Binary Search)     (Form Theory)     (Instrument)      (Regression Test)
```

1. **Reproduce**: Create the smallest reproducible example (minimal graph, edge-case input, deterministic seed).
2. **Isolate**: Narrow the search space. Use binary search over call stacks, state transitions, or git revisions (`git bisect`).
3. **Hypothesize**: Formulate specific, falsifiable theories about why actual output differs from expected output.
4. **Verify / Instrument**:
   - Add targeted assertions (`assert(...)`, `EXPECT_TRUE(...)`).
   - Use debuggers (`gdb`, `lldb`), sanitizers (`-fsanitize=address,undefined`), or structured tracing.
   - Disprove false hypotheses before touching production code.
5. **Fix & Prevent**:
   - Apply minimal, clean corrective patch.
   - Add automated regression tests covering the failure mode.

## Diagnostic Strategy Guide

### 1. Unexpected Algorithm Output (Heuristic / Search Solvers)
- **Symptom**: Solver returns sub-optimal path, misses feasible path, or outputs incorrect cost/score.
- **Investigation**:
  - *Heuristic Over-Pruning (Admissibility)*: Did the upper bound underestimate true remaining score? If the upper bound heuristic is not admissible, optimal branches will be pruned prematurely.
  - *State Contamination in Backtracking*: Are state variables (e.g. `current_time`, `visited_mask`, `category_counts`) fully restored when backtracking?
  - *Constraint Precedence*: Did an early deadline evaluation mistakenly reject a path that could have satisfied it through another valid sequence?

### 2. Off-By-One & Boundary Errors
- **Symptom**: Graph nodes indexed `0..N-1` causing out-of-bounds access or bitmask shifting `1ULL << 64` (undefined behavior).
- **Check**: Bit shifts must not exceed type width (e.g. `1ULL << i` valid only for `i < 64`).

### 3. Non-Deterministic Output
- **Symptom**: Different paths found on different runs with same input.
- **Check**: Unsorted iteration over `std::unordered_map`/`std::unordered_set`, uninitialized local variables, floating-point tie-breaking.

## Debugging Output Template

When solving a bug, provide:
1. **Root Cause Analysis**: The exact line and condition that created the failure.
2. **Mechanism of Failure**: Step-by-step trace explaining how input data triggered the flaw.
3. **Minimal Reproducer**: GTest / Python test reproducing the exact failure.
4. **Remediation**: The surgical code fix.
5. **Regression Safeguard**: Permanent assertions or invariant checks.
