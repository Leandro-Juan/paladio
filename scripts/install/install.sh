#!/usr/bin/env bash
# ==============================================================================
# Paladio - Sovereign Travel Optimization Engine
# Single-Command Consumer Installer
# ==============================================================================
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/Leandro-Juan/paladio/main/scripts/install/install.sh | bash
# Or locally:
#   ./scripts/install/install.sh
# ==============================================================================

set -euo pipefail

# ANSI Color Palette (Pacific Jazz Aesthetic)
COLOR_RESET="\033[0m"
COLOR_BOLD="\033[1m"
COLOR_TEAL="\033[38;5;37m"
COLOR_CORAL="\033[38;5;203m"
COLOR_GOLD="\033[38;5;221m"
COLOR_MUTED="\033[38;5;244m"

info() {
	printf "${COLOR_TEAL}▶${COLOR_RESET} %s\n" "$1"
}

success() {
	printf "${COLOR_TEAL}✔${COLOR_RESET} ${COLOR_BOLD}%s${COLOR_RESET}\n" "$1"
}

warn() {
	printf "${COLOR_GOLD}▲${COLOR_RESET} %s\n" "$1"
}

error() {
	printf "${COLOR_CORAL}✖ %s${COLOR_RESET}\n" "$1" >&2
}

banner() {
	printf "${COLOR_TEAL}"
	cat <<"EOF"
  ___      _          _ _       
 | _ \__ _| |__ _  __| (_)___    Paladio Sovereign Travel Engine
 |  _/ _` | / _` |/ _` | / _ \   Single-Command Installer
 |_| \__,_|_\__,_|\__,_|_\___/   
EOF
	printf "${COLOR_RESET}\n"
}

check_http() {
	local url="$1"
	if command -v curl >/dev/null 2>&1; then
		curl -fsS --max-time 3 "$url" >/dev/null 2>&1
	elif command -v wget >/dev/null 2>&1; then
		wget -qO- --timeout=3 "$url" >/dev/null 2>&1
	else
		return 1
	fi
}

read_env_var() {
	local file="$1"
	local key="$2"
	local line
	line="$(grep -E "^${key}=" "$file" 2>/dev/null | tail -n 1 || true)"
	if [ -z "$line" ]; then
		return 0
	fi
	local val="${line#*=}"
	val="${val%\"}"
	val="${val#\"}"
	val="${val%\'}"
	val="${val#\'}"
	printf "%s" "$val"
}

set_env_var() {
	local file="$1"
	local key="$2"
	local value="$3"
	local tmp_file="${file}.tmp.$$"
	local found=0
	local line

	: >"$tmp_file"
	if [ -f "$file" ]; then
		while IFS= read -r line || [ -n "$line" ]; do
			case "$line" in
				"${key}="*)
					if [ "$found" -eq 0 ]; then
						printf "%s=%s\n" "$key" "$value" >>"$tmp_file"
						found=1
					fi
					;;
				*)
					printf "%s\n" "$line" >>"$tmp_file"
					;;
			esac
		done <"$file"
	fi

	if [ "$found" -eq 0 ]; then
		printf "%s=%s\n" "$key" "$value" >>"$tmp_file"
	fi

	chmod 600 "$tmp_file"
	mv "$tmp_file" "$file"
}

is_valid_port() {
	local port="$1"
	if [[ ! "$port" =~ ^[1-9][0-9]{0,4}$ ]]; then
		return 1
	fi
	[ "$port" -ge 1 ] && [ "$port" -le 65535 ]
}

is_compose_service_port() {
	local service="$1"
	local container_port="$2"
	local target_host_port="$3"
	local mapped line bound_port
	mapped="$(docker compose port "$service" "$container_port" 2>/dev/null || true)"
	if [ -z "$mapped" ]; then
		return 1
	fi
	while IFS= read -r line; do
		line="${line%$'\r'}"
		bound_port="${line##*:}"
		if is_valid_port "$bound_port" && [ "$bound_port" = "$target_host_port" ]; then
			return 0
		fi
	done <<<"$mapped"
	return 1
}

get_docker_published_ports() {
	docker ps --format '{{.Ports}}' 2>/dev/null || true
}

is_port_in_use_shell() {
	local port="$1"
	local docker_ports="${2:-}"

	if [ -n "$docker_ports" ] && printf "%s\n" "$docker_ports" | grep -qE "(^|,|[[:space:]])[^,[:space:]]*:${port}(-[0-9]+)?->"; then
		return 0
	fi

	if command -v ss >/dev/null 2>&1; then
		if ss -H -ltn "sport = :${port}" 2>/dev/null | grep -q .; then
			return 0
		fi
	fi

	if command -v lsof >/dev/null 2>&1; then
		if lsof -nP -iTCP:"${port}" -sTCP:LISTEN >/dev/null 2>&1; then
			return 0
		fi
	fi

	if command -v netstat >/dev/null 2>&1; then
		if netstat -an 2>/dev/null | grep -E "LISTEN" | grep -qE "[:.]${port}[[:space:]]"; then
			return 0
		fi
	fi

	if command -v nc >/dev/null 2>&1; then
		if nc -z 127.0.0.1 "$port" >/dev/null 2>&1; then
			return 0
		fi
	fi

	return 1
}

find_available_port_python() {
	local desired_port="$1"
	local reserved_port="${2:-0}"
	local docker_ports="${3:-}"
	python3 - "$desired_port" "$reserved_port" "$docker_ports" <<'PY'
import errno
import re
import socket
import sys

desired = int(sys.argv[1])
reserved = int(sys.argv[2]) if sys.argv[2] else 0
docker_ports_raw = sys.argv[3] if len(sys.argv) > 3 else ""

docker_busy = set()
for start_s, end_s in re.findall(r":(\d+)(?:-(\d+))?->", docker_ports_raw):
    start_p = int(start_s)
    end_p = int(end_s) if end_s else start_p
    if end_p < start_p:
        continue
    for p in range(start_p, min(end_p, start_p + 1000) + 1):
        docker_busy.add(p)

def port_in_use(port: int) -> bool:
    if port == reserved or port in docker_busy:
        return True
    for family, host in ((socket.AF_INET, "127.0.0.1"), (socket.AF_INET6, "::1")):
        if family == socket.AF_INET6 and not socket.has_ipv6:
            continue
        try:
            with socket.socket(family, socket.SOCK_STREAM) as s:
                s.settimeout(0.2)
                if s.connect_ex((host, port)) == 0:
                    return True
        except OSError:
            pass
    checks = [(socket.AF_INET, "0.0.0.0"), (socket.AF_INET, "127.0.0.1")]
    if socket.has_ipv6:
        checks.extend([(socket.AF_INET6, "::"), (socket.AF_INET6, "::1")])
    for family, addr in checks:
        try:
            with socket.socket(family, socket.SOCK_STREAM) as s:
                if family == socket.AF_INET6:
                    s.setsockopt(socket.IPPROTO_IPV6, socket.IPV6_V6ONLY, 1)
                s.bind((addr, port))
        except OSError as exc:
            if exc.errno == errno.EADDRINUSE:
                return True
    return False

candidates = [desired]
start_next = desired + 1 if desired >= 1024 else 1024
for p in range(start_next, min(start_next + 1000, 65536)):
    if p != desired:
        candidates.append(p)
if start_next + 1000 > 65535:
    for p in range(1024, min(desired, 1024 + 1000)):
        if p != desired:
            candidates.append(p)

for candidate in candidates:
    if not port_in_use(candidate):
        print(candidate)
        sys.exit(0)

sys.exit(1)
PY
}

resolve_available_port() {
	local service="$1"
	local container_port="$2"
	local desired_port="$3"
	local reserved_port="${4:-0}"

	if [ "$desired_port" != "$reserved_port" ] && is_compose_service_port "$service" "$container_port" "$desired_port"; then
		printf "%s" "$desired_port"
		return 0
	fi

	local docker_ports
	docker_ports="$(get_docker_published_ports)"

	if command -v python3 >/dev/null 2>&1; then
		local found_port
		if found_port="$(find_available_port_python "$desired_port" "$reserved_port" "$docker_ports")" && is_valid_port "$found_port"; then
			printf "%s" "$found_port"
			return 0
		fi
		return 1
	fi

	local candidate="$desired_port"
	local attempts=0
	local max_attempts=500
	while [ "$attempts" -lt "$max_attempts" ]; do
		if [ "$candidate" != "$reserved_port" ] && ! is_port_in_use_shell "$candidate" "$docker_ports"; then
			printf "%s" "$candidate"
			return 0
		fi
		attempts=$((attempts + 1))
		if [ "$candidate" -lt 1024 ]; then
			candidate=1024
		elif [ "$candidate" -ge 65535 ]; then
			candidate=1024
		else
			candidate=$((candidate + 1))
		fi
	done

	return 1
}

generate_hex_secret() {
	local bytes="$1"
	if command -v openssl >/dev/null 2>&1; then
		openssl rand -hex "$bytes"
	elif command -v python3 >/dev/null 2>&1; then
		python3 -c "import os; print(os.urandom(${bytes}).hex())"
	else
		head -c "$bytes" /dev/urandom | od -An -tx1 | tr -d ' \n'
	fi
}

generate_fernet_key() {
	if command -v openssl >/dev/null 2>&1; then
		openssl rand 32 | openssl base64 -A | tr '+/' '-_'
	elif command -v python3 >/dev/null 2>&1; then
		python3 -c "import base64, os; print(base64.urlsafe_b64encode(os.urandom(32)).decode())"
	else
		head -c 32 /dev/urandom | base64 | tr -d '\r\n' | tr '+/' '-_'
	fi
}

banner

# --- Step 1: Preflight Dependency & Hardware Checks ---
info "Running preflight environment checks..."

if ! command -v docker >/dev/null 2>&1; then
	error "Docker is not installed. Please install Docker Engine first: https://docs.docker.com/engine/install/"
	exit 1
fi

if ! docker info >/dev/null 2>&1; then
	error "Docker daemon is not running or current user lacks permission. Try: sudo systemctl start docker"
	exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
	error "Docker Compose v2 is required but not found. Please install the docker-compose-plugin."
	exit 1
fi

RAM_MB=""
if [ -r /proc/meminfo ]; then
	MEM_KB="$(awk '/^MemTotal:/ {print $2}' /proc/meminfo 2>/dev/null || true)"
	if [ -n "$MEM_KB" ]; then
		RAM_MB=$((MEM_KB / 1024))
	fi
elif command -v sysctl >/dev/null 2>&1; then
	MEM_BYTES="$(sysctl -n hw.memsize 2>/dev/null || true)"
	if [ -n "$MEM_BYTES" ]; then
		RAM_MB=$((MEM_BYTES / 1024 / 1024))
	fi
fi

if [ -n "$RAM_MB" ] && [ "$RAM_MB" -lt 7500 ]; then
	warn "Detected ${RAM_MB} MB RAM. Paladio recommends at least 8 GB (8192 MB) RAM for Postgres, Valhalla routing, and ONNX embeddings."
fi

success "Docker Engine and Compose v2 verified."

# --- Step 2: Determine Installation Directory ---
INSTALL_DIR="${PALADIO_INSTALL_DIR:-}"

if [ -z "$INSTALL_DIR" ]; then
	SCRIPT_REPO_ROOT=""
	if [ -n "${BASH_SOURCE[0]:-}" ]; then
		SCRIPT_REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." 2>/dev/null && pwd || true)"
	fi
	if [ -f "docker-compose.yml" ]; then
		INSTALL_DIR="$(pwd)"
	elif [ -n "$SCRIPT_REPO_ROOT" ] && [ -f "$SCRIPT_REPO_ROOT/docker-compose.yml" ]; then
		INSTALL_DIR="$SCRIPT_REPO_ROOT"
	else
		INSTALL_DIR="$HOME/paladio"
	fi
fi

if [ ! -d "$INSTALL_DIR" ]; then
	info "Creating installation directory at $INSTALL_DIR..."
	mkdir -p "$INSTALL_DIR"
fi

cd "$INSTALL_DIR"
info "Working directory: $INSTALL_DIR"

# --- Step 3: Fetch docker-compose.yml if not present ---
if [ ! -f "docker-compose.yml" ]; then
	COMPOSE_URL="${PALADIO_COMPOSE_URL:-https://raw.githubusercontent.com/Leandro-Juan/paladio/main/docker-compose.yml}"
	info "Downloading docker-compose.yml from ${COMPOSE_URL}..."
	TMP_COMPOSE="docker-compose.yml.tmp"
	if command -v curl >/dev/null 2>&1; then
		curl -fsSL "$COMPOSE_URL" -o "$TMP_COMPOSE"
	elif command -v wget >/dev/null 2>&1; then
		wget -qO "$TMP_COMPOSE" "$COMPOSE_URL"
	else
		error "Neither curl nor wget is available to download docker-compose.yml."
		exit 1
	fi

	if ! grep -qE '^[[:space:]]*services:' "$TMP_COMPOSE"; then
		rm -f "$TMP_COMPOSE"
		error "Downloaded file is not a valid Docker Compose manifest."
		exit 1
	fi

	mv "$TMP_COMPOSE" docker-compose.yml
	success "Downloaded docker-compose.yml"
fi

# --- Step 4: Auto-Generate Secrets (.env) ---
if [ ! -f ".env" ]; then
	info "Generating cryptographically secure bootstrap secrets..."

	PG_PASS="$(generate_hex_secret 20)"
	JWT_KEY="$(generate_hex_secret 32)"
	WALLET_KEY="$(generate_fernet_key)"

	cat <<EOF >.env
# ==============================================================================
# Paladio - Self-Hosted Bootstrap Configuration (Auto-Generated)
# ==============================================================================
POSTGRES_USER=postgres
POSTGRES_PASSWORD=${PG_PASS}
POSTGRES_DB=paladio

JWT_SECRET_KEY=${JWT_KEY}
WALLET_ENCRYPTION_KEY=${WALLET_KEY}
ENVIRONMENT=production
ACCESS_TOKEN_EXPIRE_MINUTES=1440
API_WORKERS=1
EOF

	for opt_var in API_PORT FRONTEND_PORT PALADIO_VERSION PALADIO_API_IMAGE PALADIO_FRONTEND_IMAGE PALADIO_PUBLIC_API_URL VALHALLA_TILE_URLS ALLOWED_ORIGINS; do
		opt_val="${!opt_var:-}"
		if [ -n "$opt_val" ]; then
			printf "%s=%s\n" "$opt_var" "$opt_val" >>.env
		fi
	done

	chmod 600 .env
	success "Created secure .env with high-entropy cryptographic keys."
else
	info "Existing .env detected; preserving current secrets."
fi

REQ_API_PORT="${API_PORT:-$(read_env_var .env API_PORT)}"
REQ_API_PORT="${REQ_API_PORT:-8000}"
REQ_FRONTEND_PORT="${FRONTEND_PORT:-$(read_env_var .env FRONTEND_PORT)}"
REQ_FRONTEND_PORT="${REQ_FRONTEND_PORT:-3000}"

if ! is_valid_port "$REQ_API_PORT"; then
	error "Invalid API_PORT '${REQ_API_PORT}'. Expected an integer between 1 and 65535."
	exit 1
fi

if ! is_valid_port "$REQ_FRONTEND_PORT"; then
	error "Invalid FRONTEND_PORT '${REQ_FRONTEND_PORT}'. Expected an integer between 1 and 65535."
	exit 1
fi

info "Checking host port availability (API: ${REQ_API_PORT}, Frontend: ${REQ_FRONTEND_PORT})..."

if ! API_PORT="$(resolve_available_port "api" 8000 "$REQ_API_PORT" "")"; then
	error "Could not find an available host port starting from API_PORT=${REQ_API_PORT}."
	exit 1
fi

if [ "$API_PORT" != "$REQ_API_PORT" ]; then
	warn "Port ${REQ_API_PORT} is already in use; automatically selected API_PORT=${API_PORT}."
	set_env_var .env API_PORT "$API_PORT"
fi

if ! FRONTEND_PORT="$(resolve_available_port "frontend" 3000 "$REQ_FRONTEND_PORT" "$API_PORT")"; then
	error "Could not find an available host port starting from FRONTEND_PORT=${REQ_FRONTEND_PORT}."
	exit 1
fi

if [ "$FRONTEND_PORT" != "$REQ_FRONTEND_PORT" ]; then
	warn "Port ${REQ_FRONTEND_PORT} is already in use; automatically selected FRONTEND_PORT=${FRONTEND_PORT}."
	set_env_var .env FRONTEND_PORT "$FRONTEND_PORT"
fi

export API_PORT FRONTEND_PORT

# --- Step 5: Pull & Launch Containers ---
if [ "${PALADIO_NO_PULL:-0}" != "1" ]; then
	info "Pulling Paladio container images..."
	docker compose pull
fi

info "Launching Paladio services with Docker Compose..."
docker compose up -d

# --- Step 6: Healthcheck Verification ---
info "Waiting for backend API and web UI to initialize (migrations + startup, up to 180s)..."

MAX_RETRIES=90
RETRY_COUNT=0
HEALTHY=0

while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
	if check_http "http://127.0.0.1:${API_PORT}/health" && check_http "http://127.0.0.1:${FRONTEND_PORT}/"; then
		HEALTHY=1
		break
	fi
	sleep 2
	RETRY_COUNT=$((RETRY_COUNT + 1))
	printf "${COLOR_MUTED}.${COLOR_RESET}"
done
printf "\n"

if [ $HEALTHY -eq 1 ]; then
	success "Paladio Web UI and Backend API are online and healthy!"
else
	warn "Services are still initializing after 180s. Check progress with:"
	warn "  cd \"$INSTALL_DIR\" && docker compose ps && docker compose logs -f"
fi

# --- Step 7: Final Instruction Banner ---
printf "\n"
printf "${COLOR_TEAL}─────────────────────────────────────────────────────────────${COLOR_RESET}\n"
printf "  ${COLOR_BOLD}Paladio is installed!${COLOR_RESET}\n\n"
printf "  Web App:       ${COLOR_BOLD}http://localhost:${FRONTEND_PORT}${COLOR_RESET}\n"
printf "  API Docs:      ${COLOR_BOLD}http://localhost:${API_PORT}/docs${COLOR_RESET}\n"
printf "  Install Dir:   %s\n\n" "$INSTALL_DIR"
printf "  ${COLOR_GOLD}First-Run:${COLOR_RESET} Open the Web App URL above to complete /setup.\n"
printf "  The first registered account is promoted to Administrator.\n\n"
printf "  Logs:    docker compose logs -f\n"
printf "  Update:  docker compose pull && docker compose up -d\n"
printf "  Stop:    docker compose down\n"
printf "${COLOR_TEAL}─────────────────────────────────────────────────────────────${COLOR_RESET}\n\n"
