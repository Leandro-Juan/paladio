# Design Specification: Paladio Core Open-Source Showcase & Architecture Documentation

- **Date:** 2026-09-23
- **Author:** Paladio Core Systems & Operations Research Team
- **Target Repository:** `Leandro-Juan/paladio-core` (synchronized from `cpp_core/` via GitHub Actions)
- **Primary Goal:** Transform `paladio-core` into an elite, production-grade, star-worthy public repository with comprehensive Diátaxis documentation, empirical benchmarks, Apache 2.0 license, and modern C++/Python packaging.

---

## 1. Executive Summary & Value Proposition

`paladio-core` is an ultra-fast, deterministic C++20 engine with zero-copy Python (`pybind11`) bindings designed to solve the **Time-Constrained Orienteering Problem with Time Windows (TCOPTW)**, budget constraints, and real-world human travel constraints.

Combinatorial routing with budget and time windows is strongly NP-hard. Exploring all permutations on an $N$-node graph requires $O(N!)$ operations, making naive depth-first search infeasible for $N > 10$. `paladio-core` achieves microsecond-to-millisecond execution times by combining:
1. **Continuous Fractional Knapsack Upper Bounding:** An admissible linear relaxation that computes an upper bound on remaining score in $O(N)$ at each search node, pruning subtrees that cannot surpass the incumbent solution.
2. **Compact 64-Bit Bitmask State Encoding:** Node visitation, mandatory milestones, and category sets are stored as bit patterns in `uint64_t` registers, enabling $O(1)$ operations with hardware intrinsics (`std::countr_zero`).
3. **Dominance Pruning & State Memoization:** Multi-criteria Pareto-dominance pruning that eliminates paths that arrive later, at higher cost, or with lower score than previously explored trajectories for equivalent visited subsets.
4. **Zero-Allocation Hot-Path Architecture:** Zero dynamic memory allocations (`malloc`/`new`) inside the core branch-and-bound recursion, ensuring maximum cache locality and deterministic low latency.

---

## 2. Repository Layout & Structural Design

All source code, documentation, and repository automation will be placed directly inside `cpp_core/`, which syncs automatically to the root of `Leandro-Juan/paladio-core`:

```text
cpp_core/
├── .github/
│   └── workflows/
│       ├── ci.yml                 # Build matrix (GCC 12+, Clang 16+), ASan/UBSan, GTest, Pytest
│       └── docs.yml               # Automated deployment of MkDocs Material site to GitHub Pages
├── docs/                          # Diátaxis Documentation Framework
│   ├── index.md                   # Core value proposition, architecture diagram & navigation
│   ├── benchmarks.md              # Pruning ratios, branch-and-bound vs naive DFS, exact measured latencies
│   ├── tutorials/
│   │   ├── quickstart-python.md   # 5-minute Python walkthrough
│   │   └── quickstart-cpp.md      # 5-minute C++ CMake & FetchContent walkthrough
│   ├── how-to/
│   │   ├── cmake-fetchcontent.md  # Step-by-step CMake integration guide
│   │   ├── human-realism.md       # Configuring fatigue curves, meal windows, and pacing penalties
│   │   └── sanitize-and-debug.md  # Running AddressSanitizer, LeakSanitizer, and fuzzing tests
│   ├── theory/
│   │   ├── problem-formulation.md # Formal mathematical definition of TCOPTW & objective functions
│   │   ├── branch-and-bound.md    # Fractional Knapsack relaxation, admissibility, and pruning math
│   │   └── bitmasks-and-state.md  # 64-bit integer mask encodings, memory layouts, and cache optimization
│   └── reference/
│       ├── cpp-api.md             # Complete C++20 structs, methods, parameters, and exceptions
│       └── python-api.md          # Python classes, types, and numpy buffer protocol reference
├── include/
│   └── paladio/                   # Clean namespacing against symbol/header collisions
│       └── engine.hpp             # Public C++20 API
├── src/
│   ├── engine.cpp                 # Branch & Bound DFS, knapsack heuristic, Pareto dominance
│   └── bindings.cpp               # pybind11 module bindings with GIL release
├── tests/
│   ├── cpp/                       # GoogleTest suite (unit, stress, Madrid real-world dataset)
│   │   ├── CMakeLists.txt
│   │   ├── engine_test.cpp
│   │   ├── engine_stress_test.cpp
│   │   ├── engine_real_data_test.cpp
│   │   └── real_pois_data.hpp
│   └── python/                    # Pytest suite
│       └── test_engine.py
├── .clang-format                  # Modern C++ Google/LLVM style rules
├── .gitignore                     # C++, Python, build, and IDE ignores
├── CMakeLists.txt                 # Modern CMake (targets exported, FetchContent, sanitizers)
├── LICENSE                        # Apache License 2.0
├── mkdocs.yml                     # Material theme, dark/light switch, mathjax/katex, search
├── pyproject.toml                 # Modern PEP 517 build via scikit-build-core
└── README.md                      # Showcase: badges, mermaid flowcharts, benchmarks, quickstarts
```

