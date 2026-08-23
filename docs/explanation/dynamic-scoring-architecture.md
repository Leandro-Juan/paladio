# The Dynamic Scoring Architecture

This document explains the conceptual design, necessity, and execution flow of the Paladio dynamic scoring system. It is designed to help architects and core developers understand *why* the system is structured this way and *how* the Python/C++ boundaries interact to generate personalized Point of Interest (POI) scores.

## The Problem with Static Scoring

In early versions of the Paladio graph engine, every POI (museum, flight, restaurant, etc.) was assigned a static score of `100.0`. The C++ optimization engine operated purely as a constrained mathematical solver, attempting to maximize the number of nodes visited within budget and time bounds. 

However, travel is highly subjective. A museum might be a `100.0` for a history enthusiast but a `10.0` for someone seeking nightlife. To solve this, the scoring mechanism needed to become **dynamic, personalized, and differentiable**.

## Architectural Components

The dynamic scoring architecture bridges high-level Python orchestrations with low-level C++ math. It consists of three primary components:

### 1. Deep Feature Pipeline (Python)
Raw data from APIs (Yelp, Duffel, etc.) is highly heterogeneous. A flight has "legroom", while a restaurant has "Michelin stars". To allow a neural network to process this, all raw data is standardized into a unified mathematical structure: the **128-dimensional Feature Tensor**.

### 2. The Multi-Layer Perceptron (Python)
Instead of hardcoded rules, a Neural Network (the `ScoringMLP`) determines the score. It takes a **64-dimensional User Embedding** (representing latent travel preferences) and concatenates it with the 128-dimensional Feature Tensor. 

Through non-linear layers (`ReLU`), the network uncovers complex relationships (e.g., if the user hates exertion but the POI involves hiking, lower the score). The final output is scaled to a `[0, 100]` float.

### 3. The Custom Autograd Engine (C++)
To allow the system to learn from user feedback, the neural network's mathematical operations must be differentiable. Rather than introducing a heavy dependency like PyTorch, Paladio uses a custom **C++ Autograd Engine** (`paladio_core.Value`). 

This engine is exposed to Python via PyBind11. Every multiplication, addition, and activation function executed in the Python MLP is actually processed and tracked by the C++ core. If a user rejects a generated itinerary, the system can simply call `.backwards()` on the final score. The C++ engine computes the exact gradients needed to update the user's embedding or the network's weights, creating a self-improving feedback loop.

## Execution Flow

1. **Orchestration**: The LangGraph Swarm extracts JSON data for various POIs.
2. **Feature Extraction**: `bridge.py` pipes the JSON through `features.py`, resulting in a `128-d` numpy array.
3. **Inference**: The `ScoringMLP` takes the User Tensor and the POI Tensor, converting them into `paladio_core.Value` objects and executing a forward pass.
4. **Resolution**: The resulting scalar value is extracted from the computational graph (`score_val.data`) and embedded into the lightweight C++ `POI` struct.
5. **Optimization**: The C++ branch-and-bound solver searches for the mathematically optimal path that maximizes the sum of these personalized scores.
