---
name: comprehensive-code-audit
description: Scans all existing code in the project to review quality, pinpoint flaws, bugs, dead code, AI slop, bad practices, and scalability issues. Writes a full extensive markdown report and scores the codebase out of 10 without resolving the issues. Time is not a constraint.
---

# Comprehensive Code Audit

This skill performs a deep, exhaustive audit of the entire codebase. Time is not a constraint. Your goal is to find flaws in quality, logic, bugs, dead code, AI slop, bad practices, and scalability issues. You must NOT resolve the issues. You will only produce a comprehensive report.

## 1. Discover All Source Code

- Run terminal commands (e.g., `find . -type f` combined with `grep -v`) to list all relevant source files in the project (e.g., `.py`, `.cpp`, `.h`, `.ts`, `.js`, etc.).
- Explicitly exclude directories like `node_modules/`, `.git/`, `__pycache__/`, `venv/`, `build/`, `.agents/`, and any other irrelevant cache or dependency folders.

## 2. Iterative Deep Review

Read every single discovered file iteratively using the `view_file` tool or terminal commands. Take as much time as you need.

**CRITICAL REQUIREMENT**: During this audit, you MUST explicitly invoke and apply the rigorous standards of the following installed skills located in your `.agents/skills` folders:

**Global Quality & Slop Detection Skills:**
- **`thermo-nuclear-code-quality-review`**: Look for severe architectural flaws, lack of scalability, and deep logic bugs. Assume zero tolerance for fragile engineering.
- **`stop-slop`** & **`deslop`**: Actively search for "AI slop" — overly verbose code, hallucinated structures, redundant abstractions, generic comments that explain *what* rather than *why*, and "enterprisey" boilerplate that does nothing.
- **`code-review-and-quality`** & **`code-review`**: Check for standard best practices, documentation completeness, DRY principles, and dead code.

**Project-Specific Deep Inspection Skills:**
- **`code-reviewer`**: Deeply analyze logic bugs, off-by-one errors, memory safety issues, and performance bottlenecks.
- **`cpp-pro`**: Evaluate C++ code for modern C++20/23 features, performance bottlenecks, and robust memory management.
- **`test-master`** & **`python-testing-patterns`**: Evaluate test suites, mocking strategies, and code coverage architecture.

For each file, systematically cross-reference its contents against the principles outlined in the skills above.

**CRITICAL CONSTRAINT**: Do NOT edit the code. Do NOT fix the issues. You are strictly an auditor for this run.

## 3. Compile the Report

Maintain a running log of your findings. Once all files have been scanned, synthesize your findings into a single, extensive Markdown report. Save it as `comprehensive_audit_report.md` in the project root.

## 4. Scoring Framework

At the end of the report, you must assign a **Final Score out of 10** based on the following rubric:
- **0-3 (AI Slop / Unmaintainable)**: Heavy AI slop, unscalable, severely bugged, poorly documented, fragile.
- **4-6 (Functional but Messy)**: Works but contains redundancy, missing key documentation, evident slop patterns, and technical debt.
- **7-9 (High Quality)**: Scalable, clean, solid architecture, well-documented, minimal to no slop.
- **10 (Masterpiece)**: Flawless, perfectly optimized, completely slop-free engineering.

## Output Schema

The `comprehensive_audit_report.md` must follow this structure exactly:

```markdown
# Comprehensive Codebase Audit Report

**Final Score: X/10**

## Executive Summary
*High-level overview of the codebase's health, major architectural flaws, scalability concerns, and the overall presence of AI slop.*

## Detailed Findings

### [File Path 1]
- **Bugs & Logic Flaws**: ...
- **Bad Practices & Dead Code**: ...
- **AI Slop**: ...
- **Scalability & Architecture**: ...

### [File Path 2]
...

## Recommendations
*A prioritized, actionable list of steps the user should take to improve the score and remove the identified slop.*
```
