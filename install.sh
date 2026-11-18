#!/usr/bin/env bash
# ==============================================================================
# Paladio - Sovereign Travel Optimization Engine
# Single-Command One-Line Installer
# ==============================================================================
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/Leandro-Juan/paladio/main/install.sh | bash
# Or locally:
#   ./install.sh
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
    cat << "EOF"
  ___       _           _ _       
 | _ \ __ _| |__ _  __| (_)___    Paladio Sovereign Travel Engine
 |  _/ _` | / _` |/ _` | / _ \   Single-Command Installer
 |_| \__,_|_\__,_|\__,_|_\___/   
EOF
    printf "${COLOR_RESET}\n"
}

banner

# --- Step 1: Preflight Dependency Checks ---
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

success "Docker Engine and Compose v2 verified."

# --- Step 2: Determine Installation Directory ---
INSTALL_DIR="${PALADIO_INSTALL_DIR:-}"

if [ -z "$INSTALL_DIR" ]; then
    if [ -f "docker-compose.yml" ]; then
        INSTALL_DIR="$(pwd)"
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
    info "Downloading docker-compose.yml from repository..."
    COMPOSE_URL="https://raw.githubusercontent.com/Leandro-Juan/paladio/main/docker-compose.yml"
    if command -v curl >/dev/null 2>&1; then
        curl -fsSL "$COMPOSE_URL" -o docker-compose.yml
    elif command -v wget >/dev/null 2>&1; then
        wget -qO docker-compose.yml "$COMPOSE_URL"
    else
        error "Neither curl nor wget is available to download docker-compose.yml."
        exit 1
    fi
    success "Downloaded docker-compose.yml"
fi

# --- Step 4: Auto-Generate Secrets (.env) ---
if [ ! -f ".env" ]; then
    info "Generating cryptographically secure bootstrap secrets..."

    generate_secret() {
        if command -v openssl >/dev/null 2>&1; then
            openssl rand -hex "$1"
        else
            head -c "$1" /dev/urandom | xxd -p -c "$1" 2>/dev/null || tr -dc 'a-zA-Z0-9' < /dev/urandom | head -c "$(( $1 * 2 ))"
        fi
    }

    PG_PASS=$(generate_secret 20)
    JWT_KEY=$(generate_secret 32)

    cat <<EOF > .env
# ==============================================================================
# Paladio - Self-Hosted Bootstrap Configuration (Auto-Generated)
# ==============================================================================
POSTGRES_USER=postgres
POSTGRES_PASSWORD=${PG_PASS}
POSTGRES_DB=paladio

JWT_SECRET_KEY=${JWT_KEY}
ENVIRONMENT=production
ACCESS_TOKEN_EXPIRE_MINUTES=1440
EOF

    chmod 600 .env
    success "Created secure .env with high-entropy cryptographic keys."
else
    info "Existing .env detected; preserving current secrets."
fi

# --- Step 5: Launch Containers ---
info "Launching Paladio services with Docker Compose..."
docker compose up -d

# --- Step 6: Healthcheck Verification ---
API_PORT="${API_PORT:-8000}"
FRONTEND_PORT="${FRONTEND_PORT:-3000}"

info "Waiting for backend services to initialize (this may take a few seconds)..."

MAX_RETRIES=30
RETRY_COUNT=0
HEALTHY=0

while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    if command -v curl >/dev/null 2>&1; then
        if curl -fs "http://127.0.0.1:${API_PORT}/health" >/dev/null 2>&1; then
            HEALTHY=1
            break
        fi
    elif command -v wget >/dev/null 2>&1; then
        if wget -qO- "http://127.0.0.1:${API_PORT}/health" >/dev/null 2>&1; then
            HEALTHY=1
            break
        fi
    fi
    sleep 2
    RETRY_COUNT=$((RETRY_COUNT + 1))
    printf "${COLOR_MUTED}.${COLOR_RESET}"
done
printf "\n"

if [ $HEALTHY -eq 1 ]; then
    success "Backend API is online and healthy!"
else
    warn "Backend is still initializing. Check logs with: docker compose logs -f"
fi

# --- Step 7: Final Instruction Banner ---
printf "\n"
printf "${COLOR_TEAL}╭─────────────────────────────────────────────────────────────╮${COLOR_RESET}\n"
printf "${COLOR_TEAL}│${COLOR_RESET}  ${COLOR_BOLD}Paladio is successfully installed and running!${COLOR_RESET}             ${COLOR_TEAL}│${COLOR_RESET}\n"
printf "${COLOR_TEAL}│${COLOR_RESET}                                                             ${COLOR_TEAL}│${COLOR_RESET}\n"
printf "${COLOR_TEAL}│${COLOR_RESET}  Web App:       ${COLOR_BOLD}http://localhost:${FRONTEND_PORT}${COLOR_RESET}                       ${COLOR_TEAL}│${COLOR_RESET}\n"
printf "${COLOR_TEAL}│${COLOR_RESET}  API Docs:      ${COLOR_BOLD}http://localhost:${API_PORT}/docs${COLOR_RESET}                  ${COLOR_TEAL}│${COLOR_RESET}\n"
printf "${COLOR_TEAL}│${COLOR_RESET}                                                             ${COLOR_TEAL}│${COLOR_RESET}\n"
printf "${COLOR_TEAL}│${COLOR_RESET}  ${COLOR_GOLD}First-Run:${COLOR_RESET} Open ${COLOR_BOLD}http://localhost:${FRONTEND_PORT}${COLOR_RESET} to complete         ${COLOR_TEAL}│${COLOR_RESET}\n"
printf "${COLOR_TEAL}│${COLOR_RESET}  admin onboarding. The first registered account is auto-     ${COLOR_TEAL}│${COLOR_RESET}\n"
printf "${COLOR_TEAL}│${COLOR_RESET}  promoted to Administrator.                                  ${COLOR_TEAL}│${COLOR_RESET}\n"
printf "${COLOR_TEAL}╰─────────────────────────────────────────────────────────────╯${COLOR_RESET}\n\n"
