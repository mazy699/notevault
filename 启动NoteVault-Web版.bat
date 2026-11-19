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

echo 正在启动 NoteVault Web 版...
node out-web\web\server.js --open
pause
