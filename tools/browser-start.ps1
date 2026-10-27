# 启动「我自己的」星愿浏览器（Chromium + 独立配置 + 调试端口）
# 用法:
#   .\tools\browser-start.ps1            # 无头，不弹窗
#   .\tools\browser-start.ps1 -Headful   # 有头，能看见窗口
#   .\tools\browser-start.ps1 -Port 9229
# 说明: DSH 沙箱下启动需要一次放宽许可（崩溃处理器要 OpenProcess）；启动后读页面不再需要。

[CmdletBinding()]
param(
    [int]$Port = 9228,
    [switch]$Headful
)

$ErrorActionPreference = "Stop"

$exe  = "C:\Twinkstar Browser\twinkstar.exe"
$ws   = Split-Path -Parent $PSScriptRoot
$prof = Join-Path $ws ".browser\twinkstar"

if (-not (Test-Path -LiteralPath $exe)) {
    throw "找不到浏览器: $exe"
}

function Test-Cdp {
    param([int]$P)
    try {
        Invoke-RestMethod "http://127.0.0.1:$P/json/version" -TimeoutSec 2 | Out-Null
        return $true
    } catch {
        return $false
    }
}

if (Test-Cdp $Port) {
    Write-Output "已在运行: http://127.0.0.1:$Port"
    exit 0
}

New-Item -ItemType Directory -Force -Path $prof | Out-Null

$args = @(
    "--user-data-dir=$prof"
    "--remote-debugging-port=$Port"
    "--no-first-run"
    "--no-default-browser-check"
    "--disable-gpu"
)
if (-not $Headful) { $args = @("--headless=new") + $args }

Start-Process -FilePath $exe -ArgumentList $args | Out-Null

for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Milliseconds 600
    if (Test-Cdp $Port) {
        $v = Invoke-RestMethod "http://127.0.0.1:$Port/json/version" -TimeoutSec 3
        Write-Output "已启动: $($v.Browser)  http://127.0.0.1:$Port"
        exit 0
    }
}

throw "启动失败：端口 $Port 30 秒内无响应（检查是否被沙箱拦下）"
