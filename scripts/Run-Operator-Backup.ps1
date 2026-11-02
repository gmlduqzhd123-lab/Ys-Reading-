$ErrorActionPreference='Stop'
$taskRepo=Split-Path -Parent $PSScriptRoot
$taskNode=(Get-Command node.exe -ErrorAction Stop).Source
$taskLog=Join-Path $env:LOCALAPPDATA 'Bookforest/OperatorBackups/rbtqtkjnqtcnljvabisa/scheduled-status.json'
Push-Location -LiteralPath $taskRepo
try { & $taskNode (Join-Path $PSScriptRoot 'operator-backup.mjs') *> $taskLog; exit $LASTEXITCODE } finally { Pop-Location }
