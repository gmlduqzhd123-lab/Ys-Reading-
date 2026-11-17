param([ValidateSet('backup','watchdog')][string]$TaskRole='backup',[Parameter(Mandatory=$true)][string]$Repo,[Parameter(Mandatory=$true)][string]$NodePath)
$ErrorActionPreference='Stop'
try {
  $taskName=if($TaskRole -eq 'backup'){'Bookforest-Operator-Backup'}else{'Bookforest-Backup-Watchdog'}
  try {$task=Get-ScheduledTask -TaskPath '\Bookforest\' -TaskName $taskName -ErrorAction Stop}
  catch {
    if($_.CategoryInfo.Category -eq 'ObjectNotFound' -or $_.Exception.HResult -eq -2147024894){Write-Output '{"exists":false}';exit 0}
    throw
  }
  $info=$task|Get-ScheduledTaskInfo
  $runner=Join-Path ([IO.Path]::GetFullPath($Repo)) ('scripts/'+$(if($TaskRole -eq 'backup'){'operator-scheduled.mjs'}else{'operator-watchdog.mjs'}))
  $arguments='"'+$NodePath+'" "'+$runner+'"'
  $launcherRoot=Join-Path $env:USERPROFILE 'Documents/Bookforest-OperatorBackups/rbtqtkjnqtcnljvabisa/launchers'
  $configured=@($task.Actions).Count -eq 1
  if($configured){
    $configured=$task.Actions.Execute.StartsWith($launcherRoot+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase) -and (Test-Path -LiteralPath $task.Actions.Execute -PathType Leaf) -and $task.Actions.Arguments.Equals($arguments,[StringComparison]::OrdinalIgnoreCase)
  }
  if($configured){
    $bytes=[IO.File]::ReadAllBytes($task.Actions.Execute);$pe=[BitConverter]::ToInt32($bytes,0x3c)
    $configured=[BitConverter]::ToUInt16($bytes,$pe+0x5c) -eq 2
  }
  $identity=New-Object Security.Principal.NTAccount($task.Principal.UserId)
  $configured=$configured -and $identity.Translate([Security.Principal.SecurityIdentifier]).Value -eq [Security.Principal.WindowsIdentity]::GetCurrent().User.Value -and $task.Principal.LogonType.ToString() -eq 'Interactive'
  [pscustomobject]@{exists=$true;enabled=[bool]$task.Settings.Enabled;configured=[bool]$configured;state=$task.State.ToString();result=[long]$info.LastTaskResult;lastRun=$info.LastRunTime.ToUniversalTime().ToString('o');nextRun=$info.NextRunTime.ToUniversalTime().ToString('o')}|ConvertTo-Json -Compress
} catch {Write-Output '{"inspectionFailed":true}';exit 1}
