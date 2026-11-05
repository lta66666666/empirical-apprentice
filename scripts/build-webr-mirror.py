"""重建 static/webr/repo 本地 R 二进制包仓库（webR 4.6 离线安装 fixest）。

用法：
    python scripts/build-webr-mirror.py

依赖：仅标准库。下载来源为 repo.r-wasm.org 与 lrberge.r-universe.dev。
"""
import gzip
import re
import sys
import time
import urllib.request
from pathlib import Path

RVER = '4.6'
ROOT = Path(__file__).resolve().parents[1] / 'static' / 'webr' / 'repo'
DEST = ROOT / 'bin' / 'emscripten' / 'contrib' / RVER
REPOS = {
    'rwasm': f'https://repo.r-wasm.org/bin/emscripten/contrib/{RVER}',
    'lrberge': f'https://lrberge.r-universe.dev/bin/emscripten/contrib/{RVER}',
}
BASE_PKGS = {'R', 'stats', 'graphics', 'grDevices', 'tools', 'utils', 'methods', 'datasets',
             'compiler', 'parallel', 'grid', 'splines', 'tcltk', 'stats4'}


def fetch(url, timeout=180):
    req = urllib.request.Request(url, headers={'User-Agent': 'ea-mirror/1.0'})
    with urllib.request.urlopen(req, timeout=timeout) as response:
        return response.read()


def parse_dcf(text):
    blocks = {}
    for block in re.split(r'\n\s*\n', text):
        fields, key = {}, None
        for line in block.splitlines():
            if line[:1] in (' ', '\t') and key:
                fields[key] += ' ' + line.strip()
            elif ':' in line:
                key, value = line.split(':', 1)
                fields[key.strip()] = value.strip()
        if 'Package' in fields:
            blocks[fields['Package']] = fields
    return blocks


def deps_of(fields):
    names = []
    for field in ('Depends', 'Imports', 'LinkingTo'):
        for part in fields.get(field, '').split(','):
            name = part.strip().split('(')[0].strip()
            if name and name not in BASE_PKGS:
                names.append(name)
    return names


def main():
    indexes = {}
    for name, url in REPOS.items():
        started = time.time()
        indexes[name] = parse_dcf(fetch(url + '/PACKAGES').decode('utf-8', 'replace'))
        print(f'{name}: {len(indexes[name])} packages in {time.time() - started:.1f}s')

    closure, stack = set(), ['fixest']
    while stack:
        pkg = stack.pop()
        if pkg in closure:
            continue
        closure.add(pkg)
        source = 'lrberge' if pkg in indexes['lrberge'] else 'rwasm' if pkg in indexes['rwasm'] else None
        if not source:
            print(f'missing package metadata: {pkg}')
            return 1
        stack.extend(deps_of(indexes[source][pkg]))

    DEST.mkdir(parents=True, exist_ok=True)
    merged = []
    for pkg in sorted(closure):
        for source in ('lrberge', 'rwasm'):
            fields = indexes[source].get(pkg)
            if not fields:
                continue
            filename = fields.get('File') or f"{pkg}_{fields['Version']}.tar.gz"
            target = DEST / filename
            if target.exists():
                print(f'cached {pkg} {fields["Version"]}')
                break
            try:
                data = fetch(f"{REPOS[source]}/{filename}")
            except Exception as error:
                print(f'skip {pkg} from {source}: {error}')
                continue
            target.write_bytes(data)
            print(f'downloaded {pkg} {fields["Version"]} {len(data) // 1024} KB from {source}')
            break
        else:
            print(f'failed to obtain {pkg}')
            return 2
        fields = dict(fields, File=filename)
        merged.append(fields)

    text = ''.join(''.join(f'{k}: {v}\n' for k, v in fields.items()) + '\n' for fields in merged)
    (DEST / 'PACKAGES').write_text(text, encoding='utf-8', newline='\n')
    with gzip.open(DEST / 'PACKAGES.gz', 'wb') as handle:
        handle.write(text.encode('utf-8'))
    print(f'wrote {len(merged)} packages')
    return 0


if __name__ == '__main__':
    sys.exit(main())
