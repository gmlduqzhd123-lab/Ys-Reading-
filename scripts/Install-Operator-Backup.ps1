$ErrorActionPreference='Stop'
$taskScript=Join-Path $PSScriptRoot 'Run-Operator-Backup.ps1'
$taskRunner=(Resolve-Path -LiteralPath (Join-Path $PSScriptRoot 'operator-scheduled.mjs')).Path
$taskVbs=(Resolve-Path -LiteralPath (Join-Path $PSScriptRoot 'Run-Operator-Backup.vbs')).Path
$taskIdentity=[Security.Principal.WindowsIdentity]::GetCurrent().Name
$taskNode=(Get-Command node.exe -ErrorAction Stop).Source
$null=Get-Command codex.exe -ErrorAction Stop
$taskPrefix='-NoProfile -NonInteractive -WindowStyle Hidden -File "'+$taskScript+'"'
$taskVbsPrefix='//B //NoLogo "'+$taskVbs+'"'
$taskAction=New-ScheduledTaskAction -Execute (Join-Path $env:WINDIR 'System32/wscript.exe') -Argument ($taskVbsPrefix+' "'+$taskNode+'"') -WorkingDirectory (Split-Path -Parent $PSScriptRoot)
$taskTriggers=@((New-ScheduledTaskTrigger -Daily -At '19:00'),(New-ScheduledTaskTrigger -AtLogOn -User $taskIdentity))
$taskSettings=New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 30) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
$taskPrincipal=New-ScheduledTaskPrincipal -UserId $taskIdentity -LogonType Interactive -RunLevel Limited
$existing=Get-ScheduledTask -TaskName 'Bookforest-Operator-Backup' -TaskPath '\Bookforest\' -ErrorAction SilentlyContinue
if($existing -and !$existing.Actions.Arguments.StartsWith($taskPrefix) -and !$existing.Actions.Arguments.StartsWith('"'+$taskRunner+'"') -and !$existing.Actions.Arguments.StartsWith($taskVbsPrefix)){throw 'Existing backup task points to another checkout. Review before replacing.'}
Register-ScheduledTask -TaskName 'Bookforest-Operator-Backup' -TaskPath '\Bookforest\' -Action $taskAction -Trigger $taskTriggers -Settings $taskSettings -Principal $taskPrincipal -Description 'Bookforest encrypted daily backup and isolated restore verification. Runs as the signed-in operator only.' -Force | Out-Null
Write-Output 'Bookforest backup scheduled daily at 19:00 and at operator logon. No Windows password was stored.'
