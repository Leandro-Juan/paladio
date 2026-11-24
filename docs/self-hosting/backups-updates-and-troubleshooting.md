# Backups, updates, and troubleshooting

Protect PostgreSQL data and uploaded attachments with repeatable backup commands, track new releases via the GitHub Auto-Updater, purge stale caches safely, and resolve the most common self-hosted operational failures.

## Backing up PostgreSQL, volumes, and `.trip` archives

Back up the PostgreSQL database (`pgdata`), photo uploads (`PHOTO_STORAGE_DIR`), wallet attachments (`WALLET_STORAGE_DIR`), and `.env` secrets before any major upgrade.

1. Dump the PostgreSQL 16 + TimescaleDB + `pgvector` database to a compressed archive:

```bash
docker compose exec -T db pg_dump -U postgres -Fc paladio > paladio_$(date +%Y%m%d).dump
```

2. Archive user-uploaded photos and encrypted wallet ticket attachments from the `api` container (skipping `valhalladata` and `gtfsdata` if desired because both can be re-derived from OSM and GTFS):

```bash
docker compose exec -T api tar -czf - data/trip_photos data/wallet_attachments > paladio_media_$(date +%Y%m%d).tar.gz
```

3. Restore a database dump into a fresh `db` container:

```bash
docker compose exec -T db pg_restore -U postgres -d paladio --clean --if-exists < paladio_20261122.dump
```

4. Use **Settings -> Data Vault & Backups -> Storage & Snapshots** to trigger manual vault snapshots (`POST /api/system/vault/snapshot`), configure retention (`7`, `14`, `30`, or `90` days), or export individual expeditions as **Full Vault** `.trip` files for portable per-trip backups.

## Checking and applying updates

Celery Beat checks GitHub releases every 6 hours (`periodic_autoupdate_check_task`) and reports release notes in **Settings** (`/config` under **System Updates**).

- **In-app release check**: Open **Settings -> System Updates** to toggle auto-update checks, inspect changelog notes, or download updates (`POST /api/system/update/check` and `/api/system/update/download`).
- **Docker Compose upgrade**: Pull the latest git commits, back up your database first, rebuild changed images, and apply Alembic migrations:

```bash
git pull origin main
docker compose up -d --build
docker compose exec api alembic upgrade head
```

## Troubleshooting common self-hosted issues

Check container status and recent logs first whenever a route generation, transit build, or login check stalls:

```bash
docker compose ps
docker compose logs -f --tail=100 api worker beat valhalla
```

| Symptom | Root cause | Resolution |
| :--- | :--- | :--- |
| **Login screen hangs on "Reconnecting…"** | `api` is starting, migrating, or failing DB connection | Inspect `docker compose logs api` and verify `db` health with `docker compose exec db pg_isready -U postgres` |
| **GTFS compile stays stuck in `BUILDING`** | Previous worker died while holding `paladio:transit_compiler_lock` | Restart `worker` (`docker compose restart worker`) so `on_worker_ready` clears stale locks and dispatches `reconcile_interrupted_transit_builds` |
| **Missing or broken POI photos / descriptions** | Corrupted Wikimedia cache entry in Redis or Postgres | Run `docker compose exec api python scripts/cleanup_corrupted_poi_data.py` or trigger **Purge System Cache** (`POST /api/system/cache/purge`) in `/config` |
| **Boarding pass PDF scan returns empty fields** | Host running outside Docker without OCR binaries | Install `tesseract-ocr`, `tesseract-ocr-eng`, `tesseract-ocr-spa`, and `poppler-utils` on the host |
| **Valhalla container exits with OOM (`137`)** | Large regional OSM extract exceeds `mem_limit: 3072m` | Increase `valhalla` `mem_limit` in `docker-compose.yml` or delete unused city extracts under **Settings -> City Data** |
| **Interactive Agent returns `Model too large` or OOM on Ollama** | `HardwareService` detected insufficient free RAM/VRAM | Switch to a smaller quantized model (for example `qwen2.5:3b`) or click **Unload Model** in **Settings -> AI & LLM Engine** |
| **WebSocket disconnects immediately behind proxy** | Reverse proxy drops `Upgrade: websocket` or times out idle frames | Add WebSocket `Upgrade`/`Connection` headers and increase `proxy_read_timeout` as shown in [Reverse proxy and security](reverse-proxy-and-security.md) |
