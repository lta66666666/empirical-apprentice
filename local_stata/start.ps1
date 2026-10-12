$ErrorActionPreference = 'Stop'
$assistantPython = (Get-Command python -ErrorAction SilentlyContinue).Source
if (-not $assistantPython) { throw '需要 Python 3.11 或以上；安装后重新运行。' }
& $assistantPython (Join-Path $PSScriptRoot 'assistant.py')
