# Itinerary Realism Rules & Heuristic Traps

## 1. Realism Dimensions & Audit Matrix

| Dimension | Unrealistic Output (Violation) | Realism Rule & Invariant |
|---|---|---|
| **Meal Spacing** | • Lunch at 09:00 or Dinner at 15:00<br>• Two meals within < 180 min<br>• Zero meals during a 10h trip | • Breakfast: 07:00 – 10:30<br>• Lunch: 12:00 – 15:00<br>• Dinner: 18:30 – 22:30<br>• `min_meal_spacing` strictly $\ge 180$ minutes |
| **Pacing & Fatigue** | • 8 intensive attractions in 3 hours<br>• Continuous active walking for 6h<br>• Hard POIs at the end of an exhausting day | • Visit durations match real POI depth (Major museum $\ge 90$ min)<br>• Apply fatigue discount after `max_active_time` (e.g. 240 min)<br>• Buffer time between intense activities |
| **Idle Time** | • Arriving 2 hours early and idling<br>• Total accumulated idle time > 45 min | • `idle_time = max(0, earliest_time - arrival_time)`<br>• Reject or severely penalize if `idle_time > max_idle_time` |
| **Routing Sanity** | • Ping-pong routing (North $\to$ South $\to$ North)<br>• Teleportation / unrealistic speeds | • Route must minimize back-and-forth oscillations<br>• Transit must satisfy triangle inequality |
| **Monotony** | • Visiting 4 art museums in a row | • Diminishing returns: Multiply subsequent same-category POI scores by $\text{monotony\_multiplier}^{k - \text{threshold}}$ |
| **Round-Trip** | • Terminating far from hotel at 23:00 with zero budget left | • Path must end at designated `end_node`<br>• Budget & time must include final return transit |
| **Deadlines** | • Visiting POI after closing<br>• Exceeding `end_time_limit` | • $\text{arrival}_i + \text{duration}_i \le \text{latest\_time}_i$<br>• $\text{termination time} \le \text{end\_time_limit}$ |

## 2. Heuristic & Pruning Traps in Travel Solvers

When auditing optimization code (e.g. Branch-and-Bound C++ solvers), ensure the pruning logic avoids these critical logic traps:

1. **False Pruning on Meal Deadlines**:
   - If a path hasn't visited a meal spot by $t$, but can still reach a meal spot before `lunch_deadline`, do NOT prune too early. Only prune if $\min_{\text{meal } m} (t + \text{transit}(curr, m)) > \text{lunch\_deadline}$.
2. **Fatigue Score Miscalculation**:
   - Fatigue should decay the POI enjoyment/score, NOT modify the physics of arrival time or transit duration.
3. **Monotony Diminishing Returns Invariants**:
   - Backtracking in DFS must strictly decrement the category count `category_visited[poi.type]--` to avoid poisoning sibling search branches.
4. **Round-Trip Feasibility Lookahead**:
   - At any search depth, the solver must verify:
     $t_{\text{current}} + \text{duration}_i + \text{transit}(i, \text{hotel}) \le \text{end\_time\_limit}$
     $\text{cost}_{\text{current}} + \text{cost}_i + \text{transit\_cost}(i, \text{hotel}) \le \text{max\_budget}$
