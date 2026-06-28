@echo off
cd /d "%~dp0"
fly deploy --ha=false
pause
