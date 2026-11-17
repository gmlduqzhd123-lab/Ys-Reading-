param([string]$NodePath,[string]$CodexPath)
$ErrorActionPreference='Stop'
$taskStatus=Join-Path $env:USERPROFILE 'Documents/Bookforest-OperatorBackups/rbtqtkjnqtcnljvabisa/scheduled-status.json'
function Write-TaskStatus([string]$status,[string]$code) {
  $value=@{ok=$false;status=$status;checkedAt=[DateTime]::UtcNow.ToString('o');code=$code}
  [IO.File]::WriteAllText($taskStatus,($value|ConvertTo-Json -Compress))
}
try {
  # This directory is provisioned with an operator-only ACL by Install-Operator-Backup.
  if(!(Test-Path -LiteralPath (Split-Path -Parent $taskStatus))){throw 'BACKUP_VAULT_UNAVAILABLE'}
  Write-TaskStatus 'starting' ''
  $nodeCommand=Get-Command node.exe -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
  $nodeCandidates=@($nodeCommand.Source,$NodePath,(Join-Path $env:ProgramFiles 'nodejs/node.exe'))
  $NodePath=$nodeCandidates | Where-Object {$_ -and (Test-Path -LiteralPath $_ -PathType Leaf)} | Select-Object -First 1
  if(!$NodePath){throw 'BACKUP_NODE_UNAVAILABLE'}
  # Keep CodexPath as a legacy parameter. The Node runner resolves the current
  # desktop/Store installation through backup-runtime.mjs, including updates
  # and packaged installs, instead of trusting a stale versioned task path.
  $taskRunner=Join-Path $PSScriptRoot 'operator-scheduled.mjs'
  $taskRun=Start-Process -FilePath $NodePath -ArgumentList @('"'+$taskRunner+'"') -WorkingDirectory (Split-Path -Parent $PSScriptRoot) -WindowStyle Hidden -Wait -PassThru
  exit $taskRun.ExitCode
} catch {
  $taskCode=if($_.Exception.Message -match '^BACKUP_[A-Z_]+$'){$_.Exception.Message}else{'BACKUP_LAUNCH_FAILED'}
  try {Write-TaskStatus 'failed' $taskCode} catch {}
  exit 1
}
