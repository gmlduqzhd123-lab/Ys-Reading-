$ErrorActionPreference='Stop'
$taskScript=(Resolve-Path -LiteralPath (Join-Path $PSScriptRoot 'Run-Operator-Backup.ps1')).Path
$taskIdentity=[Security.Principal.WindowsIdentity]::GetCurrent().Name
$taskAction=New-ScheduledTaskAction -Execute (Join-Path $env:WINDIR 'System32/WindowsPowerShell/v1.0/powershell.exe') -Argument ('-NoProfile -NonInteractive -WindowStyle Hidden -File "'+$taskScript+'"')
$taskTriggers=@((New-ScheduledTaskTrigger -Daily -At '19:00'),(New-ScheduledTaskTrigger -AtLogOn -User $taskIdentity))
$taskSettings=New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 30) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
$taskPrincipal=New-ScheduledTaskPrincipal -UserId $taskIdentity -LogonType Interactive -RunLevel Limited
$existing=Get-ScheduledTask -TaskName 'Bookforest-Operator-Backup' -TaskPath '\Bookforest\' -ErrorAction SilentlyContinue
if($existing -and $existing.Actions.Arguments -ne $taskAction.Arguments){throw 'Existing backup task points to another checkout. Review before replacing.'}
Register-ScheduledTask -TaskName 'Bookforest-Operator-Backup' -TaskPath '\Bookforest\' -Action $taskAction -Trigger $taskTriggers -Settings $taskSettings -Principal $taskPrincipal -Description 'Bookforest encrypted daily backup and isolated restore verification. Runs as the signed-in operator only.' -Force | Out-Null
Write-Output 'Bookforest backup scheduled daily at 19:00 and at operator logon. No Windows password was stored.'
