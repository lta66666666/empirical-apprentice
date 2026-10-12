"""Real MCP tests, independent task sessions, existing fixtures only."""
import json, pathlib, sys, csv, io, tempfile, hashlib
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]/'local_stata'))
import assistant as a
root=pathlib.Path(__file__).resolve().parents[1]
m=a.MCP();m.initialize()
results=[]
for method in ('ols','panel_fe','did'):
    fixture=json.loads((root/'outputs/mcp-fixtures'/f'{method}.json').read_text(encoding='utf-8'))
    rows=list(csv.reader(io.StringIO(fixture['text'])))
    names=rows[0];aliases={n:f'v{i}' for i,n in enumerate(names)}
    plan=dict(fixture['plan']);plan['missing']='drop';plan.setdefault('same_batch',True)
    plan.setdefault('cluster','');plan.setdefault('vcov','hetero' if method=='ols' else 'cluster')
    for key in ('outcome','unit','time','treated','cluster'):plan[key]=aliases.get(plan.get(key),'')
    plan['predictors']=[aliases[n] for n in plan['predictors']];plan['labels']={v:k for k,v in aliases.items()}
    folder=root/'outputs/mcp-acceptance'/method;folder.mkdir(parents=True,exist_ok=True)
    with (folder/'normalized.csv').open('w',encoding='utf-8',newline='') as f:
        w=csv.writer(f);w.writerow(list(aliases.values()));w.writerows(rows[1:])
    code,command=a.stata_script(plan);code=code.replace('exit, clear\n','');(folder/'estimate.do').write_text(code,encoding='utf-8')
    session='ea_acceptance_'+method
    try:
        response=m.tool('stata_run_file',{'file_path':str(folder/'estimate.do'),'working_dir':str(folder),'session_id':session,'timeout':120},130)
        (folder/'mcp-response.json').write_text(json.dumps(response,ensure_ascii=False,indent=2),encoding='utf-8')
        result=a.result_from_files({'dir':folder,'task':{'kind':'template'},'plan':plan});result['method']=method;results.append(result)
        (folder/'result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
        print(method,result['n_used'],[(c['term'],c['estimate']) for c in result['coefficients']])
    finally:a.stop_session(session)
(root/'outputs/mcp-acceptance/summary.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8')
