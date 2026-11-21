# Measure NoteVault desktop process tree memory (host + WebView2 children)
$app = Get-Process | Where-Object { $_.ProcessName -like "NoteVault_*" } | Select-Object -First 1
if (-not $app) { Write-Output "app not running"; exit 1 }
Write-Output "Found: $($app.ProcessName) (PID $($app.Id))"

$all = Get-CimInstance Win32_Process
$tree = @($app.Id)
$changed = $true
while ($changed) {
  $changed = $false
  foreach ($p in $all) {
    if (($tree -contains $p.ParentProcessId) -and -not ($tree -contains $p.ProcessId)) {
      $tree += $p.ProcessId
      $changed = $true
    }
  }
}

$totalMb = 0
Write-Output "=== NoteVault desktop process tree ==="
foreach ($procId in $tree) {
  $gp = Get-Process -Id $procId -ErrorAction SilentlyContinue
  if ($gp) {
    $ws = $gp.WorkingSet64 / 1MB
    $totalMb += $ws
    Write-Output ("{0,-24} PID {1,-7} WorkingSet {2,7:N1} MB" -f $gp.ProcessName, $gp.Id, $ws)
  }
}
Write-Output ("TOTAL: {0:N1} MB" -f $totalMb)
