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
$taskTick=New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 15)
$taskTriggers=@($taskTick,(New-ScheduledTaskTrigger -Daily -At '19:00'),(New-ScheduledTaskTrigger -AtLogOn -User $taskIdentity))
$taskSettings=New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 30) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
$taskPrincipal=New-ScheduledTaskPrincipal -UserId $taskIdentity -LogonType Interactive -RunLevel Limited
$existing=Get-ScheduledTask -TaskName 'Bookforest-Operator-Backup' -TaskPath '\Bookforest\' -ErrorAction SilentlyContinue
if($existing -and !$existing.Actions.Arguments.StartsWith($taskPrefix) -and !$existing.Actions.Arguments.StartsWith('"'+$taskRunner+'"') -and !$existing.Actions.Arguments.StartsWith($taskVbsPrefix)){throw 'Existing backup task points to another checkout. Review before replacing.'}
Register-ScheduledTask -TaskName 'Bookforest-Operator-Backup' -TaskPath '\Bookforest\' -Action $taskAction -Trigger $taskTriggers -Settings $taskSettings -Principal $taskPrincipal -Description 'Bookforest 15-minute backup agent, hourly MCP auth probe, daily encrypted backup and isolated restore verification. Runs as the signed-in operator only.' -Force | Out-Null
Write-Output 'Bookforest agent checks every 15 minutes, probes MCP hourly, and backs up daily at 19:00 with catch-up after logon/recovery. No Windows password was stored.'
