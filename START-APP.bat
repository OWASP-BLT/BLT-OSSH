@echo off
setlocal enabledelayedexpansion
set PORT=8000

:: Kill any existing Python server on port 8000 (prevents "Address already in use")
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":%PORT%" ^| findstr "LISTENING"') do (
  taskkill /F /PID %%a 2>nul
)

:: Start Python HTTP server in background
echo Starting OSSH server on http://localhost:%PORT%...
start /b "" python -m http.server %PORT%

:: Give server a moment to start
timeout /t 2 /nobreak >nul

:: Open browser
start "" "http://localhost:%PORT%"

echo.
echo Server running at http://localhost:%PORT%
echo Press any key to stop the server and exit...
pause >nul

:: Terminate the Python server process (fixes "Address already in use" on next run)
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":%PORT%" ^| findstr "LISTENING"') do (
  taskkill /F /PID %%a 2>nul
)

echo Server stopped. Goodbye!
