@echo off
cd /d "%~dp0"
set PORT=3003
node server.cjs
pause
