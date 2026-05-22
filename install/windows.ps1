#Requires -RunAsAdministrator
<#
.SYNOPSIS
    SAR Manager -- Windows Installer
.DESCRIPTION
    Installs SAR Manager on a Windows machine.
    Run from the root of the repo as Administrator.

    CLIENT mode  -> starts on your login, opens browser on this machine.
    SERVER mode  -> starts at boot as SYSTEM, accessible from the network.

.EXAMPLE
    # Interactive (asks client or server):
    .\install\windows.ps1

    # Client install to default location:
    .\install\windows.ps1 -Mode client

    # Server install on port 3000:
    .\install\windows.ps1 -Mode server -Port 3000

    # Uninstall:
    .\install\windows.ps1 -Uninstall
#>

param(
    [ValidateSet('client','server')]
    [string]$Mode,
    [string]$InstallDir = 'C:\SAR Manager',
    [int]   $Port        = 3000,
    [switch]$Uninstall
)

$ErrorActionPreference = 'Stop'
$AppName    = 'SAR Manager'
$TaskName   = 'SARManager'
$NodeMinVer = 20

function Step($msg) { Write-Host "`n  --> $msg" -ForegroundColor Cyan }
function OK($msg)   { Write-Host "      $msg"   -ForegroundColor Green }
function Warn($msg) { Write-Host "      $msg"   -ForegroundColor Yellow }
function Fail($msg) { Write-Host "      ERROR: $msg" -ForegroundColor Red; exit 1 }

# ---------------------------------------------------------------------------
# Uninstall
# ---------------------------------------------------------------------------
if ($Uninstall) {
    Step "Uninstalling $AppName"

    Stop-ScheduledTask  -TaskName $TaskName -ErrorAction SilentlyContinue
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
    OK "Scheduled task removed"

    $shortcut = "$([Environment]::GetFolderPath('Desktop'))\$AppName.lnk"
    if (Test-Path $shortcut) { Remove-Item $shortcut -Force; OK "Desktop shortcut removed" }

    netsh advfirewall firewall delete rule name="SAR Manager Port $Port" | Out-Null
    OK "Firewall rule removed"

    if (Test-Path $InstallDir) {
        Remove-Item $InstallDir -Recurse -Force
        OK "Removed $InstallDir"
    }

    OK "Uninstall complete."
    exit 0
}

# ---------------------------------------------------------------------------
# Mode prompt
# ---------------------------------------------------------------------------
if (-not $Mode) {
    Write-Host ""
    Write-Host "  SAR Manager Installer" -ForegroundColor White
    Write-Host "  ---------------------"
    Write-Host "  [1] Client - runs on login, opens browser on this machine"
    Write-Host "  [2] Server - runs at boot, accessible from any device on the network"
    Write-Host ""
    $choice = Read-Host "  Select 1 or 2"
    $Mode = if ($choice -eq '2') { 'server' } else { 'client' }
}

OK "Mode: $Mode  |  Port: $Port  |  Install dir: $InstallDir"

# ---------------------------------------------------------------------------
# Clean previous install
# ---------------------------------------------------------------------------
Step "Cleaning previous install"

$existingTask = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($existingTask) {
    Stop-ScheduledTask       -TaskName $TaskName -ErrorAction SilentlyContinue
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
    OK "Old scheduled task stopped and removed"
}

if (Test-Path $InstallDir) {
    Remove-Item $InstallDir -Recurse -Force
    OK "Removed $InstallDir"
} else {
    OK "No previous install found"
}

# ---------------------------------------------------------------------------
# Node.js check
# ---------------------------------------------------------------------------
Step "Checking Node.js"

$nodeCmd     = Get-Command node -ErrorAction SilentlyContinue
$needInstall = $true

if ($nodeCmd) {
    $rawVer    = (& node --version) -replace '^v',''
    $nodeMajor = [int]($rawVer.Split('.')[0])
    if ($nodeMajor -ge $NodeMinVer) {
        OK "Node.js $rawVer already installed"
        $needInstall = $false
    } else {
        Warn "Node.js $rawVer is too old (need $NodeMinVer+), upgrading..."
    }
}

