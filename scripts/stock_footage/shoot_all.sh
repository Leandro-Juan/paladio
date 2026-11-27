#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

STOCK_OUT_DIR="${STOCK_OUT_DIR:-${REPO_ROOT}/.local/stock-footage}"
CHAPTERS_FILTER=""
ENV_USER_SET=0
[[ -n "${PALADIO_RECORD_USER:-}" ]] && ENV_USER_SET=1
RECORD_USER="${PALADIO_RECORD_USER:-admin}"
RECORD_PASSWORD="${PALADIO_RECORD_PASSWORD:-PaladioRecord2026!}"
PASSWORD_EXPLICIT=0
USER_EXPLICIT=0
NO_DB_RESET=0
KEEP_RAW=0
KEEP_WORK=0
FFMPEG_PRESET="${FFMPEG_PRESET:-fast}"
FFMPEG_CRF="${FFMPEG_CRF:-18}"
SKIP_ASSEMBLE=0

BASE_URL="${PALADIO_BASE_URL:-http://localhost:3000}"
API_URL="${PALADIO_API_URL:-http://localhost:8000}"
DB_CONTAINER="${PALADIO_DB_CONTAINER:-paladio-db-1}"
API_CONTAINER="${PALADIO_API_CONTAINER:-paladio-api-1}"
PGUSER="${PALADIO_PGUSER:-postgres}"
PGDB="${PALADIO_PGDB:-paladio}"

usage() {
	cat <<'EOF'
Usage: shoot_all.sh [OPTIONS]

Records the full 13-chapter 1080p stock-footage walkthrough of Paladio,
encodes each chapter with libx264, restores database & sample photo state cleanly,
and concatenates the complete master reel with FOOTAGE_INDEX.md.

Options:
  --chapters <list>   Comma-separated chapter numbers (e.g. 01,02,07) or full slugs.
                      Default: all 13 chapters.
  --out <dir>         Output directory (default: <repo_root>/.local/stock-footage).
  --user <username>   Login identifier/username for recording (default: admin).
  --password <pass>   Login password (default: PALADIO_RECORD_PASSWORD or temp override).
  --no-db-reset       Do not snapshot/restore Postgres or Tokyo photos, and do not
                      apply a temporary login password override.
  --keep-raw          Keep raw Playwright .webm recordings inside <out>/.work/raw.
  --keep-work         Keep <out>/.work artifacts (QA contact sheets, logs, concat list).
  --preset <name>     ffmpeg x264 preset (default: fast).
  --crf <value>       ffmpeg x264 CRF quality (default: 18).
  --skip-assemble     Record & transcode chapters only; skip master concatenation.
  -h, --help          Show this help message and exit.

Chapters:
  01  01_auth_and_dashboard
  02  02_trip_itinerary_days_map_edit
  03  03_trip_search_sliders_waypoints_custom_poi
  04  04_trip_transit_weather_collections
  05  05_trip_wallet_costs_photos
  06  06_trip_config_agent_multicity
  07  07_engine_trip_creation
  08  08_monitoring_deals_telemetry_calendar
  09  09_vault_world_map_stats_recaps
  10  10_taste_calibration_and_pois
  11  11_config_all_10_sections
  12  12_themes_dock_and_i18n_rtl
  13  13_help_center_all_categories
EOF
}

