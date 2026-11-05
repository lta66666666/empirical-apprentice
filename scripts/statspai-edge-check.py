"""Boundary cases: no silent sample or parameter changes."""
import csv,json,sys,time
from pathlib import Path
root=Path(__file__).resolve().parents[1];sys.path.insert(0,str(root/'local_stata'))
from dual_engines import stats_compute
fixture=json.loads((root/'outputs/mcp-fixtures/ols.json').read_text(encoding='utf-8'))
out=root/'outputs'/('statspai-edges-'+str(time.time_ns()));out.mkdir(parents=True)
rows=list(csv.reader(fixture['text'].splitlines()));aliases={n:'v'+str(i) for i,n in enumerate(rows[0])}
plan=dict(fixture['plan'],outcome='v0',predictors=['v1','v2'],unit='',time='',treated='',cluster='',missing='drop',labels={v:k for k,v in aliases.items()})
evidence=[]
for case in ('missing_drop','missing_block','collinear','invalid_vcov'):
    folder=out/case;folder.mkdir();data=[list(r) for r in rows];data[0]=list(aliases.values());p=dict(plan)
    if case.startswith('missing'):data[1][1]='NA'
    if case=='missing_block':p['missing']='block'
    if case=='collinear':
        for r in data[1:]:r[2]=r[1]
    if case=='invalid_vcov':p['vcov']='unsupported'
    with (folder/'normalized.csv').open('w',newline='',encoding='utf-8') as f:csv.writer(f).writerows(data)
    try:
        result=stats_compute(folder,p)
        if case!='missing_drop':raise AssertionError(case+'应当拒绝')
        assert result['n_used']==159 and 1 not in result['used_indices']
        evidence.append({'case':case,'status':'passed','n_used':159})
    except AssertionError:raise
    except Exception as e:
        if case=='missing_drop':raise
        evidence.append({'case':case,'status':'passed','rejected':str(e)[:250]})
(out/'evidence.json').write_text(json.dumps(evidence,ensure_ascii=False,indent=2),encoding='utf-8')
print(evidence,'Evidence:',out)
