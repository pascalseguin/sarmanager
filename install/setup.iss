#define AppName      "SAR Manager"
#define AppVersion   "1.0.0"
#define AppPublisher "Southeastern Alberta Search and Rescue"
#define TaskName     "SARManager"
#define DefaultPort  "3000"

[Setup]
AppId={{8A4F2D1B-3C7E-4F9A-B2D6-1E8F5A3C7D9B}
AppName={#AppName}
AppVersion={#AppVersion}
AppVerName={#AppName} {#AppVersion}
AppPublisher={#AppPublisher}
DefaultDirName={autopf}\SAR Manager
DefaultGroupName=SAR Manager
AllowNoIcons=yes
LicenseFile=..\LICENSE
OutputDir=..\dist
OutputBaseFilename=SAR Manager Setup
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=admin
UsedUserAreasWarning=no
MinVersion=10.0
SetupLogging=yes
CloseApplications=yes
UninstallDisplayName={#AppName}
UninstallDisplayIcon={app}\server\node_modules\.bin\node.exe

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[CustomMessages]
english.NodeMissing=Node.js 20 or later is required but was not found on this computer.%n%nThe installer will now download and install Node.js LTS. An internet connection is required.%n%nClick OK to continue.
english.NodeInstallFailed=Node.js installation failed or timed out. Please install Node.js 20 LTS manually from https://nodejs.org and then re-run this installer.
english.TaskRegFailed=The startup task could not be registered. SAR Manager was installed but will not start automatically. You can register it manually by running register-task.ps1 in the install folder as Administrator.

[Tasks]
Name: "desktopicon"; Description: "Create a desktop shortcut"; GroupDescription: "Options:"

[Files]
; Pre-built Next.js standalone server -- produced by build-installer.ps1
Source: "..\dist\server\*"; DestDir: "{app}\server"; Flags: recursesubdirs createallsubdirs ignoreversion

; Task registration script -- called after install with mode + port args
Source: "register-task.ps1"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{group}\SAR Manager";           Filename: "wscript.exe"; Parameters: "//nologo ""{app}\launch.vbs"""; WorkingDir: "{app}"
Name: "{group}\Uninstall SAR Manager"; Filename: "{uninstallexe}"
Name: "{userdesktop}\SAR Manager";     Filename: "wscript.exe"; Parameters: "//nologo ""{app}\launch.vbs"""; WorkingDir: "{app}"; Tasks: desktopicon

[UninstallRun]
Filename: "powershell.exe"; \
  Parameters: "-NonInteractive -ExecutionPolicy Bypass -Command ""Stop-ScheduledTask -TaskName '{#TaskName}' -EA SilentlyContinue; Unregister-ScheduledTask -TaskName '{#TaskName}' -Confirm:$false -EA SilentlyContinue; netsh advfirewall firewall delete rule name='SAR Manager' | Out-Null"""; \
  Flags: runhidden; RunOnceId: "RemoveTask"

[Code]

// ── Custom wizard pages ──────────────────────────────────────────────────────

var
  ModePage: TInputOptionWizardPage;
  PortPage: TInputQueryWizardPage;

procedure InitializeWizard;
begin
  // Page 1 of custom: installation mode
  ModePage := CreateInputOptionPage(wpLicense,
    'Installation Mode',
    'How will SAR Manager be used on this computer?',
    'Choose the mode that fits your setup. You can re-run the installer to change this later.',
    True, False);
  ModePage.Add(
    'Client  —  starts when you log in, opens the browser on this machine');
  ModePage.Add(
    'Server  —  starts at boot, accessible from any device on the network (requires network access)');
  ModePage.Values[0] := True;

  // Page 2 of custom: port
  PortPage := CreateInputQueryPage(ModePage.ID,
    'Network Port',
    'Which port should SAR Manager listen on?',
    'Leave this as 3000 unless another application is already using that port.');
  PortPage.Add('Port:', False);
  PortPage.Values[0] := '{#DefaultPort}';
end;

// ── Helpers ──────────────────────────────────────────────────────────────────

function GetMode(Param: String): String;
begin
  if ModePage.Values[0] then Result := 'client' else Result := 'server';
end;

function GetPort(Param: String): String;
begin
  Result := PortPage.Values[0];
  if Result = '' then Result := '{#DefaultPort}';
end;

// ── Validation ───────────────────────────────────────────────────────────────

function NextButtonClick(CurPageID: Integer): Boolean;
var
  Port: Integer;
begin
  Result := True;
  if CurPageID = PortPage.ID then
  begin
    Port := StrToIntDef(PortPage.Values[0], 0);
    if (Port < 1024) or (Port > 65535) then
    begin
      MsgBox('Please enter a valid port number between 1024 and 65535.', mbError, MB_OK);
      Result := False;
    end;
  end;
end;

// ── Node.js check & install ──────────────────────────────────────────────────

function NodeVersionOK: Boolean;
var
  ResultCode: Integer;
begin
  Result := False;
  if Exec('powershell.exe',
    '-NonInteractive -Command "try { $v = (node --version 2>$null) -replace ''v'','''' ; if ([int]($v.Split(''.'')[0]) -ge 20) { exit 0 } else { exit 1 } } catch { exit 1 }"',
    '', SW_HIDE, ewWaitUntilTerminated, ResultCode) then
    Result := (ResultCode = 0);
end;

function InstallNode: Boolean;
var
  ResultCode: Integer;
begin
  // Try winget first (available on Windows 10 1809+ / Windows 11)
  Result := Exec('winget',
    'install OpenJS.NodeJS.LTS --silent --accept-source-agreements --accept-package-agreements',
    '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  Result := Result and (ResultCode = 0);
end;

function PrepareToInstall(var NeedsRestart: Boolean): String;
begin
  Result := '';
  NeedsRestart := False;
  if not NodeVersionOK then
  begin
    MsgBox(CustomMessage('NodeMissing'), mbInformation, MB_OK);
    if not InstallNode then
    begin
      Result := CustomMessage('NodeInstallFailed');
    end;
  end;
end;

// ── Post-install: register scheduled task ────────────────────────────────────

procedure CurStepChanged(CurStep: TSetupStep);
var
  ResultCode: Integer;
  ScriptPath: String;
  Params: String;
begin
  if CurStep = ssPostInstall then
  begin
    ScriptPath := ExpandConstant('{app}') + '\register-task.ps1';
    Params := '-NonInteractive -ExecutionPolicy Bypass -File "' + ScriptPath + '"'
            + ' -Mode '   + GetMode('')
            + ' -Port '   + GetPort('')
            + ' -AppDir "' + ExpandConstant('{app}') + '"';

    if not Exec('powershell.exe', Params, '', SW_HIDE, ewWaitUntilTerminated, ResultCode) or
       (ResultCode <> 0) then
      MsgBox(CustomMessage('TaskRegFailed'), mbError, MB_OK);
  end;
end;
