## Summary

Provide a clear and concise summary of the changes in this pull request and the motivation behind them.

## Type of Change

- [ ] 🐛 Bug fix (non-breaking change which fixes an issue)
- [ ] ✨ New feature (non-breaking change which adds functionality)
- [ ] ⚡ Performance optimization (latency/memory improvements in C++ or Python)
- [ ] ♻️ Code refactoring (no functional changes)
- [ ] 📝 Documentation update
- [ ] 🔧 Build / CI / Tooling configuration

## Subsystems Touched

- [ ] C++ Core Solver (`cpp_core/`)
- [ ] FastAPI Gateway & Routing Services (`backend/app/services/`, `backend/app/api/`)
- [ ] LangGraph Agentic Swarm (`backend/app/swarm/`)
- [ ] Frontend UI & Map Controls (`frontend/src/`)
- [ ] Docker Infrastructure & Deployment

## Architectural & Quality Checklist

- [ ] **Sovereignty**: No cloud LLM APIs introduced (100% local inference via Ollama / vLLM).
- [ ] **Determinism**: Arithmetic, routing, and combinatorial optimization remain deterministic (C++ core), with LLMs strictly limited to semantic NLP.
- [ ] **Formatting**: Linting and formatting pass cleanly (`ruff check .`, `npm run lint`, `clang-format`).
- [ ] **Testing**: Automated unit/integration tests added or updated (`pytest backend/tests/`, `ctest` for C++).
- [ ] **DCO 1.1 Sign-Off**: All commits are signed off (`git commit -s`) per [CONTRIBUTING.md](CONTRIBUTING.md).

## Related Issues

Closes #
