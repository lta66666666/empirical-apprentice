"""可选的本机 Stata MCP 适配器。

仅在显式设置 EA_STATA_MCP_URL（回环地址）时启用；公网部署不设置该变量，
stata_native 仍保持“仅教学”。适配器只把已生成的受控 estimate.do 交给本机
Stata MCP，不解析屏幕表格，结果仍由 engines.py 从 CSV 读取。
"""
import json
import os
import tempfile
import urllib.parse
import urllib.request
from pathlib import Path

LOOPBACK_HOSTS = ('127.0.0.1', 'localhost')


def configured():
    return bool(os.getenv('EA_STATA_MCP_URL', '').strip())


def endpoint():
    value = os.getenv('EA_STATA_MCP_URL', '').strip().rstrip('/')
    if not value:
        raise ValueError('未配置 EA_STATA_MCP_URL')
    parsed = urllib.parse.urlparse(value)
    if parsed.scheme != 'http' or parsed.hostname not in LOOPBACK_HOSTS:
        raise ValueError('EA_STATA_MCP_URL 仅允许本机 http://127.0.0.1 或 http://localhost')
    return value


def probe(timeout=5):
    if not configured():
        return False, '未配置'
    try:
        base = endpoint()
    except ValueError as error:
        return False, str(error)
    try:
        with urllib.request.urlopen(base + '/openapi.json', timeout=timeout) as response:
            spec = json.loads(response.read().decode('utf-8'))
        paths = spec.get('paths', {})
        if '/run_file' not in paths or '/run_selection' not in paths:
            return False, '本机服务接口不匹配'
        return True, '本机 Stata MCP 已就绪'
    except Exception as error:
        return False, f'本机 Stata MCP 连接失败：{type(error).__name__}: {error}'


def run_file(path, working_dir, timeout):
    base = endpoint()
    query = urllib.parse.urlencode({
        'file_path': str(path),
        'working_dir': str(working_dir),
        'timeout': int(timeout),
    })
    request = urllib.request.Request(base + '/run_file?' + query, method='GET')
    with urllib.request.urlopen(request, timeout=float(timeout) + 10) as response:
        return response.read().decode('utf-8', errors='replace')


def release(timeout=10):
    """把 Stata 当前目录切到临时目录，释放 Windows 对任务目录的占用句柄。"""
    base = endpoint()
    neutral = Path(tempfile.gettempdir()).resolve().as_posix()
    query = urllib.parse.urlencode({'selection': f'cd "{neutral}"', 'timeout': int(timeout)})
    request = urllib.request.Request(base + '/run_selection?' + query, method='POST')
    with urllib.request.urlopen(request, timeout=float(timeout) + 5) as response:
        return response.read().decode('utf-8', errors='replace')