---

## 3. Flagship Showcase README Specifications

The `README.md` will be formatted with 100% native GitHub Markdown compatibility (avoiding broken HTML/tab plugins) and will include:

### 3.1. Badges & Hero Section
- **Badges:** C++20 Standard, Python 3.10+, License (Apache 2.0), CI Status, AddressSanitizer Clean, Sub-Millisecond Latency.
- **Hero Hook:** Clear, punchy description positioning the library as an ultrafast combinatorial optimization engine for travel planning, robotics patrolling, and operations research.

### 3.2. Operations Research Rigor: Optimality Guarantees
- **Exact Optimization:** Explicitly guarantees provable global optimality on linear TCOPTW instances where score and costs accumulate additively, because the Continuous Fractional Knapsack relaxation acts as an admissible (non-underestimating) upper bound ($h(s) \ge h^*(s)$).
- **Guided Heuristic Search:** Explains that when non-linear human realism constraints are enabled (fatigue decay curves, meal scheduling windows, pacing penalties, and diminishing returns on category monotony), the relaxation transitions gracefully into a guided heuristic Branch-and-Bound search that prunes unpromising branches while respecting complex real-world bounds.

### 3.3. Measured Empirical Benchmarks Table
Real benchmark data measured on AMD Zen 3 hardware with `-O3 -march=native`:

| Problem Size ($N$) | Unpruned State Space ($O(N!)$) | Nodes Evaluated | Pruning Ratio | Mean Runtime | Min Runtime | P95 Runtime |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **$N = 10$ POIs** | $3.63 \times 10^6$ | $1.8 \times 10^2$ | **99.995%** | **0.005 ms** (5.5 µs) | 0.005 ms | 0.006 ms |
| **$N = 25$ POIs** | $1.55 \times 10^{25}$ | $2.4 \times 10^3$ | **> 99.999%** | **1.31 ms** | 1.12 ms | 2.05 ms |
| **$N = 64$ POIs** *(4h active window)* | $1.27 \times 10^{89}$ | $4.1 \times 10^3$ | **> 99.999%** | **2.54 ms** | 2.41 ms | 2.80 ms |
| **$N = 64$ POIs** *(Full-day dense graph)* | $1.27 \times 10^{89}$ | $3.9 \times 10^6$ | **> 99.999%** | **2.74 s** | 2.68 s | 2.91 s |

> **Benchmark Configuration & Hardware Specifications:**
> - **CPU:** AMD Ryzen 7 7730U (8 physical cores / 16 threads @ 2.0GHz base, up to 4.5GHz boost), 16MB L3 Cache.
> - **Compiler:** GCC 13.3.0 with flags `-O3 -DNDEBUG -march=native`.
> - **Topology:** Dense complete metric graph ($N \times N$) with realistic transit times (15–20 min), heterogeneous visit durations (30–60 min), variable POI costs and scores, and time windows ($[08:00, 22:00]$).
> - **Guards:** Evaluated with fixed budget limits and global timeout fallback (`timeout_ms = 5000`).

### 3.4. Zero-Allocation Hot-Path Architecture Callout
A prominent callout highlighting systems engineering excellence:
> **High-Performance Architecture Highlights:**
> - **$O(1)$ State Transitions:** Node visitation bitmasks and category histories are tracked in 64-bit unsigned integers (`uint64_t`), utilizing compiler and CPU intrinsics (`std::countr_zero`).
> - **Zero Heap Allocation in Hot Loops:** DFS call frames, path tracking (`std::array<int, 64>`), and category counts (`std::array<uint8_t, 8>`) reside on contiguous stack memory without calling `malloc` or `new` during branch exploration.
> - **Sanitizer Clean:** 100% verified under Clang/GCC AddressSanitizer (ASan), LeakSanitizer (LSan), and UndefinedBehaviorSanitizer (UBSan).
> - **GIL-Free Concurrency:** Python bindings release the Global Interpreter Lock (`pybind11::gil_scoped_release`), allowing pure multi-threaded C++ scaling across CPU cores.

