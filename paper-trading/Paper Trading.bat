@echo off
rem Double-click to open Paper Trading in your browser.
cd /d "%~dp0"
where python >nul 2>nul && (python -m paper_trading ui) || (py -m paper_trading ui)
if errorlevel 1 pause
