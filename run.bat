@echo off
setlocal EnableExtensions
cd /d "%~dp0"

set "URL=http://127.0.0.1:8765/"

if not exist "index.html" (
  echo ERROR: index.html not found in %cd%
  echo Run build.bat from the repository root first.
  pause
  exit /b 1
)
if not exist "serve.ps1" (
  echo ERROR: serve.ps1 missing next to run.bat
  pause
  exit /b 1
)

echo Serving %cd%
echo URL: %URL%
echo Close this window to stop the server.
echo Browser opens automatically after the server is listening.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0serve.ps1"
if errorlevel 1 (
  echo Server exited with error.
  pause
  exit /b 1
)
