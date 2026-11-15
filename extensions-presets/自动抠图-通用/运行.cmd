@echo off
cd /d "%~dp0"
python run.py
exit /b %errorlevel%
