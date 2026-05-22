# SAR Manager — Azure Web App Deployment
#
# Prerequisites:
#   - Azure CLI: winget install Microsoft.AzureCLI
#   - Run from the repo root
#
# Usage:
#   .\install\azure.ps1
#   .\install\azure.ps1 -AppName mysar -Location "Canada Central" -Sku B1
#
# After deploy, the app is at: https://<AppName>.azurewebsites.net

param(
    [string]$AppName       = 'sarmanager',
    [string]$ResourceGroup = 'sarmanager-rg',
    [string]$Location      = 'Canada Central',
    [string]$Sku           = 'B1',     # B1 = ~$13 CAD/mo. F1 = free (slow, limited)
    [switch]$Delete
)

$ErrorActionPreference = 'Stop'

function Step($msg) { Write-Host "`n  --> $msg" -ForegroundColor Cyan }
function OK($msg)   { Write-Host "      $msg"   -ForegroundColor Green }
function Warn($msg) { Write-Host "      $msg"   -ForegroundColor Yellow }
function Fail($msg) { Write-Host "      ERROR: $msg" -ForegroundColor Red; exit 1 }

# ── Check az CLI ──────────────────────────────────────────────────────────────
if (-not (Get-Command az -ErrorAction SilentlyContinue)) {
    Fail "Azure CLI not found.`n  Install: winget install Microsoft.AzureCLI`n  Then re-open PowerShell and try again."
}

# ── Login ─────────────────────────────────────────────────────────────────────
Step "Checking Azure login"
$account = az account show 2>&1
if ($LASTEXITCODE -ne 0) {
    az login
}
OK "Logged in as: $((az account show --query 'user.name' -o tsv))"

# ── Delete / teardown ─────────────────────────────────────────────────────────
if ($Delete) {
    Step "Deleting resource group '$ResourceGroup' (all resources)"
    $confirm = Read-Host "  Type the resource group name to confirm deletion"
    if ($confirm -ne $ResourceGroup) { Fail "Aborted — name did not match." }
    az group delete --name $ResourceGroup --yes --no-wait
    OK "Deletion started (runs in background on Azure)."
    exit 0
}

# ── Resource group ────────────────────────────────────────────────────────────
Step "Creating resource group '$ResourceGroup' in '$Location'"
az group create --name $ResourceGroup --location $Location | Out-Null
OK "Resource group ready"

# ── Deploy with az webapp up ──────────────────────────────────────────────────
# az webapp up creates the App Service Plan + Web App and deploys the code.
Step "Deploying to Azure App Service (this takes 3-5 minutes)"

$repoRoot = Split-Path $PSScriptRoot -Parent

az webapp up `
    --name            $AppName `
    --resource-group  $ResourceGroup `
    --location        $Location `
    --runtime         "NODE:20-lts" `
    --sku             $Sku `
    --os-type         linux `
    --src-path        $repoRoot

if ($LASTEXITCODE -ne 0) { Fail "Deployment failed — check the output above." }
OK "App deployed"

# ── App settings ──────────────────────────────────────────────────────────────
Step "Configuring app settings"

az webapp config appsettings set `
    --name            $AppName `
    --resource-group  $ResourceGroup `
    --settings `
        NODE_ENV=production `
        NEXT_TELEMETRY_DISABLED=1 `
        SCM_DO_BUILD_DURING_DEPLOYMENT=true `
        WEBSITE_NODE_DEFAULT_VERSION=20 | Out-Null

# Tell Azure to run "npm start" after deployment
az webapp config set `
    --name            $AppName `
    --resource-group  $ResourceGroup `
    --startup-file    "npm start" | Out-Null

OK "Settings applied"

# ── Restart ───────────────────────────────────────────────────────────────────
Step "Restarting app"
az webapp restart --name $AppName --resource-group $ResourceGroup | Out-Null
OK "App restarted"

# ── Done ──────────────────────────────────────────────────────────────────────
$url = "https://$AppName.azurewebsites.net"
Write-Host ""
Write-Host "  Deployment complete!" -ForegroundColor Green
Write-Host "  URL: $url" -ForegroundColor White
Write-Host ""
Write-Host "  First load may take 30-60 seconds (cold start on free/B1)." -ForegroundColor Gray
Write-Host ""
Write-Host "  Useful commands:" -ForegroundColor Gray
Write-Host "    az webapp log tail --name $AppName --resource-group $ResourceGroup"
Write-Host "    az webapp restart  --name $AppName --resource-group $ResourceGroup"
Write-Host "    az webapp delete   --name $AppName --resource-group $ResourceGroup"
Write-Host ""

Start-Process $url
