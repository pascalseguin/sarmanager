<#
.SYNOPSIS
    SAR Manager -- Developer build script
    Builds the Next.js app and compiles the Inno Setup installer.

.DESCRIPTION
    Run this from the repo root to produce dist\SAR Manager Setup.exe.
    Requires Inno Setup 6 to be installed (https://jrsoftware.org/isinfo.php).

.EXAMPLE
    .\install\build-installer.ps1
#>

$ErrorActionPreference = 'Stop'
$Root   = Split-Path $PSScriptRoot -Parent
$Dist   = Join-Path $Root 'dist'
$Server = Join-Path $Dist 'server'

function Step($msg) { Write-Host "`n  --> $msg" -ForegroundColor Cyan }
function OK($msg)   { Write-Host "      $msg"   -ForegroundColor Green }
function Fail($msg) { Write-Host "      ERROR: $msg" -ForegroundColor Red; exit 1 }

# ---------------------------------------------------------------------------
# 1. Build the Next.js app
# ---------------------------------------------------------------------------
Step "Building SAR Manager (npm install + npm run build)"
Push-Location $Root
try {
    $savedNodeEnv = $env:NODE_ENV
    $env:NODE_ENV = $null

    # Clear Turbopack / Next.js cache -- stale cache causes silent crashes on re-runs
    $nextCache = Join-Path $Root '.next'
    if (Test-Path $nextCache) {
        Remove-Item $nextCache -Recurse -Force -ErrorAction SilentlyContinue
        OK "Cleared .next cache"
    }

    # Run npm install -- use cmd.exe to avoid PowerShell treating npm stderr as fatal
    cmd /c "npm install"
    if ($LASTEXITCODE -ne 0) { Fail "npm install failed (exit $LASTEXITCODE)" }

    # Run next build -- same wrapper; next writes progress to stderr which kills PS with Stop preference
    cmd /c "npm run build"
    if ($LASTEXITCODE -ne 0) { Fail "npm run build failed (exit $LASTEXITCODE)" }
} finally {
    $env:NODE_ENV = $savedNodeEnv
    Pop-Location
}
OK "Build complete"

# ---------------------------------------------------------------------------
# 2. Prepare dist/server (standalone + static)
# ---------------------------------------------------------------------------
Step "Preparing dist\server"

$standaloneDir = Join-Path $Root '.next\standalone'
if (-not (Test-Path $standaloneDir)) {
    Fail "Standalone output not found -- ensure next.config.ts has output: 'standalone'"
}

if (Test-Path $Server) {
    Remove-Item $Server -Recurse -Force
}
New-Item -ItemType Directory -Force $Server | Out-Null

# Copy standalone output (includes its own node_modules)
Copy-Item -Path "$standaloneDir\*" -Destination $Server -Recurse -Force
OK "Copied .next/standalone"

# Copy public/
$pub = Join-Path $Root 'public'
if (Test-Path $pub) {
    Copy-Item -Path $pub -Destination $Server -Recurse -Force
    OK "Copied public/"
}

# Copy .next/static/ into server/.next/static/
$staticSrc = Join-Path $Root '.next\static'
$staticDst = Join-Path $Server '.next\static'
if (Test-Path $staticSrc) {
    New-Item -ItemType Directory -Force $staticDst | Out-Null
    Copy-Item -Path "$staticSrc\*" -Destination $staticDst -Recurse -Force
    OK "Copied .next/static/"
}

$serverJs = Join-Path $Server 'server.js'
if (-not (Test-Path $serverJs)) {
    Fail "server.js not found in standalone output"
}
OK "dist\server ready"

# ---------------------------------------------------------------------------
# 3. Compile with Inno Setup 6
# ---------------------------------------------------------------------------
Step "Compiling installer with Inno Setup 6"

$iscc = "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe"
if (-not (Test-Path $iscc)) {
    $iscc = "${env:ProgramFiles}\Inno Setup 6\ISCC.exe"
}
if (-not (Test-Path $iscc)) {
    Write-Host ""
    Write-Host "  Inno Setup 6 not found." -ForegroundColor Yellow
    Write-Host "  Download from: https://jrsoftware.org/isdl.php" -ForegroundColor Yellow
    Write-Host "  After installing, re-run this script." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "  The pre-built server files are ready in dist\server\" -ForegroundColor Cyan
    Write-Host "  You can also compile setup.iss manually with the Inno Setup IDE." -ForegroundColor Cyan
    exit 0
}

$iss = Join-Path $PSScriptRoot 'setup.iss'
& $iscc $iss
if ($LASTEXITCODE -ne 0) { Fail "Inno Setup compilation failed" }

$exe = Join-Path $Dist 'SAR Manager Setup.exe'
if (Test-Path $exe) {
    OK "Installer ready: $exe"
    Write-Host ""
    Write-Host "  Distribute '$exe' to end users." -ForegroundColor Green
    Write-Host "  They double-click it and step through the wizard." -ForegroundColor Green
} else {
    Fail "Installer exe not found after compilation"
}
