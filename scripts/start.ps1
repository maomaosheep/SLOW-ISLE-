param([int]$Port = 8000, [switch]$Lan)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectRoot
$taskPython = Join-Path $projectRoot '.venv\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $taskPython)) { throw 'Run .\scripts\setup.ps1 first.' }
$bindAddress = if ($Lan) { '0.0.0.0' } else { '127.0.0.1' }
if ($Lan) { $env:DJANGO_ALLOWED_HOSTS = '*' }
if ($Lan) {
    $lanIp = (Get-NetIPAddress -AddressFamily IPv4 |
        Where-Object { $_.IPAddress -notmatch '^(127\.|169\.254)' } |
        Sort-Object InterfaceIndex | Select-Object -First 1).IPAddress
    if (-not $lanIp) { $lanIp = '无法获取局域网 IP' }
    Write-Host "LAN 模式：监听 $bindAddress`:$Port（手机可访问）"
    Write-Host "Prototype: http://$lanIp`:$Port/prototype/"
    Write-Host "Admin: http://$lanIp`:$Port/admin/"
    Write-Host "API:   http://$lanIp`:$Port/api    <- miniprogram/config.js 的 API_BASE_URL 要填这个"
} else {
    Write-Host "本机模式：监听 127.0.0.1（手机访问不到，真机调试请加 -Lan）"
    Write-Host "Prototype: http://127.0.0.1:$Port/prototype/"
    Write-Host "Admin: http://127.0.0.1:$Port/admin/"
}
& $taskPython backend/manage.py runserver "${bindAddress}:$Port"