while [[ $# -gt 0 ]]; do
	case "$1" in
	--chapters)
		CHAPTERS_FILTER="${2:?--chapters requires a value}"
		shift 2
		;;
	--out)
		STOCK_OUT_DIR="${2:?--out requires a directory}"
		shift 2
		;;
	--user)
		RECORD_USER="${2:?--user requires a value}"
		USER_EXPLICIT=1
		shift 2
		;;
	--password)
		RECORD_PASSWORD="${2:?--password requires a value}"
		PASSWORD_EXPLICIT=1
		shift 2
		;;
	--no-db-reset)
		NO_DB_RESET=1
		shift
		;;
	--keep-raw)
		KEEP_RAW=1
		shift
		;;
	--keep-work)
		KEEP_WORK=1
		shift
		;;
	--preset)
		FFMPEG_PRESET="${2:?--preset requires a value}"
		shift 2
		;;
	--crf)
		FFMPEG_CRF="${2:?--crf requires a value}"
		shift 2
		;;
	--skip-assemble)
		SKIP_ASSEMBLE=1
		shift
		;;
	-h | --help)
		usage
		exit 0
		;;
	*)
		echo "[shoot_all] Unknown option: $1" >&2
		usage >&2
		exit 1
		;;
	esac
done

STOCK_OUT_DIR="$(python3 -c 'import os,sys; print(os.path.abspath(sys.argv[1]))' "${STOCK_OUT_DIR}")"
STOCK_WORK_DIR="${STOCK_WORK_DIR:-${STOCK_OUT_DIR}/.work}"
AUTH_STATE_PATH="${STOCK_WORK_DIR}/auth_state.json"

export PALADIO_REPO_ROOT="${REPO_ROOT}"
export STOCK_OUT_DIR
export STOCK_WORK_DIR
export PALADIO_AUTH_STATE="${AUTH_STATE_PATH}"
export PALADIO_BASE_URL="${BASE_URL}"
export PALADIO_API_URL="${API_URL}"
export PALADIO_RECORD_USER="${RECORD_USER}"
export PALADIO_RECORD_PASSWORD="${RECORD_PASSWORD}"
export FFMPEG_PRESET
export FFMPEG_CRF
export KEEP_RAW
export PALADIO_DB_CONTAINER="${DB_CONTAINER}"
export PALADIO_API_CONTAINER="${API_CONTAINER}"
export PALADIO_PGUSER="${PGUSER}"
export PALADIO_PGDB="${PGDB}"

# Ordered phase execution:
# Phase A: monitoring, vault, help (non-conflicting)
# Phase B: demo-trip-tokyo-active deep walkthrough (ch02..ch06)
# Checkpoint DB & photo restore (so Phase C sees pristine seeded workspace)
# Phase C: login/dashboard, engine creation, taste calibration, settings, themes/i18n
PHASE_A=(
	"08_monitoring_deals_telemetry_calendar:rec_ch08_monitoring.mjs"
	"09_vault_world_map_stats_recaps:rec_ch09_vault.mjs"
	"13_help_center_all_categories:rec_ch13_help.mjs"
)
PHASE_B=(
	"02_trip_itinerary_days_map_edit:rec_ch02_trip_itinerary.mjs"
	"03_trip_search_sliders_waypoints_custom_poi:rec_ch03_trip_search.mjs"
	"04_trip_transit_weather_collections:rec_ch04_trip_transit_weather_collections.mjs"
	"05_trip_wallet_costs_photos:rec_ch05_trip_wallet_costs_photos.mjs"
	"06_trip_config_agent_multicity:rec_ch06_trip_config_agent_multicity.mjs"
)
PHASE_C=(
	"01_auth_and_dashboard:rec_ch01_auth_dashboard.mjs"
	"07_engine_trip_creation:rec_ch07_engine.mjs"
	"10_taste_calibration_and_pois:rec_ch10_taste_and_pois.mjs"
	"11_config_all_10_sections:rec_ch11_config.mjs"
	"12_themes_dock_and_i18n_rtl:rec_ch12_themes_dock_i18n.mjs"
)

chapter_selected() {
	local slug="$1"
	local num="${slug%%_*}"
	if [[ -z "${CHAPTERS_FILTER}" ]]; then
		return 0
	fi
	local IFS=','
	for tok in ${CHAPTERS_FILTER}; do
		tok="${tok//[[:space:]]/}"
		[[ -z "${tok}" ]] && continue
		if [[ "${tok}" == "${slug}" || "${tok}" == "${num}" || "${tok}" == "${num#0}" ]]; then
			return 0
		fi
	done
	return 1
}

