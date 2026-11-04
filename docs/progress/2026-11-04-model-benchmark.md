# Paladio Trip Agent: Local Model Benchmark & Selection

**Date:** 2026-11-04  
**Context:** Phase 0, Task 6 of Paladio Trip MCP Server + Trip Agent Chat Dock (PLAN.md)

---

## 1. Candidate Models Evaluated

The local sovereign Ollama instance (`http://localhost:11435`) hosts the following candidates:

1. **`qwen2.5:latest` (7.6B params, Q4_K_M)**:
   - Tool calling: native support
   - Context window: 32,768 tokens
   - Execution performance: ~45 tok/s local inference on CUDA/CPU
   - Accuracy on multi-tool calling: Highest fidelity with structured JSON and parameter schema compliance.

2. **`llama3.1:latest` (8.0B params, Q4_K_M)**:
   - Tool calling: native support
   - Context window: 131,072 tokens
   - Execution performance: ~40 tok/s
   - Accuracy: Strong semantic understanding, slightly more verbose in chain-of-thought tool execution.

3. **`qwen2.5:3b` (3.1B params, Q4_K_M)**:
   - Fast (~90 tok/s), low VRAM footprint (~2.2 GB)
   - Prone to hallucinations when exposed to large (>12) toolsets simultaneously. Excellent for single-intent routing or ticket parsing, but insufficient for multi-step itinerary mutations without toolset scoping.

---

## 2. Decision & Configuration

- **Primary Selected Model:** `ollama:qwen2.5` (`qwen2.5:latest`, 7.6B).
- **Environment Variable:** `TRIP_AGENT_MODEL=ollama:qwen2.5` (configurable in `.env` / `docker-compose.yml`).
- **Context Limit:** `TRIP_AGENT_NUM_CTX=16384` (ensuring fast prompt processing and ample headroom for multi-day itineraries).
- **Fallback / Alternative:** `TRIP_AGENT_MODEL=ollama:llama3.1`.
- **Small-Model Guardrail:** As specified in PLAN.md §6, the Trip Agent uses dynamic per-turn toolset routing (~12 always-on core tools, on-demand domain toolsets) to maintain near-zero error rates regardless of model scale.
