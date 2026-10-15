"""Actual local adapters on the existing simulated teaching fixtures."""
import csv, io, json, os, sys, time
from pathlib import Path
root=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(root/'local_stata'))
import assistant as a
from dual_engines import comparison, pinned_versions

out=root/'outputs'/('dual-acceptance-'+str(time.time_ns()));out.mkdir(parents=True)
results=[]
for method in ('ols','panel_fe','did'):
    fixture=json.loads((root/'outputs/mcp-fixtures'/f'{method}.json').read_text(encoding='utf-8'))
    file=out/(method+'.csv');file.write_text(fixture['text'],encoding='utf-8')
    a.INPUT=a.read_input(file)
    plan=dict(fixture['plan'],missing='drop');plan.setdefault('same_batch',True);plan.setdefault('cluster','');plan.setdefault('vcov','hetero' if method=='ols' else 'cluster')
    task={'id':'acceptance-'+method+'-'+str(time.time_ns()),'kind':'template','plan':plan,'input_sha256':a.INPUT['hash'],
          'plan_sha256':a.digest(json.dumps(plan,sort_keys=True).encode()),'engine_id':'stata_local_mcp','bridge_id':'stata_code','status':'awaiting_approval'}
    # Use evidence directory rather than the user's paired assistant HOME.
    a.HOME=out
    a.prepare(task); current=a.CURRENT
    row={'method':method,'results':{},'errors':{}}
    for adapter in ('stata_mcp','stata_code','statspai_local'):
        try:
            value=a.run_leg(current,adapter)
            assert len(value['used_indices'])==value['n_used']
            assert all(0<=c['p_value']<=1 for c in value['coefficients'])
            row['results'][adapter]=value
            print(method,adapter,value['n_used'],[(c['term'],c['estimate'],c['p_value']) for c in value['coefficients']],flush=True)
        except Exception as error:
            row['errors'][adapter]=str(error);print(method,adapter,'FAILED',error,flush=True)
    row['bridges']=comparison(row['results'].get('stata_mcp'),row['results'].get('stata_code'))
    row['python_comparison']=comparison(row['results'].get('stata_mcp'),row['results'].get('statspai_local'))
    results.append(row)
    (out/'summary.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8')
print('Evidence:',out,flush=True)
if any(r['errors'] for r in results):sys.exit(1)