count_phase_selected() {
	local count=0
	for entry in "$@"; do
		local slug="${entry%%:*}"
		if chapter_selected "${slug}"; then
			count=$((count + 1))
		fi
	done
	echo "${count}"
}

SEL_A=$(count_phase_selected "${PHASE_A[@]}")
SEL_B=$(count_phase_selected "${PHASE_B[@]}")
SEL_C=$(count_phase_selected "${PHASE_C[@]}")
TOTAL_SELECTED=$((SEL_A + SEL_B + SEL_C))

if [[ "${TOTAL_SELECTED}" -eq 0 ]]; then
	echo "[shoot_all] ERROR: --chapters '${CHAPTERS_FILTER}' matched no chapters." >&2
	exit 1
fi

echo "[shoot_all] Checking preflight dependencies..."
for bin in node ffmpeg ffprobe python3 curl; do
	if ! command -v "${bin}" >/dev/null 2>&1; then
		echo "[shoot_all] ERROR: required binary '${bin}' not found in PATH." >&2
		exit 1
	fi
done

node -e "import { createRequire } from 'node:module'; createRequire('${REPO_ROOT}/frontend/package.json')('playwright');" 2>/dev/null || {
	echo "[shoot_all] ERROR: playwright package could not be resolved from ${REPO_ROOT}/frontend/package.json." >&2
	exit 1
}

for asset in \
	"${REPO_ROOT}/backend/data/trip_photos/demo-trip-tokyo-active/tokyo-photo-1.jpg" \
	"${REPO_ROOT}/backend/tests/fixtures/travel_documents/boarding_passes/boarding_pass_lufthansa.pkpass" \
	"${REPO_ROOT}/backend/tests/fixtures/travel_documents/boarding_passes/boarding_pass_iberia_mad_svq.pdf"; do
	if [[ ! -f "${asset}" ]]; then
		echo "[shoot_all] ERROR: required fixture file missing: ${asset}" >&2
		exit 1
	fi
done

if ! curl -sfL -o /dev/null "${BASE_URL}"; then
	echo "[shoot_all] ERROR: Frontend is not reachable at ${BASE_URL}." >&2
	exit 1
fi
if ! curl -sf "${API_URL}/health" | grep -q '"ok"'; then
	echo "[shoot_all] ERROR: Backend API health check failed at ${API_URL}/health." >&2
	exit 1
fi

mkdir -p "${STOCK_OUT_DIR}/chapters" "${STOCK_WORK_DIR}/raw" "${STOCK_WORK_DIR}/qa"

TOKYO_PHOTOS_DIR="${REPO_ROOT}/backend/data/trip_photos/demo-trip-tokyo-active"
PHOTOS_BACKUP_DIR="${STOCK_WORK_DIR}/tokyo_photos_backup"
DB_BACKUP_DUMP="${STOCK_WORK_DIR}/paladio_pre_shoot.dump"
TEMP_PWD_APPLIED=0
DB_MUTATED=0
PHOTOS_MUTATED=0
CLEANUP_DONE=0

test_api_login() {
	local code
	code=$(
		python3 - "${API_URL}" "${RECORD_USER}" "${RECORD_PASSWORD}" <<'PY'
import json
import sys
import urllib.error
import urllib.request

api_url, ident, pwd = sys.argv[1], sys.argv[2], sys.argv[3]
req = urllib.request.Request(
    f"{api_url}/api/auth/login",
    data=json.dumps({"username_or_email": ident, "password": pwd}).encode("utf-8"),
    headers={"Content-Type": "application/json"},
    method="POST",
)
try:
    with urllib.request.urlopen(req, timeout=10) as resp:
        print(resp.status)
except urllib.error.HTTPError as e:
    print(e.code)
except Exception:
    print(0)
PY
	)
	[[ "${code}" == "200" ]]
}

