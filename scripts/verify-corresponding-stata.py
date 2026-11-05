"""Run exact teaching scripts in an independent licensed local Stata18 session."""
import contextlib,csv,io,json,sys
from pathlib import Path
root=Path(__file__).resolve().parents[1];sys.path.insert(0,str(root))
from executor.cloud_artifacts import teaching
out=root/'outputs/stata-corresponding-acceptance';out.mkdir(exist_ok=True)
sys.path.insert(0,r'D:\Program Files\Stata18\utilities')
with (out/'local-runtime.txt').open('w',encoding='utf-8') as private,contextlib.redirect_stdout(private):
 from pystata import config
 config.init('mp')
 from pystata import stata
 fixtures=json.loads((root/'outputs/cloud-fixtures.json').read_text(encoding='utf-8'));checks=[]
 for method,f in fixtures.items():
  folder=out/method;folder.mkdir(parents=True,exist_ok=True)
  rows=list(csv.reader(io.StringIO(f['text'])));aliases={h:'v'+str(i) for i,h in enumerate(rows[0])};p={'unit':'','time':'','treated':'','cluster':'','missing':'block',**f['plan']};p['predictors']=[aliases[n] for n in p['predictors']]
  for k in ['outcome','unit','time','treated','cluster']:p[k]=aliases.get(p.get(k),'')
  p['labels']={v:k for k,v in aliases.items()}
  with (folder/'normalized.csv').open('w',encoding='utf-8',newline='') as stream:
   writer=csv.writer(stream);writer.writerow(aliases.values());writer.writerows(rows[1:])
  code,manifest=teaching(p);(folder/'corresponding.do').write_text(code,encoding='utf-8')
  stata.run('cd "'+folder.as_posix()+'"',quietly=True);stata.run(code,quietly=True)
  n=int(stata.get_ereturn()['e(N)']);assert n==len(rows)-1,(method,n)
  sample=list(csv.DictReader((folder/'stata-sample.csv').open()));assert len(sample)==n
  assert all(code.splitlines()[c['line']-1]==c['text'] for c in manifest['commands'])
  checks.append({'method':method,'n_used':n,'script_sha256':manifest['sha256'],'status':'exact script and command lines passed Stata18; numerical inference differences not equated'})
(out/'acceptance.json').write_text(json.dumps(checks,indent=2),encoding='utf-8');print(json.dumps(checks))
