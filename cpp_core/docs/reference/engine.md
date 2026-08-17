# Paladio Core Optimization Engine Reference

This document provides a technical reference for the `paladio::core` namespace, which encapsulates the C++20 travel itinerary routing solver. 

This reference is intended for **C++ Developers** maintaining or extending the core engine. It focuses on the internal data structures, constraints, and algorithmic machinery (specifically the Branch and Bound routing solver).

---

## 1. Core Data Structures

The engine relies on a small set of tightly packed structures to maximize cache locality during the Depth First Search (DFS).

### `POI` (Point of Interest)
Represents a distinct location (node) in the travel graph.

- **`score` (double):** The objective value to be maximized.
- **`cost` (double):** Financial cost of the activity, counted against the global budget constraint.
- **`earliest_time` / `latest_time` (int):** Hard time windows. The solver must wait if arriving early, and is invalid if the duration pushes departure past `latest_time`.
- **`duration` (int):** Time in minutes required to consume the POI.
- **`NodeType` (enum):** Used for hard type constraints (e.g., ensuring a route ends at a `HOTEL`).
- **Meal Flags:** `is_breakfast_spot`, `is_lunch_spot`, `is_dinner_spot` are pre-calculated booleans used to rapidly verify meal deadlines in $O(1)$.

### `TransitInfo`
Represents directed edges between POIs.
- **`duration` (int):** Travel time.
- **`cost` (double):** Financial cost (e.g., Uber fare).

### `OptimizationConfig`
Defines the global user-provided constraints bounding the problem space.
- **`max_budget`:** Hard limit on `sum(poi.cost) + sum(transit.cost)`.
- **`end_time_limit`:** If set, enables the Continuous Fractional Knapsack upper-bound pruning logic.
- **`[meal]_deadline`:** Absolute timestamps by which a specific node type (e.g., `RESTAURANT_DINNER`) must have been visited.

---

## 2. Algorithmic Machinery (Branch & Bound DFS)

The entry point `optimize_itinerary()` executes a brute-force recursive Depth First Search over the graph of POIs. Because this is an NP-Hard Time-Constrained Orienteering Problem (TCOP), the engine relies heavily on rigorous pruning to maintain a sub-50ms latency.

### The Search State
During recursion, the `SearchState` object is mutated (pushed) and reverted (popped). 
- Uses a **`uint64_t visited_mask`** to track visitation. This strictly caps the maximum number of POIs per routing request to 64 nodes.

### Constraint Pruning
Branches are immediately aborted if they violate:
1. **Time Windows:** Arriving too late.
2. **Budget:** Accumulating a cost higher than `max_budget`.
3. **Deadlines:** Exceeding a meal deadline without having visited an appropriate node.

### Upper-Bound Pruning (Fractional Knapsack Heuristic)
To prevent exploring deep, sub-optimal paths, the engine estimates the best possible future score.
1. Before searching, it pre-computes an array of POIs sorted descending by their **value density** (`score / duration`).
2. At any node, `calculate_optimistic_bound()` greedily simulates filling the remaining time by taking fractions of the unvisited, highest-density POIs.
3. Because the Continuous Fractional Knapsack problem provides an *admissible heuristic* (it will always perfectly estimate or overestimate the true discrete knapsack maximum), if `current_score + optimistic_bound <= best_known_score`, the entire branch is mathematically proven to be sub-optimal and is immediately pruned.

---

## 3. Python Bindings (PyBind11)

The C++ module is exposed to Python via the `paladio_core` library. 
- The Global Interpreter Lock (GIL) is explicitly released via `py::gil_scoped_release release;` when calling `optimize_itinerary`. This enables Python to execute optimization requests on multiple threads concurrently, maximizing throughput in an async FastAPI environment.
