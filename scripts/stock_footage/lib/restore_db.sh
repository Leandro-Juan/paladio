#!/usr/bin/env bash
set -euo pipefail

DUMP_FILE="${1:?Usage: restore_db.sh <dump_file>}"
if [[ ! -f "${DUMP_FILE}" ]]; then
  echo "[restore_db] ERROR: dump file not found: ${DUMP_FILE}" >&2
  exit 1
fi

DB_CONTAINER="${PALADIO_DB_CONTAINER:-paladio-db-1}"
API_CONTAINER="${PALADIO_API_CONTAINER:-paladio-api-1}"
WORKER_CONTAINER="${PALADIO_WORKER_CONTAINER:-paladio-worker-1}"
BEAT_CONTAINER="${PALADIO_BEAT_CONTAINER:-paladio-beat-1}"
PGUSER="${PALADIO_PGUSER:-postgres}"
PGDB="${PALADIO_PGDB:-paladio}"
API_URL="${PALADIO_API_URL:-http://localhost:8000}"

if ! [[ "${PGDB}" =~ ^[a-zA-Z0-9_]+$ ]]; then
  echo "[restore_db] ERROR: invalid database identifier '${PGDB}'" >&2
  exit 1
fi

TSDB_VERSION=$(
  docker exec "${DB_CONTAINER}" psql -U "${PGUSER}" -d postgres -Atqc \
    "SELECT COALESCE(installed_version, default_version) FROM pg_available_extensions WHERE name = 'timescaledb';" 2>/dev/null | head -n1 || true
)
TSDB_VERSION="${TSDB_VERSION:-2.29.1}"

if ! docker exec -i "${DB_CONTAINER}" pg_restore -l < "${DUMP_FILE}" >/dev/null 2>&1; then
  echo "[restore_db] ERROR: dump '${DUMP_FILE}' failed pg_restore -l validation — aborting before DROP DATABASE." >&2
  exit 1
fi

RESTORE_ERR="$(mktemp)"
cleanup_restore() {
  rm -f "${RESTORE_ERR}"
}
trap cleanup_restore EXIT

echo "[restore_db] Restoring '${DUMP_FILE}' into ${DB_CONTAINER}/${PGDB} (timescaledb ${TSDB_VERSION})..."
docker stop "${API_CONTAINER}" "${WORKER_CONTAINER}" "${BEAT_CONTAINER}" >/dev/null 2>&1 || true

docker exec "${DB_CONTAINER}" psql -U "${PGUSER}" -d postgres -v ON_ERROR_STOP=1 \
  -c "DROP DATABASE IF EXISTS \"${PGDB}\" WITH (FORCE);" \
  -c "CREATE DATABASE \"${PGDB}\";"

docker exec "${DB_CONTAINER}" psql -U "${PGUSER}" -d "${PGDB}" -v ON_ERROR_STOP=1 \
  -c "CREATE EXTENSION IF NOT EXISTS timescaledb VERSION '${TSDB_VERSION}';" \
  -c "CREATE EXTENSION IF NOT EXISTS vector;" \
  -c "CREATE EXTENSION IF NOT EXISTS pg_trgm;" \
  -c "CREATE EXTENSION IF NOT EXISTS unaccent;" \
  -c "SELECT timescaledb_pre_restore();"

RESTORE_RC=0
docker exec -i "${DB_CONTAINER}" pg_restore --no-owner --no-privileges -U "${PGUSER}" -d "${PGDB}" < "${DUMP_FILE}" 2>"${RESTORE_ERR}" || RESTORE_RC=$?

if ! python3 - "${RESTORE_ERR}" "${RESTORE_RC}" <<'PY'
import sys

err_path = sys.argv[1]
rc = int(sys.argv[2])
text = open(err_path, encoding="utf-8", errors="replace").read()
if rc == 0 and "pg_restore: error:" not in text:
    sys.exit(0)

blocks = []
cur = None
for line in text.splitlines():
    if line.startswith("pg_restore: error:"):
        if cur is not None:
            blocks.append("\n".join(cur))
        cur = [line]
    elif line.startswith("pg_restore: "):
        if cur is not None:
            blocks.append("\n".join(cur))
            cur = None
    elif cur is not None:
        cur.append(line)
if cur is not None:
    blocks.append("\n".join(cur))

unexpected = []
for blk in blocks:
    is_hnsw_shm = (
        "could not resize shared memory segment" in blk
        and ("idx_attractions_embedding_hnsw" in blk or "ix_attractions_embedding_hnsw" in blk)
    )
    is_already_exists = "already exists" in blk
    if not (is_hnsw_shm or is_already_exists):
        unexpected.append(blk)

if unexpected or (rc != 0 and not blocks):
    sys.stderr.write(text)
    if not text.endswith("\n"):
        sys.stderr.write("\n")
    sys.exit(1)
PY
then
  echo "[restore_db] ERROR: pg_restore encountered fatal errors (exit=${RESTORE_RC}); restarting containers and aborting." >&2
  docker start "${API_CONTAINER}" "${WORKER_CONTAINER}" "${BEAT_CONTAINER}" >/dev/null 2>&1 || true
  exit 1
fi

docker exec "${DB_CONTAINER}" psql -U "${PGUSER}" -d "${PGDB}" -v ON_ERROR_STOP=1 \
  -c "SET maintenance_work_mem = '64MB'; SET max_parallel_maintenance_workers = 0; CREATE INDEX IF NOT EXISTS idx_attractions_embedding_hnsw ON public.attractions USING hnsw (embedding public.vector_cosine_ops) WITH (m='16', ef_construction='64'); CREATE INDEX IF NOT EXISTS ix_attractions_embedding_hnsw ON public.attractions USING hnsw (embedding public.vector_cosine_ops) WITH (m='16', ef_construction='128');" \
  -c "SELECT timescaledb_post_restore();"

docker start "${API_CONTAINER}" "${WORKER_CONTAINER}" "${BEAT_CONTAINER}" >/dev/null

HEALTHY=0
for i in $(seq 1 45); do
  if curl -sf "${API_URL}/health" | grep -q '"ok"'; then
    echo "[restore_db] API_HEALTHY_AFTER_${i}s"
    HEALTHY=1
    break
  fi
  sleep 1
done

if [[ "${HEALTHY}" != "1" ]]; then
  echo "[restore_db] ERROR: ${API_URL}/health did not report ok within 45s" >&2
  exit 1
fi

docker exec "${DB_CONTAINER}" psql -U "${PGUSER}" -d "${PGDB}" -c "
SELECT
  (SELECT count(*) FROM trips) AS trips,
  (SELECT count(*) FROM users) AS users,
  (SELECT count(*) FROM attractions) AS attractions,
  (SELECT count(*) FROM trip_expenses) AS expenses,
  (SELECT count(*) FROM trip_tickets) AS tickets,
  (SELECT count(*) FROM deal_watch_alerts) AS routes,
  (SELECT count(*) FROM market_price_ticks) AS ticks,
  (SELECT count(*) FROM transit_stations) AS stations;
"
