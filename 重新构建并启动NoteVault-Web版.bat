@echo off
chcp 65001 >nul
title NoteVault Web 版 - 重新构建并启动
setlocal
cd /d "%~dp0"

set "OPEN_BROWSER=1"
if /i "%~1"=="--no-open" set "OPEN_BROWSER=0"

echo ============================================================
echo  NoteVault Web 版 · 根据最新代码重新构建并启动
echo ============================================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [错误] 未找到 Node.js，请先安装 Node.js 18+ 并加入 PATH。
  pause
  exit /b 1
)
where npm >nul 2>nul
if errorlevel 1 (
  echo [错误] 未找到 npm，请检查 Node.js 安装。
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo [NoteVault] 未找到 node_modules，正在安装依赖（npm install）...
  call npm install
  if errorlevel 1 (
    echo [错误] 依赖安装失败，已停止。
    pause
    exit /b 1
  )
)

echo [NoteVault] 正在构建最新代码（typecheck + renderer + node）...
call npm run build
if errorlevel 1 (
  echo.
  echo [错误] 构建失败，已停止启动；现有 Web 服务（如有）保持不变。
  pause
  exit /b 1
)

for /f "delims=" %%v in ('node -p "require('./package.json').version"') do set "NV_VERSION=%%v"
echo [NoteVault] 构建成功，版本 v%NV_VERSION%。

echo [NoteVault] 正在生成 Web 发布包（release\NoteVault_%NV_VERSION%_web.zip）...
node scripts\pack-web.mjs
if errorlevel 1 (
  echo [警告] Web 发布包生成失败，但本地构建已成功，继续启动。
)

echo [NoteVault] 正在停止旧服务（仅 8321 端口上的 node 进程）...
powershell -NoProfile -Command "$conns = Get-NetTCPConnection -LocalPort 8321 -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique; if (-not $conns) { exit 0 }; foreach ($procId in $conns) { $p = Get-Process -Id $procId -ErrorAction SilentlyContinue; if ($p -and $p.ProcessName -match 'node') { Stop-Process -Id $procId -Force } }"

echo [NoteVault] 正在启动新构建...
powershell -NoProfile -Command "Start-Process -FilePath 'node' -ArgumentList 'out-web\web\server.js' -WorkingDirectory '%~dp0' -WindowStyle Hidden"
if errorlevel 1 (
  echo [错误] 启动失败：请确认 Node.js 可用。
  pause
  exit /b 1
)

set /a tries=0
:waitloop
powershell -NoProfile -Command "try { $c = New-Object Net.Sockets.TcpClient; $c.Connect('127.0.0.1', 8321); $c.Close(); exit 0 } catch { exit 1 }" >nul 2>&1
if %errorlevel%==0 (
  echo [NoteVault] 启动成功：http://127.0.0.1:8321 （版本 v%NV_VERSION%）
  if "%OPEN_BROWSER%"=="1" (
    start "" http://127.0.0.1:8321/
  ) else (
    echo [NoteVault] 已按 --no-open 跳过打开浏览器。
  )
  endlocal
  exit /b 0
)
set /a tries+=1
if %tries% lss 30 (
  ping -n 2 127.0.0.1 >nul
  goto waitloop
)

echo.
echo [错误] 服务未在 30 秒内就绪。可能原因：
echo   - 8321 端口被非 node 程序占用；
echo   - Node.js 进程启动失败。
echo 请运行“关闭NoteVault-Web版.bat”或检查端口占用后重试。
pause
exit /b 1
