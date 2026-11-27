#!/usr/bin/env bash
set -euo pipefail

SLUG="${1:?Usage: process_chapter.sh <chapter_slug>}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SUITE_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
REPO_ROOT="${PALADIO_REPO_ROOT:-$(cd "${SUITE_DIR}/../.." && pwd)}"
STOCK_OUT_DIR="${STOCK_OUT_DIR:-${REPO_ROOT}/.local/stock-footage}"
STOCK_WORK_DIR="${STOCK_WORK_DIR:-${STOCK_OUT_DIR}/.work}"

FFMPEG_PRESET="${FFMPEG_PRESET:-fast}"
FFMPEG_CRF="${FFMPEG_CRF:-18}"
KEEP_RAW="${KEEP_RAW:-0}"

META_JSON="${STOCK_WORK_DIR}/qa/${SLUG}.json"
OUT_MP4="${STOCK_OUT_DIR}/chapters/${SLUG}.mp4"
SHEET_JPG="${STOCK_WORK_DIR}/qa/${SLUG}_sheet.jpg"

mkdir -p "${STOCK_OUT_DIR}/chapters" "${STOCK_WORK_DIR}/qa"

if [[ ! -f "${META_JSON}" ]]; then
  echo "[process_chapter] ERROR: missing metadata JSON: ${META_JSON}" >&2
  exit 1
fi

read -r RAW_WEBM TRIM_SEC < <(
  python3 -c "import json, sys; d = json.load(open(sys.argv[1])); print(d['videoPath'], d['trimSec'])" "${META_JSON}"
)

if [[ -z "${RAW_WEBM}" || ! -f "${RAW_WEBM}" ]]; then
  echo "[process_chapter] ERROR: missing raw video: ${RAW_WEBM}" >&2
  exit 1
fi

# Auto-probe 0.5s increments from TRIM_SEC until pixel (1900, 1060) is non-grey
# (filters out early pre-resize / Playwright grey canvas intro frames).
START_SEC=$(python3 - "${RAW_WEBM}" "${TRIM_SEC}" <<'PY'
import json
import subprocess
import sys

raw_path = sys.argv[1]
trim_sec = float(sys.argv[2])

probe = subprocess.run(
    ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "json", raw_path],
    capture_output=True,
    text=True,
    check=True,
)
duration = float(json.loads(probe.stdout)["format"]["duration"])
max_probe = min(trim_sec + 6.0, max(trim_sec, duration - 0.5))

chosen = trim_sec
t = trim_sec
while t <= max_probe + 1e-6:
    res = subprocess.run(
        [
            "ffmpeg",
            "-v", "error",
            "-ss", f"{t:.2f}",
            "-i", raw_path,
            "-vframes", "1",
            "-vf", "crop=1:1:1900:1060",
            "-f", "rawvideo",
            "-pix_fmt", "rgb24",
            "-",
        ],
        capture_output=True,
    )
    rgb = res.stdout
    is_grey = False
    if res.returncode != 0 or len(rgb) < 3:
        is_grey = True
    else:
        r, g, b = rgb[0], rgb[1], rgb[2]
        if 120 <= r <= 136 and 120 <= g <= 136 and 120 <= b <= 136:
            is_grey = True

    if not is_grey:
        chosen = t
        break
    t = round(t + 0.5, 2)

print(f"{chosen:.2f}")
PY
)

if [[ "${START_SEC}" != "${TRIM_SEC}" ]]; then
  echo "[process_chapter] ${SLUG}: adjusted trimSec ${TRIM_SEC}s -> ${START_SEC}s (skipped grey intro frame)"
fi

ffmpeg -y -v warning -ss "${START_SEC}" -i "${RAW_WEBM}" \
  -vf "scale=1920:1080:flags=lanczos,fps=30,format=yuv420p" \
  -c:v libx264 -preset "${FFMPEG_PRESET}" -crf "${FFMPEG_CRF}" -movflags +faststart \
  -an "${OUT_MP4}"

DUR=$(ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${OUT_MP4}")
INTERVAL=$(python3 -c "d=float('${DUR}'); print(max(d/12.0, 0.5))")

ffmpeg -y -v error -i "${OUT_MP4}" \
  -vf "select='isnan(prev_selected_t)+gte(t-prev_selected_t,${INTERVAL})',scale=480:270,tile=4x3" \
  -frames:v 1 -q:v 3 "${SHEET_JPG}" || true

SIZE=$(du -h "${OUT_MP4}" | awk '{print $1}')
echo "ENCODED ${SLUG} -> ${OUT_MP4} (trim=${START_SEC}s, duration=${DUR}s, size=${SIZE})"

if [[ "${KEEP_RAW}" != "1" ]]; then
  rm -f "${RAW_WEBM}"
fi
