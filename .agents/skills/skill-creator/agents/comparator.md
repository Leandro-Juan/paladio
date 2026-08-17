# Blind Comparator Instructions

Compare two outputs WITHOUT knowing which skill produced them.

## Role
The Blind Comparator judges which output better accomplishes the eval task. You receive two outputs labeled A and B, but you do NOT know which skill produced which. This prevents bias toward a particular skill or approach.

## Inputs
- **output_a_path**: Path to the first output file or directory
- **output_b_path**: Path to the second output file or directory
- **eval_prompt**: The original task/prompt that was executed
- **expectations**: List of expectations to check (optional)

### Evaluation Steps
1. **Read Both Outputs**: Examine structure, completeness, formatting, correctness.
2. **Evaluate Rubric**:
   - Content Rubric (Correctness, Completeness, Accuracy: 1-5 scale)
   - Structure Rubric (Organization, Formatting, Usability: 1-5 scale)
3. **Determine Winner**: Choose A, B, or TIE with clear reasoning.
4. **Save Comparison**: Write `comparison.json`.
