$ErrorActionPreference='Stop'
$testTempBase=[IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd([IO.Path]::DirectorySeparatorChar)+[IO.Path]::DirectorySeparatorChar
$testRoot=Join-Path $testTempBase ('Bookforest Launcher Test '+[Guid]::NewGuid().ToString('N'))
try {
  $null=New-Item -ItemType Directory -Path $testRoot
  $testLauncher=Join-Path $testRoot 'backup launcher.exe'
  Add-Type -Path (Join-Path $PSScriptRoot '../scripts/Run-Operator-Backup.cs') -OutputAssembly $testLauncher -OutputType WindowsApplication
  $testBytes=[IO.File]::ReadAllBytes($testLauncher)
  $testPeOffset=[BitConverter]::ToInt32($testBytes,0x3c)
  if([BitConverter]::ToUInt16($testBytes,$testPeOffset+0x5c) -ne 2){throw 'LAUNCHER_MUST_HAVE_NO_CONSOLE'}
  $testNode=(Get-Command node.exe -ErrorAction Stop).Source
  function Invoke-TestLauncher([string]$node,[string]$runner) {
    $testStart=New-Object Diagnostics.ProcessStartInfo
    $testStart.FileName=$testLauncher
    $testStart.Arguments='"'+$node+'" "'+$runner+'"'
    $testStart.UseShellExecute=$false
    $testStart.CreateNoWindow=$true
    $testStart.RedirectStandardOutput=$true
    $testStart.RedirectStandardError=$true
    $testProcess=New-Object Diagnostics.Process
    $testProcess.StartInfo=$testStart
    try {
      if(!$testProcess.Start()){throw 'TEST_LAUNCH_FAILED'}
      $stdout=$testProcess.StandardOutput.ReadToEndAsync()
      $stderr=$testProcess.StandardError.ReadToEndAsync()
      if(!$testProcess.WaitForExit(15000)){$testProcess.Kill();throw 'LAUNCHER_STREAM_DEADLOCK'}
      if($stdout.Result.Length -gt 0 -or $stderr.Result.Length -gt 0){throw 'CHILD_OUTPUT_MUST_NOT_BE_EXPOSED'}
      return $testProcess.ExitCode
    } finally {$testProcess.Dispose()}
  }
  $testScripts=Join-Path $testRoot 'path with spaces/scripts'
  $null=New-Item -ItemType Directory -Path $testScripts -Force
  $testRunner=Join-Path $testScripts 'operator-scheduled.mjs'
  [IO.File]::WriteAllText($testRunner,'process.stdout.write("fixture-output".repeat(40000));process.stderr.write("fixture-error".repeat(40000));process.exitCode=7;')
  if((Invoke-TestLauncher $testNode $testRunner) -ne 7){throw 'CHILD_FAILURE_NOT_PROPAGATED'}
  [IO.File]::WriteAllText($testRunner,'process.exitCode=0;')
  if((Invoke-TestLauncher $testNode $testRunner) -ne 0){throw 'CHILD_SUCCESS_NOT_PROPAGATED'}
  if((Invoke-TestLauncher (Join-Path $testRoot 'missing/node.exe') $testRunner) -ne 1){throw 'MISSING_RUNTIME_ACCEPTED'}
  if((Invoke-TestLauncher $testNode 'operator-scheduled.mjs') -ne 1){throw 'RELATIVE_RUNNER_ACCEPTED'}
  $testWatchdog=Join-Path $testScripts 'operator-watchdog.mjs'
  [IO.File]::WriteAllText($testWatchdog,'process.stderr.write("private-fixture".repeat(40000));process.exitCode=9;')
  if((Invoke-TestLauncher $testNode $testWatchdog) -ne 9){throw 'WATCHDOG_FAILURE_NOT_PROPAGATED'}
  [IO.File]::WriteAllText($testWatchdog,'process.exitCode=0;')
  if((Invoke-TestLauncher $testNode $testWatchdog) -ne 0){throw 'WATCHDOG_SUCCESS_NOT_PROPAGATED'}
  $testArbitrary=Join-Path $testScripts 'other.mjs'
  [IO.File]::WriteAllText($testArbitrary,'process.exitCode=0;')
  if((Invoke-TestLauncher $testNode $testArbitrary) -ne 1){throw 'UNREVIEWED_RUNNER_ACCEPTED'}
  Write-Output '{"passed":true,"checks":8,"consoleFree":true,"exitCodesPreserved":true,"largeStreamsDrainedWithoutDisclosure":true,"pathsWithSpaces":true,"watchdogAllowed":true,"arbitraryRunnerRejected":true}'
} finally {
  if(Test-Path -LiteralPath $testRoot){
    $testResolved=(Resolve-Path -LiteralPath $testRoot).Path
    if(!$testResolved.StartsWith($testTempBase,[StringComparison]::OrdinalIgnoreCase) -or ![IO.Path]::GetFileName($testResolved).StartsWith('Bookforest Launcher Test ')){throw 'TEST_CLEANUP_SCOPE_INVALID'}
    Remove-Item -LiteralPath $testResolved -Recurse -Force
  }
}
