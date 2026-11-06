"""Single-process durable executor. Never expose without the signed gateway."""
import asyncio
import csv
import hashlib
import hmac
import io
import json
import os
import re
import shutil
import signal
import sqlite3
import time
import uuid
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from .engines import capabilities, execute

ROOT = Path(os.environ.get('EA_NODE_DATA', Path(__file__).parent / 'data')).resolve()
ROOT.mkdir(parents=True, exist_ok=True)
db = sqlite3.connect(ROOT / 'tasks.sqlite3', check_same_thread=False)
db.row_factory = sqlite3.Row
db.executescript('''PRAGMA journal_mode=WAL;
CREATE TABLE IF NOT EXISTS tasks(id TEXT PRIMARY KEY, owner TEXT, session TEXT, digest TEXT, body TEXT, status TEXT, created REAL, expires REAL);
CREATE TABLE IF NOT EXISTS requests(id TEXT PRIMARY KEY, created REAL);
CREATE TABLE IF NOT EXISTS usage(id TEXT PRIMARY KEY, owner TEXT, created REAL);
INSERT OR IGNORE INTO usage SELECT id,owner,created FROM tasks;''')
db.commit()
active = {}
IMPORT_LOCK=asyncio.Lock()
TERMINAL = {'succeeded', 'failed', 'interrupted', 'cancelled'}
# 运行限额可配置：默认值保持原有行为，便于不同赛事/演示环境调整。
MAX_QUEUE = int(os.getenv('EA_MAX_QUEUE', '10'))
DAILY_LIMIT = int(os.getenv('EA_DAILY_LIMIT', '30'))
QUEUE_WAIT = float(os.getenv('EA_QUEUE_WAIT', '1200'))

def update(task):
    db.execute('UPDATE tasks SET body=?,status=? WHERE id=?', (json.dumps(task, ensure_ascii=False, allow_nan=False), task['status'], task['id']))
    db.commit()


async def json_body(request):
    """解析 JSON 请求体；格式错误返回 422，而不是未捕获异常导致的 500。"""
    try:
        data = await request.json()
    except ValueError:
        raise HTTPException(422, '请求体不是有效 JSON')
    if not isinstance(data, dict):
        raise HTTPException(422, '请求体必须为 JSON 对象')
    return data


def expires_from(body):
    """读取过期时间；缺省为 0（由调用方判定为已过期），非法值返回 422。"""
    try:
        return float(body.get('expires_at', 0))
    except (TypeError, ValueError):
        raise HTTPException(422, 'expires_at 必须为数字')


def load(task_id, owner):
    row = db.execute('SELECT * FROM tasks WHERE id=? AND owner=?', (task_id, owner)).fetchone()
    if not row or row['expires'] <= time.time():
        raise HTTPException(404, 'Task missing, expired or owned by another browser')
    return json.loads(row['body'])

