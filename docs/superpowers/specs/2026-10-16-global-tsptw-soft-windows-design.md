# Design Specification: Global TSPTW with Soft Time-Window Constraints

**Date**: 2026-10-16  
**Status**: Approved  
**Author**: Antigravity  

---

## 1. Context & Motivation
Previously, re-optimizing an itinerary day partitioned the sequence into isolated sub-tours bounded by fixed anchors (hotels, airports, or user-locked POIs). While this prevented locked items from moving, it fragmented the global optimization problem into piecewise sub-problems. If a user locked a stop at mid-day, the solver could not optimize across the boundary, causing artificial zig-zagging and sub-optimal overall routes.

This specification designs a **unified global Traveling Salesperson Problem with Time Windows (TSPTW)** solver in C++20 (`paladio_core`), replacing piecewise array partitioning with soft time-window constraints $[t_{\text{target}} - \epsilon, t_{\text{target}} + \epsilon]$.

---

## 2. Mathematical Formulation

### 2.1 Graph & Node Attributes
Let $G = (V, E)$ be a complete directed graph with $n = |V|$ POIs, and transit duration matrix $T \in \mathbb{Z}_{\ge 0}^{n \times n}$.
Each vertex $i \in V$ is associated with:
- $D_i \in \mathbb{Z}_{\ge 0}$: Dwell duration (minutes).
- $[W_i^{\min}, W_i^{\max}]$: Permissible arrival window (minutes from midnight).
  - For **locked POIs** at scheduled arrival time $t_{\text{target}}$:
    $$W_i^{\min} = \max(t_{\text{day\_start}}, t_{\text{target}} - \epsilon), \quad W_i^{\max} = \min(t_{\text{day\_end}}, t_{\text{target}} + \epsilon)$$
    Default $\epsilon = 15$ minutes (30-minute arrival window).
  - For **unlocked POIs**:
    $$W_i^{\min} = \max(t_{\text{day\_start}}, \text{earliest\_time}_i), \quad W_i^{\max} = \min(t_{\text{day\_end}}, \text{latest\_time}_i)$$
  - For the **start depot** (node 0, e.g. morning hotel):
    $$W_0^{\min} = W_0^{\max} = t_{\text{day\_start}}$$
  - For a **fixed end depot** (node $n-1$, e.g. night hotel return):
    Fixed at permutation index $n-1$.

### 2.2 Forward Timeline Simulation
For any tour permutation $\pi = (\pi_0, \pi_1, \dots, \pi_{n-1})$:
1. Initialize arrival and departure at start depot:
   $$t_{\text{arr}}(\pi_0) = W_{\pi_0}^{\min}, \quad t_{\text{dep}}(\pi_0) = t_{\text{arr}}(\pi_0) + D_{\pi_0}$$
2. For $k = 1, \dots, n-1$:
   $$t_{\text{transit}} = T[\pi_{k-1}, \pi_k]$$
   $$t_{\text{reach}} = t_{\text{dep}}(\pi_{k-1}) + t_{\text{transit}}$$
   $$t_{\text{arr}}(\pi_k) = \max(t_{\text{reach}}, W_{\pi_k}^{\min})$$
   $$t_{\text{dep}}(\pi_k) = t_{\text{arr}}(\pi_k) + D_{\pi_k}$$

### 2.3 Soft Penalty Objective
$$\text{Cost}(\pi) = \sum_{k=1}^{n-1} T[\pi_{k-1}, \pi_k] + \lambda_{\text{penalty}} \sum_{k=0}^{n-1} \left( \max(0, t_{\text{reach}}(\pi_k) - W_{\pi_k}^{\max}) \right)^2$$
Where:
- $\lambda_{\text{penalty}} = 100.0$: Heavily penalizes arriving after $W^{\max}$, driving the solver to meet locked windows without discarding candidates.
- Idling before $W^{\min}$ is accounted for in $t_{\text{arr}}(\pi_k) = \max(t_{\text{reach}}, W_{\pi_k}^{\min})$ without extra penalty, representing natural waiting time.

---

## 3. C++20 Core Architecture (`cpp_core`)

### 3.1 Function Signature (`cpp_core/include/paladio/engine.hpp`)
```cpp
[[nodiscard]] std::vector<int> solve_tsptw(
    const int *transit_durations, int n,
    const int *dwell_times,
    const int *window_starts,
    const int *window_ends,
    int start_node = 0,
    int end_node = -1,
    bool fixed_end = false,
    double penalty_weight = 100.0);
```

### 3.2 Optimization Engine (`cpp_core/src/engine.cpp`)
1. **Initial Solution Generation**:
   - Multi-start greedy heuristic combining nearest neighbor with earliest deadline sorting ($W_i^{\min}$).
   - Generates up to 8 diverse valid starting permutations.
2. **Local Search Improvements**:
   - **2-Opt Edge Inversion**: Iteratively reverses tour sub-sequences $[\pi_i, \dots, \pi_j]$ whenever the total cost (transit + window penalty) decreases.
   - **Or-Opt Node Relocation**: Relocates single nodes and consecutive pairs to candidate insertion slots that minimize cost.
3. **Performance & Determinism Guarantees**:
   - Zero heap allocation in hot loop (pre-allocated working arrays).
   - Worst-case execution time under 10ms for $n \le 25$.
   - Releases Python GIL via `pybind11::gil_scoped_release`.

---

## 4. Python Binding & Service Integration

### 4.1 Pybind11 Binding (`cpp_core/src/bindings.cpp`)
Expose `solve_tsptw` taking flattened 1D numpy arrays for `durations`, `dwell_times`, `window_starts`, `window_ends`, integers `n`, `start_node`, `end_node`, boolean `fixed_end`, and float `penalty_weight`.

### 4.2 Reoptimization Service (`backend/app/services/trip_reoptimization_service.py`)
1. In `reoptimize_trip_slice`:
   - Inspect items of the target day.
   - For each item, compute dwell duration and time windows $[W^{\min}, W^{\max}]$ based on `locked` status.
   - If locked: center tight window around current scheduled start ($t \pm \epsilon$).
   - If unlocked: set window to operating hours or $[t_{\text{day\_start}}, t_{\text{day\_end}}]$.
   - Call `paladio_core.solve_tsptw(...)` over the entire day's nodes in one single call.
   - Reconstruct the day's timeline with arrival/departure times.

### 4.3 Test Mock Conftest (`backend/tests/conftest.py`)
Add `mock_paladio_core.solve_tsptw` mirroring the exact objective function so tests can run both in full compiled C++ mode and in pure python test mocks.

---

## 5. Verification Plan
- **Unit & Property Tests**:
  - Verify locked POI arrives within $[t - \epsilon, t + \epsilon]$.
  - Verify unlocked POIs re-order freely to minimize travel distance.
  - Verify hotel/airport anchors at day start and end.
  - Verify execution time is sub-50ms.
- **Pre-commit Quality**:
  - `ruff`, `ruff-format`, `eslint`, `clang-format` all pass cleanly.
