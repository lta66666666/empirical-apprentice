"""Derived synthetic boundary cases, not additional teaching methods."""
import csv,io,json,sys,time
from pathlib import Path
root=Path(__file__).resolve().parents[1];sys.path.insert(0,str(root/'local_stata'))
import assistant as a
from dual_engines import comparison
out=root/'outputs'/('dual-edges-'+str(time.time_ns()));out.mkdir(parents=True);a.HOME=out
evidence=[]
for case in ('missing_drop','collinear','singleton_fe','cluster_ols'):
    method='panel_fe' if case=='singleton_fe' else 'ols'
    f=json.loads((root/'outputs/mcp-fixtures'/f'{method}.json').read_text(encoding='utf-8'))
    rows=list(csv.reader(io.StringIO(f['text'])));p=dict(f['plan'],missing='drop')
    if case=='missing_drop':rows[1][1]='NA'
    elif case=='collinear':
        for row in rows[1:]:row[2]=row[1]
    elif case=='singleton_fe':
        extra=list(rows[1]);extra[0]='SINGLETON_TEST';rows.append(extra)
    else:
        rows[0].append('cluster_test')
        for i,row in enumerate(rows[1:]):row.append('G'+str(i//8))
        p.update(vcov='cluster',cluster='cluster_test')
    file=out/(case+'.csv')
    with file.open('w',newline='',encoding='utf-8') as handle:csv.writer(handle).writerows(rows)
    a.INPUT=a.read_input(file)
    task={'id':case+str(time.time_ns()),'kind':'template','plan':p,'engine_id':'stata_local_mcp','bridge_id':'stata_code',
          'status':'awaiting_approval','input_sha256':a.INPUT['hash'],'plan_sha256':a.digest(json.dumps(p,sort_keys=True).encode())}
    a.prepare(task);current=a.CURRENT;record={'case':case,'results':{},'errors':{}}
    for adapter in ('stata_code','statspai_local'):
        try:record['results'][adapter]=a.run_leg(current,adapter)
        except Exception as error:record['errors'][adapter]=str(error)
    if case=='collinear':
        assert 'statspai_local' in record['errors']
        if 'stata_code' in record['results']:assert record['results']['stata_code']['omitted_terms']
        record['comparison']=comparison(record['results'].get('stata_code'),record['results'].get('statspai_local'))
        assert record['comparison']['status']=='unable_to_compare'
    else:
        assert not record['errors'],record['errors']
        assert sorted(record['results']['stata_code']['used_indices'])==sorted(record['results']['statspai_local']['used_indices'])
        assert record['results']['stata_code']['n_used']=={'missing_drop':159,'singleton_fe':385,'cluster_ols':160}[case]
        record['comparison']=comparison(record['results']['stata_code'],record['results']['statspai_local'])
        if case!='singleton_fe':assert record['comparison']['status']=='passed',record['comparison']
    evidence.append(record);(out/'summary.json').write_text(json.dumps(evidence,ensure_ascii=False,indent=2),encoding='utf-8')
    print(case,'passed',record.get('comparison',{}).get('status','rejected by both'),flush=True)
print('Evidence:',out,flush=True)
