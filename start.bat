@echo off
setlocal
title Seed Scent local server
rem Seed Scent: open the website on this PC. Works with no internet.
rem
rem Double-click this file. It starts a tiny local web server in this folder
rem and opens the site in your browser. Keep the window open while you use
rem the site. Close the window to stop.
rem
rem Why a server at all: browsers refuse to load the moving parts (ES modules,
rem the 3D engine) from an index.html that was opened by double-clicking it.

cd /d "%~dp0"

set "PORT=3001"
set "URL=http://127.0.0.1:%PORT%/"

rem Find Python: the py launcher first, then python, then python3.
set "PY="
where py >nul 2>nul && set "PY=py -3"
if not defined PY (where python >nul 2>nul && set "PY=python")
if not defined PY (where python3 >nul 2>nul && set "PY=python3")
if not defined PY goto nopython

rem Already running? (This file was probably double-clicked twice.)
netstat -ano -p tcp 2>nul | findstr /r /c:":%PORT% .*LISTENING" >nul 2>nul
if not errorlevel 1 goto running

echo Seed Scent
echo Serving this folder at %URL%
echo Keep this window open while you use the site. Close it to stop.
echo.

rem Open the browser once the server has had a moment to start (ping = a 2 second pause).
start "" /b cmd /c "ping -n 3 127.0.0.1 >nul & start %URL%"

%PY% -m http.server %PORT% --bind 127.0.0.1

echo.
echo The server stopped.
pause
exit /b 0

:running
echo Something is already serving port %PORT%, probably an earlier copy of this window.
echo Opening %URL% in your browser.
start %URL%
pause
exit /b 0

:nopython
echo Python was not found, so the server cannot start.
echo Install Python 3 from https://www.python.org/downloads/ and keep "py launcher" ticked,
echo or serve this folder with any static web server.
pause
exit /b 1
