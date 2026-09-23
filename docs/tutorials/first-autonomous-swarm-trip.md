# First Autonomous Swarm Trip

In this tutorial, you will submit a natural language travel prompt to the Paladio multi-agent swarm and observe how the system extracts constraints, queries vector memories, computes ML affinity scores, and produces an optimized multi-day itinerary.

---

## 1. Navigating to the Trip Preparation Interface

Open your browser and navigate to:
```text
http://localhost:3000/trips
```

You will see the **Trip Preparation Form**, which supports both structured inputs and conversational text parsing.

---

## 2. Submitting a Unstructured Travel Prompt

Paste the following natural language request into the prompt intake area:

> *"I am traveling from Madrid to Barcelona from October 12 to October 15 with a strict budget of $450. I have booked the Hotel Arts in Barcelona. I absolutely love art galleries and historic cathedrals, but I want to avoid crowded tourist traps. Make sure we have time for authentic tapas dinners each night."*

Click **Start Swarm Optimization**.

---

## 3. Observing the Multi-Agent Execution Lifecycle

As the swarm processes your request, the **FastAPI Semantic Gateway** streams real-time lifecycle events over WebSockets (`/ws/stream`):

```text
[PHASE: PARSER]      Extracting booking anchors from text...
                     -> Hotel: Hotel Arts (Barcelona)
                     -> Outbound: Madrid (MAD) -> Barcelona (BCN)
[PHASE: CONSTRAINTS] Deterministically assembling temporal & financial bounds...
                     -> Budget: $450.00 USD
                     -> Dates: 2026-10-12 to 2026-10-15
[PHASE: ANALYSIS]    Extracting travel tastes & tag affinities via Ollama...
                     -> Preferred Cuisines: ['tapas']
                     -> High Affinities: art_culture (0.90), history_heritage (0.85)
[PHASE: ML_SCORING]  Batch encoding POIs into 16-D feature tensors...
                     -> Computing Bayesian smoothed ratings
                     -> Applying user taste EMA vector update
[PHASE: SOLVER]      Dispatching to C++ paladio-core branch-and-bound solver...
                     -> Evaluated 2,400 graph permutations in 1.42 ms
[PHASE: COMPLETED]   Optimal multi-day itinerary converged!
```

---

## 4. Inspecting the Interactive Results

Once converged, the interface renders three interconnected views:

### 1. The Daily Trip Timeline (`TripTimeline`)
- Every day is segmented into chronological cards with visit time windows ($[09:30, 11:30]$).
- Dedicated meal slots (e.g., *Lunch [13:30 - 15:00]*, *Dinner [20:30 - 22:30]*) are scheduled according to local cultural pacing.
- Real walking and public transit times between venues are factored into the schedule buffer.

### 2. The Real-Time Affinity Radar (`PreferenceRadar`)
- The SVG radar chart reflects the harmonic projection of your taste update.
- Notice how `art_culture` and `food_culinary` have expanded outward based on your request.

### 3. The Geospatial Route Map (`VaultMap`)
- Displays the geographic layout of visited POIs and the daily transit routes computed by the C++ engine.

---

## 5. What Just Happened Under the Hood?

1. **`ticket_parser` Agent:** Scanned the text for hotels, flights, and dates using Pydantic AI.
2. **`assemble_constraints_node`:** Mapped raw inputs into a validated `TravelConstraints` model.
3. **`prompt_analyzer` Agent:** Extracted semantic tastes and affinities.
4. **`MLScorer`:** Calculated multi-attribute utility scores for all Barcelona venues in PostgreSQL.
5. **`paladio-core` (C++):** Formulated and solved the Time-Constrained Orienteering Problem with Time Windows (TCOPTW).

Congratulations! You have completed your first autonomous swarm-optimized trip with Paladio.
