@echo off
title Connect DesignStudio to Cursor
where node >nul 2>nul || (echo Node.js is not installed. Get it from https://nodejs.org (LTS^), then run this again.& pause & exit /b 1)
node "%~dp0designstudio-mcp.mjs" --install cursor
echo.
pause
