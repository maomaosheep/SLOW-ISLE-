@echo off
chcp 65001 >nul
cd /d "%~dp0.."

set PORTARG=
if not "%~1"=="" set PORTARG=-Port %~1

echo.
echo  正在以 LAN 模式启动后端，请保持本窗口开着...
echo  停止服务：Ctrl+C
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start.ps1" -Lan %PORTARG%

echo.
echo  服务已停止。
pause
