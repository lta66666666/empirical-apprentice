"""Synthetic fixture end-to-end acceptance. Never uses user research files."""
import http.cookiejar,json,os,pathlib,re,subprocess,sys,time,urllib.request
ROOT=pathlib.Path(__file__).resolve().parents[1];SITE='http://127.0.0.1:8788';LOCAL='http://127.0.0.1:8767'
jar=http.cookiejar.CookieJar();browser=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
browser.addheaders=[('User-Agent','EmpiricalApprenticeAcceptance/0.1 (Windows; Stata MCP client)')]
def site(path,payload=None):
    request=urllib.request.Request(SITE+path,data=None if payload is None else json.dumps(payload).encode(),headers={'Origin':SITE,'Content-Type':'application/json'})
    try:
        with browser.open(request,timeout=30) as r:return json.load(r)
    except urllib.error.HTTPError as error: raise RuntimeError(error.read().decode()) from error
def local(path,payload=None):
    request=urllib.request.Request(LOCAL+path,data=None if payload is None else json.dumps(payload).encode(),headers={'Origin':LOCAL,'Content-Type':'application/json','X-Local-CSRF':csrf})
    try:
        with urllib.request.urlopen(request,timeout=40) as r:return json.load(r)
    except urllib.error.HTTPError as error: raise RuntimeError(error.read().decode()) from error
def wait(predicate,timeout=50):
    start=time.monotonic()
    while time.monotonic()-start<timeout:
        value=local('/state')
        if predicate(value):return value
        time.sleep(.5)
    raise RuntimeError('Acceptance deadline: '+str(value.get('error','')))
fixture=json.loads((ROOT/'outputs/mcp-fixtures/ols.json').read_text(encoding='utf-8'))
file=ROOT/'outputs/mcp-fixtures/ols.csv';file.write_text(fixture['text'],encoding='utf-8')
env={**os.environ,'EA_LOCAL_TEST':'1','EA_LOCAL_STATA_DIR':str(ROOT/'outputs'/('assistant-e2e-'+str(time.time_ns())))}
process=subprocess.Popen([sys.executable,str(ROOT/'local_stata/assistant.py')],env=env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
try:
    for _ in range(20):
        try:
            with urllib.request.urlopen(LOCAL+'/',timeout=1) as r:html=r.read().decode()
            break
        except Exception:time.sleep(.3)
    csrf=re.search("const token='([a-f0-9]+)'",html).group(1)
    state=site('/api/sessions',{});sid=state['session_id']
    pair=local('/pair',{'site':SITE});site('/api/local-stata/pairings/claim',{'session_id':sid,'code':pair['code']})
    local('/input',{'path':str(file)})
    wait(lambda s:s['paired'] and s['mcp_available'])
    info=site('/api/local-stata/pairings?session_id='+sid)['pairing']
    for _ in range(20):
        if info.get('profile') and info.get('input_sha256'):break
        time.sleep(.3);info=site('/api/local-stata/pairings?session_id='+sid)['pairing']
    assert info.get('input_sha256') and info.get('profile'),'Field summary not yet synchronized'
    created=site('/api/local-stata/tasks',{'session_id':sid,'kind':'template','research_revision':state['research_revision'],'input_sha256':info['input_sha256'],'confirmed':True,'plan':{**fixture['plan'],'missing':'drop'}})['task']
    waiting=wait(lambda s:(s.get('task') or {}).get('status')=='awaiting_approval')
    assert waiting['result'] is None and 'regress' in waiting['code']
    local('/approve',{})
    ready=wait(lambda s:(s.get('task') or {}).get('status')=='awaiting_upload',70)
    assert ready['result']['n_used']==160
    before=site('/api/local-stata/pairings?session_id='+sid)['tasks'][0]
    assert before['result'] is None,'Result uploaded without second local approval'
    local('/upload',{})
    task=site('/api/local-stata/pairings?session_id='+sid)['tasks'][0]
    assert task['status']=='succeeded' and task['result']['n_used']==160
    assert 'owner' not in task and str(file) not in json.dumps(task)
    site('/api/local-stata/tasks/reflection',{'session_id':sid,'task_id':task['id'],'record_version':task['record_version'],'answer':'教育年限系数约0.774千元每年；关联不等于因果。'})
    report=site('/api/sessions/'+sid+'/learning-report/json')
    assert report['local_stata_tasks'][0]['record_version']==3
    # Cancel a distinct long task and verify its actual session disappears.
    cancelled=site('/api/local-stata/tasks',{'session_id':sid,'kind':'code','code':'sleep 30000\ndisplay 9','research_revision':state['research_revision'],'input_sha256':info['input_sha256'],'confirmed':True})['task']
    wait(lambda s:(s.get('task') or {}).get('id')==cancelled['id'] and s['task']['status']=='awaiting_approval')
    local('/approve',{});wait(lambda s:(s.get('task') or {}).get('status')=='running')
    session='ea_'+cancelled['id'].replace('-','')
    for _ in range(20):
        with urllib.request.urlopen('http://127.0.0.1:4000/sessions') as r:sessions=json.load(r)
        if any(s['session_id']==session for s in sessions['sessions']):break
        time.sleep(.3)
    assert any(s['session_id']==session for s in sessions['sessions'])
    start=time.monotonic();local('/cancel',{});elapsed=time.monotonic()-start
    with urllib.request.urlopen('http://127.0.0.1:4000/sessions') as r:sessions=json.load(r)
    assert not any(s['session_id']==session for s in sessions['sessions'])
    assert site('/api/local-stata/pairings?session_id='+sid)['tasks'][0]['status']=='cancelled'
    evidence={'status':'passed','checks':['outbound pairing','local summary only','no execution before approval','real MCP OLS','no result upload before second approval','latest reflection in learning JSON','owner credential excluded','cancel removes only owned MCP session'],'cancel_seconds':round(elapsed,3),'n_used':160,'coefficients':task['result']['coefficients']}
    (ROOT/'outputs/assistant-e2e-evidence.json').write_text(json.dumps(evidence,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(evidence,ensure_ascii=False))
finally:process.terminate();process.wait(timeout=10)
