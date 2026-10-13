$ErrorActionPreference = 'Stop'
$taskRoot = Join-Path (Get-Location) 'docs/ai-runs/stage3-hunter-acd-combat-001'
$taskBudgetPath = Join-Path $taskRoot 'budget.json'
$taskBudget = if (Test-Path -LiteralPath $taskBudgetPath) { Get-Content $taskBudgetPath -Raw | ConvertFrom-Json } else { [pscustomobject]@{ attempts=0; elapsedMs=0 } }
if ($taskBudget.attempts -ge 2 -or $taskBudget.elapsedMs -ge 600000) { throw 'Combat evaluation attempt/time budget exhausted.' }
$taskNative = Get-Content 'src/test/stage3CurrentRulesCpu.ps1' -Raw
$taskBegin = $taskNative.IndexOf('Add-Type -TypeDefinition')
$taskEnd = $taskNative.IndexOf('$taskRecord = [ordered]')
. ([ScriptBlock]::Create($taskNative.Substring($taskBegin, $taskEnd - $taskBegin)))
$taskBudget.attempts++
[IO.File]::WriteAllText($taskBudgetPath, ($taskBudget | ConvertTo-Json), [Text.UTF8Encoding]::new($false))
$taskRecord = [ordered]@{ status='incomplete'; attempt=$taskBudget.attempts; startedAtUtc=[DateTime]::UtcNow.ToString('o'); endedAtUtc=$null; elapsedMs=0; errors=@(); samples=@(); events=@(); sleepGuardReleased=$false }
$taskProcess = $null
$taskGuard = $false
$taskClock = [Diagnostics.Stopwatch]::StartNew()
$taskStart = [DateTime]::UtcNow
$taskRemaining = 600000 - $taskBudget.elapsedMs
try {
  $taskRecord.plan = (& powercfg /getactivescheme | Out-String).Trim()
  if ([Stage3CurrentRulesPower]::SetThreadExecutionState([uint32]2147483649) -eq 0) { throw 'Temporary sleep prevention unavailable' }
  $taskGuard = $true
  $env:RUN_HUNTER_ACD_EVAL = '1'
  $env:AI_EVAL_DEADLINE = [DateTimeOffset]::UtcNow.AddMilliseconds($taskRemaining).ToUnixTimeMilliseconds().ToString()
  $taskProcess = [Diagnostics.Process]::new()
  $taskProcess.StartInfo.FileName = (Get-Command node).Source
  $taskProcess.StartInfo.Arguments = 'node_modules/vitest/vitest.mjs run src/hooks/ai/hunterACD.evaluation.test.tsx --pool=threads --maxWorkers=1 --minWorkers=1 --no-file-parallelism'
  $taskProcess.StartInfo.WorkingDirectory = (Get-Location).Path
  $taskProcess.StartInfo.UseShellExecute = $false
  $taskProcess.StartInfo.CreateNoWindow = $true
  $taskProcess.StartInfo.RedirectStandardOutput = $true
  $taskProcess.StartInfo.RedirectStandardError = $true
  if (-not $taskProcess.Start()) { throw 'Evaluation worker failed to launch' }
  $taskOut = $taskProcess.StandardOutput.ReadToEndAsync()
  $taskErr = $taskProcess.StandardError.ReadToEndAsync()
  $taskLastPulse = [DateTime]::UtcNow
  $taskTimes = Get-TaskTimes
  $taskNextSample = 0
  $taskNextProgress = 20000
  while (-not $taskProcess.HasExited) {
    if ($taskClock.ElapsedMilliseconds -ge $taskRemaining -or ([DateTime]::UtcNow - $taskStart).TotalMilliseconds -ge $taskRemaining) { throw '10 minute cumulative worker time limit reached' }
    [void]$taskProcess.WaitForExit(500)
    $taskNow = [DateTime]::UtcNow
    if (($taskNow - $taskLastPulse).TotalMilliseconds -gt 3000) { throw 'Execution interruption/sleep suspected; preserve completed checkpoints' }
    $taskLastPulse = $taskNow
    if ($taskClock.ElapsedMilliseconds -ge $taskNextSample) {
      $taskPower = Get-TaskPower
      $taskTimesNext = Get-TaskTimes
      $taskTotal = ($taskTimesNext[1]-$taskTimes[1])+($taskTimesNext[2]-$taskTimes[2])
      $taskBusy = if ($taskTotal -gt 0) { 100*(1-($taskTimesNext[0]-$taskTimes[0])/$taskTotal) } else { $null }
      $taskRecord.samples += @{ utc=$taskNow.ToString('o'); ac=$taskPower.ACLineStatus; saver=$taskPower.SystemStatusFlag; systemBusyIncludingWorkerPercent=$taskBusy }
      $taskTimes = $taskTimesNext
      $taskNextSample = $taskClock.ElapsedMilliseconds + 5000
    }
    if ($taskClock.ElapsedMilliseconds -ge $taskNextProgress) {
      $taskCount = 0
      Get-ChildItem -LiteralPath $taskRoot -Recurse -Filter 'games.jsonl' | ForEach-Object { $taskCount += @(Get-Content -LiteralPath $_.FullName | Where-Object { $_.Trim() }).Count }
      Write-Output "Completed checkpoint rows: $taskCount/60; worker elapsed $([Math]::Round($taskClock.Elapsed.TotalSeconds,1))s"
      $taskNextProgress = $taskClock.ElapsedMilliseconds + 20000
    }
  }
  $taskRecord.exitCode = $taskProcess.ExitCode
  if ($taskProcess.ExitCode -ne 0) { throw 'Evaluation worker failed; inspect logs before any permitted resume' }
  $taskEventErrors = @()
  $taskEvents = @(Get-WinEvent -FilterHashtable @{ LogName='System'; ProviderName='Microsoft-Windows-Kernel-Power'; StartTime=$taskStart.ToLocalTime(); Id=42,107,506,507 } -ErrorAction SilentlyContinue -ErrorVariable taskEventErrors)
  if (@($taskEventErrors | Where-Object { $_.FullyQualifiedErrorId -notlike 'NoMatchingEventsFound*' }).Count) { throw 'System event validation unavailable' }
  $taskRecord.events = @($taskEvents | Select-Object TimeCreated,Id,RecordId)
  if ($taskEvents.Count) { throw 'Sleep/resume event during evaluation; completed rows require review' }
  $taskRecord.status = 'complete'
} catch { $taskRecord.errors += $_.Exception.Message }
finally {
  if ($taskProcess -and -not $taskProcess.HasExited) { $taskProcess.Kill(); [void]$taskProcess.WaitForExit(1000) }
  if ($taskOut) { [IO.File]::WriteAllText((Join-Path $taskRoot "worker-$($taskBudget.attempts).stdout.log"),$taskOut.GetAwaiter().GetResult()) }
  if ($taskErr) { [IO.File]::WriteAllText((Join-Path $taskRoot "worker-$($taskBudget.attempts).stderr.log"),$taskErr.GetAwaiter().GetResult()) }
  if ($taskGuard) { $taskRecord.sleepGuardReleased = [Stage3CurrentRulesPower]::SetThreadExecutionState([uint32]2147483648) -ne 0 }
  $taskClock.Stop()
  $taskRecord.elapsedMs = [Math]::Max($taskClock.ElapsedMilliseconds,([DateTime]::UtcNow-$taskStart).TotalMilliseconds)
  $taskRecord.endedAtUtc = [DateTime]::UtcNow.ToString('o')
  $taskBudget.elapsedMs += $taskRecord.elapsedMs
  [IO.File]::WriteAllText($taskBudgetPath,($taskBudget | ConvertTo-Json),[Text.UTF8Encoding]::new($false))
  $taskJson = $taskRecord | ConvertTo-Json -Depth 8
  [IO.File]::WriteAllText((Join-Path $taskRoot "supervisor-$($taskBudget.attempts).json"),$taskJson,[Text.UTF8Encoding]::new($false))
  [IO.File]::WriteAllText((Join-Path $taskRoot 'supervisor.json'),$taskJson,[Text.UTF8Encoding]::new($false))
}
Write-Output "Evaluation status: $($taskRecord.status); elapsed $($taskRecord.elapsedMs) ms; errors: $($taskRecord.errors -join ', ')"
if ($taskRecord.status -ne 'complete') { exit 1 }
