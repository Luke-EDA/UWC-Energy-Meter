@echo off
setlocal
set "UWC_APP_DIR=%~dp0"
set "UWC_PORT=3000"
if defined PORT set "UWC_PORT=%PORT%"

where node.exe >nul 2>&1
if errorlevel 1 (
  echo Node.js is not installed. Run Initial setup.bat after installing Node.js LTS.
  pause
  exit /b 1
)
if not exist "%UWC_APP_DIR%node_modules" (
  echo Dependencies are missing. Run Initial setup.bat first.
  pause
  exit /b 1
)

start "UWC Energy Monitor - Service" powershell.exe -NoProfile -NoExit -Command "Set-Location -LiteralPath $env:UWC_APP_DIR; & npm.cmd start; if ($LASTEXITCODE -ne 0) { Write-Host 'Service stopped or failed. Review the output above.' -ForegroundColor Yellow }"

echo Waiting for UWC Energy Monitor to start...
powershell.exe -NoProfile -Command "$url='http://localhost:'+$env:UWC_PORT+'/health'; for ($i=0; $i -lt 60; $i++) { try { $r=Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop; if ($r.StatusCode -eq 200) { exit 0 } } catch { }; Start-Sleep -Seconds 1 }; exit 1"
if errorlevel 1 (
  echo.
  echo The service did not respond to the health check within the timeout.
  echo If the service is running, open http://localhost:%UWC_PORT% manually.
  echo Check the service window for errors or a different configured port.
  pause
  exit /b 1
)

echo Service is ready. Opening http://localhost:%UWC_PORT% ...
start "" "http://localhost:%UWC_PORT%/"
if errorlevel 1 (
  echo Unable to open the browser automatically. Open http://localhost:%UWC_PORT% manually.
  pause
)
endlocal
