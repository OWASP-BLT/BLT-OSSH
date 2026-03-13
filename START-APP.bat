@echo off
setlocal
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

rem Start server with PowerShell to capture PID (kills only this instance on exit)
for /f "delims=" %%i in ('powershell -NoProfile -Command "$p = Start-Process -FilePath python -ArgumentList '-m','http.server','8000' -PassThru -WindowStyle Hidden; $p.Id"') do set "SERVER_PID=%%i"
if not defined SERVER_PID (
    echo ERROR: Could not start server. Falling back to basic mode.
    start "OSSH_SERVER" /b python -m http.server 8000
    timeout /t 3 /nobreak >nul
    goto :open_browser
)

rem Wait for port 8000 to be ready (max 30 seconds)
set retries=0
:wait_loop
netstat -an 2>nul | find ":8000" | find "LISTENING" >nul
if %errorlevel% equ 0 goto :open_browser
timeout /t 1 /nobreak >nul
set /a retries+=1
if %retries% geq 30 (
    echo WARNING: Server may not be ready. Opening browser anyway...
    goto :open_browser
)
goto :wait_loop

:open_browser
start http://localhost:8000
echo.
echo Server running. Press any key to stop...
pause >nul

rem Kill only this server process, not other Python processes
if defined SERVER_PID (
    taskkill /f /pid %SERVER_PID% >nul 2>&1
) else (
    taskkill /f /im python.exe >nul 2>&1
)
echo Server stopped.
endlocal
