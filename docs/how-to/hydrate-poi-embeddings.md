# How-To: Hydrate POI Vector Embeddings with CLI

Paladio stores attractions in PostgreSQL with **768-dimensional dense semantic embeddings** managed by `pgvector`. When new cities or OpenStreetMap venues are ingested, their vector representations must be generated locally via Ollama.

This guide explains how to run the automated batch hydration CLI tool.

---

## 1. Prerequisites

Ensure your local Ollama service is active and has pulled the default embedding model:

```bash
# Pull the 768-D embedding model inside the Ollama container or local host
ollama pull nomic-embed-text
```

---

## 2. Running the Batch Hydration CLI

The hydration script lives at `backend/app/cli/hydrate_pois.py`. It inspects the `attractions` table for records where `embedding IS NULL`, uses `PoiNaturalLanguageSynthesizer` to compose structured descriptive texts, and embeds them in vectorized batches.

Run the script from inside the `backend` container or your local virtual environment:

```bash
# From repository root (local venv)
python -m app.cli.hydrate_pois

# Or via Docker Compose
docker compose exec backend python -m app.cli.hydrate_pois
```

### CLI Options:
- **Default mode:** Only embeds attractions where `embedding` is currently null.
- **Force mode (`--force`):** Re-embeds all attractions in the database (useful when upgrading embedding models or modifying category synthesis logic):

```bash
python -m app.cli.hydrate_pois --force
```

---

## 3. What the Hydration Pipeline Does

```text
Attraction Model (SQL) ──> PoiNaturalLanguageSynthesizer ──> Ollama nomic-embed-text ──> pgvector Update
```

1. **Natural Language Synthesis:** Converts disparate database columns (name, category, opening hours, estimated cost, OSM tags) into a rich descriptive paragraph:
   > *"Museo Nacional del Prado is a world-class art museum located in Madrid. Open from 10:00 to 20:00. General admission is €15.00. Key highlights include masterpieces by Velázquez, Goya, and El Greco. Recommended duration is 150 minutes."*
2. **Batch Embedding:** Dispatches chunks of 24 syntheses to Ollama concurrently, maximizing CPU/GPU throughput.
3. **Database Upsert:** Writes the resulting 768-D float arrays directly to `attractions.embedding` using `SqlPoiRepository.update_poi_embeddings()`.

---

## 4. Verifying Vector Population

To confirm that attractions have been successfully hydrated, query PostgreSQL directly:

```bash
docker compose exec postgres psql -U postgres -d paladio -c \
  "SELECT count(*) AS total_pois, count(embedding) AS embedded_pois FROM attractions;"
```

You should see `total_pois = embedded_pois`.
