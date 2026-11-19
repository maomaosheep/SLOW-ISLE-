$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectRoot
if (-not (Test-Path -LiteralPath '.venv\Scripts\python.exe')) {
    python -m venv .venv
    if ($LASTEXITCODE -ne 0) { throw 'Could not create Python environment.' }
}
$taskPython = Join-Path $projectRoot '.venv\Scripts\python.exe'
& $taskPython -m pip install -r backend/requirements.txt
if ($LASTEXITCODE -ne 0) { throw 'Could not install backend dependencies.' }
& $taskPython backend/manage.py migrate
if ($LASTEXITCODE -ne 0) { throw 'Database migration failed.' }
& $taskPython backend/manage.py seed_demo
if ($LASTEXITCODE -ne 0) { throw 'Demo initialization failed.' }
& $taskPython backend/manage.py bootstrap_admin
if ($LASTEXITCODE -ne 0) { throw 'Admin initialization failed.' }
Write-Host 'Ready. Run .\scripts\start.ps1 to open the prototype and backend.'
