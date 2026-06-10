
#Requires -RunAsAdministrator
<#
.SYNOPSIS
    SAR Manager -- Scheduled Task Registration
    Called by the Inno Setup installer after files are copied.
#>

param(
    [ValidateSet('client','server')]
    [string]$Mode    = 'client',
    [int]   $Port    = 3000,
    [string]$AppDir  = 'C:\Program Files\SAR Manager'
)

$ErrorActionPreference = 'Stop'
$TaskName   = 'SARManager'
$ServerDir  = Join-Path $AppDir 'server'

# Find node.exe
$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
$nodeExe = if ($nodeCmd) { $nodeCmd.Source } else { $null }
if (-not $nodeExe) {
    foreach ($p in @("$env:ProgramFiles\nodejs", "$env:ProgramW6432\nodejs")) {
        if (Test-Path "$p\node.exe") { $nodeExe = "$p\node.exe"; break }
    }
}
if (-not $nodeExe) {
    Write-Error "node.exe not found -- install Node.js 20+ from nodejs.org"
    exit 1
}

# Write start-silent.vbs -- runs node.exe without a visible console window
$silentVbs = @'
Dim port, nodeExe, serverDir
port      = WScript.Arguments(0)
nodeExe   = WScript.Arguments(1)
serverDir = WScript.Arguments(2)
Set shell = CreateObject("WScript.Shell")
shell.Environment("Process")("PORT") = port
shell.CurrentDirectory = serverDir
shell.Run """" & nodeExe & """ server.js", 0, False
'@
Set-Content (Join-Path $AppDir 'start-silent.vbs') $silentVbs -Encoding ASCII

# Write launch.vbs -- desktop shortcut target: starts the task then polls until ready
$launchVbs = @"
Dim port, url, shell, http, ready, i
port = $Port
url  = "http://localhost:" & port
Set shell = CreateObject("WScript.Shell")
Set http  = CreateObject("MSXML2.XMLHTTP")

' Ensure the scheduled task is running
shell.Run "powershell.exe -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -Command ""Start-ScheduledTask -TaskName 'SARManager' -ErrorAction SilentlyContinue""", 0, True

' Poll until the server responds (up to 30 seconds)
ready = False
For i = 1 To 30
    On Error Resume Next
    http.Open "GET", url, False
    http.Send
    If Err.Number = 0 And http.Status >= 100 Then
        ready = True
        Exit For
    End If
    On Error GoTo 0
    WScript.Sleep 1000
Next

shell.Run url
"@
Set-Content (Join-Path $AppDir 'launch.vbs') $launchVbs -Encoding ASCII

# Remove any previous task
Stop-ScheduledTask       -TaskName $TaskName -ErrorAction SilentlyContinue
Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue

$silentVbsPath = Join-Path $AppDir 'start-silent.vbs'
$action = New-ScheduledTaskAction `
    -Execute  'wscript.exe' `
    -Argument "//nologo ""$silentVbsPath"" ""$Port"" ""$nodeExe"" ""$ServerDir"""

$settings = New-ScheduledTaskSettingsSet `
    -ExecutionTimeLimit (New-TimeSpan -Hours 0) `
    -RestartCount 3 `
    -RestartInterval (New-TimeSpan -Minutes 1)

if ($Mode -eq 'server') {
    $trigger   = New-ScheduledTaskTrigger -AtStartup
    $principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
    Register-ScheduledTask -TaskName $TaskName `
        -Action $action -Trigger $trigger `
        -Principal $principal -Settings $settings -Force | Out-Null

    $fwName = "SAR Manager Port $Port"
    netsh advfirewall firewall delete rule name="$fwName" | Out-Null
    netsh advfirewall firewall add rule `
        name="$fwName" dir=in action=allow protocol=TCP localport=$Port | Out-Null
} else {
    $trigger = New-ScheduledTaskTrigger -AtLogon -User $env:USERNAME
    Register-ScheduledTask -TaskName $TaskName `
        -Action $action -Trigger $trigger `
        -RunLevel Highest -Settings $settings -Force | Out-Null
}

Start-ScheduledTask -TaskName $TaskName
Write-Output "Task registered and started (mode=$Mode port=$Port)"
