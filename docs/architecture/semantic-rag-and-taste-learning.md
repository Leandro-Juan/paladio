# Semantic RAG and taste learning engine

Paladio embeds POIs and user preferences in-process on CPU via `fastembed`, retrieves candidates with hybrid SQL Reciprocal Rank Fusion (RRF) and Spatial-Semantic Maximal Marginal Relevance (MMR), and ranks venues using pure-NumPy Bayesian + online Stochastic Gradient Descent (SGD) models.

## In-process CPU ONNX embeddings (`OnnxEmbeddingProvider`)

Running embeddings through an external Ollama daemon previously added container startup latency, GPU/VRAM contention, and network hop failures. `backend/app/infrastructure/providers/onnx_embedding_provider.py` embeds text directly inside Python using quantized CPU ONNX (`fastembed`, model `nomic-ai/nomic-embed-text-v1.5-Q`, baked into `/opt/models/fastembed` during Docker build).

- **768-dimensional L2-normalized vectors**: Applies task-aware `search_query:` and `search_document:` prefixes so asymmetrical short queries match rich versioned v3 POI documents built by `backend/app/engine/hydration/document_builder.py`.
- **Idle RAM reclamation**: Honors `FASTEMBED_THREADS` and optional `FASTEMBED_IDLE_TIMEOUT_SECONDS` to release ONNX runtime sessions and trim heap memory (`malloc_trim`) when idle.
- **Zero-LLM `PromptIntentExtractor`**: Projects user trip prompts against curated 768-D semantic anchor vectors and combines `rapidfuzz` fuzzy DB matching (`backend/app/engine/nlp/intent_extractor.py`) to extract mandatory POIs, tastes, cuisines, pace, and offbeat preference without calling a chat LLM.

## Hybrid SQL RRF retrieval and Spatial-Semantic MMR

`HybridRetriever` (`backend/app/engine/retrieval/hybrid_retriever.py`) fuses four PostgreSQL signals inside a single database round-trip before diversifying results geographically:

1. **Vector cosine similarity**: `pgvector` HNSW index (`m=16, ef_construction=128`) on `attractions.embedding`.
2. **Full-text search (FTS)**: PostgreSQL `tsvector` GIN index over normalized names, descriptions, and facets.
3. **Fuzzy trigram matching**: `pg_trgm` GIN index catching misspellings, accents, and partial venue titles.
4. **Structured JSONB facets**: `jsonb_path_ops` GIN index filtering opening hours, indoor/outdoor traits, and cost brackets extracted by `facet_extractor.py`.

Reciprocal Rank Fusion (RRF) merges ranked lists across those signals, and Spatial-Semantic Maximal Marginal Relevance (MMR) then prevents near-duplicate venues in the same micro-block from crowding out neighborhood variety.

## 16-D `PoiEncoder`, `HybridSovereignScorer`, and online SGD

`HybridSovereignScorer` (`backend/app/infrastructure/scoring/hybrid_scorer.py`) completely replaced the legacy untrained JAX/Flax MLP with an interpretable, deterministic pure-NumPy utility function (`[0.0, 100.0]`) paired with `PoiEncoder` (`backend/app/engine/scoring/features.py`, `FEATURE_DIM = 16`):

| Feature index | Signal | Normalization / representation |
| :--- | :--- | :--- |
| `[0]` | Admission cost | `cost / 200.0` clipped to `[0.0, 1.0]` |
| `[1]` | Visit dwell duration | `duration_mins / 240.0` clipped to `[0.0, 1.0]` |
| `[2]`, `[4]` | Rating | Normalized `rating / 5.0` and raw `[0.0, 5.0]` |
| `[3]`, `[5]` | Review popularity | Normalized `log10(reviews + 1) / 5.0` and raw count |
| `[6]` | Free admission flag | `1.0` if `cost <= 0` else `0.0` |
| `[7]` | Outdoor flag | `1.0` if `nature_outdoors` tag active |
| `[8..15]` | 8 category tag activations | `art_culture`, `history_heritage`, `nature_outdoors`, `architecture`, `food_culinary`, `nightlife`, `shopping`, `scenic_views` |

Default hybrid scorer weights combine quality (`w_quality = 0.35`, Bayesian smoothed with `prior_reviews_m = 50.0` and `prior_rating_C = 4.0`), tag/semantic affinity (`w_affinity = 0.40`), pacing fit (`w_pacing = 0.15`), and budget fit (`w_budget = 0.10`). Online SGD updates (`learning_rate = 0.15`, `l2_reg = 0.01`), `TasteService` (`backend/app/application/taste/taste_service.py`), and `TasteRankerModel` persist implicit and explicit signals (`taste_events`) into `user_taste_profiles`, support group consensus merging for multi-traveler trips, and retrain nightly at `04:00 UTC` via Celery Beat (`retrain_taste_profiles_task`).
