# Idle CPU usage over 5 seconds for NoteVault desktop tree and Web node host
function Get-TreeCpu($rootId) {
  $all = Get-CimInstance Win32_Process
  $tree = @($rootId)
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
  $cpu = 0
  foreach ($procId in $tree) {
    $gp = Get-Process -Id $procId -ErrorAction SilentlyContinue
    if ($gp) { $cpu += $gp.TotalProcessorTime.TotalMilliseconds }
  }
  return @{ cpu = $cpu; count = $tree.Count }
}

$app = Get-Process | Where-Object { $_.ProcessName -like "NoteVault_*" } | Select-Object -First 1
$node = Get-Process node -ErrorAction SilentlyContinue | Where-Object { $_.Path -like "*node*" } | Select-Object -First 1

$beforeApp = 0; $beforeNode = 0
if ($app) { $beforeApp = (Get-TreeCpu $app.Id).cpu }
# find the node that owns port 8321
$conn = Get-NetTCPConnection -LocalPort 8321 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($conn) { $beforeNode = (Get-Process -Id $conn.OwningProcess).TotalProcessorTime.TotalMilliseconds }

Start-Sleep -Seconds 5

if ($app) {
  $afterApp = (Get-TreeCpu $app.Id).cpu
  $pct = (($afterApp - $beforeApp) / 5000) * 100
  Write-Output ("Desktop idle CPU (5s): {0:N1} ms -> {1:N2}% (tree)" -f ($afterApp - $beforeApp), $pct)
}
if ($conn) {
  $afterNode = (Get-Process -Id $conn.OwningProcess).TotalProcessorTime.TotalMilliseconds
  $pct = (($afterNode - $beforeNode) / 5000) * 100
  Write-Output ("Web host idle CPU (5s): {0:N1} ms -> {1:N2}%" -f ($afterNode - $beforeNode), $pct)
}
