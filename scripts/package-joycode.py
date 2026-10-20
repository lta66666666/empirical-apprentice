"""Allowlisted source export and immutable diff. Runtime state and credentials are excluded."""
import hashlib,json,re,subprocess,zipfile
from pathlib import Path

root=Path(__file__).resolve().parents[1];baseline=root.parent/'empirical_apprentice_sites'
assert subprocess.check_output(['git','rev-parse','HEAD'],cwd=baseline,text=True).strip()=='ca0a496b41fb5ab18fe943222eae5da72caa395b'
tracked=subprocess.check_output(['git','ls-files','-z'],cwd=baseline).decode().split('\0')
files={name for name in tracked if name and (root/name).is_file()}
files.update(str(p.relative_to(root)).replace('\\','/') for p in (root/'deploy/joycode').rglob('*') if p.is_file() and '__pycache__' not in str(p))
files.update(('Dockerfile','.dockerignore','executor/statspai_runner.py','executor/cloud_artifacts.py',
 'worker/method-registry.js','docs/JOYCODE_CLOUD_ACCEPTANCE.md','scripts/package-joycode.py',
 'scripts/verify-cloud-compute.py','scripts/verify-cloud-site.mjs','scripts/verify-cloud-model.mjs','scripts/verify-cloud-dom.mjs'))
diff=[];manifest=[]
for name in sorted(files):
    assert Path(name).parts[0] not in ('outputs','dist')
    assert not any(part in ('node_modules','.git','.joycode','.venv','__pycache__') for part in Path(name).parts)
    assert not Path(name).name.startswith('.env')
    data=(root/name).read_bytes()
    try:text=data.decode('utf-8')
    except UnicodeDecodeError:text=''
    assert not re.search(r'\bsk-[A-Za-z0-9_-]{24,}\b',text),f'Credential-like text: {name}'
    manifest.append({'path':name,'sha256':hashlib.sha256(data).hexdigest(),'size':len(data)})
    old=subprocess.run(['git','show','HEAD:'+name],cwd=baseline,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL)
    if old.returncode or old.stdout!=data:
        diff.append({'path':name,'mode':'100644','type':'blob','content':data.decode('utf-8')})
out=root/'outputs';out.mkdir(exist_ok=True)
(out/'joycode-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
(out/'joycode-github-diff.json').write_text(json.dumps(diff,ensure_ascii=False),encoding='utf-8')
with zipfile.ZipFile(out/'empirical-apprentice-joycode-candidate.zip','w',zipfile.ZIP_DEFLATED) as z:
    for name in sorted(files):z.write(root/name,name)
    z.writestr('SOURCE_MANIFEST.json',json.dumps(manifest,ensure_ascii=False,indent=2))
print(json.dumps({'files':len(files),'changed':len(diff),'zip_bytes':(out/'empirical-apprentice-joycode-candidate.zip').stat().st_size,'paths':[x['path'] for x in diff]},ensure_ascii=False))
