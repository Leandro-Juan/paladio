# ==============================================================================
# Paladio - Sovereign Travel Optimization Engine
# Single-Command One-Line Installer for Windows (PowerShell 5.1+ / 7+)
# ==============================================================================
# Usage (PowerShell):
#   irm https://raw.githubusercontent.com/Leandro-Juan/paladio/main/install.ps1 | iex
# Usage (CMD / Win+R):
#   powershell -NoProfile -ExecutionPolicy Bypass -Command "irm https://raw.githubusercontent.com/Leandro-Juan/paladio/main/install.ps1 | iex"
# Or locally:
#   .\install.ps1
# ==============================================================================

function Install-Paladio {
    $ErrorActionPreference = "Stop"

    function Write-Info([string]$Message) {
        Write-Host "[>] " -ForegroundColor Cyan -NoNewline
        Write-Host $Message
    }

    function Write-Success([string]$Message) {
        Write-Host "[OK] " -ForegroundColor Green -NoNewline
        Write-Host $Message -ForegroundColor White
    }

    function Write-Warn([string]$Message) {
        Write-Host "[!] " -ForegroundColor Yellow -NoNewline
        Write-Host $Message
    }

    function Write-Err([string]$Message) {
        Write-Host "[x] $Message" -ForegroundColor Red
    }

    function Show-Banner {
        $banner = @'
  ___       _           _ _
 | _ \ __ _| |__ _  __| (_)___    Paladio Sovereign Travel Engine
 |  _/ _` | / _` |/ _` | / _ \   Single-Command Windows Installer
 |_| \__,_|_\__,_|\__,_|_\___/
'@
        Write-Host $banner -ForegroundColor Cyan
        Write-Host ""
    }

    function New-HexSecret([int]$ByteCount) {
        $bytes = New-Object byte[] $ByteCount
        $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
        try {
            $rng.GetBytes($bytes)
        } finally {
            $rng.Dispose()
        }
        return ([BitConverter]::ToString($bytes) -replace "-", "").ToLowerInvariant()
    }

    Show-Banner

    # --- Step 1: Preflight Dependency Checks ---
    Write-Info "Running preflight environment checks..."

    if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
        Write-Err "Docker is not installed. Install Docker Desktop for Windows: https://docs.docker.com/desktop/install/windows-install/"
        if (Get-Command winget -ErrorAction SilentlyContinue) {
            Write-Info "Or install via winget: winget install Docker.DockerDesktop"
        }
        return
    }

    $prevPref = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    docker info *> $null
    $dockerInfoExit = $LASTEXITCODE
    $ErrorActionPreference = $prevPref

    if ($dockerInfoExit -ne 0) {
        Write-Err "Docker daemon is not running or current user lacks permission. Please start Docker Desktop and wait until it is ready."
        return
    }

    $ErrorActionPreference = "Continue"
    docker compose version *> $null
    $composeExit = $LASTEXITCODE
    $ErrorActionPreference = $prevPref

    if ($composeExit -ne 0) {
        Write-Err "Docker Compose v2 is required but not found. Please update Docker Desktop."
        return
    }

    Write-Success "Docker Engine and Compose v2 verified."

    # --- Step 2: Determine Installation Directory ---
    $installDir = $env:PALADIO_INSTALL_DIR
    if ([string]::IsNullOrWhiteSpace($installDir)) {
        if (Test-Path -LiteralPath "docker-compose.yml" -PathType Leaf) {
            $installDir = (Get-Location).Path
        } else {
            $homeDir = if ($env:USERPROFILE) { $env:USERPROFILE } else { $HOME }
            $installDir = Join-Path $homeDir "paladio"
        }
    }

    if (-not (Test-Path -LiteralPath $installDir -PathType Container)) {
        Write-Info "Creating installation directory at $installDir..."
        New-Item -ItemType Directory -Path $installDir -Force | Out-Null
    }

    Push-Location -LiteralPath $installDir
    try {
        Write-Info "Working directory: $installDir"

        # --- Step 3: Fetch docker-compose.yml if not present ---
        $composePath = Join-Path $installDir "docker-compose.yml"
        if (-not (Test-Path -LiteralPath $composePath -PathType Leaf)) {
            Write-Info "Downloading docker-compose.yml from repository..."
            $composeUrl = "https://raw.githubusercontent.com/Leandro-Juan/paladio/main/docker-compose.yml"
            try {
                Invoke-WebRequest -Uri $composeUrl -OutFile $composePath -UseBasicParsing
            } catch {
                Write-Err "Failed to download docker-compose.yml: $($_.Exception.Message)"
                return
            }
            Write-Success "Downloaded docker-compose.yml"
        }

        # --- Step 4: Auto-Generate Secrets (.env) ---
        $envPath = Join-Path $installDir ".env"
        if (-not (Test-Path -LiteralPath $envPath -PathType Leaf)) {
            Write-Info "Generating cryptographically secure bootstrap secrets..."

            $pgPass = New-HexSecret 20
            $jwtKey = New-HexSecret 32

            $envLines = @(
                "# ==============================================================================",
                "# Paladio - Self-Hosted Bootstrap Configuration (Auto-Generated)",
                "# ==============================================================================",
                "POSTGRES_USER=postgres",
                "POSTGRES_PASSWORD=$pgPass",
                "POSTGRES_DB=paladio",
                "",
                "JWT_SECRET_KEY=$jwtKey",
                "ENVIRONMENT=production",
                "ACCESS_TOKEN_EXPIRE_MINUTES=1440",
                ""
            )
            # Use LF line endings and UTF-8 without BOM for Docker Compose compatibility
            $envContent = $envLines -join "`n"
            $utf8NoBom = New-Object System.Text.UTF8Encoding $false
            [System.IO.File]::WriteAllText($envPath, $envContent, $utf8NoBom)

            if ($env:OS -eq "Windows_NT") {
                $ErrorActionPreference = "Continue"
                icacls $envPath /inheritance:r /grant:r "$($env:USERNAME):(R,W)" *> $null
                $ErrorActionPreference = $prevPref
            } else {
                chmod 600 $envPath
            }

            Write-Success "Created secure .env with high-entropy cryptographic keys."
        } else {
            Write-Info "Existing .env detected; preserving current secrets."
        }

        # --- Step 5: Launch Containers ---
        Write-Info "Launching Paladio services with Docker Compose..."
        $ErrorActionPreference = "Continue"
        docker compose up -d
        $upExit = $LASTEXITCODE
        $ErrorActionPreference = $prevPref

        if ($upExit -ne 0) {
            Write-Err "docker compose up -d failed with exit code $upExit."
            return
        }

        # --- Step 6: Healthcheck Verification ---
        $apiPort = if ($env:API_PORT) { $env:API_PORT } else { "8000" }
        $frontendPort = if ($env:FRONTEND_PORT) { $env:FRONTEND_PORT } else { "3000" }

        Write-Info "Waiting for backend services to initialize (this may take a few seconds)..."

        $maxRetries = 30
        $retryCount = 0
        $healthy = $false

        while ($retryCount -lt $maxRetries) {
            try {
                $resp = Invoke-WebRequest -Uri "http://127.0.0.1:${apiPort}/health" -UseBasicParsing -TimeoutSec 2
                if ($resp.StatusCode -ge 200 -and $resp.StatusCode -lt 300) {
                    $healthy = $true
                    break
                }
            } catch {
                # Service still starting
            }
            Start-Sleep -Seconds 2
            $retryCount++
            Write-Host "." -ForegroundColor DarkGray -NoNewline
        }
        Write-Host ""

        if ($healthy) {
            Write-Success "Backend API is online and healthy!"
        } else {
            Write-Warn "Backend is still initializing. Check logs with: docker compose logs -f"
        }

        # --- Step 7: Final Instruction Banner ---
        Write-Host ""
        Write-Host "+-------------------------------------------------------------+" -ForegroundColor Cyan
        Write-Host "|  Paladio is successfully installed and running!             |" -ForegroundColor Cyan
        Write-Host "|                                                             |" -ForegroundColor Cyan
        Write-Host ("|  Web App:       http://localhost:{0,-26} |" -f $frontendPort) -ForegroundColor Cyan
        Write-Host ("|  API Docs:      http://localhost:{0}/docs{1} |" -f $apiPort, (" " * [Math]::Max(0, 21 - $apiPort.Length))) -ForegroundColor Cyan
        Write-Host "|                                                             |" -ForegroundColor Cyan
        Write-Host ("|  First-Run: Open http://localhost:{0} to complete{1} |" -f $frontendPort, (" " * [Math]::Max(0, 12 - $frontendPort.Length))) -ForegroundColor Cyan
        Write-Host "|  admin onboarding. The first registered account is auto-    |" -ForegroundColor Cyan
        Write-Host "|  promoted to Administrator.                                 |" -ForegroundColor Cyan
        Write-Host "+-------------------------------------------------------------+" -ForegroundColor Cyan
        Write-Host ""
    } finally {
        Pop-Location
    }
}

Install-Paladio
