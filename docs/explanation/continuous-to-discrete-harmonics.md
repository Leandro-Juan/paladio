# Architectural Explanation: Continuous-to-Discrete Harmonics

One of Paladio's unique technical innovations is its mathematical bridging of **continuous latent embeddings** and **discrete human-interpretable category radar telemetry**.

This document outlines the geometric theory behind the **8-D Harmonic Projection**.

---

## 1. The Interpretability Gap in Latent Spaces

While dense 768-D vector embeddings excel at mathematical similarity computations, they suffer from the *interpretability gap*: a vector $\mathbf{v} \in \mathbb{R}^{768}$ is completely opaque to a human traveler. 

Travelers do not think in continuous 768-dimensional coordinates; they think in tangible interests:
- *"I enjoy historical landmarks and fine food, but I don't care for nightlife."*

To provide transparent, explainable recommendations, Paladio projects continuous latent trajectories onto an **8-dimensional harmonic basis**.

---

## 2. Defining the Canonical Anchor Hypersphere

In `backend/app/engine/scoring/semantic_learning.py`, 8 canonical travel categories are defined by descriptive natural language prompts:

```text
1. art_culture        (Fine arts, museums, exhibitions, sculptures)
2. history_heritage   (Monuments, castles, cathedrals, archaeology)
3. nature_outdoors    (Parks, botanical gardens, lakes, trails)
4. architecture       (Urban facades, towers, bridges, city design)
5. food_culinary      (Gastronomy, tapas, local dining, bistros)
6. nightlife          (Cocktail bars, speakeasies, music venues)
7. shopping           (Artisan markets, boutiques, antique stores)
8. scenic_views       (Miradors, rooftop viewpoints, observation decks)
```

At module initialization, each anchor prompt is embedded into a 768-D vector and normalized to unit length:

$$\mathbf{u}_k = \frac{\text{Embed}(P_k)}{\|\text{Embed}(P_k)\|_2} \quad \text{for } k \in [1, \dots, 8]$$

These 8 vectors act as anchor poles defining an 8-dimensional basis on the 768-D unit hypersphere $\mathbb{S}^{767}$.

---

## 3. The Harmonic Projection Mapping

Given a user's latent preference vector $\mathbf{v} \in \mathbb{S}^{767}$ (which continuously adapts via EMA on every conversational turn), its projection onto category $k$ is calculated by:

$$\mathbf{a}_k = \text{clip}\left(\frac{\mathbf{v} \cdot \mathbf{u}_k + 1}{2}, \, 0.0, \, 1.0\right)$$

Because both $\mathbf{v}$ and $\mathbf{u}_k$ are unit vectors, their inner product $\mathbf{v} \cdot \mathbf{u}_k \equiv \cos(\theta)$ is strictly bounded in $[-1.0, 1.0]$:
- If $\cos(\theta) = 1.0$ (perfect alignment): $\mathbf{a}_k = 1.0$.
- If $\cos(\theta) = 0.0$ (orthogonal / neutral): $\mathbf{a}_k = 0.5$.
- If $\cos(\theta) = -1.0$ (diametrically opposed): $\mathbf{a}_k = 0.0$.

---

## 4. Driving Real-Time UI Radar Telemetry

The resulting vector $\mathbf{a} \in [0, 1]^8$ is transmitted directly over WebSockets to the Next.js frontend:

```mermaid
graph LR
    P[User Prompt] -->|Ollama nomic-embed-text| V[768-D Vector]
    V -->|EMA Update| U[Permanent User Vector]
    U -->|Harmonic Projection| A[8-D Vector]
    A -->|WebSocket /ws/stream| R[SVG PreferenceRadar Component]
```

This transforms complex multi-dimensional machine learning into an intuitive, interactive radar polygon that updates in real time as the user chats with the AI swarm.
