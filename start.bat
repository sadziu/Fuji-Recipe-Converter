@echo off
rem Starts Fuji Recipe Converter on this computer and opens it in your browser.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start.ps1" %*
if errorlevel 1 pause
