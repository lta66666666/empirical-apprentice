param([string]$Python = 'python')
$ErrorActionPreference = 'Stop'
& $Python -c "import sys,struct;assert sys.version_info[:2]==(3,11) and struct.calcsize('P')==8,'Requires Python 3.11 64-bit'"
if ($LASTEXITCODE -ne 0) { throw '请指定 Python 3.11 64位可执行文件：./setup.ps1 -Python 完整路径' }
$environmentPath = Join-Path $PSScriptRoot '.venv'
if (-not (Test-Path -LiteralPath $environmentPath)) { & $Python -m venv $environmentPath }
$localPython = Join-Path $environmentPath 'Scripts/python.exe'
& $localPython -m pip install -r (Join-Path $PSScriptRoot 'requirements.lock')
if ($LASTEXITCODE -ne 0) { throw '依赖安装失败。保留环境，网络恢复后可重新运行。' }
& $localPython -c "import sys;sys.path.insert(0,sys.argv[1]);from dual_engines import pinned_versions;print(pinned_versions())" $PSScriptRoot
if ($LASTEXITCODE -ne 0) { throw '固定源码版本核对失败。' }
Write-Output '依赖就绪。运行 ./start.ps1 -StataHome 你的Stata安装目录；软件可用不代表验收完成。'
