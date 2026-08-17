#!/usr/bin/env python3
"""
Itinerary Realism Validator Script
Usage: python validate_itinerary.py path/to/itinerary.json

Validates a JSON itinerary against realistic human constraints.
"""

import sys
import json

def validate_itinerary(data):
    config = data.get('config', {})
    pois = {p['id']: p for p in data.get('pois', [])}
    transits = data.get('transits', {})
    path = data.get('path', [])
    
    max_idle = config.get('max_idle_time', 45)
    min_meal_spacing = config.get('min_meal_spacing', 180)
    max_budget = config.get('max_budget', float('inf'))
    end_time_limit = config.get('end_time_limit', float('inf'))
    
    current_time = None
    total_cost = 0.0
    last_meal_time = -999
    
    violations = []
    
    for i in range(len(path)):
        node_id = path[i]
        poi = pois.get(node_id)
        if not poi:
            violations.append(f"POI {node_id} not found in POIs list")
            continue
            
        # 1. Transit
        if i > 0:
            prev_id = path[i-1]
            transit = transits.get(str(prev_id), {}).get(str(node_id), {})
            duration = transit.get('duration', 0)
            cost = transit.get('cost', 0.0)
            current_time += duration
            total_cost += cost
            
        # 2. Idle / Opening Hours
        earliest = poi.get('earliest_time', 0)
        
        if current_time is None:
            current_time = earliest
            
        if current_time < earliest:
            idle = earliest - current_time
            if idle > max_idle:
                violations.append(f"Unrealistic idle wait of {idle}m at POI {node_id}")
            current_time = earliest
            
        # 3. Closing Window
        latest = poi.get('latest_time', float('inf'))
        duration = poi.get('duration', 0)
        if current_time + duration > latest:
            violations.append(f"Time window violation: POI {node_id} closes before visit ends")
            
        # 4. Meal Spacing
        is_meal = poi.get('is_meal_spot', False)
        if is_meal:
            if current_time - last_meal_time < min_meal_spacing:
                violations.append(f"Unrealistic meal spacing ({current_time - last_meal_time}m < {min_meal_spacing}m)")
            last_meal_time = current_time
            
        current_time += duration
        total_cost += poi.get('cost', 0.0)
        
    # 5. Budget & Global Deadline
    if total_cost > max_budget:
        violations.append(f"Budget exceeded: {total_cost} > {max_budget}")
        
    if current_time > end_time_limit:
        violations.append(f"Global time exceeded: {current_time} > {end_time_limit}")
        
    if violations:
        print("❌ Realism Validation Failed:")
        for v in violations:
            print(f"  - {v}")
        return False
    else:
        print("✅ Itinerary is fully realistic")
        return True

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python validate_itinerary.py <itinerary.json>")
        sys.exit(1)
        
    try:
        with open(sys.argv[1], 'r') as f:
            data = json.load(f)
        success = validate_itinerary(data)
        sys.exit(0 if success else 1)
    except Exception as e:
        print(f"Error reading or parsing file: {e}")
        sys.exit(1)
