---
name: skill-creator
description: Create new skills, modify and rewrite existing skills, optimize trigger descriptions, and benchmark skill performance. Use when users want to create a skill from scratch, edit or optimize an existing skill, rewrite/refactor skill instructions, run evals to test a skill, or optimize a skill's description for better triggering accuracy.
---

# Skill Creator

A specialized skill for creating new skills, rewriting/improving existing skills, and iteratively optimizing them.

At a high level, the process of creating or rewriting a skill goes like this:

- **Capture Intent & Requirements**: Decide what you want the skill to do and roughly how it should do it.
- **Draft/Rewrite Instructions**: Write a clean draft of the skill following progressive disclosure principles.
- **Test with Real Prompts**: Create test prompts and run agent evaluations with access to the skill.
- **Evaluate & Review**: Evaluate results both qualitatively and quantitatively against baselines.
- **Iterate & Refactor**: Rewrite the skill based on evaluation feedback, removing redundant/rigid rules and explaining the "why".
- **Optimize Triggers**: Optimize the skill's description frontmatter for high recall and precision.
- **Package & Validate**: Run validation checks and package into `.skill` bundles.

---

## 1. Intent Capture & Interview

Start by understanding the user's intent. The current conversation might already contain a workflow the user wants to capture (e.g., "turn this into a skill" or "rewrite this skill to be better"). Extract answers from conversation history first:
1. **Goal**: What capability or workflow should this skill provide?
2. **Triggering**: When should this skill trigger? (what user keywords, task contexts, file types)
3. **Output Format**: What is the expected output structure (files, formats, templates)?
4. **Resources & Dependencies**: Does it require helper scripts, reference schemas, templates, or external tools?
5. **Testability**: Should we set up test cases with verifiable assertions?

---

## 2. Anatomy of a Skill & Progressive Disclosure

Skills use a three-level loading system to minimize token overhead:
1. **Metadata (`name` + `description` in YAML frontmatter)**: Always in context (~100 words).
2. **`SKILL.md` body**: Loaded only when the skill is triggered (<500 lines recommended).
3. **Bundled resources**: Loaded on demand as needed (unlimited size).

### Directory Structure
```
<skill-name>/
├── SKILL.md (required)
│   ├── YAML frontmatter (name, description required)
│   └── Markdown instructions
├── references/ (optional)
│   ├── schemas.md
│   └── domain-specific-docs.md
├── scripts/ (optional)
│   ├── helper_util.py
│   └── validator.py
└── assets/ (optional)
    └── templates/
```

### Frontmatter Specification
```yaml
---
name: my-skill-name
description: Clear, action-oriented description of what the skill does and specific contexts/phrases for when to trigger it.
---
```

- **`name`**: kebab-case (lowercase letters, numbers, hyphens only; max 64 chars).
- **`description`**: Max 1024 characters. Must include what the skill does AND when to use it. Be proactive with trigger terms to avoid undertriggering.

---

## 3. Writing and Rewriting Guidelines

### Principles for Effective Skill Authoring
1. **Explain the "Why"**: Modern LLMs have strong reasoning capabilities. Explain the underlying purpose and constraints rather than using brittle all-caps `MUST` / `NEVER` mandates.
2. **Keep Instructions Lean**: Remove boilerplate, redundant explanations, or steps that the model already handles well natively.
3. **Imperative & Actionable**: Use concise, imperative steps ("1. Inspect the AST...", "2. Generate the test fixture...").
4. **Bundle Repeated Code in `scripts/`**: If agents frequently write identical helper scripts or parsing logic, extract that logic into a standalone python script under `scripts/` and reference it in `SKILL.md`.
5. **Organize Multi-Domain Skills into `references/`**: If a skill covers multiple platforms/frameworks (e.g., AWS vs GCP vs Azure), keep the core workflow in `SKILL.md` and move framework-specific details into `references/`.
6. **Explicit Output Schemas**: Provide exact templates or schema examples for generated artifacts.

---

## 4. Test Cases & Quantitative Evals

After drafting or updating a skill, formulate 2-3 realistic test prompts representing actual developer requests.

Save test cases to `evals/evals.json`:
```json
{
  "skill_name": "example-skill",
  "evals": [
    {
      "id": 1,
      "prompt": "User's task prompt",
      "expected_output": "Description of expected result",
      "files": []
    }
  ]
}
```

### Evaluation Loop
1. **Run With-Skill & Baseline**:
   - For new skills: compare `with_skill` vs `without_skill`.
   - For rewritten skills: compare `new_skill` vs `old_skill` snapshot.
2. **Draft Assertions**: Create objectively verifiable assertions in `eval_metadata.json` (e.g., "Generates valid CMakeLists.txt with target_link_libraries", "Execution time < 50ms").
3. **Grade & Aggregate**: Run grading against the execution transcript and output files, producing `grading.json` and `benchmark.json`.

---

## 5. Description Optimization

The frontmatter description governs when the agent triggers the skill.

### Optimization Strategy
1. Generate 10-20 realistic eval queries:
   - **8-10 Should-Trigger**: Diverse phrasings (formal, casual, edge cases, partial keywords).
   - **8-10 Should-Not-Trigger**: Near-misses (adjacent topics, overlapping keywords that belong to other skills).
2. Measure precision and recall across test queries.
3. Refine the description to maximize activation on relevant prompts while rejecting near-miss queries.

---

## 6. Packager and Validator Tooling

The skill comes with bundled utilities:
- `scripts/quick_validate.py`: Validates YAML frontmatter, naming rules, description limits, and file integrity.
- `scripts/package_skill.py`: Packages a skill folder into a `.skill` zip bundle, excluding cache/eval artifacts.
- `scripts/aggregate_benchmark.py`: Aggregates run metrics into statistical summaries (`benchmark.json` and `benchmark.md`).

### Packaging a Skill
```bash
python scripts/package_skill.py <path/to/skill-folder> [output-dir]
```
