@echo off
chcp 65001 >nul
title 关闭 NoteVault Web 版

rem ---- 按 8321 端口找到监听进程并结束（仅限 node 进程，避免误杀） ----
powershell -NoProfile -Command ^
  "$conns = Get-NetTCPConnection -LocalPort 8321 -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique;" ^
  "if (-not $conns) { Write-Host '[NoteVault] 服务未在运行。'; exit 0 }" ^
  "foreach ($procId in $conns) {" ^
  "  $p = Get-Process -Id $procId -ErrorAction SilentlyContinue;" ^
  "  if ($p -and $p.ProcessName -match 'node') { Stop-Process -Id $procId -Force; Write-Host ('[NoteVault] 已停止服务进程：' + $p.ProcessName + ' (PID ' + $procId + ')') }" ^
  "  else { Write-Host ('[NoteVault] 端口被非 node 进程占用（PID ' + $procId + '），跳过。') }" ^
  "}"
ping -n 3 127.0.0.1 >nul