list_available_users() {
	local users
	users=$(docker exec "${DB_CONTAINER}" psql -U "${PGUSER}" -d "${PGDB}" -Atqc \
		"SELECT username || COALESCE(' (' || email || ')', '') FROM users WHERE username IS NOT NULL ORDER BY username;" 2>/dev/null || true)
	if [[ -n "${users}" ]]; then
		echo "[shoot_all] Available users in DB:"
		echo "${users}" | sed 's/^/  - /'
	fi
}

user_exists_in_db() {
	local found
	found=$(
		docker exec -i "${DB_CONTAINER}" psql -U "${PGUSER}" -d "${PGDB}" -v uname="${RECORD_USER}" -Atq <<'SQL'
SELECT 1 FROM users WHERE username = :'uname' OR email = :'uname' LIMIT 1;
SQL
	)
	[[ "${found}" == "1" ]]
}

apply_temp_recording_password() {
	local hashed updated_user
	hashed=$(
		python3 - "${RECORD_PASSWORD}" <<'PY'
import hashlib, secrets, sys
pwd = sys.argv[1].encode("utf-8")
salt = secrets.token_bytes(32)
dk = hashlib.pbkdf2_hmac("sha256", pwd, salt, 100000)
print(f"{salt.hex()}${dk.hex()}")
PY
	)
	updated_user=$(
		docker exec -i "${DB_CONTAINER}" psql -U "${PGUSER}" -d "${PGDB}" -v ON_ERROR_STOP=1 \
			-v uname="${RECORD_USER}" -v hpass="${hashed}" -Atq <<'SQL'
UPDATE users
SET hashed_password = :'hpass'
WHERE username = :'uname' OR email = :'uname'
RETURNING username;
SQL
	)
	if [[ -z "${updated_user}" ]]; then
		echo "[shoot_all] ERROR: No user matching '${RECORD_USER}' exists in Postgres 'users' table." >&2
		list_available_users >&2
		return 1
	fi
}

restore_photos_backup() {
	if [[ ! -d "${PHOTOS_BACKUP_DIR}" ]] || [[ -z "$(ls -A "${PHOTOS_BACKUP_DIR}" 2>/dev/null)" ]]; then
		return 0
	fi
	tar -C "${PHOTOS_BACKUP_DIR}" -cf - . | docker exec -i "${API_CONTAINER}" sh -lc \
		'mkdir -p /data/trip_photos/demo-trip-tokyo-active && find /data/trip_photos/demo-trip-tokyo-active -mindepth 1 -maxdepth 1 -exec rm -rf {} + && tar -C /data/trip_photos/demo-trip-tokyo-active -xf - && chmod -R a+rwX /data/trip_photos/demo-trip-tokyo-active'
}

cleanup() {
	local exit_code=$?
	if [[ "${CLEANUP_DONE}" -eq 1 ]]; then
		return
	fi
	CLEANUP_DONE=1
	trap '' EXIT INT TERM

	local restore_ok=1
	if [[ "${NO_DB_RESET}" -eq 0 ]]; then
		if [[ "${DB_MUTATED}" -eq 1 && -f "${DB_BACKUP_DUMP}" ]]; then
			echo "[shoot_all] Restoring original Postgres backup (please wait; do not interrupt)..."
			if "${SCRIPT_DIR}/lib/restore_db.sh" "${DB_BACKUP_DUMP}"; then
				rm -f "${DB_BACKUP_DUMP}"
			else
				restore_ok=0
				echo "[shoot_all] ERROR: DB restore failed — backup preserved at ${DB_BACKUP_DUMP}" >&2
			fi
		else
			rm -f "${DB_BACKUP_DUMP}" "${DB_BACKUP_DUMP}.tmp"
		fi

		if [[ "${PHOTOS_MUTATED}" -eq 1 ]]; then
			echo "[shoot_all] Restoring original sample photos..."
			if ! restore_photos_backup; then
				restore_ok=0
				echo "[shoot_all] ERROR: Photo restore failed — backup preserved at ${PHOTOS_BACKUP_DIR}" >&2
			fi
		fi

		if [[ "${restore_ok}" -eq 1 ]]; then
			rm -rf "${PHOTOS_BACKUP_DIR}"
		fi
	fi

	if [[ "${KEEP_WORK}" -eq 0 && "${KEEP_RAW}" -eq 0 && "${restore_ok}" -eq 1 ]]; then
		rm -rf "${STOCK_WORK_DIR}"
	fi
	exit "${exit_code}"
}

