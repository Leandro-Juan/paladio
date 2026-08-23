import sys
import os
import numpy as np

# Add backend directory to sys.path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.engine.scoring.features import build_feature_tensor

def main():
    poi_data = {
        "name": "La Sagrada Familia",
        "description": "An unfinished Catholic minor basilica in Barcelona, Spain.",
        "category": "ATTRACTION",
        "is_indoor": 0.4,
        "distance_to_center_km": 1.5,
        "historical_significance": 0.95,
        "physical_exertion": 0.3,
        "expected_crowd_density": 0.9
    }
    
    tensor = build_feature_tensor(poi_data)
    print(f"Tensor shape: {tensor.shape}")
    print(f"Sample tensor values (spatiotemporal): {tensor[64:67]}")
    print("Feature tensor extraction successful!")

if __name__ == "__main__":
    main()
