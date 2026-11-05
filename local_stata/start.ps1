param([string]$StataHome = $env:STATA_HOME)
$ErrorActionPreference = 'Stop'
$assistantPython = Join-Path $PSScriptRoot '.venv/Scripts/python.exe'
if (-not (Test-Path -LiteralPath $assistantPython)) { throw '请先使用 Python 3.11 执行 setup.ps1。' }
if ($StataHome) {
    $resolvedStata = (Resolve-Path -LiteralPath $StataHome).Path
    if (-not (Test-Path -LiteralPath (Join-Path $resolvedStata 'utilities/pystata/config.py'))) { throw '此路径未找到 Stata 自带的 PyStata。' }
    $env:STATA_HOME = $resolvedStata
    $env:PYTHONPATH = (Join-Path $resolvedStata 'ado/base/py')
}
& $assistantPython (Join-Path $PSScriptRoot 'assistant.py')
