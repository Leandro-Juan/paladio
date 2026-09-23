# First Autonomous Swarm Trip

In this tutorial, you will plan a trip using Paladio's **Active Engine** cockpit (`/engine`), configure travel constraints and anchors, stream real-time WebSocket telemetry from the multi-agent swarm, and inspect the converged combinatorial itinerary.

---

## 1. Navigating to the Active Engine Cockpit

Open your browser and navigate to:
```text
http://localhost:3000/engine
```
Or click **Active Engine** in the sidebar navigation.

The Active Engine interface is structured into two main workspaces:
- **`01 // MISSION PREPARATION`**: Configuration interface for prompt intent, budget, meal windows, and flight/hotel anchors.
- **`02 // TELEMETRY CONSOLE`**: Live streaming terminal and output panel (`OUTPUT TELEMETRY`) powered by persistent WebSockets.

---

## 2. Configuring the Travel Parameters (`01 // MISSION PREPARATION`)

In the **Mission Preparation** tab, set up your trip parameters:

### Step 2.1: Trip Intent & Preferences
In the **`> TRIP INTENT & PREFERENCES`** textarea, define your qualitative travel goals:
> *"Visit the main cultural landmarks and museums. Love traditional bistros and relaxed cafes."*

This prompt is analyzed by the sovereign local LLM (`prompt_analyzer`) to update your continuous 768-D taste vector and extract domain category affinities.

### Step 2.2: Financial Budget Ceiling
In **`> BUDGET CEILING`**, enter your currency envelope:
```text
$ 1500 USD
```
The C++ solver uses this constraint to enforce a strict upper bound on POI admission fees and transit legs.

### Step 2.3: Mandatory Meal Windows
Under **`> MEAL CONSTRAINTS`**, review the culturally calibrated meal windows:
- **Breakfast:** `08:00` $\rightarrow$ `10:00`
- **Lunch:** `12:00` $\rightarrow$ `14:30`
- **Dinner:** `19:30` $\rightarrow$ `22:00`

You can click **`+ ADD MEAL WINDOW`** (e.g., for an afternoon snack) or adjust the boundary hours. The solver treats these as hard temporal time windows where food venues must be scheduled.

### Step 2.4: Travel Anchors (Flights & Hotel)
Paladio anchors itineraries around real flight arrival/departure times and lodging locations. Select your mode:

- **Simulated Anchors (Test Mode):**
  - **Origin City:** `Madrid`
  - **Destination City:** `Paris`
  - *Automated Generation:* Generates round-trip flight bookings between real IATA airports (`MAD` $\rightarrow$ `CDG`) and verifies a hotel in the destination city for 5 days.
- **Direct Ticket Ingestion (Production Mode):**
  - Paste raw flight confirmation text, boarding passes, or hotel vouchers directly into the intake box for deterministic parsing by the Pydantic AI `ticket_parser` agent.

---

## 3. Initializing the Solver & Streaming Telemetry

Click the blue **`INITIALIZE SOLVER [MADRID -> PARIS]`** button at the bottom of the form.

The interface immediately switches to **`02 // TELEMETRY CONSOLE`** and the **`OUTPUT TELEMETRY`** panel connects via WebSockets (`/api/v1/ws/stream`):

```text
[PHASE: PARSER]      Extracting booking anchors...
                     -> Origin: Madrid (MAD) | Destination: Paris (CDG)
                     -> Hotel: Hotel Pullman Paris Tour Eiffel
                     -> Dates: 5-day optimization horizon
[PHASE: CONSTRAINTS] Deterministically assembling temporal & financial bounds...
                     -> Budget: $1500.00 USD
                     -> Hard Meal Windows: 3 daily (Breakfast, Lunch, Dinner)
[PHASE: ANALYSIS]    Extracting travel tastes & tag affinities via Ollama...
                     -> High Affinities: art_culture (0.92), food_culinary (0.88)
[PHASE: ML_SCORING]  Batch encoding POIs into 16-D feature tensors...
                     -> Computing Bayesian smoothed ratings
                     -> Applying user taste EMA vector update
[PHASE: SOLVER]      Dispatching to C++ paladio-core branch-and-bound solver...
                     -> Evaluated 3,840 graph permutations in 1.86 ms
[PHASE: COMPLETED]   Optimal multi-day itinerary converged!
```

---

## 4. Inspecting and Saving the Results

Once converged, the interface renders the interactive results in the right viewport:

### 1. The Daily Trip Timeline (`TripTimeline`)
- **Day-by-Day Tabs:** Navigate through each scheduled day.
- **Chronological Time Cards:** Fixed POI visit windows ($[09:30, 11:30]$) displaying attraction names, estimated admission costs, and categories.
- **Dedicated Meal Blocks:** Culturally scheduled lunch and dinner venues.
- **Multimodal Transit Buffers:** Walking and metro transit times with live fare estimates calculated between consecutive POIs.

### 2. Saving to Vault & Upcoming Trips
Click the **`SAVE TRIP TO VAULT`** button in the header of the converged itinerary:
- The itinerary is permanently saved to PostgreSQL.
- You can now view and manage it under **Upcoming Trips** (`/trips`) and explore historical itineraries in the **Itinerary Vault** (`/vault`).

---

## 5. What Just Happened Under the Hood?

1. **`ticket_parser` Agent:** Verified flight timings and hotel check-in/out bounds using Pydantic AI models.
2. **`assemble_constraints_node`:** Synthesized financial envelopes, meal windows, and spatial anchors into a validated `TravelConstraints` structure.
3. **`prompt_analyzer` Agent:** Extracted semantic tastes and executed an Exponential Moving Average (EMA) update on your permanent 768-D latent vector.
4. **`MLScorer`:** Encoded POIs in the destination city into 16-D tensors, computing Bayesian-smoothed multi-attribute utility scores.
5. **`paladio-core` (C++):** Formulated and solved the Time-Constrained Orienteering Problem with Time Windows (TCOPTW) via branch-and-bound DFS and Knapsack bounding in sub-millisecond time.

Congratulations! You have completed your first autonomous swarm-optimized trip with Paladio.
