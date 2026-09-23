# Architectural Explanation: Sovereign ML & Dense Semantic RAG

This document explains the design principles behind Paladio's **Sovereign Machine Learning** architecture: how local dense vector embeddings, `pgvector`, and pure NumPy scoring achieve high-accuracy personalization without external cloud APIs.

---

## 1. The Flaws of Cloud-Dependent RAG

Standard enterprise RAG (Retrieval-Augmented Generation) patterns typically rely on:
- OpenAI `text-embedding-3-small` or Cohere Embed API endpoints.
- Cloud vector databases (Pinecone, Qdrant Cloud, Weaviate Cloud).
- Continuous network round-trips for every user prompt.

In a sovereign, air-gapped system, this architecture fails three non-negotiable criteria:
1. **Privacy & Air-Gap Compatibility:** Sensitive travel schedules and private booking texts cannot be transmitted to third-party cloud servers.
2. **Deterministic Availability:** The system must function identically on an offline laptop, private home server, or disconnected field environment.
3. **Cost & Latency:** Frequent embedding calls incur latency penalties and ongoing API subscription costs.

---

## 2. The Local 768-D Semantic Hypersphere

Paladio standardizes on local dense vector representations:
- **Embedding Model:** `nomic-embed-text` (768 dimensions), quantized and executed locally via Ollama.
- **Vector Database:** PostgreSQL 16 equipped with `pgvector`, utilizing HNSW (Hierarchical Navigable Small World) indexing for sub-millisecond approximate nearest neighbor searches.

### Why 768 Dimensions?
768-dimensional embeddings strike the optimal balance for consumer hardware:
- Small enough to fit comfortably in RAM: indexing 100,000 attractions requires only ~300 MB of vector memory.
- Rich enough to capture subtle nuances between closely related cultural activities (e.g., distinguishing between a modern art gallery and a classical sculpture museum).

---

## 3. Pure NumPy & Deterministic Scorer vs. Heavy Frameworks

Early prototypes explored training lightweight Multi-Layer Perceptrons (MLPs) using PyTorch or JAX to calculate POI scores. However, introducing PyTorch to the backend:
- Bloated Docker image sizes by over 2.5 GB.
- Introduced non-deterministic GPU memory spikes that competed with local Ollama inference.
- Created cold-start latency during worker initialization.

Paladio replaced the neural network with **`HybridSovereignScorer`**, implemented entirely in **pure NumPy**:
- **Bayesian Rating Smoothing:** Eliminates rating bias on venues with few reviews.
- **Multi-Attribute Utility:** Linearly combines quality, affinity dot products, pacing penalties, and budget fit.
- **Sub-Millisecond Inference:** Evaluates thousands of POIs in under 2 milliseconds on standard CPU cores.
