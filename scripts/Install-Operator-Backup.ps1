$ErrorActionPreference='Stop'
$taskScript=Join-Path $PSScriptRoot 'Run-Operator-Backup.ps1'
$taskRunner=(Resolve-Path -LiteralPath (Join-Path $PSScriptRoot 'operator-scheduled.mjs')).Path
$watchdogRunner=(Resolve-Path -LiteralPath (Join-Path $PSScriptRoot 'operator-watchdog.mjs')).Path
$taskVbs=Join-Path $PSScriptRoot 'Run-Operator-Backup.vbs'
$taskIdentity=[Security.Principal.WindowsIdentity]::GetCurrent().Name
$taskNode=(Get-Command node.exe -ErrorAction Stop).Source
$taskPrefix='-NoProfile -NonInteractive -WindowStyle Hidden -File "'+$taskScript+'"'
$taskVbsPrefix='//B //NoLogo "'+$taskVbs+'"'
$taskLauncherDirectory=Join-Path $env:USERPROFILE 'Documents/Bookforest-OperatorBackups/rbtqtkjnqtcnljvabisa/launchers'
$taskNativeArguments='"'+$taskNode+'" "'+$taskRunner+'"'
$existing=Get-ScheduledTask -TaskName 'Bookforest-Operator-Backup' -TaskPath '\Bookforest\' -ErrorAction SilentlyContinue
$sameNative=$existing -and $existing.Actions.Execute.StartsWith($taskLauncherDirectory+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase) -and $existing.Actions.Arguments.EndsWith('" "'+$taskRunner+'"',[StringComparison]::OrdinalIgnoreCase)
if($existing -and !$sameNative -and !$existing.Actions.Arguments.StartsWith($taskPrefix) -and !$existing.Actions.Arguments.StartsWith('"'+$taskRunner+'"') -and !$existing.Actions.Arguments.StartsWith($taskVbsPrefix)){throw 'Existing backup task points to another checkout. Review before replacing.'}
if($existing -and $existing.State -eq 'Running'){throw 'Wait for the running backup before reinstalling its task.'}
$existingWatchdog=Get-ScheduledTask -TaskName 'Bookforest-Backup-Watchdog' -TaskPath '\Bookforest\' -ErrorAction SilentlyContinue
if($existingWatchdog -and (!$existingWatchdog.Actions.Execute.StartsWith($taskLauncherDirectory+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase) -or !$existingWatchdog.Actions.Arguments.EndsWith('" "'+$watchdogRunner+'"',[StringComparison]::OrdinalIgnoreCase))){throw 'Existing watchdog belongs to another checkout. Review before replacing.'}
if($existingWatchdog -and $existingWatchdog.State -eq 'Running'){throw 'Wait for the running watchdog before reinstalling its task.'}
# The operator-only vault is provisioned by enrollment. Compile reviewed local
# source as a GUI executable, without a console or any execution-policy bypass.
if(!(Test-Path -LiteralPath (Split-Path -Parent $taskLauncherDirectory) -PathType Container)){throw 'Enroll the backup agent before installing its task.'}
$null=New-Item -ItemType Directory -Path $taskLauncherDirectory -Force
$taskLauncher=Join-Path $taskLauncherDirectory ('Bookforest-Backup-Launcher-'+[Guid]::NewGuid().ToString('N')+'.exe')
Add-Type -Path (Join-Path $PSScriptRoot 'Run-Operator-Backup.cs') -OutputAssembly $taskLauncher -OutputType WindowsApplication
$taskAction=New-ScheduledTaskAction -Execute $taskLauncher -Argument $taskNativeArguments -WorkingDirectory (Split-Path -Parent $PSScriptRoot)
$taskTick=New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 15)
$taskTriggers=@($taskTick,(New-ScheduledTaskTrigger -Daily -At '19:00'),(New-ScheduledTaskTrigger -AtLogOn -User $taskIdentity))
$taskSettings=New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 30) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
$taskPrincipal=New-ScheduledTaskPrincipal -UserId $taskIdentity -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName 'Bookforest-Operator-Backup' -TaskPath '\Bookforest\' -Action $taskAction -Trigger $taskTriggers -Settings $taskSettings -Principal $taskPrincipal -Description 'Bookforest 15-minute backup agent, hourly MCP auth probe, daily encrypted backup and isolated restore verification. Runs as the signed-in operator only.' -Force | Out-Null
$watchdogAction=New-ScheduledTaskAction -Execute $taskLauncher -Argument ('"'+$taskNode+'" "'+$watchdogRunner+'"') -WorkingDirectory (Split-Path -Parent $PSScriptRoot)
$watchdogTriggers=@((New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(3) -RepetitionInterval (New-TimeSpan -Minutes 15)),(New-ScheduledTaskTrigger -AtLogOn -User $taskIdentity))
$watchdogSettings=New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 5) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
Register-ScheduledTask -TaskName 'Bookforest-Backup-Watchdog' -TaskPath '\Bookforest\' -Action $watchdogAction -Trigger $watchdogTriggers -Settings $watchdogSettings -Principal $taskPrincipal -Description 'Bookforest independent 15-minute MCP permission and primary-task watchdog. Reports faults through the signed channel; never fabricates backup success.' -Force | Out-Null
$installation=@{format='bookforest-watchdog-installation';version=1;installedAt=[DateTime]::UtcNow.ToString('o')}
[IO.File]::WriteAllText((Join-Path (Split-Path -Parent $taskLauncherDirectory) 'watchdog-installation.json'),($installation|ConvertTo-Json -Compress))
Write-Output 'Bookforest backup and independent watchdog installed. MCP access and task health are checked every 15 minutes. Daily encrypted backup at 19:00 and catch-up after logon/recovery. No Windows password was stored.'
