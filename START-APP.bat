@echo off
cd /d "%~dp0"
echo.
echo ========================================
echo   OSSH - Open Source Sorting Hat
echo ========================================
echo.
python -c "exit(0)" 2>nul
if errorlevel 1 (
    echo ERROR: Python not found. Install from python.org
    pause
    exit /b 1
)
echo Starting server... Your browser will open shortly.
echo.
echo KEEP THIS WINDOW OPEN while using the app.
echo.
start "OSSH_SERVER" /b python -m http.server 8000
timeout /t 3 /nobreak >nul
start http://localhost:8000
echo.
echo Server running. Press any key to stop...
pause >nul
taskkill /f /im python.exe >nul 2>&1
echo Server stopped.
