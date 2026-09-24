@echo off
setlocal EnableExtensions
cd /d "%~dp0"

echo [1/3] Installing dependencies...
where npm >nul 2>nul
if errorlevel 1 (
  echo ERROR: npm not found. Install Node.js first.
  exit /b 1
)
call npm install
if errorlevel 1 (
  echo ERROR: npm install failed.
  exit /b 1
)

echo [2/3] Building dist...
call npm run build
if errorlevel 1 (
  echo ERROR: build failed.
  exit /b 1
)

echo [3/3] Copying launcher into dist...
if not exist "dist" mkdir dist
copy /y "run.bat" "dist\run.bat" >nul
copy /y "serve.ps1" "dist\serve.ps1" >nul
if errorlevel 1 (
  echo ERROR: failed to copy launcher scripts
  exit /b 1
)

echo.
echo BUILD OK
echo Run: dist\run.bat
echo Then open the browser page it launches.
exit /b 0
