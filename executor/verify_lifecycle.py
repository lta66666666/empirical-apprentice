import asyncio
import hashlib
import hmac
import json
import os
import sys
import time
import uuid
from pathlib import Path
from fastapi.testclient import TestClient
from . import app as node
from .engines import process

owner='lifecycle_owner_123456789';key=os.environ['EA_NODE_SECRET']
async def slow(payload,directory):
    # Real child process exercises cancellation and worker restart, independent of model size.
    await process([sys.executable,'-c','import time; time.sleep(30)'])
    raise AssertionError('Should be cancelled before completion')
async def ready():return {'r_native':{'ready':True},'stata_native':{'ready':False}}
node.execute=slow;node.capabilities=ready
def call(client,route,body=None,method=None):
    method=method or ('GET' if body is None else 'POST');raw='' if body is None else json.dumps(body);path='/v1/'+route;stamp=str(int(time.time()));id=str(uuid.uuid4())
    signature=hmac.new(key.encode(),'\n'.join([method,path,stamp,id,owner,hashlib.sha256(raw.encode()).hexdigest()]).encode(),hashlib.sha256).hexdigest()
    return client.request(method,path,content=raw,headers={'x-ea-time':stamp,'x-ea-request':id,'x-ea-owner':owner,'x-ea-signature':signature,'content-type':'application/json'})
def payload():
    text='v0,v1\n'+''.join(f'{i},{i*2}\n' for i in range(12))
    return {'id':str(uuid.uuid4()),'session_id':'abcdef123456','software':'r','engine_id':'r_native','execution_location':'cloud_native','plan':{'method':'ols','outcome':'v0','predictors':['v1'],'vcov':'hetero','missing':'block','cluster':''},'csv':text,'normalized_sha256':hashlib.sha256(text.encode()).hexdigest(),'input_sha256':'a'*64,'plan_sha256':'b'*64,'expires_at':time.time()+7*86400}
checks=[]
with TestClient(node.app) as client:
    active=payload();assert call(client,'jobs',active).status_code==200
    for _ in range(20):
        if call(client,'jobs/'+active['id']).json()['status']=='estimating':break
        time.sleep(.1)
    waiting=[]
    for _ in range(10):
        body=payload();assert call(client,'jobs',body).status_code==200;waiting.append(body)
    assert call(client,'jobs',payload()).status_code==429;checks.append('queue rejects eleventh waiting task')
    assert call(client,'jobs/'+waiting[0]['id']+'/cancel',{}).json()['status']=='cancelled';checks.append('queued cancellation')
    start=time.monotonic();assert call(client,'jobs/'+active['id']+'/cancel',{}).json()['status']=='interrupted'
    assert time.monotonic()-start<5;checks.append('running child cancellation completes within 5 seconds')
    for body in waiting[1:]:call(client,'jobs/'+body['id']+'/cancel',{})
    expired=payload();expired['expires_at']=time.time()-1;assert call(client,'jobs',expired).status_code==410
    checks.append('expired submission refused')
    restart=payload();assert call(client,'jobs',restart).status_code==200
    for _ in range(20):
        if call(client,'jobs/'+restart['id']).json()['status']=='estimating':break
        time.sleep(.1)
# Lifespan exits while real child is running; shutdown must not leave it executing.
with TestClient(node.app) as client:
    assert call(client,'jobs/'+restart['id']).json()['status']=='interrupted';checks.append('running task interrupted on restart')
    assert not (node.ROOT/restart['id']).exists();checks.append('cancelled input directory removed')
    stale=payload();stale.update(status='estimating',created=time.time())
    node.db.execute('INSERT INTO tasks VALUES(?,?,?,?,?,?,?,?)',(stale['id'],owner,stale['session_id'],'stale',json.dumps(stale),'estimating',time.time(),time.time()+100));node.db.commit()
with TestClient(node.app) as client:
    assert call(client,'jobs/'+stale['id']).json()['status']=='interrupted';checks.append('abrupt restart marks persisted running task interrupted')
    node.db.execute('UPDATE tasks SET expires=? WHERE id=?',(time.time()-1,stale['id']));node.db.commit()
    assert call(client,'jobs/'+stale['id']).status_code==404
    time.sleep(.5);assert not node.db.execute('SELECT id FROM tasks WHERE id=?',(stale['id'],)).fetchone();checks.append('expired read denied and row removed by node maintenance loop')
    assert call(client,'sessions/delete',{'session_id':'abcdef123456'}).status_code==200
    charged=node.db.execute('SELECT count(*) FROM usage WHERE owner=?',(owner,)).fetchone()[0]
    assert charged>0
    for _ in range(30-charged):node.db.execute('INSERT INTO usage VALUES(?,?,?)',(str(uuid.uuid4()),owner,time.time()))
    node.db.commit();assert call(client,'jobs',payload()).status_code==429
    checks.append('deleting task records does not reset daily node quota')
async def timeout():
    try:await process([sys.executable,'-c','import time; time.sleep(30)'],timeout=.3)
    except asyncio.TimeoutError:return
    raise AssertionError('Timeout not enforced')
asyncio.run(timeout());checks.append('subprocess timeout enforced')
(Path(__file__).parents[1]/'outputs/executor-lifecycle-evidence.json').write_text(json.dumps(checks,indent=2),encoding='utf-8')
print(json.dumps(checks))