if [[ "${NO_DB_RESET}" -eq 0 ]]; then
	command -v docker >/dev/null 2>&1 || {
		echo "[shoot_all] ERROR: docker CLI not found (pass --no-db-reset to run without DB backup/restore)." >&2
		exit 1
	}
	docker exec "${DB_CONTAINER}" pg_isready -U "${PGUSER}" >/dev/null 2>&1 || {
		echo "[shoot_all] ERROR: Postgres container '${DB_CONTAINER}' is not ready." >&2
		exit 1
	}

	if [[ "${USER_EXPLICIT}" -eq 0 && "${ENV_USER_SET}" -eq 0 ]] && ! user_exists_in_db; then
		detected_admin=$(
			docker exec "${DB_CONTAINER}" psql -U "${PGUSER}" -d "${PGDB}" -Atqc \
				"SELECT username FROM users WHERE role = 'admin' AND username IS NOT NULL ORDER BY created_at ASC NULLS LAST LIMIT 1;" 2>/dev/null || true
		)
		if [[ -n "${detected_admin}" ]]; then
			RECORD_USER="${detected_admin}"
			export PALADIO_RECORD_USER="${RECORD_USER}"
			echo "[shoot_all] Auto-selected admin user '${RECORD_USER}'."
		fi
	fi

	if [[ "${PASSWORD_EXPLICIT}" -eq 1 ]]; then
		if ! test_api_login; then
			echo "[shoot_all] ERROR: Login failed for user '${RECORD_USER}' with provided --password." >&2
			list_available_users >&2
			exit 1
		fi
	else
		if ! test_api_login && ! user_exists_in_db; then
			echo "[shoot_all] ERROR: User '${RECORD_USER}' not found in Postgres 'users' table." >&2
			list_available_users >&2
			exit 1
		fi
	fi

	echo "[shoot_all] Creating pre-shoot Postgres dump -> ${DB_BACKUP_DUMP}"
	docker exec "${DB_CONTAINER}" pg_dump -Fc -U "${PGUSER}" "${PGDB}" >"${DB_BACKUP_DUMP}.tmp"
	if [[ ! -s "${DB_BACKUP_DUMP}.tmp" ]] || ! docker exec -i "${DB_CONTAINER}" pg_restore -l < "${DB_BACKUP_DUMP}.tmp" >/dev/null 2>&1; then
		rm -f "${DB_BACKUP_DUMP}.tmp"
		echo "[shoot_all] ERROR: Failed to create a valid pre-shoot DB dump." >&2
		exit 1
	fi
	mv "${DB_BACKUP_DUMP}.tmp" "${DB_BACKUP_DUMP}"

	rm -rf "${PHOTOS_BACKUP_DIR}"
	mkdir -p "${PHOTOS_BACKUP_DIR}"
	if docker exec "${API_CONTAINER}" sh -lc 'test -d /data/trip_photos/demo-trip-tokyo-active'; then
		docker exec "${API_CONTAINER}" tar -C /data/trip_photos/demo-trip-tokyo-active -cf - . | tar -C "${PHOTOS_BACKUP_DIR}" -xf -
	elif [[ -d "${TOKYO_PHOTOS_DIR}" ]]; then
		cp -r "${TOKYO_PHOTOS_DIR}/." "${PHOTOS_BACKUP_DIR}/"
	fi

	trap cleanup EXIT INT TERM

	if ! test_api_login; then
		echo "[shoot_all] Temporarily setting recording password for '${RECORD_USER}' (will be restored from dump on exit)..."
		DB_MUTATED=1
		apply_temp_recording_password
		TEMP_PWD_APPLIED=1
		if ! test_api_login; then
			echo "[shoot_all] ERROR: Login still failed after updating temporary password for '${RECORD_USER}'." >&2
			exit 1
		fi
	fi
