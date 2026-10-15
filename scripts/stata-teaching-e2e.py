"""Authenticated webpage protocol -> actual assistant -> actual engines -> report.
Uses synthetic fixtures, a fresh account and an owned assistant process only.
"""
import http.cookiejar,json,os,re,socket,subprocess,sys,time,urllib.request,uuid,hashlib,secrets
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
TEST_PASSWORD=secrets.token_urlsafe(32)+'aA1!'
SITE=os.getenv('EA_TEST_URL','http://127.0.0.1:8795');LOCAL='http://127.0.0.1:8767'
out=ROOT/'outputs'/('stata-teaching-e2e-'+str(time.time_ns()));out.mkdir(parents=True)
jar=http.cookiejar.CookieJar();browser=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
def site(path,payload=None):
    if payload and payload.get('session_id') and 'state_version' not in payload:
        state=site('/api/sessions/'+payload['session_id']);payload=dict(payload,state_version=state['state_version'])
    request=urllib.request.Request(SITE+path,data=None if payload is None else json.dumps(payload).encode(),headers={'Origin':SITE,'Content-Type':'application/json'})
    try:
        with browser.open(request,timeout=30) as r:return json.load(r)
    except urllib.error.HTTPError as e:raise RuntimeError(str(e.code)+' '+e.read().decode())
def local(path,payload=None):
    request=urllib.request.Request(LOCAL+path,data=None if payload is None else json.dumps(payload).encode(),headers={'Origin':LOCAL,'Content-Type':'application/json','X-Local-CSRF':csrf})
    try:
        with urllib.request.urlopen(request,timeout=30) as r:return json.load(r)
    except urllib.error.HTTPError as e:raise RuntimeError(str(e.code)+' '+e.read().decode())
def wait(predicate,timeout=150):
    start=time.monotonic()
    while time.monotonic()-start<timeout:
        value=local('/state')
        if predicate(value):return value
        if (value.get('task') or {}).get('status')=='failed':raise RuntimeError(value.get('error'))
        time.sleep(.5)
    raise RuntimeError('Deadline: '+str(value.get('error')))
with socket.socket() as probe:
    if probe.connect_ex(('127.0.0.1',8767))==0:raise RuntimeError('8767已有助手，拒绝接管或停止它')
