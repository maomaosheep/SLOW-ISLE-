param([int]$Port = 8000, [switch]$Lan)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectRoot
$taskPython = Join-Path $projectRoot '.venv\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $taskPython)) { throw 'Run .\scripts\setup.ps1 first.' }
$bindAddress = if ($Lan) { '0.0.0.0' } else { '127.0.0.1' }
if ($Lan) { $env:DJANGO_ALLOWED_HOSTS = '*' }
Write-Host "Prototype: http://127.0.0.1:$Port/prototype/"
Write-Host "Admin: http://127.0.0.1:$Port/admin/"
& $taskPython backend/manage.py runserver "${bindAddress}:$Port"
