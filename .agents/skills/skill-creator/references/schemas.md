# Skill Creator JSON Schemas

This document defines the JSON schemas used by skill-creator.

---

## evals.json
Defines the evals for a skill. Located at `evals/evals.json` within the skill directory.

```json
{
  "skill_name": "example-skill",
  "evals": [
    {
      "id": 1,
      "prompt": "User's example prompt",
      "expected_output": "Description of expected result",
      "files": ["evals/files/sample1.pdf"],
      "expectations": [
        "The output includes X",
        "The skill used script Y"
      ]
    }
  ]
}
```

**Fields:**
- `skill_name`: Name matching the skill's frontmatter
- `evals[].id`: Unique integer identifier
- `evals[].prompt`: The task to execute
- `evals[].expected_output`: Human-readable description of success
- `evals[].files`: Optional list of input file paths (relative to skill root)
- `evals[].expectations`: List of verifiable statements

---

## history.json
Tracks version progression in Improve mode. Located at workspace root.

```json
{
  "started_at": "2026-01-15T10:30:00Z",
  "skill_name": "pdf",
  "current_best": "v2",
  "iterations": [
    {
      "version": "v0",
      "parent": null,
      "expectation_pass_rate": 0.65,
      "grading_result": "baseline",
      "is_current_best": false
    },
    {
      "version": "v1",
      "parent": "v0",
      "expectation_pass_rate": 0.75,
      "grading_result": "won",
      "is_current_best": false
    },
    {
      "version": "v2",
      "parent": "v1",
      "expectation_pass_rate": 0.85,
      "grading_result": "won",
      "is_current_best": true
    }
  ]
}
```

---

## grading.json
Output from the grader agent. Located at `<run-dir>/grading.json`.

```json
{
  "expectations": [
    {
      "text": "The output includes the name 'John Smith'",
      "passed": true,
      "evidence": "Found in transcript Step 3: 'Extracted names: John Smith, Sarah Johnson'"
    },
    {
      "text": "The spreadsheet has a SUM formula in cell B10",
      "passed": false,
      "evidence": "No spreadsheet was created. The output was a text file."
    }
  ],
  "summary": {
    "passed": 2,
    "failed": 1,
    "total": 3,
    "pass_rate": 0.67
  },
  "execution_metrics": {
    "tool_calls": {
      "Read": 5,
      "Write": 2,
      "Bash": 8
    },
    "total_tool_calls": 15,
    "total_steps": 6,
    "errors_encountered": 0,
    "output_chars": 12450,
    "transcript_chars": 3200
  },
  "timing": {
    "executor_duration_seconds": 165.0,
    "grader_duration_seconds": 26.0,
    "total_duration_seconds": 191.0
  }
}
```

---

## benchmark.json
Output from Benchmark mode. Located at `<benchmark_dir>/benchmark.json`.

```json
{
  "metadata": {
    "skill_name": "travel-solver",
    "skill_path": "/path/to/travel-solver",
    "executor_model": "gemini-flash",
    "timestamp": "2026-08-16T15:30:00Z",
    "evals_run": [1, 2, 3],
    "runs_per_configuration": 3
  },
  "runs": [],
  "run_summary": {
    "with_skill": {
      "pass_rate": {"mean": 0.90, "stddev": 0.05, "min": 0.85, "max": 0.95},
      "time_seconds": {"mean": 12.0, "stddev": 2.0, "min": 10.0, "max": 14.0},
      "tokens": {"mean": 2400, "stddev": 200, "min": 2200, "max": 2600}
    },
    "without_skill": {
      "pass_rate": {"mean": 0.40, "stddev": 0.10, "min": 0.30, "max": 0.50},
      "time_seconds": {"mean": 18.0, "stddev": 4.0, "min": 14.0, "max": 22.0},
      "tokens": {"mean": 3800, "stddev": 500, "min": 3300, "max": 4300}
    },
    "delta": {
      "pass_rate": "+0.50",
      "time_seconds": "-6.0",
      "tokens": "-1400"
    }
  },
  "notes": [
    "Skill improves pass rate by 50% while reducing token usage and runtime."
  ]
}
```
