# C++20 and Python API reference (`paladio_core`)

`paladio_core` exposes `paladio::core` (`cpp_core/include/paladio/engine.hpp`) to Python via `pybind11` (`cpp_core/src/bindings.cpp`, typed in `cpp_core/src/paladio_core.pyi`), releasing the Python Global Interpreter Lock (GIL) across all three combinatorial solvers.

## Build options and packaging

`cpp_core/CMakeLists.txt` (`PaladioEngine` v3.0.0) compiles pure C++20 (`-Wall -Wextra -Werror`) into `paladio_engine_static` (`paladio::engine`) and the `paladio_core` Python extension module, while `cpp_core/pyproject.toml` builds PEP 517 Python wheels through `scikit-build-core` (`numpy>=1.20.0`).

| CMake option | Default | Purpose |
| :--- | :---: | :--- |
| `PALADIO_BUILD_TESTS` | `OFF` | Fetches GoogleTest `v1.14.0` and builds the 23 C++ tests (`paladio_tests`) |
| `PALADIO_ENABLE_NATIVE` | `OFF` | Adds `-march=native` alongside `-O3 -DNDEBUG` in Release builds |
| `PALADIO_ENABLE_SANITIZERS` | `OFF` | Adds `-g -Og -fsanitize=address,undefined` to compile and link flags |
| `PALADIO_BUILD_PYTHON` | `ON` | Fetches `pybind11 v2.11.1` and builds `paladio_core` + installs `paladio_core.pyi` and `py.typed` |

## `NodeType` enumeration

`paladio_core.NodeType` (`enum class NodeType : uint8_t`) classifies vertices for meal fulfillment, active fatigue resets, and monotony grouping; `bindings.cpp` calls `.export_values()` so members are accessible both as `NodeType.ATTRACTION` and directly on `paladio_core`.

| Member | Behavioral role in `optimize_itinerary` |
| :--- | :--- |
| `ATTRACTION` | Accrues objective score; subject to time windows, fatigue multiplier, and monotony decay |
| `HOTEL` | Rest depot; resets `continuous_active_time` to `0` and incurs `0` dwell cost or duration when used as terminal depot |
| `RESTAURANT_BREAKFAST` | Rest node; sets `is_breakfast_spot=True`, satisfies `breakfast_deadline`, enforces `min_meal_spacing` |
| `RESTAURANT_LUNCH` | Rest node; sets `is_lunch_spot=True`, satisfies `lunch_deadline`, enforces `min_meal_spacing` |
| `RESTAURANT_DINNER` | Rest node; sets `is_dinner_spot=True`, satisfies `dinner_deadline`, enforces `min_meal_spacing` |
| `BAR` | Rest node; resets `continuous_active_time` to `0` without triggering meal spacing |

## `POI` and `TransitInfo` structures

Construct `POI` vertices with operating windows in minutes from midnight (`0` to `1440`) and non-negative monetary cost, score, and duration. `TransitInfo` (`int duration`, `double cost`) exists only in the C++ `#ifdef PALADIO_TESTING` convenience overload and is **not** bound in Python (`bindings.cpp`).

```python
POI(
    type: NodeType,
    cost: float,
    score: float,
    earliest_time: int,
    latest_time: int,
    duration: int,
    is_mandatory: bool = False,
    category_id: int = 255,
)
```

| Field | Type | Default / invariant | Notes |
| :--- | :--- | :--- | :--- |
| `type` | `NodeType` | Required | Drives meal flags (`is_breakfast_spot`, `is_lunch_spot`, `is_dinner_spot`) on construction |
| `cost` | `float` | Required (`>= 0.0`) | Direct visit cost in currency units |
| `score` | `float` | Required (`>= 0.0`) | Base objective utility to maximize |
| `earliest_time`, `latest_time` | `int` | Required (`0 <= earliest <= latest`) | Arrival + duration must finish at or before `latest_time` |
| `duration` | `int` | Required (`>= 0`) | Mandatory dwell time in minutes |
| `is_breakfast_spot`, `is_lunch_spot`, `is_dinner_spot` | `bool` | Derived from `type` | Readable/writable in Python to mark mixed venues or hotels |
| `is_mandatory` | `bool` | `False` | Candidate paths omitting mandatory vertices are pruned |
| `category_id` | `int` (`uint8_t`) | `255` | Taxonomy slot `0–15` for monotony decay; `255` falls back to `NodeType` |

