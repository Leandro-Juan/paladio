# ==============================================================================
# Paladio - Sovereign Travel Optimization Engine
# Single-Command Consumer Installer for Windows (PowerShell 5.1+ / 7+)
# ==============================================================================
# Usage (PowerShell):
#   irm https://raw.githubusercontent.com/Leandro-Juan/paladio/main/scripts/install/install.ps1 | iex
# Usage (CMD / Win+R):
#   powershell -NoProfile -ExecutionPolicy Bypass -Command "irm https://raw.githubusercontent.com/Leandro-Juan/paladio/main/scripts/install/install.ps1 | iex"
# Or locally:
#   .\scripts\install\install.ps1
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
  ___      _          _ _
 | _ \__ _| |__ _  __| (_)___    Paladio Sovereign Travel Engine
 |  _/ _` | / _` |/ _` | / _ \   Single-Command Windows Installer
 |_| \__,_|_\__,_|\__,_|_\___/
'@
        Write-Host $banner -ForegroundColor Cyan
        Write-Host ""
    }

    function New-RandomBytes([int]$ByteCount) {
        $bytes = New-Object byte[] $ByteCount
        $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
        try {
            $rng.GetBytes($bytes)
        } finally {
            $rng.Dispose()
        }
        return $bytes
    }

    function New-HexSecret([int]$ByteCount) {
        $bytes = New-RandomBytes $ByteCount
        return ([BitConverter]::ToString($bytes) -replace "-", "").ToLowerInvariant()
    }

    function New-FernetKey {
        $bytes = New-RandomBytes 32
        return [Convert]::ToBase64String($bytes).Replace("+", "-").Replace("/", "_")
    }

    function Read-EnvValue([string]$Path, [string]$Key) {
        if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
            return $null
        }
        $pattern = "^\s*" + [Regex]::Escape($Key) + "=(.*)$"
        $matchLine = Get-Content -LiteralPath $Path | Where-Object { $_ -match $pattern } | Select-Object -Last 1
        if (-not $matchLine) {
            return $null
        }
        if ($matchLine -match $pattern) {
            $val = $Matches[1].Trim()
            if (($val.StartsWith('"') -and $val.EndsWith('"')) -or ($val.StartsWith("'") -and $val.EndsWith("'"))) {
                if ($val.Length -ge 2) {
                    $val = $val.Substring(1, $val.Length - 2)
                }
            }
            return $val
        }
        return $null
    }

    function Set-EnvValue([string]$Path, [string]$Key, [string]$Value) {
        $lines = @()
        if (Test-Path -LiteralPath $Path -PathType Leaf) {
            $lines = @(Get-Content -LiteralPath $Path)
        }
        $pattern = "^\s*" + [Regex]::Escape($Key) + "=.*$"
        $updated = New-Object System.Collections.Generic.List[string]
        $found = $false
        foreach ($line in $lines) {
            if ($line -match $pattern) {
                if (-not $found) {
                    $updated.Add("${Key}=${Value}")
                    $found = $true
                }
            } else {
                $updated.Add($line)
            }
        }
        if (-not $found) {
            $updated.Add("${Key}=${Value}")
        }
        $envContent = ($updated -join "`n") + "`n"
        $utf8NoBom = New-Object System.Text.UTF8Encoding $false
        [System.IO.File]::WriteAllText($Path, $envContent, $utf8NoBom)

        if ($env:OS -eq "Windows_NT") {
            $localPrevPref = $ErrorActionPreference
            $ErrorActionPreference = "Continue"
            icacls $Path /inheritance:r /grant:r "$($env:USERNAME):(R,W)" *> $null
            $ErrorActionPreference = $localPrevPref
        } else {
            chmod 600 $Path
        }
    }

    function ConvertTo-ValidPort([string]$RawPort) {
        if ([string]::IsNullOrWhiteSpace($RawPort)) {
            return $null
        }
        $trimmed = $RawPort.Trim()
        if ($trimmed -notmatch '^[1-9][0-9]{0,4}$') {
            return $null
        }
        $parsed = [int]$trimmed
        if ($parsed -lt 1 -or $parsed -gt 65535) {
            return $null
        }
        return $parsed
    }

    function Test-ComposeServicePort([string]$Service, [int]$ContainerPort, [int]$TargetHostPort) {
        $localPrevPref = $ErrorActionPreference
        $ErrorActionPreference = "Continue"
        $mapped = docker compose port $Service $ContainerPort 2>$null
        $exitCode = $LASTEXITCODE
        $ErrorActionPreference = $localPrevPref
        if ($exitCode -ne 0 -or -not $mapped) {
            return $false
        }
        foreach ($line in @($mapped)) {
            $trimmed = ([string]$line).Trim()
            if (-not $trimmed) { continue }
            $lastColon = $trimmed.LastIndexOf(":")
            if ($lastColon -ge 0) {
                $boundPort = $trimmed.Substring($lastColon + 1)
                if ($boundPort -eq [string]$TargetHostPort) {
                    return $true
                }
            }
        }
        return $false
    }

    function Get-DockerPublishedPortSet {
        $portSet = New-Object 'System.Collections.Generic.HashSet[int]'
        $localPrevPref = $ErrorActionPreference
        $ErrorActionPreference = "Continue"
        $lines = docker ps --format "{{.Ports}}" 2>$null
        $exitCode = $LASTEXITCODE
        $ErrorActionPreference = $localPrevPref
        if ($exitCode -ne 0 -or -not $lines) {
            return $portSet
        }
        foreach ($line in @($lines)) {
            $portMatches = [Regex]::Matches([string]$line, ':(\d+)(?:-(\d+))?->')
            foreach ($m in $portMatches) {
                $startPort = [int]$m.Groups[1].Value
                $endPort = if ($m.Groups[2].Success) { [int]$m.Groups[2].Value } else { $startPort }
                if ($endPort -lt $startPort) { continue }
                $cappedEnd = [Math]::Min($endPort, $startPort + 1000)
                for ($p = $startPort; $p -le $cappedEnd; $p++) {
                    [void]$portSet.Add($p)
                }
            }
        }
        return $portSet
    }

    function Get-ActiveTcpListenerPortSet {
        $portSet = New-Object 'System.Collections.Generic.HashSet[int]'
        try {
            $ipProps = [System.Net.NetworkInformation.IPGlobalProperties]::GetIPGlobalProperties()
            foreach ($ep in $ipProps.GetActiveTcpListeners()) {
                [void]$portSet.Add([int]$ep.Port)
            }
        } catch {
            # Fallback to socket bind probe in Test-PortInUse
        }
        return $portSet
    }

    function Test-PortInUse([int]$Port, $DockerPortSet, $ListenerPortSet) {
        if ($null -ne $DockerPortSet -and $DockerPortSet.Contains($Port)) {
            return $true
        }
        if ($null -ne $ListenerPortSet -and $ListenerPortSet.Contains($Port)) {
            return $true
        }

        $addrs = @(
            [System.Net.IPAddress]::Any,
            [System.Net.IPAddress]::Loopback
        )
        if ([System.Net.Sockets.Socket]::OSSupportsIPv6) {
            $addrs += @(
                [System.Net.IPAddress]::IPv6Any,
                [System.Net.IPAddress]::IPv6Loopback
            )
        }

        foreach ($addr in $addrs) {
            $listener = $null
            try {
                $listener = New-Object System.Net.Sockets.TcpListener($addr, $Port)
                if ($addr.AddressFamily -eq [System.Net.Sockets.AddressFamily]::InterNetworkV6) {
                    try { $listener.Server.DualMode = $false } catch {}
                }
                $listener.Start()
            } catch [System.Net.Sockets.SocketException] {
                $errCode = $_.Exception.SocketErrorCode
                if ($errCode -eq [System.Net.Sockets.SocketError]::AddressAlreadyInUse) {
                    return $true
                }
                if (($env:OS -eq "Windows_NT") -and ($Port -ge 1024) -and ($errCode -eq [System.Net.Sockets.SocketError]::AccessDenied)) {
                    return $true
                }
            } catch {
                # Ignore unsupported protocol or permission errors on privileged ports
            } finally {
                if ($null -ne $listener) {
                    try { $listener.Stop() } catch {}
                }
            }
        }

        return $false
    }

    function Resolve-AvailablePort([string]$Service, [int]$ContainerPort, [int]$DesiredPort, [int]$ReservedPort, $DockerPortSet, $ListenerPortSet) {
        if (($DesiredPort -ne $ReservedPort) -and (Test-ComposeServicePort $Service $ContainerPort $DesiredPort)) {
            return $DesiredPort
        }

        $candidate = $DesiredPort
        $maxAttempts = 1000
        for ($attempt = 0; $attempt -lt $maxAttempts; $attempt++) {
            if (($candidate -ne $ReservedPort) -and (-not (Test-PortInUse $candidate $DockerPortSet $ListenerPortSet))) {
                return $candidate
            }
            if ($candidate -lt 1024 -or $candidate -ge 65535) {
                $candidate = 1024
            } else {
                $candidate++
            }
        }

        return $null
    }

    function Test-HttpOk([string]$Url) {
        try {
            $resp = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 3
            return ($resp.StatusCode -ge 200 -and $resp.StatusCode -lt 300)
        } catch {
            return $false
        }
    }

    Show-Banner

    # --- Step 1: Preflight Dependency & Hardware Checks ---
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

    try {
        $cs = Get-CimInstance -ClassName Win32_ComputerSystem -ErrorAction SilentlyContinue
        if ($cs -and $cs.TotalPhysicalMemory) {
            $ramMb = [int][Math]::Floor($cs.TotalPhysicalMemory / 1MB)
            if ($ramMb -lt 7500) {
                Write-Warn "Detected $ramMb MB RAM. Paladio recommends at least 8 GB (8192 MB) RAM for Postgres, Valhalla routing, and ONNX embeddings."
            }
        }
    } catch {
        # Ignore WMI/CIM failures on non-Windows PowerShell hosts
    }

    Write-Success "Docker Engine and Compose v2 verified."

    # --- Step 2: Determine Installation Directory ---
    $installDir = $env:PALADIO_INSTALL_DIR
    if ([string]::IsNullOrWhiteSpace($installDir)) {
        $scriptRepoRoot = if ($PSScriptRoot) { (Resolve-Path -LiteralPath (Join-Path (Join-Path $PSScriptRoot "..") "..") -ErrorAction SilentlyContinue).Path } else { $null }
        if (Test-Path -LiteralPath "docker-compose.yml" -PathType Leaf) {
            $installDir = (Get-Location).Path
        } elseif ($scriptRepoRoot -and (Test-Path -LiteralPath (Join-Path $scriptRepoRoot "docker-compose.yml") -PathType Leaf)) {
            $installDir = $scriptRepoRoot
        } else {
            $homeDir = if ($env:USERPROFILE) { $env:USERPROFILE } else { $HOME }
            $installDir = Join-Path $homeDir "paladio"
        }
    }

    if (-not (Test-Path -LiteralPath $installDir -PathType Container)) {
        Write-Info "Creating installation directory at $installDir..."
        New-Item -ItemType Directory -Path $installDir -Force | Out-Null
    }

    $hadApiPortEnv = Test-Path Env:API_PORT
    $origApiPortEnv = $env:API_PORT
    $hadFrontendPortEnv = Test-Path Env:FRONTEND_PORT
    $origFrontendPortEnv = $env:FRONTEND_PORT

    Push-Location -LiteralPath $installDir
    try {
        Write-Info "Working directory: $installDir"

        # --- Step 3: Fetch docker-compose.yml if not present ---
        $composePath = Join-Path $installDir "docker-compose.yml"
        if (-not (Test-Path -LiteralPath $composePath -PathType Leaf)) {
            $composeUrl = if (-not [string]::IsNullOrWhiteSpace($env:PALADIO_COMPOSE_URL)) {
                $env:PALADIO_COMPOSE_URL
            } else {
                "https://raw.githubusercontent.com/Leandro-Juan/paladio/main/docker-compose.yml"
            }
            Write-Info "Downloading docker-compose.yml from $composeUrl..."
            $tmpComposePath = "$composePath.tmp"
            try {
                Invoke-WebRequest -Uri $composeUrl -OutFile $tmpComposePath -UseBasicParsing
                $composeContent = Get-Content -LiteralPath $tmpComposePath -Raw
                if ($composeContent -notmatch "(?m)^\s*services:") {
                    Remove-Item -LiteralPath $tmpComposePath -Force -ErrorAction SilentlyContinue
                    Write-Err "Downloaded file is not a valid Docker Compose manifest."
                    return
                }
                Move-Item -LiteralPath $tmpComposePath -Destination $composePath -Force
            } catch {
                Remove-Item -LiteralPath $tmpComposePath -Force -ErrorAction SilentlyContinue
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
            $walletKey = New-FernetKey

            $envLines = @(
                "# ==============================================================================",
                "# Paladio - Self-Hosted Bootstrap Configuration (Auto-Generated)",
                "# ==============================================================================",
                "POSTGRES_USER=postgres",
                "POSTGRES_PASSWORD=$pgPass",
                "POSTGRES_DB=paladio",
                "",
                "JWT_SECRET_KEY=$jwtKey",
                "WALLET_ENCRYPTION_KEY=$walletKey",
                "ENVIRONMENT=production",
                "ACCESS_TOKEN_EXPIRE_MINUTES=1440",
                "API_WORKERS=1"
            )

            $optionalVars = @(
                "API_PORT",
                "FRONTEND_PORT",
                "PALADIO_VERSION",
                "PALADIO_API_IMAGE",
                "PALADIO_FRONTEND_IMAGE",
                "PALADIO_PUBLIC_API_URL",
                "VALHALLA_TILE_URLS",
                "ALLOWED_ORIGINS"
            )
            foreach ($optVar in $optionalVars) {
                $optVal = [Environment]::GetEnvironmentVariable($optVar)
                if (-not [string]::IsNullOrWhiteSpace($optVal)) {
                    $envLines += "${optVar}=${optVal}"
                }
            }
            $envLines += ""

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

        $rawApiPort = if (-not [string]::IsNullOrWhiteSpace($env:API_PORT)) { $env:API_PORT } else { Read-EnvValue $envPath "API_PORT" }
        if ([string]::IsNullOrWhiteSpace($rawApiPort)) { $rawApiPort = "8000" }
        $reqApiPort = ConvertTo-ValidPort $rawApiPort
        if ($null -eq $reqApiPort) {
            Write-Err "Invalid API_PORT '$rawApiPort'. Expected an integer between 1 and 65535."
            return
        }

        $rawFrontendPort = if (-not [string]::IsNullOrWhiteSpace($env:FRONTEND_PORT)) { $env:FRONTEND_PORT } else { Read-EnvValue $envPath "FRONTEND_PORT" }
        if ([string]::IsNullOrWhiteSpace($rawFrontendPort)) { $rawFrontendPort = "3000" }
        $reqFrontendPort = ConvertTo-ValidPort $rawFrontendPort
        if ($null -eq $reqFrontendPort) {
            Write-Err "Invalid FRONTEND_PORT '$rawFrontendPort'. Expected an integer between 1 and 65535."
            return
        }

        Write-Info "Checking host port availability (API: $reqApiPort, Frontend: $reqFrontendPort)..."
        $dockerPortSet = Get-DockerPublishedPortSet
        $listenerPortSet = Get-ActiveTcpListenerPortSet

        $apiPortInt = Resolve-AvailablePort "api" 8000 $reqApiPort 0 $dockerPortSet $listenerPortSet
        if ($null -eq $apiPortInt) {
            Write-Err "Could not find an available host port starting from API_PORT=$reqApiPort."
            return
        }
        if ($apiPortInt -ne $reqApiPort) {
            Write-Warn "Port $reqApiPort is already in use; automatically selected API_PORT=$apiPortInt."
            Set-EnvValue $envPath "API_PORT" ([string]$apiPortInt)
        }

        $frontendPortInt = Resolve-AvailablePort "frontend" 3000 $reqFrontendPort $apiPortInt $dockerPortSet $listenerPortSet
        if ($null -eq $frontendPortInt) {
            Write-Err "Could not find an available host port starting from FRONTEND_PORT=$reqFrontendPort."
            return
        }
        if ($frontendPortInt -ne $reqFrontendPort) {
            Write-Warn "Port $reqFrontendPort is already in use; automatically selected FRONTEND_PORT=$frontendPortInt."
            Set-EnvValue $envPath "FRONTEND_PORT" ([string]$frontendPortInt)
        }

        $apiPort = [string]$apiPortInt
        $frontendPort = [string]$frontendPortInt
        $env:API_PORT = $apiPort
        $env:FRONTEND_PORT = $frontendPort

        # --- Step 5: Pull & Launch Containers ---
        if ($env:PALADIO_NO_PULL -ne "1") {
            Write-Info "Pulling Paladio container images..."
            $ErrorActionPreference = "Continue"
            docker compose pull
            $pullExit = $LASTEXITCODE
            $ErrorActionPreference = $prevPref
            if ($pullExit -ne 0) {
                Write-Err "docker compose pull failed with exit code $pullExit."
                return
            }
        }

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
        Write-Info "Waiting for backend API and web UI to initialize (migrations + startup, up to 180s)..."

        $maxRetries = 90
        $retryCount = 0
        $healthy = $false

        while ($retryCount -lt $maxRetries) {
            if ((Test-HttpOk "http://127.0.0.1:${apiPort}/health") -and (Test-HttpOk "http://127.0.0.1:${frontendPort}/")) {
                $healthy = $true
                break
            }
            Start-Sleep -Seconds 2
            $retryCount++
            Write-Host "." -ForegroundColor DarkGray -NoNewline
        }
        Write-Host ""

        if ($healthy) {
            Write-Success "Paladio Web UI and Backend API are online and healthy!"
        } else {
            Write-Warn "Services are still initializing after 180s. Check progress with:"
            Write-Warn "  cd `"$installDir`"; docker compose ps; docker compose logs -f"
        }

        # --- Step 7: Final Instruction Banner ---
        Write-Host ""
        Write-Host "-------------------------------------------------------------" -ForegroundColor Cyan
        Write-Host "  Paladio is installed!" -ForegroundColor White
        Write-Host ""
        Write-Host ("  Web App:       http://localhost:{0}" -f $frontendPort) -ForegroundColor Cyan
        Write-Host ("  API Docs:      http://localhost:{0}/docs" -f $apiPort) -ForegroundColor Cyan
        Write-Host ("  Install Dir:   {0}" -f $installDir)
        Write-Host ""
        Write-Host "  First-Run: Open the Web App URL above to complete /setup." -ForegroundColor Yellow
        Write-Host "  The first registered account is promoted to Administrator."
        Write-Host ""
        Write-Host "  Logs:    docker compose logs -f"
        Write-Host "  Update:  docker compose pull; docker compose up -d"
        Write-Host "  Stop:    docker compose down"
        Write-Host "-------------------------------------------------------------" -ForegroundColor Cyan
        Write-Host ""
    } finally {
        if ($hadApiPortEnv) {
            $env:API_PORT = $origApiPortEnv
        } else {
            Remove-Item Env:API_PORT -ErrorAction SilentlyContinue
        }
        if ($hadFrontendPortEnv) {
            $env:FRONTEND_PORT = $origFrontendPortEnv
        } else {
            Remove-Item Env:FRONTEND_PORT -ErrorAction SilentlyContinue
        }
        Pop-Location
    }
}

Install-Paladio