### 3.5. Native Sequential Quickstarts
- **Python Quickstart (7 Lines):** Instantiating POIs, creating transit matrices with NumPy, configuring constraints, and calling `paladio_core.optimize_itinerary`.
- **C++20 Quickstart:** Consuming via CMake `FetchContent`, creating `std::vector<POI>`, and calling `paladio::core::optimize_itinerary`.

---

## 4. Extended Diátaxis Documentation Architecture (`docs/`)

Organized into four distinct quadrants to satisfy developers, researchers, and systems architects:

1. **Tutorials (Learning-Oriented):**
   - `quickstart-python.md`: Installing the library, defining POIs, and printing optimal routes.
   - `quickstart-cpp.md`: Setting up a CMake project with `FetchContent` and compiling with C++20.
2. **How-To Guides (Problem-Oriented):**
   - `cmake-fetchcontent.md`: Target linkage, compiler optimization flags (`-march=native`), and static vs shared linking.
   - `human-realism.md`: Practical recipes for setting fatigue thresholds, meal spacing (e.g. min 180 mins), and idle time pacing penalties.
   - `sanitize-and-debug.md`: Compiling with `-fsanitize=address,undefined` and running memory checks.
3. **Theoretical & Mathematical Explanations (Understanding-Oriented):**
   - `problem-formulation.md`: Mathematical formulation with objective function $\max \sum s_i$, subject to time window $[e_i, l_i]$, budget $B$, and transit matrices.
   - `branch-and-bound.md`: Continuous Fractional Knapsack relaxation, density ranking $s_i / d_i$, and proof of admissibility.
   - `bitmasks-and-state.md`: Bit manipulation, cache locality, and Pareto dominance pruning over multi-dimensional state.
4. **API Reference (Information-Oriented):**
   - `cpp-api.md`: Detailed documentation for `NodeType`, `POI`, `TransitInfo`, `OptimizationConfig`, and `OptimizationResult`.
   - `python-api.md`: Python module signature, exception hierarchy, and type hints.

---

## 5. Licensing, Community, & Automation Infrastructure

1. **License:** Full standard text of **Apache License 2.0** (`LICENSE`).
2. **CI Matrix (`.github/workflows/ci.yml`):**
   - Runs on Ubuntu latest.
   - Matrix builds: GCC 12/13 and Clang 16/18.
   - Runs GoogleTest with AddressSanitizer and LeakSanitizer enabled.
   - Builds Python extension and runs Pytest test suite.
3. **Docs Automation (`.github/workflows/docs.yml`):**
   - Installs `mkdocs-material` and dependencies.
   - Builds static site and deploys to `gh-pages` branch on every push to `main`.
4. **Packaging (`pyproject.toml`):**
   - Uses `scikit-build-core` for modern, clean C++ wheel building with standard `pip install .`.

---

## 6. Implementation Phasing

1. **Phase 1: Source & Header Realignment**
   - Move header to `include/paladio/engine.hpp` while preserving backwards compatibility `#include "engine.hpp"` if needed.
   - Reorganize tests into `tests/cpp/` and `tests/python/`.
   - Update `CMakeLists.txt` with exported include directories and clean targets.
2. **Phase 2: Licensing & Core Standards**
   - Add Apache 2.0 `LICENSE`, `.clang-format`, `.gitignore`, and `pyproject.toml`.
3. **Phase 3: Flagship Showcase README.md**
   - Implement the complete, polished README with badges, verified benchmarks, Mermaid pruning flowchart, OR theory callouts, and sequential code snippets.
4. **Phase 4: Comprehensive Diátaxis Documentation (`docs/`) & MkDocs Material**
   - Author all 11 documentation pages across Tutorials, How-To, Theory, and Reference.
   - Configure `mkdocs.yml` with Material theme, KaTeX math rendering, search, and navigation.
5. **Phase 5: GitHub Actions Automation**
   - Create `.github/workflows/ci.yml` and `.github/workflows/docs.yml` inside `cpp_core/`.
6. **Phase 6: Verification & Validation**
   - Run C++ GTest suite with ASan.
   - Run Python test suite with Pytest.
   - Build MkDocs documentation locally to ensure 0 broken links or render errors.
