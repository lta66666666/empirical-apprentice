"""Allowlisted source-only kit; never package credentials or runtime data."""
import hashlib,json,zipfile
from pathlib import Path
root=Path(__file__).resolve().parents[1]
files={str(p.relative_to(root)):p for p in (root/'local_stata').glob('*') if p.is_file() and p.name in
       ('assistant.py','dual_engines.py','process_guard.py','README.md','start.ps1','setup.ps1','requirements.lock')}
for p in (root/'local_stata/licenses').glob('*'):files[str(p.relative_to(root))]=p
for name in ['manifest.json']+[method+suffix for method in ('ols','panel_fe','did') for suffix in ('.csv','.dictionary.json')]:
    p=root/'local_stata/sample-fixtures'/name
    if not p.is_file(): raise ValueError('Build fixed teaching fixtures before packaging')
    files[str(p.relative_to(root))]=p
files['executor/engines.py']=root/'executor/engines.py'
files['executor/stata_teaching.py']=root/'executor/stata_teaching.py'
manifest={name.replace('\\','/'):hashlib.sha256(p.read_bytes()).hexdigest() for name,p in files.items()}
with zipfile.ZipFile(root/'static/local-stata-assistant.zip','w',zipfile.ZIP_DEFLATED) as archive:
    for name,p in sorted(files.items()):
        info=zipfile.ZipInfo(name.replace('\\','/'),date_time=(2026,10,14,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED
        archive.writestr(info,p.read_bytes())
    archive.writestr('SOURCE-MANIFEST.json',json.dumps(manifest,indent=2))
print('Packaged',len(files),'allowlisted files; no runtime, input or connection files.')
