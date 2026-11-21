@echo off
chcp 65001 >nul
title NoteVault Web 版
cd /d "%~dp0"

if not exist "out-web\web\server.js" (
  echo [NoteVault] 首次运行需要先构建：
  echo   npm install
  echo   npm run build
  pause
  exit /b 1
)

rem ---- 已在运行则直接打开浏览器 ----
powershell -NoProfile -Command "try { $c = New-Object Net.Sockets.TcpClient; $c.Connect('127.0.0.1', 8321); $c.Close(); exit 0 } catch { exit 1 }" >nul 2>&1
if %errorlevel%==0 (
  echo [NoteVault] 服务已在后台运行（127.0.0.1:8321），直接打开浏览器...
  start "" http://127.0.0.1:8321/
  ping -n 3 127.0.0.1 >nul
  exit /b 0
)

rem ---- 后台启动：独立 node 进程，关闭本命令行不影响服务 ----
echo 正在后台启动 NoteVault Web 版（127.0.0.1:8321）...
powershell -NoProfile -Command "Start-Process -FilePath 'node' -ArgumentList 'out-web\web\server.js' -WorkingDirectory '%~dp0' -WindowStyle Hidden"
if %errorlevel% neq 0 (
  echo [NoteVault] 启动失败：请确认已安装 Node.js（node -v）
  pause
  exit /b 1
)

rem ---- 等待端口就绪后打开浏览器 ----
set /a tries=0
:waitloop
powershell -NoProfile -Command "try { $c = New-Object Net.Sockets.TcpClient; $c.Connect('127.0.0.1', 8321); $c.Close(); exit 0 } catch { exit 1 }" >nul 2>&1
if %errorlevel%==0 (
  echo [NoteVault] 启动成功，已打开浏览器。
  start "" http://127.0.0.1:8321/
  ping -n 3 127.0.0.1 >nul
  exit /b 0
)
set /a tries+=1
if %tries% lss 30 (
  ping -n 2 127.0.0.1 >nul
  goto waitloop
)

echo [NoteVault] 等待超时：服务未在 30 秒内就绪，请手动检查。
pause
exit /b 1
