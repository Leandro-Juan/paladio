# Autograd C++ API Reference

This document serves as the technical reference for the `paladio_core.Value` class, the foundational component of the Paladio dynamic scoring neural network.

## Overview

The Autograd Engine implements a Directed Acyclic Graph (DAG) for automatic differentiation, similar to Andrej Karpathy's `micrograd`. It operates strictly on scalar values, meaning matrix multiplications must be implemented via dot products of lists/vectors.

## C++ Implementation Details

### `ValueNode`
The internal struct holding the computational graph data.
- `double data`: The raw scalar value.
- `double grad`: The accumulated gradient.
- `std::vector<std::shared_ptr<ValueNode>> children`: The dependencies (inputs) of this node.
- `std::function<void()> _backwards`: The lambda function defining the backward pass for this specific operation.

### `Value`
The public-facing wrapper class holding a `std::shared_ptr<ValueNode>`.

#### Methods
- `Value(double data = 0.0)`: Initializes a leaf node.
- `double data() const` / `double& data()`: Accessor for the scalar value.
- `double grad() const` / `double& grad()`: Accessor for the gradient.
- `void backwards()`: Performs a topological sort and initiates backpropagation.
- `void zero_grad()`: Resets all gradients in the graph to `0.0`.

#### Activation Functions
- `Value exp() const`: Returns $e^x$.
- `Value log() const`: Returns $\ln(x)$ (internally clamped to $1e^{-8}$ to prevent `-inf`).
- `Value pow(const Value& other) const`: Returns $x^y$.
- `Value relu() const`: Returns $\max(0, x)$.
- `Value tanh() const`: Returns $\tanh(x)$.
- `Value sigmoid() const`: Returns $\frac{1}{1 + e^{-x}}$.

#### Supported Global Operators
The engine supports commutative arithmetic with both `Value` objects and `double` primitives:
- `Value + Value`, `Value + double`, `double + Value`
- `Value - Value`, `Value - double`, `double - Value`
- `Value * Value`, `Value * double`, `double * Value`
- `Value / Value`, `Value / double`, `double / Value`

## Python Bindings (PyBind11)

The C++ engine is exposed to Python via the `paladio_core` module. 

### Instantiation
```python
import paladio_core
x = paladio_core.Value(5.0)
```

### Interoperability
Thanks to robust PyBind11 operator overloads, Python `float` and `int` primitives natively interact with `Value` objects without requiring explicit casting.

```python
# Valid operations
y = x * 2.0
z = 10 + y
score = z.relu()

# Backpropagate
score.backwards()
print(x.grad) # Prints the computed derivative
```
