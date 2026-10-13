$ErrorActionPreference = 'Stop'
$taskRoot = Join-Path (Get-Location) 'docs/ai-runs/stage3-current-rules-20261013-final'
if (Test-Path -LiteralPath (Join-Path $taskRoot 'cpu-supervisor.json')) { throw 'One attempt only; preserve the previous record.' }
if (Test-Path -LiteralPath (Join-Path $taskRoot 'cpu-attempt.json')) { throw 'Worker was already attempted.' }

Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class Stage3CurrentRulesPower {
  [StructLayout(LayoutKind.Sequential)] public struct Status { public byte ACLineStatus, BatteryFlag, BatteryLifePercent, SystemStatusFlag; public uint BatteryLifeTime, BatteryFullLifeTime; }
  [StructLayout(LayoutKind.Sequential)] public struct FileTime { public uint Low, High; }
  [DllImport("kernel32.dll", SetLastError=true)] [return: MarshalAs(UnmanagedType.Bool)] public static extern bool GetSystemPowerStatus(out Status status);
  [DllImport("kernel32.dll", SetLastError=true)] public static extern uint SetThreadExecutionState(uint flags);
  [DllImport("kernel32.dll", SetLastError=true)] [return: MarshalAs(UnmanagedType.Bool)] public static extern bool GetSystemTimes(out FileTime idle, out FileTime kernel, out FileTime user);
}
'@
function Get-TaskPower {
  $value = New-Object Stage3CurrentRulesPower+Status
  if (-not [Stage3CurrentRulesPower]::GetSystemPowerStatus([ref]$value)) { throw 'Power status unavailable' }
  return $value
}
function Get-TaskTimes {
  $idle = New-Object Stage3CurrentRulesPower+FileTime
  $kernel = New-Object Stage3CurrentRulesPower+FileTime
  $user = New-Object Stage3CurrentRulesPower+FileTime
  if (-not [Stage3CurrentRulesPower]::GetSystemTimes([ref]$idle, [ref]$kernel, [ref]$user)) { throw 'System load unavailable' }
  return @(([uint64]$idle.High * 4294967296 + $idle.Low),
    ([uint64]$kernel.High * 4294967296 + $kernel.Low),
    ([uint64]$user.High * 4294967296 + $user.Low))
}
function Save-TaskSupervisor($value) {
  $text = $value | ConvertTo-Json -Depth 10
  [IO.File]::WriteAllText((Join-Path $taskRoot 'cpu-supervisor.json'), $text, [Text.UTF8Encoding]::new($false))
}

$taskRecord = [ordered]@{ status = 'not-started'; startedAtUtc = $null; endedAtUtc = $null; maxMs = 120000;
  powerSamples = @(); loadBeforePercent = @(); errors = @(); events = @(); sleepGuardReleased = $false }
