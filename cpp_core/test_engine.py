import sys
import os

# Add the build directory to the Python path
sys.path.append(os.path.join(os.path.dirname(__file__), 'build'))

try:
    import paladio_core
    print("Successfully imported paladio_core!")
except ImportError as e:
    print(f"Failed to import paladio_core: {e}")
    sys.exit(1)

# Create POIs
pois = [
    paladio_core.POI(paladio_core.NodeType.HOTEL, 10.0, 50.0, 0, 100, 10),
    paladio_core.POI(paladio_core.NodeType.ATTRACTION, 20.0, 100.0, 10, 100, 20),
    paladio_core.POI(paladio_core.NodeType.AIRPORT, 15.0, 80.0, 30, 120, 15)
]

# Transit times
transit_times = [
    [paladio_core.TransitInfo(0, 0.0), paladio_core.TransitInfo(10, 5.0), paladio_core.TransitInfo(20, 10.0)],
    [paladio_core.TransitInfo(10, 5.0), paladio_core.TransitInfo(0, 0.0), paladio_core.TransitInfo(15, 8.0)],
    [paladio_core.TransitInfo(20, 10.0), paladio_core.TransitInfo(15, 8.0), paladio_core.TransitInfo(0, 0.0)]
]

# Config
config = paladio_core.OptimizationConfig(1.0, 1.0, 1.0, 100.0)

import time
start = time.time()
result = paladio_core.optimize_itinerary(pois, transit_times, config)
end = time.time()

print(f"Optimization finished in {(end - start) * 1000:.2f} ms")
print(f"Best path: {result.path}")
print(f"Total cost: {result.total_cost}")
print(f"Total time: {result.total_time}")
print(f"Objective value: {result.objective_value}")
