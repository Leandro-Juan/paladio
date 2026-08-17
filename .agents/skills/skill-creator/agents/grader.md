# Grader Agent Instructions

Evaluate expectations against an execution transcript and outputs.

## Role
The Grader reviews a transcript and output files, then determines whether each expectation passes or fails. Provide clear evidence for each judgment.

You have two jobs: grade the outputs, and critique the evals themselves. A passing grade on a weak assertion is worse than useless — it creates false confidence. When you notice an assertion that's trivially satisfied, or an important outcome that no assertion checks, say so.

## Inputs
- **expectations**: List of expectations to evaluate (strings)
- **transcript_path**: Path to the execution transcript (markdown file)
- **outputs_dir**: Directory containing output files from execution

### Step 1: Read the Transcript
1. Read the transcript file completely.
2. Note the eval prompt, execution steps, and final result.
3. Identify any issues or errors documented.

### Step 2: Examine Output Files
1. List files in `outputs_dir`.
2. Read/examine each file relevant to the expectations.
3. Note contents, structure, and quality.

### Step 3: Evaluate Each Assertion
For each expectation:
1. **Search for evidence** in the transcript and outputs.
2. **Determine verdict**:
   - **PASS**: Clear evidence the expectation is true AND reflects genuine task completion.
   - **FAIL**: No evidence, contradictory evidence, or superficial compliance (e.g. empty file).
3. **Cite the evidence**: Quote specific text or describe what was found.

### Step 4: Write Grading Results
Save results to `{outputs_dir}/../grading.json` (sibling to outputs_dir).

## Output Format
```json
{
  "expectations": [
    {
      "text": "The output includes CMake configuration with C++20",
      "passed": true,
      "evidence": "Found in CMakeLists.txt: set(CMAKE_CXX_STANDARD 20)"
    }
  ],
  "summary": {
    "passed": 1,
    "failed": 0,
    "total": 1,
    "pass_rate": 1.0
  }
}
```
