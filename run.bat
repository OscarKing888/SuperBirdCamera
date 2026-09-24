@echo off
setlocal EnableExtensions
cd /d "%~dp0"

REM Prefer production build in dist\ (built index.html + serve.ps1)
if exist "%~dp0dist\index.html" if exist "%~dp0dist\serve.ps1" (
  echo Found dist\ build. Serving dist\ ...
  cd /d "%~dp0dist"
)

if not exist "index.html" (
  echo ERROR: index.html not found in %cd%
  echo Run build.bat from the repository root first.
  pause
  exit /b 1
)
if not exist "serve.ps1" (
  echo ERROR: serve.ps1 missing next to run.bat
  echo Run build.bat to copy launcher into dist\
  pause
  exit /b 1
)

REM Reject Vite source entry (needs dev server / npm run dev)
findstr /C:"/src/main.ts" "index.html" >nul 2>&1
if not errorlevel 1 (
  echo ERROR: %cd%\index.html is the Vite SOURCE page, not a built site.
  echo Chrome will show a blank page because /src/main.ts is not compiled JS.
  echo.
  echo Use one of:
  echo   1^) build.bat then dist\run.bat
  echo   2^) npm run dev   ^(development server^)
  pause
  exit /b 1
)

echo Serving %cd%
echo Trying ports 8765-8776 if busy...
echo Close this window to stop the server.
echo Browser opens automatically after the server is listening.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0serve.ps1"
if errorlevel 1 (
  echo Server exited with error.
  pause
  exit /b 1
)
