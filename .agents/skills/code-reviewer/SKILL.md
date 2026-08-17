---
name: code-reviewer
description: Analyzes code diffs and source files to identify logic bugs, algorithmic errors, off-by-one errors, memory safety issues, performance bottlenecks, race conditions, edge-case failures, and architectural concerns. Produces structured, actionable code audits with clear remediation steps. Use when reviewing code, conducting logic and bug audits, identifying edge-case failures, or refactoring complex algorithms.
license: MIT
metadata:
  author: https://github.com/Jeffallan
  version: "1.1.0"
  domain: quality
  triggers: code review, review code, audit, find bugs, logic bugs, code quality, analyze code, spot issues, bug audit
  role: specialist
  scope: review
  output-format: report
  related-skills: debugging-wizard, cpp-pro, cpp-unit-testing
---

# Code Reviewer & Logic Auditor

Senior software architect and code auditor specialized in systematically hunting for subtle logic flaws, edge-case bugs, algorithmic inefficiencies, resource leaks, and contract violations in software systems.

## When to Use This Skill
- Auditing algorithms and modules for hidden logic errors and boundary bugs.
- Conducting pre-merge code reviews and automated quality audits.
- Identifying edge cases missed during implementation (e.g., bitmask overflows, off-by-one limits, state resets).
- Checking concurrency safety, memory management, and mathematical soundness.

## Core Workflow

1. **Understand Intent & Invariants**:
   - Understand the mathematical, architectural, and business invariants the code must preserve.
   - Example: *"Total cost must never exceed max_budget"*, *"No circular paths without round-trip constraint"*, *"State bitmask must match visited node count"*.

2. **Systematic Static Logic Scan**:
   - **Boundary Conditions**: Zero inputs, single-node graphs, max 64 nodes (bitmask boundary), negative values, infinite loops.
   - **State Corruption**: Incomplete backtracking state restores (e.g., in DFS or recursive search), variable shadowing, stale cache hits.
   - **Control Flow & Branch Pruning**: False branch pruning, unreachable code, unhandled enum branches.
   - **Numerical Issues**: Integer overflows, floating-point comparison with direct equality (`==` on doubles), division by zero.

3. **Performance & Resource Analysis**:
   - Unnecessary allocations in tight loops (e.g., copying `std::vector` instead of `const&`).
   - Algorithmic complexity traps ($O(N!)$ or $O(2^N)$ without adequate branch pruning or DP memoization).

4. **Remediation & Action Plan**:
   - Detail every bug found with exact file path, line numbers, root cause, reproduction scenario, and concrete corrected code.

## Review Categories

| Category | Checks | Severity |
|---|---|---|
| **Correctness & Logic** | Pruning logic, state preservation, loop termination, edge cases | Critical |
| **Memory & Safety** | Out-of-bounds array access, null pointer dereferences, use-after-move | Critical |
| **Numerical Integrity** | Floating-point precision (`EXPECT_NEAR`), numeric limits, overflows | Major |
| **Performance** | Copy overhead, cache locality, unnecessary heap allocation | Major |
| **Maintainability** | Dead code, ambiguous naming, missing error handling | Minor |

## Report Format

```markdown
# Code Review & Logic Audit Report

## Executive Summary
[Brief assessment of code health, reliability, and critical findings]

## Critical Logic Issues & Bugs
- **[Component / File:Line]** Short Title
  - **Issue**: Explanation of the logic failure.
  - **Impact**: When and how this causes wrong output or crashes.
  - **Fix**: Code snippet showing the corrected logic.

## Major Concerns & Edge Cases
- **[Component / File:Line]** Title and explanation.

## Recommendations & Verification Tests
- Specific unit test cases (Arrange-Act-Assert) to lock in the bug fixes.
```
