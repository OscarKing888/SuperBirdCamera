@echo off
setlocal EnableExtensions
cd /d "%~dp0"

echo ============================================
echo  SuperBirdCamera lens studio - build
echo ============================================

where npm >nul 2>nul
if errorlevel 1 (
  echo ERROR: npm not found. Install Node.js 18+ and reopen the terminal.
  exit /b 1
)
where node >nul 2>nul
if errorlevel 1 (
  echo ERROR: node not found. Install Node.js 18+ and reopen the terminal.
  exit /b 1
)

echo Node: 
node -v
echo npm:
call npm -v

if not exist "package.json" (
  echo ERROR: package.json missing in %cd%
  echo Copy the full project folder ^(src\, package.json, build.bat ...^) to the server.
  exit /b 1
)

REM Optional China / corporate registry:
REM   set NPM_REGISTRY=https://registry.npmmirror.com
REM   build.bat
if defined NPM_REGISTRY (
  echo Using registry: %NPM_REGISTRY%
  call npm config set registry %NPM_REGISTRY%
)

REM Reduce flaky ECONNRESET on slow cloud links
call npm config set fetch-retries 5 >nul 2>nul
call npm config set fetch-retry-mintimeout 20000 >nul 2>nul
call npm config set fetch-retry-maxtimeout 120000 >nul 2>nul

echo.
echo [1/3] Installing dependencies...
set INSTALL_OK=0
if exist "package-lock.json" (
  call npm ci --no-audit --no-fund
) else (
  call npm install --no-audit --no-fund
)
if not errorlevel 1 set INSTALL_OK=1

if not "%INSTALL_OK%"=="1" (
  echo npm install failed ^(often ECONNRESET / network^). Cleaning node_modules and retrying...
  if exist "node_modules" (
    rmdir /s /q "node_modules" 2>nul
    if exist "node_modules" (
      echo NOTE: could not delete node_modules yet ^(file lock / antivirus^).
      echo       Close programs using the folder and re-run build.bat.
    )
  )
  if exist "package-lock.json" (
    call npm ci --no-audit --no-fund
  ) else (
    call npm install --no-audit --no-fund
  )
  if errorlevel 1 (
    echo.
    echo ERROR: dependency install failed twice.
    echo Tips:
    echo   - Check network / proxy, then re-run build.bat
    echo   - For China network:  set NPM_REGISTRY=https://registry.npmmirror.com ^& build.bat
    echo   - Corporate proxy:    npm config set proxy http://user:pass@host:port
    exit /b 1
  )
)

REM Verify local tools exist (npm run needs these inside node_modules\.bin)
if not exist "node_modules\.bin\tsc.cmd" if not exist "node_modules\.bin\tsc" (
  echo ERROR: typescript ^(tsc^) missing after install. Re-run build.bat.
  exit /b 1
)
if not exist "node_modules\.bin\vite.cmd" if not exist "node_modules\.bin\vite" (
  echo ERROR: vite missing after install. Re-run build.bat.
  exit /b 1
)

echo.
echo [2/3] Building dist...
call npm run build
if errorlevel 1 (
  echo ERROR: build failed. See errors above.
  exit /b 1
)

if not exist "dist\index.html" (
  echo ERROR: dist\index.html not produced.
  exit /b 1
)

echo.
echo [3/3] Copying launcher into dist...
if not exist "dist" mkdir dist
copy /y "run.bat" "dist\run.bat" >nul
if errorlevel 1 (
  echo ERROR: failed to copy run.bat
  exit /b 1
)
copy /y "serve.ps1" "dist\serve.ps1" >nul
if errorlevel 1 (
  echo ERROR: failed to copy serve.ps1
  exit /b 1
)

echo.
echo ============================================
echo  BUILD OK
echo  Start app:  dist\run.bat
echo  Then open the URL it prints in the browser.
echo ============================================
exit /b 0