if ($needInstall) {
    Step "Installing Node.js $NodeMinVer LTS via winget"
    winget install OpenJS.NodeJS.LTS `
        --silent --accept-source-agreements --accept-package-agreements
    # Refresh PATH for this session
    $env:PATH = [System.Environment]::GetEnvironmentVariable('PATH','Machine') + ';' +
                [System.Environment]::GetEnvironmentVariable('PATH','User')
    OK "Node.js installed"
}

# Capture the full path to node.exe now -- used in the task action later
$nodeExePath = (Get-Command node -ErrorAction Stop).Source
OK "node.exe: $nodeExePath"

# ---------------------------------------------------------------------------
# Copy files
# ---------------------------------------------------------------------------
Step "Copying files to $InstallDir"

$sourceDir = Split-Path $PSScriptRoot -Parent   # repo root (parent of install\)
$exclude   = @('.git', 'node_modules', '.next', 'install', '.claude')

New-Item -ItemType Directory -Force $InstallDir | Out-Null

foreach ($item in Get-ChildItem -Path $sourceDir) {
    if ($exclude -contains $item.Name) { continue }
    Copy-Item -Path $item.FullName -Destination $InstallDir -Recurse -Force
}

OK "Files copied"

# ---------------------------------------------------------------------------
# Install deps + build
# ---------------------------------------------------------------------------
Step "Installing dependencies"
Push-Location $InstallDir
try {
    $savedNodeEnv = $env:NODE_ENV
    $env:NODE_ENV = $null   # do NOT skip devDependencies -- needed for build

    & npm install
    if ($LASTEXITCODE -ne 0) { Fail "npm install failed" }
    OK "Dependencies installed"

    Step "Building app (npm run build)"
    & npm run build
    if ($LASTEXITCODE -ne 0) { Fail "Build failed" }
    OK "Build complete"
} finally {
    $env:NODE_ENV = $savedNodeEnv
    Pop-Location
}

# ---------------------------------------------------------------------------
# Prepare standalone server files
# Next.js standalone output needs public/ and .next/static/ copied in
# ---------------------------------------------------------------------------
Step "Preparing standalone server"

$standaloneDir = Join-Path $InstallDir '.next\standalone'
if (-not (Test-Path $standaloneDir)) {
    Fail "Standalone dir not found at $standaloneDir -- ensure next.config.ts has output: 'standalone'"
}

$pubSrc = Join-Path $InstallDir 'public'
if (Test-Path $pubSrc) {
    Copy-Item -Path $pubSrc -Destination $standaloneDir -Recurse -Force
    OK "Copied public/"
}

$staticSrc = Join-Path $InstallDir '.next\static'
$staticDst = Join-Path $standaloneDir '.next\static'
if (Test-Path $staticSrc) {
    New-Item -ItemType Directory -Force $staticDst | Out-Null
    Copy-Item -Path "$staticSrc\*" -Destination $staticDst -Recurse -Force
    OK "Copied .next/static/"
}

$serverJs = Join-Path $standaloneDir 'server.js'
if (-not (Test-Path $serverJs)) {
    Fail "server.js not found at $serverJs -- standalone build may have failed"
}
OK "Standalone server ready: $serverJs"

# ---------------------------------------------------------------------------
# Scheduled task
# The task action runs node.exe directly -- no wrapper script to go wrong.
# NODE_ENV defaults to 'production' inside standalone server.js.
# PORT defaults to 3000.
# ---------------------------------------------------------------------------
Step "Registering scheduled task '$TaskName'"

Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue

$action = New-ScheduledTaskAction `
    -Execute       $nodeExePath `
    -Argument      'server.js' `
    -WorkingDirectory $standaloneDir

if ($Mode -eq 'server') {
    $trigger   = New-ScheduledTaskTrigger -AtStartup
    $principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
    $settings  = New-ScheduledTaskSettingsSet `
        -ExecutionTimeLimit (New-TimeSpan -Hours 0) `
        -RestartCount 3 `
        -RestartInterval (New-TimeSpan -Minutes 1)
    Register-ScheduledTask -TaskName $TaskName `
        -Action $action -Trigger $trigger `
        -Principal $principal -Settings $settings -Force | Out-Null
    OK "Task registered (runs node.exe at boot as SYSTEM)"
} else {
    $trigger  = New-ScheduledTaskTrigger -AtLogon -User $env:USERNAME
    $settings = New-ScheduledTaskSettingsSet `
        -ExecutionTimeLimit (New-TimeSpan -Hours 0) `
        -RestartCount 3 `
        -RestartInterval (New-TimeSpan -Minutes 1)
    Register-ScheduledTask -TaskName $TaskName `
        -Action $action -Trigger $trigger `
        -RunLevel Highest -Settings $settings -Force | Out-Null
    OK "Task registered (runs node.exe at your login)"
}

# ---------------------------------------------------------------------------
# Desktop shortcut (client only)
# Opens the browser directly -- server is kept running by the scheduled task.
# ---------------------------------------------------------------------------
if ($Mode -eq 'client') {
    Step "Creating desktop shortcut"

    $desktopPath = [Environment]::GetFolderPath('Desktop')
    $wsh         = New-Object -ComObject WScript.Shell
    $shortcut    = $wsh.CreateShortcut("$desktopPath\$AppName.lnk")
    $shortcut.TargetPath       = 'explorer.exe'
    $shortcut.Arguments        = "http://localhost:$Port"
    $shortcut.Description      = 'SAR Manager -- SEASAR'
    $shortcut.Save()

    OK "Desktop shortcut created (opens http://localhost:$Port)"
}

# ---------------------------------------------------------------------------
# Firewall rule (server only)
# ---------------------------------------------------------------------------
if ($Mode -eq 'server') {
    Step "Adding firewall rule for port $Port"
    $fwName = "SAR Manager Port $Port"
    netsh advfirewall firewall delete rule name="$fwName" | Out-Null
    netsh advfirewall firewall add rule `
        name="$fwName" dir=in action=allow protocol=TCP localport=$Port | Out-Null
    OK "Firewall rule added"

    $ip = (Get-NetIPAddress -AddressFamily IPv4 |
           Where-Object { $_.PrefixOrigin -in @('Dhcp','Manual') } |
           Select-Object -First 1).IPAddress
    if (-not $ip) { $ip = 'YOUR-SERVER-IP' }

    Warn "Server will be reachable at  http://$ip`:$Port"
    Warn "Clients on the same network open that URL in any browser."
}

# ---------------------------------------------------------------------------
# Start it now and wait (client mode only)
# ---------------------------------------------------------------------------
Step "Starting SAR Manager"
Start-ScheduledTask -TaskName $TaskName

if ($Mode -eq 'client') {
    Write-Host "      Waiting for server on port $Port ..." -ForegroundColor Gray
    $ready = $false
    for ($i = 0; $i -lt 90; $i++) {
        Start-Sleep 1
        try {
            $null = Invoke-WebRequest -Uri "http://localhost:$Port" -TimeoutSec 1 -UseBasicParsing -ErrorAction Stop
            $ready = $true
            break
        } catch {}
        if ($i -gt 0 -and ($i % 15) -eq 0) {
            Write-Host "      Still starting... ($i s)" -ForegroundColor Gray
        }
    }
    if ($ready) {
        OK "Server is ready"
        Start-Process "http://localhost:$Port"
    } else {
        Warn "Server did not respond in 90 seconds."
        Warn "Open Task Scheduler and check the '$TaskName' task for errors."
        Warn "Once running, open http://localhost:$Port"
    }
}

Write-Host ""
Write-Host "  Installation complete!" -ForegroundColor Green
if ($Mode -eq 'client') {
    Write-Host "  SAR Manager: http://localhost:$Port" -ForegroundColor White
    Write-Host "  Desktop shortcut opens the app in your browser." -ForegroundColor White
    Write-Host "  The server starts automatically when you log in." -ForegroundColor White
} else {
    Write-Host "  SAR Manager starts automatically at boot." -ForegroundColor White
}
Write-Host ""