else
	trap cleanup EXIT INT TERM
	if ! test_api_login; then
		echo "[shoot_all] ERROR: Login failed for '${RECORD_USER}' in --no-db-reset mode (pass valid --user / --password)." >&2
		exit 1
	fi
fi

run_chapter() {
	local slug="$1"
	local script="$2"
	echo "============================================================"
	echo "[shoot_all] Recording ${slug} (${script})"
	echo "============================================================"
	DB_MUTATED=1
	PHOTOS_MUTATED=1
	node "${SCRIPT_DIR}/chapters/${script}"
	"${SCRIPT_DIR}/lib/process_chapter.sh" "${slug}"
}

need_auth_bootstrap=0
for entry in "${PHASE_A[@]}" "${PHASE_B[@]}" "${PHASE_C[@]}"; do
	slug="${entry%%:*}"
	if [[ "${slug}" != "01_auth_and_dashboard" ]] && chapter_selected "${slug}"; then
		need_auth_bootstrap=1
		break
	fi
done

if [[ "${need_auth_bootstrap}" -eq 1 ]]; then
	node "${SCRIPT_DIR}/lib/auth_bootstrap.mjs"
fi

# Phase A
for entry in "${PHASE_A[@]}"; do
	slug="${entry%%:*}"
	script="${entry#*:}"
	if chapter_selected "${slug}"; then
		run_chapter "${slug}" "${script}"
	fi
done

# Phase B
RAN_PHASE_B=0
for entry in "${PHASE_B[@]}"; do
	slug="${entry%%:*}"
	script="${entry#*:}"
	if chapter_selected "${slug}"; then
		run_chapter "${slug}" "${script}"
		RAN_PHASE_B=1
	fi
done

# Checkpoint restore between Phase B and Phase C
if [[ "${NO_DB_RESET}" -eq 0 && "${RAN_PHASE_B}" -eq 1 && "${SEL_C}" -gt 0 ]]; then
	echo "[shoot_all] Checkpoint restore before Phase C chapters..."
	"${SCRIPT_DIR}/lib/restore_db.sh" "${DB_BACKUP_DUMP}"
	restore_photos_backup
	if [[ "${TEMP_PWD_APPLIED}" -eq 1 ]]; then
		apply_temp_recording_password
	fi
	if [[ "${need_auth_bootstrap}" -eq 1 ]]; then
		node "${SCRIPT_DIR}/lib/auth_bootstrap.mjs"
	fi
fi

# Phase C
for entry in "${PHASE_C[@]}"; do
	slug="${entry%%:*}"
	script="${entry#*:}"
	if chapter_selected "${slug}"; then
		run_chapter "${slug}" "${script}"
	fi
done

if [[ "${SKIP_ASSEMBLE}" -eq 0 ]]; then
	ASSEMBLE_ARGS=(--out-dir "${STOCK_OUT_DIR}" --work-dir "${STOCK_WORK_DIR}")
	if [[ -n "${CHAPTERS_FILTER}" ]]; then
		ASSEMBLE_ARGS+=(--chapters "${CHAPTERS_FILTER}")
	fi
	python3 "${SCRIPT_DIR}/lib/assemble_master.py" "${ASSEMBLE_ARGS[@]}"
fi

echo "[shoot_all] Complete! Output directory: ${STOCK_OUT_DIR}"
