# How-To: Modify the Scoring Model

This recipe demonstrates how to expand or alter the Paladio scoring neural network, whether you need to ingest new data types or increase the model's complexity.

## Adding a New Feature Dimension

If you have acquired new data (e.g., live weather data) and want the Neural Network to process it, you must increase the size of the Feature Tensor.

### Step 1: Update the Extraction Logic
Open `backend/app/engine/scoring/features.py`. Locate the `FEATURE_DIM` constant and increase it (e.g., from `128` to `129`).

```python
FEATURE_DIM = 129
```

### Step 2: Implement the Feature
Inside `build_feature_tensor`, map your new logic into the tensor. 
*Ensure the data is normalized between 0 and 1 for the best gradient performance.*

```python
def build_feature_tensor(poi: Dict[str, Any]) -> np.ndarray:
    tensor = np.zeros(FEATURE_DIM)
    
    # ... existing extraction logic ...
    
    # 4. New Weather Feature (128)
    tensor[128] = float(poi.get("rain_probability", 0.0))
    
    return tensor
```

### Step 3: Update the Network Input Size
Because the Feature Tensor is now `129` dimensions, the combined input size (User Embedding 64 + Feature Tensor 129) is now `193`.

Open `backend/app/engine/scoring/model.py` and adjust the first `Linear` layer inside `ScoringMLP`.

```python
class ScoringMLP(Module):
    def __init__(self):
        self.net = Sequential(
            Linear(193, 64), # Changed from 192 to 193
            ReLU(),
            # ...
        )
```

## Adding a New Hidden Layer

To increase the network's capacity to learn complex relationships, you can deepen the Multi-Layer Perceptron.

Open `backend/app/engine/scoring/model.py` and modify `ScoringMLP`:

```python
class ScoringMLP(Module):
    def __init__(self):
        self.net = Sequential(
            Linear(192, 128),  # Expanded layer
            ReLU(),
            Linear(128, 64),   # New hidden layer
            ReLU(),
            Linear(64, 32),
            ReLU(),
            Linear(32, 1),
            Sigmoid()
        )
```

## Testing Your Modifications

After making architectural changes, you **must** verify that gradients are still flowing correctly. If the DAG is broken, the model will output static numbers and fail to learn.

Run the test suite script:
```bash
source .venv/bin/activate
python backend/test_model.py
```

If successful, the output will confirm:
`Backward pass successful! Gradients flowed through the network correctly.`