## `OptimizationConfig` and `OptimizationResult`

`OptimizationConfig` bundles hard combinatorial bounds, human-realism physiology rules, and search termination caps; `optimize_itinerary` returns `OptimizationResult` (read/write attributes only, no Python `__init__`).

| `OptimizationConfig` parameter | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `max_budget` | `float` | Required | Upper bound on visit costs plus transit fares |
| `start_node_index` | `Optional[int]` | `None` | Fixed start index (`0..N-1`); `None` searches all root candidates |
| `end_node_type` | `Optional[NodeType]` | `None` | Required categorical type for the terminal stop |
| `end_node_index` | `Optional[int]` | `None` | Required terminal node index (for hotel round-trips) |
| `end_time_limit` | `int` | `-1` | Global itinerary deadline in minutes from midnight (`-1` disables) |
| `breakfast_deadline`, `lunch_deadline`, `dinner_deadline` | `int` | `-1` | Latest arrival minute for each meal type (`-1` disables) |
| `max_idle_time` | `int` | `60` | Maximum allowed waiting minutes before a POI opens |
| `idle_time_penalty_rate` | `float` | `0.5` | Score deducted per 15 minutes of idle waiting |
| `max_active_time_before_fatigue` | `int` | `240` | Active minutes allowed before fatigue multiplier activates |
| `fatigue_penalty_multiplier` | `float` | `0.6` | Score multiplier applied when fatigued (`0.0 < mult <= 1.0`) |
| `min_meal_spacing` | `int` | `180` | Minimum minutes required between consecutive meals |
| `monotony_threshold` | `int` | `2` | Category visits allowed before exponential diminishing returns |
| `monotony_multiplier` | `float` | `0.5` | Exponential penalty factor `mult ** (count - threshold + 1)` |
| `timeout_ms` | `int` | `5000` | Wall-clock search cap in ms (polled every `1,024` node expansions) |
| `max_nodes_expanded` | `int` | `0` | Expansion cap (`0` disables limit) |

| `OptimizationResult` attribute | Type | Description |
| :--- | :--- | :--- |
| `path` | `list[int]` | Ordered visited node indices from start to terminal (empty if infeasible) |
| `arrival_times` | `list[int]` | Arrival timestamps in minutes from midnight for each node in `path` |
| `total_cost`, `total_time`, `total_score` | `float` | Total expenditure, elapsed minutes, and net utility score |
| `nodes_expanded` | `int` | Count of branch-and-bound search nodes evaluated |
| `timed_out` | `bool` | `True` when `timeout_ms` or `max_nodes_expanded` halted search with best incumbent |

## Solver entry points (GIL-released)

All three Python functions release the GIL (`py::gil_scoped_release`), consume 1D row-major `N x N` NumPy arrays (`int32` for durations/windows/dwells, `float64` for costs), and raise `ValueError` (`std::invalid_argument` in C++) on dimension mismatches or out-of-range depot indices.

```python
optimize_itinerary(
    pois: list[POI],
    durations: npt.NDArray[np.int32],  # flattened N*N, positional-only in Python
    costs: npt.NDArray[np.float64],    # flattened N*N, positional-only in Python
    config: OptimizationConfig,
) -> OptimizationResult
```

```python
solve_tsp_tour(
    durations: npt.NDArray[np.int32],  # flattened n*n
    n: int,
    start_node: int = 0,
    end_node: int = -1,
    fixed_end: bool = False,
) -> list[int]
```

```python
solve_tsptw(
    durations: npt.NDArray[np.int32],      # flattened n*n
    n: int,
    dwell_times: npt.NDArray[np.int32],    # length n
    window_starts: npt.NDArray[np.int32],  # length n
    window_ends: npt.NDArray[np.int32],    # length n
    start_node: int = 0,
    end_node: int = -1,
    fixed_end: bool = False,
    penalty_weight: float = 100.0,
) -> list[int]
```

- `optimize_itinerary` arguments are **positional-only** in `bindings.cpp` and enforce `len(pois) <= 64`.
- `solve_tsp_tour` and `solve_tsptw` accept arbitrary `n` without the 64-node bitmask ceiling and support named keyword arguments in Python.