env=dict(os.environ,EA_LOCAL_TEST='1',EA_LOCAL_STATA_DIR=str(out/'assistant'))
log=(out/'assistant.log').open('w',encoding='utf-8')
process=subprocess.Popen([sys.executable,str(ROOT/'local_stata/assistant.py')],env=env,stdout=log,stderr=log)
evidence=[]
try:
    for _ in range(40):
        try:
            with urllib.request.urlopen(LOCAL+'/',timeout=1) as r:html=r.read().decode()
            break
        except Exception:time.sleep(.3)
    csrf=re.search("const token='([a-f0-9]+)'",html).group(1)
    site('/api/auth/register',{'username':'dual_'+str(time.time_ns()),'password':TEST_PASSWORD,'password_confirmation':TEST_PASSWORD})
    state=site('/api/sessions',{});sid=state['session_id']
    pair=local('/pair',{'site':SITE});site('/api/local-stata/pairings/claim',{'session_id':sid,'code':pair['code']})
    for engine,bridge,compare in [('stata_local_mcp','stata_mcp',False),('stata_local_mcp','stata_code',True),('statspai_local','statspai_python',False)]:
        for method in ('ols','panel_fe','did'):
            fixture=json.loads((ROOT/'outputs/mcp-fixtures'/f'{method}.json').read_text(encoding='utf-8'))
            file=out/(method+'.csv');file.write_text(fixture['text'],encoding='utf-8')
            local('/input',{'path':str(file)})
            wait(lambda s:s['paired'] and s.get('engines',{}).get('statspai_local',{}).get('available'))
            for _ in range(30):
                info=site('/api/local-stata/pairings?session_id='+sid)['pairing']
                if info['profile'] and info['input_sha256']==hashlib.sha256(file.read_bytes()).hexdigest():break
                time.sleep(.5)
            state=site('/api/sessions/'+sid)
            payload={'session_id':sid,'kind':'template','request_id':str(uuid.uuid4()),'engine_id':engine,'bridge_id':bridge,'compare':compare,
                     'research_revision':state['research_revision'],'input_sha256':info['input_sha256'],'confirmed':True,'plan':dict(fixture['plan'],missing='drop',same_batch=True)}
            task=site('/api/local-stata/tasks',payload)['task']
            assert site('/api/local-stata/tasks',payload)['task']['id']==task['id'],'重复请求重新执行'
            waiting=wait(lambda s:(s.get('task') or {}).get('id')==task['id'] and s['task']['status']=='awaiting_approval')
            assert waiting['result'] is None
            assert not list((Path(waiting['work_directory'])).glob('*/metadata.csv')),'未批准执行'
            if engine=='stata_local_mcp':
                for _ in range(40):
                    prepared=next(t for t in site('/api/local-stata/pairings?session_id='+sid)['tasks'] if t['id']==task['id'])
                    if prepared.get('teaching_preview'): break
                    time.sleep(.25)
                preview=prepared['teaching_preview'];script=(Path(waiting['work_directory'])/'estimate.do').read_bytes()
                assert preview['script_sha256']==hashlib.sha256(script).hexdigest()
                for command in preview['commands']: assert script.decode().splitlines()[command['line']-1]==command['text']
                main=next(c for c in preview['commands'] if c['topic']=='estimate')
                from urllib.parse import urlencode
                params=dict(session_id=sid,task_id=task['id'],command_id=main['id'],preview_hash=preview['preview_hash'])
                lesson=site('/api/local-stata/tasks/lesson?'+urlencode(params));assert lesson['card']['example']==main['text']
                state=site('/api/sessions/'+sid);revision=state['research_revision']
                reply=site('/api/research/chat',dict(params,intent='stata_explain',message='这条命令的标准误是什么意思？',research_revision=revision,request_id=str(uuid.uuid4())))
                assert reply['research_revision']==revision and reply['message']['stata_reference']['task_id']==task['id']
                assert reply['message']['dialogue']['learning_card']['command_id']==main['id']
                assert '固定语法' in reply['message']['dialogue']['summary']
            local('/approve',{})
            ready=wait(lambda s:(s.get('task') or {}).get('status')=='awaiting_upload')
            assert ready['result']['n_used'] in (160,384)
            before=next(t for t in site('/api/local-stata/pairings?session_id='+sid)['tasks'] if t['id']==task['id'])
            assert before['result'] is None,'未批准上传'
            local('/upload',{})
            saved=next(t for t in site('/api/local-stata/pairings?session_id='+sid)['tasks'] if t['id']==task['id'])
            assert saved['status']=='succeeded' and saved['engine_id']==engine
            assert str(file) not in json.dumps(saved) and fixture['text'] not in json.dumps(saved)
            if engine=='stata_local_mcp':
                resultlesson=site('/api/local-stata/tasks/lesson?'+urlencode(dict(params,focus='sample')))
                assert str(saved['result']['n_used']) in resultlesson['card']['content']
            if compare:
                assert saved['result']['comparison']['status']==('passed' if method=='ols' else 'unable_to_compare')
            site('/api/local-stata/tasks/reflection',{'session_id':sid,'task_id':saved['id'],'record_version':saved['record_version'],'answer':'模拟结果用于练习；系数体现条件关联，尚不能证明因果，需核对单位和识别条件。'})
            report=site('/api/sessions/'+sid+'/learning-report/json')
            reported=next(t for t in report['local_stata_tasks'] if t['id']==saved['id'])
            assert reported['record_version']==3 and reported['result']==saved['result']
            evidence.append({'engine':engine,'bridge':bridge,'method':method,'compare':compare,'task_id':task['id'],'n_used':saved['result']['n_used'],'status':'passed'})
            (out/'evidence.json').write_text(json.dumps(evidence,ensure_ascii=False,indent=2),encoding='utf-8')
            print(evidence[-1],flush=True)
    for bridge in ('stata_mcp','stata_code'):
        state=site('/api/sessions/'+sid);info=site('/api/local-stata/pairings?session_id='+sid)['pairing']
        task=site('/api/local-stata/tasks',{'session_id':sid,'kind':'code','request_id':str(uuid.uuid4()),'engine_id':'stata_local_mcp','bridge_id':bridge,
            'code':'sleep 30000\ndisplay 9','research_revision':state['research_revision'],'input_sha256':info['input_sha256'],'confirmed':True})['task']
        wait(lambda s:(s.get('task') or {}).get('id')==task['id'] and s['task']['status']=='awaiting_approval')
        local('/approve',{});wait(lambda s:(s.get('task') or {}).get('status')=='running');time.sleep(2)
        started=time.monotonic();local('/cancel',{})
        wait(lambda s:(s.get('task') or {}).get('status')=='cancelled',20)
        saved=next(t for t in site('/api/local-stata/pairings?session_id='+sid)['tasks'] if t['id']==task['id'])
        assert saved['status']=='cancelled' and saved['result'] is None
        evidence.append({'bridge':bridge,'cancel_seconds':time.monotonic()-started,'status':'passed'})
        (out/'evidence.json').write_text(json.dumps(evidence,ensure_ascii=False,indent=2),encoding='utf-8')
    print('Evidence:',out,flush=True)
finally:
    process.terminate()
    try:process.wait(timeout=10)
    except subprocess.TimeoutExpired:
        subprocess.run(['taskkill','/PID',str(process.pid),'/T','/F'],capture_output=True);process.wait()
    log.close()
