$ErrorActionPreference='Stop'
$taskScript=Join-Path $PSScriptRoot 'Run-Operator-Backup.ps1'
$taskRunner=(Resolve-Path -LiteralPath (Join-Path $PSScriptRoot 'operator-scheduled.mjs')).Path
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
Write-Output 'Bookforest agent checks every 15 minutes, probes MCP hourly, and backs up daily at 19:00 with catch-up after logon/recovery. No Windows password was stored.'
