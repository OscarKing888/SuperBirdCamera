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
  echo This folder is the project root. You must build first:
  echo   1^) build.bat
  echo   2^) dist\run.bat
  echo.
  echo If build.bat failed on npm/network, fix that then re-run it.
  echo If node_modules is broken: delete it and run build.bat again.
  echo For slow networks: set NPM_REGISTRY=https://registry.npmmirror.com
  pause
  exit /b 1
)

echo Serving %cd%
echo Binding all interfaces, ports 8765-8776 if busy...
echo Prints Local / LAN / Public URLs after start.
echo Close this window to stop the server.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0serve.ps1"
if errorlevel 1 (
  echo Server exited with error.
  pause
  exit /b 1
)
