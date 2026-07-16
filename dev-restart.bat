@echo off
setlocal EnableExtensions
REM ASCII-only bat: restart Next.js after freeing ports (avoid GBK/UTF-8 issues)
cd /d "%~dp0"

REM Uncommon app port (avoid 3000/3001/8080/5173)
set "APP_PORT=3737"

echo.
echo [dev-restart] project: %CD%
echo [dev-restart] target port: %APP_PORT%
echo.

REM Free leftover Next ports + target port
call :kill_port 3000
call :kill_port 3001
call :kill_port %APP_PORT%

REM Brief wait so sockets release
timeout /t 1 /nobreak >nul

echo [dev-restart] starting: pnpm exec next dev -H 127.0.0.1 -p %APP_PORT%
echo [dev-restart] open: http://127.0.0.1:%APP_PORT%
echo.

set "PORT=%APP_PORT%"
call pnpm exec next dev -H 127.0.0.1 -p %APP_PORT%
set "EC=%ERRORLEVEL%"

echo.
echo [dev-restart] next exited with code %EC%
pause
exit /b %EC%

:kill_port
set "PORT_TO_KILL=%~1"
if "%PORT_TO_KILL%"=="" goto :eof
echo [dev-restart] checking port %PORT_TO_KILL% ...
for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":%PORT_TO_KILL%" ^| findstr /I "LISTENING"') do (
  if not "%%P"=="0" (
    echo [dev-restart] kill PID %%P on port %PORT_TO_KILL%
    taskkill /F /PID %%P >nul 2>&1
  )
)
goto :eof
