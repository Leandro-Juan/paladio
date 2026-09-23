# Technical Reference: POI Database & Knowledge Vault Schema

This document provides the complete relational and vector database schema for Paladio's **PostgreSQL 16** cluster equipped with **`pgvector`** and **`TimescaleDB`**.

---

## 1. Table Definitions

### 1.1. `attractions` (The POI Knowledge Vault)

Stores verified points of interest, museum opening hours, financial admission models, and 768-D semantic embeddings.

```sql
CREATE TABLE attractions (
    id VARCHAR PRIMARY KEY,
    city VARCHAR NOT NULL,
    name VARCHAR NOT NULL,
    category VARCHAR NOT NULL,
    
    -- 768-D Semantic Embedding via pgvector
    embedding vector(768),
    
    -- Normalized 7-Day Operational Windows (Minutes from Midnight: 0 = 00:00, 480 = 08:00)
    open_time_mins_by_day INTEGER[] NOT NULL DEFAULT '{480,480,480,480,480,480,480}',
    close_time_mins_by_day INTEGER[] NOT NULL DEFAULT '{1320,1320,1320,1320,1320,1320,1320}',
    duration_mins INTEGER NOT NULL DEFAULT 60,
    
    -- Financial Admission Model
    cost_eur DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    cost_is_estimated BOOLEAN NOT NULL DEFAULT true,
    cost_source VARCHAR,
    osm_opening_hours VARCHAR,
    
    -- Semi-Structured Payload JSONB
    location JSONB NOT NULL,   -- {"lat": 40.4138, "lon": -3.6922, "address": "P.º del Prado"}
    scoring JSONB NOT NULL,    -- {"google_rating": 4.7, "reviews": 125000}
    metadata JSONB NOT NULL,   -- {"description": "...", "tags": ["art", "gallery"]}
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Fast City and Category Lookup Index
CREATE INDEX idx_city_category ON attractions(city, category);

-- Vector Cosine Similarity Search Index (HNSW)
CREATE INDEX idx_attractions_embedding_cosine ON attractions 
USING hnsw (embedding vector_cosine_ops);
```

---

### 1.2. `users` (Persistent Taste Profile Storage)

Persists user identities, structured preferences, and the permanent 768-D taste vector that updates via EMA.

```sql
CREATE TABLE users (
    id VARCHAR PRIMARY KEY,
    email VARCHAR UNIQUE,
    username VARCHAR UNIQUE,
    hashed_password VARCHAR,
    role VARCHAR NOT NULL DEFAULT 'user',
    is_active BOOLEAN NOT NULL DEFAULT true,
    
    -- Permanent 768-D User Taste Embedding
    embedding vector(768),
    
    -- Structured Preferences (budget, pace, tag affinities)
    preferences JSONB,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

### 1.3. `trips` (Serialized Itinerary Cache)

```sql
CREATE TABLE trips (
    id VARCHAR PRIMARY KEY,
    user_id VARCHAR REFERENCES users(id) ON DELETE CASCADE,
    destination VARCHAR NOT NULL,
    start_date VARCHAR NOT NULL,
    end_date VARCHAR NOT NULL,
    itinerary_data JSONB NOT NULL,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

### 1.4. `transit_cache` & `city_transit_fares` (Transit Matrix Engine)

```sql
CREATE TABLE transit_cache (
    city VARCHAR PRIMARY KEY,
    status VARCHAR NOT NULL DEFAULT 'BUILDING',
    osm_status VARCHAR NOT NULL DEFAULT 'PENDING',
    gtfs_status VARCHAR NOT NULL DEFAULT 'PENDING',
    valid_until TIMESTAMPTZ,
    gtfs_feed_name VARCHAR,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE city_transit_fares (
    city VARCHAR PRIMARY KEY,
    country VARCHAR,
    currency VARCHAR NOT NULL DEFAULT 'EUR',
    agency_name VARCHAR,
    single_fare DOUBLE PRECISION NOT NULL DEFAULT 2.0,
    pass_24h_price DOUBLE PRECISION,
    pass_24h_name VARCHAR,
    pass_24h_includes_airport BOOLEAN NOT NULL DEFAULT false,
    airport_surcharge DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    airport_station_keywords JSONB NOT NULL DEFAULT '[]'::jsonb,
    source VARCHAR,
    is_estimated BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 2. Vector Cosine Similarity Search Pattern

To perform semantic RAG against destination POIs using a user's prompt vector:

```sql
SELECT 
    id, name, category, cost_eur,
    1 - (embedding <=> :query_vector) AS cosine_similarity
FROM attractions
WHERE city = :destination_city
ORDER BY embedding <=> :query_vector ASC
LIMIT 50;
```