async def authenticate(request):
    key = os.getenv('EA_NODE_SECRET', '')
    if len(key) < 32:
        raise HTTPException(503, 'Node signing secret is not configured')
    stamp = request.headers.get('x-ea-time', '')
    request_id = request.headers.get('x-ea-request', '')
    owner = request.headers.get('x-ea-owner', '')
    if not re.fullmatch(r'[0-9]{10,13}', stamp) or abs(time.time() - int(stamp)) > 60:
        raise HTTPException(401, 'Expired request')
    if not re.fullmatch(r'[0-9a-f-]{36}', request_id) or not re.fullmatch(r'[a-zA-Z0-9_-]{12,100}', owner):
        raise HTTPException(401, 'Invalid signed identity')
    raw = await request.body()
    if len(raw) > 4_500_000:
        raise HTTPException(413, 'Payload too large')
    digest = hashlib.sha256(raw).hexdigest()
    canonical = '\n'.join([request.method, request.url.path, stamp, request_id, owner, digest])
    signature = hmac.new(key.encode(), canonical.encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(signature, request.headers.get('x-ea-signature', '')):
        raise HTTPException(401, 'Invalid signature')
    try:
        db.execute('INSERT INTO requests VALUES(?,?)', (request_id, time.time()))
        db.execute('DELETE FROM requests WHERE created<?', (time.time()-120,))
        db.commit()
    except sqlite3.IntegrityError:
        raise HTTPException(409, 'Request replay rejected')
    return owner

def validate(body):
    # Normalize aliases only; arbitrary formulas, scripts and paths never enter templates.
    p = body.get('plan', {})
    if body.get('engine_id') not in ('statspai_cloud', 'r_native', 'stata_native') or p.get('method') not in ('ols', 'panel_fe', 'did', 'staggered_did', 'event_study', 'iv_2sls'):
        raise ValueError('Unsupported engine or method')
    if body.get('software') != {'r_native':'r','stata_native':'stata','statspai_cloud':'python'}[body['engine_id']] or body.get('execution_location') != 'cloud_native':
        raise ValueError('Engine metadata mismatch')
    text = body.get('csv', '')
    if not isinstance(text, str) or len(text.encode()) > 2_000_000:
        raise ValueError('CSV exceeds 2 MB')
    rows = list(csv.reader(io.StringIO(text)))
    if not 2 <= len(rows) <= 20001 or not 1 <= len(rows[0]) <= 60 or len(set(rows[0])) != len(rows[0]):
        raise ValueError('Invalid row or column limits')
    if any(not re.fullmatch(r'v\d+', n) for n in rows[0]) or any(len(row)!=len(rows[0]) for row in rows):
        raise ValueError('Only rectangular normalized CSV is accepted')
    fields = [p.get(k, '') for k in ('outcome','unit','time','treated','first_treat','cluster','endogenous')] + p.get('predictors', []) + p.get('instruments', [])
    if len(p.get('predictors', []))>12 or len(p.get('instruments', []))>4 or any(n and n not in rows[0] for n in fields):
        raise ValueError('Invalid variable mapping')
    if not p.get('outcome') or p.get('vcov') not in ('iid','hetero','cluster') or p.get('missing') not in ('drop','block'):
        raise ValueError('Invalid plan')
    if p['vcov']=='cluster' and not p.get('cluster'):
        raise ValueError('Cluster variable required')
    panel = p['method'] in ('panel_fe','did','staggered_did','event_study')
    if panel and (not p.get('unit') or not p.get('time') or p['unit']==p['time']):
        raise ValueError('Panel mapping required')
    if p.get('method')=='iv_2sls' and bool(p.get('unit')) != bool(p.get('time')):
        raise ValueError('IV fixed effects require both unit and time')
    if panel and p['vcov']!='cluster':raise ValueError('Panel methods require one-way clustering')
    if p['method']=='iv_2sls' and p.get('unit') and p['vcov']!='cluster':raise ValueError('IV with fixed effects requires clustering')
    if p['method'] in ('did','event_study') and (p.get('same_batch') is not True or not isinstance(p.get('policy_year'), int) or not 1800<=p['policy_year']<=2200 or not p.get('treated')):
        raise ValueError('Only confirmed same-batch DID and event study are supported')
    if p['method']=='staggered_did':
        if not p.get('first_treat') or p.get('control_group') not in ('nevertreated','notyettreated') or p.get('absorbing_confirmed') is not True:
            raise ValueError('Invalid staggered DID setting')
    if p['method']=='event_study':
        window=p.get('window'); reference=p.get('reference_period')
        if not (isinstance(window,list) and len(window)==2 and all(isinstance(v,int) for v in window) and 1<=window[0]<=5 and 1<=window[1]<=5):
            raise ValueError('Invalid event-study window')
        if not isinstance(reference,int) or reference>-1 or reference<-window[0]:
            raise ValueError('Invalid event-study reference period')
    if p['method']=='iv_2sls':
        endogenous=p.get('endogenous'); instruments=p.get('instruments') or []
        if not endogenous or not 1<=len(instruments)<=4 or len(set(instruments))!=len(instruments) or endogenous in instruments or endogenous==p.get('outcome') or endogenous in p.get('predictors',[]) or any(name in (p.get('outcome'),*p.get('predictors',[])) for name in instruments):
            raise ValueError('Invalid IV mapping')
    for key in ('input_sha256','plan_sha256'):
        if not re.fullmatch('[0-9a-f]{64}', str(body.get(key, ''))):
            raise ValueError('Missing evidence hash')
    if hashlib.sha256(text.encode()).hexdigest()!=body.get('normalized_sha256'):
        raise ValueError('Normalized input hash mismatch')
    if not re.fullmatch(r'[0-9a-f-]{36}', str(body.get('id',''))) or not re.fullmatch(r'[a-z0-9]{12}', str(body.get('session_id',''))):
        raise ValueError('Invalid identifier')
    return len(rows)-1

async def worker():
    while True:
        db.execute('DELETE FROM usage WHERE created<?',(time.time()-86400,))
        # Never delete a running task; child inputs are removed in finally below.
        for row in db.execute("SELECT id FROM tasks WHERE expires<=? AND status NOT IN ('running','preparing','estimating')", (time.time(),)).fetchall():
            db.execute('DELETE FROM tasks WHERE id=?', (row['id'],))
        db.commit()
        row = db.execute("SELECT * FROM tasks WHERE status='queued' ORDER BY created LIMIT 1").fetchone()
        if not row:
            await asyncio.sleep(.3)
            continue
        task = json.loads(row['body'])
        if time.time()-row['created']>QUEUE_WAIT:
            task.pop('payload',None)
            task.update(status='failed', error=f'Queue wait exceeded {int(QUEUE_WAIT // 60)} minutes; reconfirm and resubmit')
            update(task)
            continue
        directory = ROOT / task['id']
        directory.mkdir(exist_ok=True)
        task['status']='preparing'; update(task)
        payload=task.pop('payload')
        (directory/'normalized.csv').write_text(payload['csv'],encoding='utf-8')
        (directory/'parameters.json').write_text(json.dumps(payload['plan'],ensure_ascii=False),encoding='utf-8')
        task['status']='estimating'; update(task)
        running = asyncio.create_task(execute(payload, directory))
        active[task['id']]=running
        try:
            result, artifacts = await running
            task.update(status='saving', result=result); update(task)
            task.update(status='succeeded', artifacts=artifacts, completed=time.time())
        except asyncio.CancelledError:
            task.update(status='interrupted',error='Execution cancelled or service stopped; reconfirm to rerun')
        except Exception as error:
            try:
                log = (directory/'execution.log').read_text(encoding='utf-8') if (directory/'execution.log').exists() else ''
            except OSError:
                log = ''
            task.update(status='failed',error=str(error)[:500],execution_log=log)
        finally:
            active.pop(task['id'],None)
            # Contains only server-created UUID child directory.
            shutil.rmtree(directory)
            update(task)
        if asyncio.current_task().cancelling():
            raise asyncio.CancelledError

@asynccontextmanager
async def lifespan(app):
    for row in db.execute("SELECT body FROM tasks WHERE status IN ('preparing','estimating','saving','running')").fetchall():
        task=json.loads(row['body']); task.update(status='interrupted',error='Node restarted during execution'); update(task)
    # Clear abandoned input directories only inside this executor's data root.
    for child in ROOT.iterdir():
        if child.is_dir() and re.fullmatch(r'(?:[0-9a-f-]{36}|import-[a-zA-Z0-9_-]+)',child.name): shutil.rmtree(child)
    runner=asyncio.create_task(worker())
    yield
    runner.cancel()
    for task in list(active.values()): task.cancel()
    await asyncio.gather(runner,*list(active.values()),return_exceptions=True)

app=FastAPI(lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)

@app.api_route('/v1/{route:path}',methods=['GET','POST','DELETE'])
async def gateway(route,request:Request):
    owner=await authenticate(request)
    if route=='teaching' and request.method=='POST':
        from .cloud_artifacts import teaching
        body=await json_body(request);plan=body.get('plan',{})
        try:
            fields=[plan.get(k,'') for k in ('outcome','unit','time','treated','first_treat','cluster','endogenous')]+plan.get('predictors',[])+plan.get('instruments',[])
            if plan.get('method') not in ('ols','panel_fe','did','staggered_did','event_study','iv_2sls') or plan.get('vcov') not in ('iid','hetero','cluster') or plan.get('missing') not in ('drop','block'):raise ValueError('教学方案无效')
            if len(plan.get('predictors',[]))>12 or len(plan.get('instruments',[]))>4 or any(v and not re.fullmatch(r'v\d+',v) for v in fields):raise ValueError('教学字段必须为受控别名')
            if plan['method'] in ('panel_fe','did','staggered_did','event_study') and plan['vcov']!='cluster':raise ValueError('面板方法仅开放单向聚类')
            if plan['method']=='iv_2sls' and plan.get('unit') and plan['vcov']!='cluster':raise ValueError('带固定效应的工具变量需聚类')
            if plan['method'] in ('did','event_study') and (plan.get('same_batch') is not True or not isinstance(plan.get('policy_year'),int) or not 1800<=plan['policy_year']<=2200 or not plan.get('treated')):raise ValueError('同批设定无效')
            if plan['method']=='staggered_did' and (not plan.get('first_treat') or plan.get('control_group') not in ('nevertreated','notyettreated') or plan.get('absorbing_confirmed') is not True):raise ValueError('分批 DID 设定无效')
            if plan['method']=='event_study':
                window=plan.get('window');reference=plan.get('reference_period')
                if not (isinstance(window,list) and len(window)==2 and all(isinstance(v,int) for v in window) and 1<=window[0]<=5 and 1<=window[1]<=5 and isinstance(reference,int) and -window[0]<=reference<=-1):raise ValueError('事件研究窗口或基期无效')
            if plan['method']=='iv_2sls':
                endogenous=plan.get('endogenous');instruments=plan.get('instruments') or []
                if not endogenous or not 1<=len(instruments)<=4 or len(set(instruments))!=len(instruments) or endogenous in instruments or endogenous in plan.get('predictors',[]) or endogenous==plan.get('outcome'):raise ValueError('工具变量映射无效')
            code,manifest=teaching(plan)
            return {'code':code,**manifest,'input_sha256':body['input_sha256'],'plan_sha256':body['plan_sha256']}
        except (ValueError,KeyError,TypeError) as error:raise HTTPException(422,str(error))
    if route=='data/import' and request.method=='POST':
        import base64,tempfile,sys
        from .engines import process
        body=await json_body(request)
        if IMPORT_LOCK.locked():raise HTTPException(429,'数据解析正忙，请稍后重试原上传')
        async with IMPORT_LOCK:
            try:
                raw=base64.b64decode(body.get('content_base64',''),validate=True)
                if not 0<len(raw)<=2_000_000:raise ValueError('DTA文件最多2MB')
                with tempfile.TemporaryDirectory(prefix='import-',dir=ROOT) as folder:
                    directory=Path(folder);(directory/'input.dta').write_bytes(raw)
                    code,log=await process([sys.executable,Path(__file__).parent/'import_data.py',directory],timeout=12)
                    if code:raise ValueError('DTA无法导入：'+(log.splitlines()[-1][:180] if log.splitlines() else '解析失败'))
                    return json.loads((directory/'import.json').read_text(encoding='utf-8'))
            except asyncio.TimeoutError:raise HTTPException(422,'DTA解析超时，文件未导入')
            except Exception as error:raise HTTPException(422,str(error)[:250])
    if route=='capabilities' and request.method=='GET': return await capabilities()
    if route=='jobs' and request.method=='POST':
        body=await json_body(request)
        try: validate(body)
        except (ValueError,TypeError,KeyError) as e: raise HTTPException(422,str(e))
        digest=hashlib.sha256(json.dumps(body,sort_keys=True).encode()).hexdigest()
        old=db.execute('SELECT * FROM tasks WHERE id=?',(body['id'],)).fetchone()
        if old:
            if old['owner']!=owner or old['digest']!=digest: raise HTTPException(409,'Idempotency payload conflict')
            return public(load(body['id'],owner))
        cap=(await capabilities())[body['engine_id']]
        if not cap['ready']: raise HTTPException(503,cap['reason'])
        if db.execute("SELECT COUNT(*) FROM tasks WHERE status='queued'").fetchone()[0]>=MAX_QUEUE: raise HTTPException(429,'Queue full')
        if db.execute('SELECT COUNT(*) FROM usage WHERE owner=? AND created>?',(owner,time.time()-86400)).fetchone()[0]>=DAILY_LIMIT: raise HTTPException(429,'Daily analysis limit reached')
        expires=min(expires_from(body),time.time()+7*86400)
        if expires<=time.time(): raise HTTPException(410,'Session expired')
        task={k:body[k] for k in ('id','session_id','software','engine_id','execution_location','input_sha256','plan_sha256')}
        task.update(status='queued',created=time.time(),payload=body)
        db.execute('INSERT INTO tasks VALUES(?,?,?,?,?,?,?,?)',(task['id'],owner,body['session_id'],digest,json.dumps(task),task['status'],task['created'],expires))
        db.execute('INSERT INTO usage VALUES(?,?,?)',(task['id'],owner,task['created']));db.commit()
        return public(task)
    if route=='sessions/activity' and request.method=='POST':
        body=await json_body(request);expires=min(expires_from(body),time.time()+7*86400)
        # Expired rows cannot be resurrected.
        db.execute('UPDATE tasks SET expires=? WHERE owner=? AND session=? AND expires>?',(expires,owner,str(body.get('session_id','')),time.time()));db.commit()
        return {'ok':True}
    if route=='sessions/delete' and request.method=='POST':
        body=await json_body(request)
        ids=db.execute('SELECT id FROM tasks WHERE owner=? AND session=?',(owner,str(body.get('session_id','')))).fetchall()
        for row in ids:
            if row['id'] in active: active[row['id']].cancel();await asyncio.gather(active[row['id']],return_exceptions=True)
        db.execute('DELETE FROM tasks WHERE owner=? AND session=?',(owner,str(body.get('session_id',''))));db.commit()
        return {'ok':True}
    match=re.fullmatch(r'jobs/([0-9a-f-]{36})(?:/(cancel|result))?',route)
    if not match: raise HTTPException(404)
    task=load(match[1],owner)
    if match[2]=='cancel' and request.method=='POST':
        if task['id'] in active:
            active[task['id']].cancel();await asyncio.gather(active[task['id']],return_exceptions=True)
            task=load(task['id'],owner)
        elif task['status']=='queued': task.pop('payload',None);task.update(status='cancelled',error='Cancelled before execution');update(task)
        return public(task)
    if request.method!='GET': raise HTTPException(405)
    return public(task)

def public(task):
    return {k:v for k,v in task.items() if k!='payload'}
