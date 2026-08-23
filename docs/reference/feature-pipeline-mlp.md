# Neural Network & Feature Pipeline Reference

This document outlines the technical schema and structure of the Python models used to process Points of Interest (POIs) into dynamic scores.

## 1. Feature Engineering (`features.py`)

Raw JSON data is heterogeneous. `features.py` unifies all entities into a **128-Dimensional Feature Tensor** using `np.ndarray`.

### Tensor Schema (128 Dimensions)

| Indices | Description | Normalization / Extraction Logic |
|---------|-------------|-----------------------------------|
| `[0:64]` | **Semantic Embeddings** | Deterministic pseudo-random vector derived from MD5 hashing the entity's description or name. Normalized to length 1.0. |
| `[64:67]` | **Spatiotemporal Features** | `[0]`: Indoor/Outdoor constraint.<br>`[1]`: Time-of-day affinity (0.2 morning, 0.9 night).<br>`[2]`: Distance to city center (normalized against 20km). |
| `[67:71]` | **Flight Features** | `[0]`: Legroom (cm / 100).<br>`[1]`: Historical delay probability.<br>`[2]`: Layover quality.<br>`[3]`: Baggage included status. |
| `[71:73]` | **Hotel Features** | `[0]`: Amenity density.<br>`[1]`: Demographic appeal (0.0 Family, 1.0 Business). |
| `[73:125]` | **Restaurant Features** | `[0:50]`: One-hot encoded vector of cuisines (hashed).<br>`[50]`: Michelin star status (1.0 if present).<br>`[51]`: Vegan-friendly status (1.0 if true). |
| `[125:128]` | **General POI Features** | `[0]`: Historical significance.<br>`[1]`: Physical exertion level.<br>`[2]`: Expected crowd density. |

*Note: If an entity is a Flight, the Hotel, Restaurant, and General POI features remain `0.0`, ensuring a dense, unified input layer.*

## 2. Neural Network Framework (`model.py`)

To utilize the scalar C++ Autograd engine, `model.py` provides an object-oriented, PyTorch-like API built entirely from list comprehensions and iterative dot products.

### Core Classes

- **`Module`**: The abstract base class. Provides `.zero_grad()` by collecting leaves via `.parameters()`.
- **`Neuron(nin: int)`**: Contains `nin` weights (`w`) and a bias (`b`), initialized to random floats between `[-1.0, 1.0]`. Executes $activation = \sum(w_i \cdot x_i) + b$.
- **`Linear(nin: int, nout: int)`**: A collection of `nout` instances of `Neuron`. 
- **`ReLU` & `Sigmoid`**: Standard non-linear activation layers that call the underlying C++ `.relu()` and `.sigmoid()` functions.
- **`Sequential`**: A wrapper to chain multiple layers together during a forward pass.

## 3. The `ScoringMLP` Architecture

The default network architecture instantiated in `bridge.py`. 

- **Input Dimension:** `192` (64 for User Embedding Tensor + 128 for POI Feature Tensor).
- **Hidden Layers:**
  1. `Linear(192, 64)` -> `ReLU`
  2. `Linear(64, 32)` -> `ReLU`
- **Output Layer:**
  - `Linear(32, 1)` -> `Sigmoid`
- **Scaling:**
  - Output is multiplied by `Value(100.0)` to constrain the generated score to standard optimization parameters (`[0.0, 100.0]`).