$taskProcess = $null
$taskSleepGuard = $false
$taskStopwatch = [Diagnostics.Stopwatch]::new()
try {
  $taskRecord.headBefore = (& git rev-parse HEAD).Trim()
  $taskRecord.planBefore = (& powercfg /getactivescheme | Out-String).Trim()
  $taskRecord.processorBefore = (& powercfg /query SCHEME_CURRENT SUB_PROCESSOR | Out-String).Trim()
  $taskInitialPower = Get-TaskPower
  if ($taskInitialPower.ACLineStatus -ne 1) { throw 'AC power required before starting' }
  $taskRecord.lastEventRecordBefore = (Get-WinEvent -LogName System -MaxEvents 1).RecordId
  for ($taskSample = 0; $taskSample -lt 2; $taskSample++) {
    $taskTimes0 = Get-TaskTimes
    Start-Sleep -Milliseconds 1000
    $taskTimes1 = Get-TaskTimes
    $taskTotal = ($taskTimes1[1] - $taskTimes0[1]) + ($taskTimes1[2] - $taskTimes0[2])
    $taskBusy = 100 * (1 - ($taskTimes1[0] - $taskTimes0[0]) / $taskTotal)
    $taskRecord.loadBeforePercent += $taskBusy
    if ($taskBusy -ge 25) { throw "Background system load is too high: $taskBusy percent" }
  }
  if ([Stage3CurrentRulesPower]::SetThreadExecutionState([uint32]2147483649) -eq 0) { throw 'Temporary sleep guard unavailable' }
  $taskSleepGuard = $true
  $taskRecord.startedAtUtc = [DateTime]::UtcNow.ToString('o')
  $taskWallStart = [DateTime]::UtcNow
  $taskStopwatch.Start()
  $taskProcess = [Diagnostics.Process]::new()
  $taskProcess.StartInfo.FileName = (Get-Command node).Source
  $taskProcess.StartInfo.Arguments = 'src/test/stage3CurrentRules.mjs cpu'
  $taskProcess.StartInfo.WorkingDirectory = (Get-Location).Path
  $taskProcess.StartInfo.UseShellExecute = $false
  $taskProcess.StartInfo.CreateNoWindow = $true
  $taskProcess.StartInfo.RedirectStandardOutput = $true
  $taskProcess.StartInfo.RedirectStandardError = $true
  if (-not $taskProcess.Start()) { throw 'Worker failed to start' }
  $taskStdout = $taskProcess.StandardOutput.ReadToEndAsync()
  $taskStderr = $taskProcess.StandardError.ReadToEndAsync()
  $taskNextPlan = 0
  while (-not $taskProcess.HasExited) {
    $taskRemaining = [Math]::Min(120000 - $taskStopwatch.ElapsedMilliseconds,
      120000 - ([DateTime]::UtcNow - $taskWallStart).TotalMilliseconds)
    if ($taskRemaining -le 0) { throw 'Hard wall-clock deadline reached' }
    [void]$taskProcess.WaitForExit([int][Math]::Min(500, $taskRemaining))
    $taskPower = Get-TaskPower
    $taskRecord.powerSamples += @{ utc = [DateTime]::UtcNow.ToString('o'); ac = $taskPower.ACLineStatus; saver = $taskPower.SystemStatusFlag }
    if ($taskPower.ACLineStatus -ne 1 -or $taskPower.SystemStatusFlag -ne $taskInitialPower.SystemStatusFlag) { throw 'Power condition changed during measurement' }
    if ($taskStopwatch.ElapsedMilliseconds -ge $taskNextPlan) {
      $taskPlan = (& powercfg /getactivescheme | Out-String).Trim()
      if ($taskPlan -ne $taskRecord.planBefore) { throw 'Power plan changed during measurement' }
      $taskNextPlan = $taskStopwatch.ElapsedMilliseconds + 5000
    }
  }
  $taskRecord.workerExitCode = $taskProcess.ExitCode
  $taskRecord.workerStdout = $taskStdout.GetAwaiter().GetResult()
  $taskRecord.workerStderr = $taskStderr.GetAwaiter().GetResult()
  if ($taskProcess.ExitCode -ne 0) { throw 'Worker reported invalid/incomplete measurement' }
  $taskRecord.headAfter = (& git rev-parse HEAD).Trim()
  $taskRecord.processorAfter = (& powercfg /query SCHEME_CURRENT SUB_PROCESSOR | Out-String).Trim()
  if ($taskRecord.headAfter -ne $taskRecord.headBefore -or $taskRecord.processorAfter -ne $taskRecord.processorBefore) { throw 'Source or processor power settings changed' }
  $taskEventErrors = @()
  $taskEvents = @(Get-WinEvent -FilterHashtable @{ LogName = 'System'; ProviderName = 'Microsoft-Windows-Kernel-Power';
    StartTime = [datetime]::Parse($taskRecord.startedAtUtc); Id = 105,506,507,42,107 } -ErrorAction SilentlyContinue -ErrorVariable taskEventErrors)
  if (@($taskEventErrors | Where-Object { $_.FullyQualifiedErrorId -notlike 'NoMatchingEventsFound*' }).Count) { throw 'Unable to validate system events' }
  $taskRecord.events = @($taskEvents | Select-Object TimeCreated,Id,RecordId)
  if ($taskEvents.Count) { throw 'Sleep/resume/power-change event occurred during measurement' }
  $taskRaw = Get-Content -LiteralPath (Join-Path $taskRoot 'cpu-raw.json') -Raw | ConvertFrom-Json
  if ($taskRaw.status -ne 'awaiting-supervisor' -or $taskRaw.rows.Count -ne 36) { throw 'Raw results incomplete or invalid' }
  if ($taskStopwatch.ElapsedMilliseconds -gt 120000 -or ([DateTime]::UtcNow - $taskWallStart).TotalMilliseconds -gt 120000) { throw 'Total execution exceeded deadline' }
  $taskRecord.status = 'valid'
} catch {
  $taskRecord.status = if ($taskRecord.startedAtUtc) { 'invalid' } else { 'not-started' }
  $taskRecord.errors += $_.Exception.Message
} finally {
  if ($taskProcess -and -not $taskProcess.HasExited) { $taskProcess.Kill(); $taskProcess.WaitForExit(1000) | Out-Null }
  if ($taskSleepGuard) {
    $taskRecord.sleepGuardReleased = [Stage3CurrentRulesPower]::SetThreadExecutionState([uint32]2147483648) -ne 0
    if (-not $taskRecord.sleepGuardReleased) { $taskRecord.status = 'invalid'; $taskRecord.errors += 'Sleep guard release failed' }
  }
  $taskStopwatch.Stop()
  $taskRecord.endedAtUtc = [DateTime]::UtcNow.ToString('o')
  $taskRecord.supervisedMs = $taskStopwatch.ElapsedMilliseconds
  if ($taskRecord.startedAtUtc) { $taskRecord.wallElapsedMs = ([DateTime]::UtcNow - $taskWallStart).TotalMilliseconds }
  Save-TaskSupervisor $taskRecord
}
Write-Output ($taskRecord | ConvertTo-Json -Depth 5)
if ($taskRecord.status -ne 'valid') { exit 1 }
