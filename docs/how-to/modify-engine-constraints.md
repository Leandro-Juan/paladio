# How-To: Modify Engine Constraints

The C++ Core Engine uses a multi-objective cost function and rigid pruning constraints to optimize itineraries. Modifying these involves updating both the C++ source and the Python Pydantic schemas.

This guide explains how to add a new constraint, for example, `max_walking_distance`.

## 1. Update the C++ Core Structures

Locate the `OptimizationConfig` struct in the C++ engine (usually in `cpp_core/src/` or similar headers).

```cpp
// In your C++ header
struct OptimizationConfig {
    double max_budget;
    int end_time_limit;
    // Add the new constraint
    double max_walking_distance; 
};
```

## 2. Apply the Constraint in the Solver

Update the Branch & Bound DFS logic to prune branches that violate the new constraint.

```cpp
// Inside optimize_itinerary or the DFS recursive function
if (current_state.accumulated_walking_distance > config.max_walking_distance) {
    // Prune branch: walking distance exceeded
    return;
}
```

## 3. Update the PyBind11 Bridge

Ensure the new constraint is exposed to Python. Update your pybind11 definitions.

```cpp
py::class_<OptimizationConfig>(m, "OptimizationConfig")
    .def(py::init<>())
    .def_readwrite("max_budget", &OptimizationConfig::max_budget)
    .def_readwrite("end_time_limit", &OptimizationConfig::end_time_limit)
    // Expose the new constraint
    .def_readwrite("max_walking_distance", &OptimizationConfig::max_walking_distance);
```

Recompile the engine:
```bash
cd cpp_core
mkdir build && cd build
cmake ..
make
```

## 4. Update the Python Validator Schema

To allow the LLM to extract this constraint from natural language, update the Pydantic model in `backend/app/schemas/`.

```python
# backend/app/schemas/itinerary.py
from pydantic import BaseModel, Field

class ItineraryConstraints(BaseModel):
    # ... existing fields
    max_walking_distance: float = Field(
        default=10.0, 
        description="Maximum acceptable walking distance in kilometers"
    )
```

## 5. Map the Pydantic Schema to the C++ Bridge

Finally, update `backend/app/engine/bridge.py` to pass the validated Python constraint to the C++ object.

```python
# backend/app/engine/bridge.py
from paladio_core import OptimizationConfig

def run_optimization(constraints, pois, transit_matrix):
    config = OptimizationConfig()
    config.max_budget = constraints.budget_eur
    
    # Map the new constraint
    config.max_walking_distance = constraints.max_walking_distance
    
    # ... execute solver
```

You have now successfully piped a new constraint from human text, through the LangGraph Validator, and into the C++ optimization engine.
