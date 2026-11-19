"""Run with isolated EA_NODE_DATA, native R and (optionally) local Stata paths."""
import asyncio
import csv
import hashlib
import hmac
import io
import json
import os
import tempfile
import time
import uuid
from pathlib import Path
from fastapi.testclient import TestClient
from .app import app, db, ROOT
from .engines import execute, capabilities

owner='test_browser_owner_123456'
other='test_browser_other_123456'
key=os.environ['EA_NODE_SECRET']
fixtures=json.loads((Path(__file__).parents[1]/'outputs/executor-fixtures.json').read_text(encoding='utf-8'))
evidence={'checks':[],'r':{},'stata':{},'cross_software':{},'limitations':['Linux cloud deployment, public Stata authorization and actual mobile/public isolation not accepted.']}

def signed(client,route,body=None,identity=owner,stamp=None,request_id=None,bad=False):
    method='GET' if body is None else 'POST'
    raw='' if body is None else json.dumps(body,ensure_ascii=False)
    stamp=str(stamp or int(time.time()));request_id=request_id or str(uuid.uuid4());path='/v1/'+route
    canonical='\n'.join([method,path,stamp,request_id,identity,hashlib.sha256(raw.encode()).hexdigest()])
    sig=hmac.new(key.encode(),canonical.encode(),hashlib.sha256).hexdigest()
    return client.request(method,path,content=raw,headers={'content-type':'application/json','x-ea-time':stamp,'x-ea-request':request_id,'x-ea-owner':identity,'x-ea-signature':'invalid' if bad else sig})

def payload(method,engine='r_native'):
    fixture=fixtures[method];rows=list(csv.reader(io.StringIO(fixture['text'])));headers=rows[0];aliases={h:'v'+str(i) for i,h in enumerate(headers)}
    out=io.StringIO();writer=csv.writer(out,lineterminator='\n');writer.writerow([aliases[h] for h in headers]);writer.writerows(rows[1:]);normalized=out.getvalue()
    p={'missing':'block',**fixture['plan']};p['predictors']=[aliases[n] for n in p['predictors']]
    for k in ('outcome','unit','time','treated','cluster'):p[k]=aliases.get(p.get(k),'')
    p['labels']={v:k for k,v in aliases.items()}
    return {'id':str(uuid.uuid4()),'session_id':'123456abcdef','engine_id':engine,'software':'r' if engine=='r_native' else 'stata','execution_location':'cloud_native','plan':p,'csv':normalized,'normalized_sha256':hashlib.sha256(normalized.encode()).hexdigest(),'input_sha256':hashlib.sha256(fixture['text'].encode()).hexdigest(),'plan_sha256':hashlib.sha256(json.dumps(fixture['plan']).encode()).hexdigest(),'expires_at':time.time()+7*86400}

def wait(client,id):
    for _ in range(160):
        r=signed(client,'jobs/'+id).json()
        if r['status'] in ('succeeded','failed','interrupted','cancelled'):return r
        time.sleep(.3)
    raise AssertionError('Execution did not finish')

with TestClient(app) as client:
    assert signed(client,'capabilities',bad=True).status_code==401
    assert signed(client,'capabilities',stamp=int(time.time())-70).status_code==401
    request_id=str(uuid.uuid4());assert signed(client,'capabilities',request_id=request_id).status_code==200
    assert signed(client,'capabilities',request_id=request_id).status_code==409
    evidence['checks']+=['forged signature rejected','expired signature rejected','request replay rejected']
    for method in ('ols','panel_fe','did'):
        body=payload(method);r=signed(client,'jobs',body);assert r.status_code==200,r.text
        assert signed(client,'jobs',body).status_code==200
        assert db.execute('SELECT count(*) FROM tasks WHERE id=?',(body['id'],)).fetchone()[0]==1
        assert signed(client,'jobs/'+body['id'],identity=other).status_code==404
        result=wait(client,body['id']);assert result['status']=='succeeded',result
        evidence['r'][method]=result['result'];assert not (ROOT/body['id']).exists()
    evidence['checks']+=['three native R methods executed','idempotent submission','other browser cannot read task','temporary inputs removed']
    body=payload('did');body['plan']['same_batch']=False;assert signed(client,'jobs',body).status_code==422
    body=payload('panel_fe');rows=body['csv'].splitlines();body['csv']='\n'.join(rows+[rows[1]])+'\n';body['normalized_sha256']=hashlib.sha256(body['csv'].encode()).hexdigest()
    assert signed(client,'jobs',body).status_code==200;assert wait(client,body['id'])['status']=='failed'
    evidence['checks']+=['staggered DID rejected','duplicate panel keys rejected by native R']
    # Completed results survive a second application lifespan.
    first_id=db.execute("SELECT id FROM tasks WHERE status='succeeded' LIMIT 1").fetchone()[0]
with TestClient(app) as client:
    assert signed(client,'jobs/'+first_id).json()['status']=='succeeded'
    evidence['checks'].append('completed results survive restart')

async def local_stata():
    if not (os.getenv('EA_STATA_EXECUTABLE') or os.getenv('EA_STATA_MCP_URL')):return
    for method in ('ols','panel_fe','did'):
        body=payload(method,'stata_native')
        with tempfile.TemporaryDirectory(prefix='ea-stata-',dir=ROOT) as tmp:
            directory=Path(tmp);(directory/'normalized.csv').write_text(body['csv'],encoding='utf-8')
            result,artifacts=await execute(body,directory,development=True)
            evidence['stata'][method]=result
            (Path(__file__).parents[1]/'outputs'/('stata-'+method+'.log')).write_text(artifacts['execution.log'],encoding='utf-8')
            a={r['term']:r for r in evidence['r'][method]['coefficients']}
            differences={r['term']:abs(r['estimate']-a[r['term']]['estimate']) for r in result['coefficients']}
            evidence['cross_software'][method]={'coefficient_differences':differences,'sample_equal':result['used_indices']==evidence['r'][method]['used_indices'],'standard_errors':'Not treated as equal: finite-sample conventions differ'}
            assert max(differences.values())<=5e-6,differences
            assert result['used_indices']==evidence['r'][method]['used_indices']
asyncio.run(local_stata())
(Path(__file__).parents[1]/'outputs/executor-evidence.json').write_text(json.dumps(evidence,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'checks':evidence['checks'],'r_methods':list(evidence['r']),'stata_methods':list(evidence['stata']),'cross_software':evidence['cross_software']},ensure_ascii=False))
