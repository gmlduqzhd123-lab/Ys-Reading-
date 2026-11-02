param([Parameter(Mandatory=$true)][string]$NodePath,[Parameter(Mandatory=$true)][string]$CodexPath)
$ErrorActionPreference='Stop'
$taskStatus=Join-Path $env:LOCALAPPDATA 'Bookforest/OperatorBackups/rbtqtkjnqtcnljvabisa/scheduled-status.json'
[IO.File]::WriteAllText($taskStatus,'{"ok":false,"status":"starting"}')
$taskRunner=Join-Path $PSScriptRoot 'operator-scheduled.mjs'
$taskRun=Start-Process -FilePath $NodePath -ArgumentList @('"'+$taskRunner+'"','--codex="'+$CodexPath+'"') -WorkingDirectory (Split-Path -Parent $PSScriptRoot) -WindowStyle Hidden -Wait -PassThru
exit $taskRun.ExitCode
