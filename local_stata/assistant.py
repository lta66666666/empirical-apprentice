"""Outbound paired Stata assistant. No cloud request executes without local approval."""
import csv, hashlib, io, json, math, os, secrets, sys, threading, time, urllib.request, urllib.error, zipfile, subprocess, importlib.util
from pathlib import Path
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT.parent / 'executor'))
from engines import stata_script
from stata_teaching import teaching_manifest
from dual_engines import comparison, pinned_versions
from process_guard import ProcessGuard
HOME = Path(os.environ.get('EA_LOCAL_STATA_DIR', Path.home() / 'AppData/Local/EmpiricalApprentice'))
HOME.mkdir(parents=True, exist_ok=True)
CSRF = secrets.token_hex(32)
LOCK = threading.RLock()
STATE = {'paired':False,'online':False,'mcp_available':False,'task':None,'error':'','code':'','result':None}
CONFIG = {}
INPUT = None
CURRENT = None
STOP = threading.Event()

def digest(data): return hashlib.sha256(data).hexdigest()
def http(url, payload=None, headers=None, timeout=15, method=None):
    data = None if payload is None else json.dumps(payload, ensure_ascii=False).encode()
    req = urllib.request.Request(url, data=data, headers={'Content-Type':'application/json','User-Agent':'EmpiricalApprenticeLocal/0.1 (Windows; Stata MCP client)', **(headers or {})}, method=method)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        text = r.read().decode()
        return json.loads(text) if text else {}, dict(r.headers)

def remote(action, payload):
    return http(CONFIG['site'] + '/api/local-stata/agent/' + CONFIG['id'] + '/' + action, payload,
                {'Authorization':'Bearer ' + CONFIG['token']})[0]

class MCP:
    def __init__(self): self.id=0; self.session=None
    def call(self, method, params=None, timeout=15, notification=False):
        self.id+=1
        body={'jsonrpc':'2.0','method':method,'params':params or {}}
        if not notification: body['id']=self.id
        headers={'Content-Type':'application/json','Accept':'application/json, text/event-stream','MCP-Protocol-Version':'2024-11-05'}
        if self.session: headers['Mcp-Session-Id']=self.session
        req=urllib.request.Request('http://127.0.0.1:4000/mcp-streamable',data=json.dumps(body).encode(),headers=headers)
        with urllib.request.urlopen(req,timeout=timeout) as r:
            self.session=r.headers.get('Mcp-Session-Id') or self.session
            text=r.read().decode()
        if notification or not text: return {}
        if text.startswith('event:') or text.startswith('data:'):
            messages=[json.loads(line[5:].strip()) for line in text.splitlines() if line.startswith('data:')]
            value=next((x for x in messages if x.get('id')==self.id),{})
        else: value=json.loads(text)
        if 'error' in value: raise RuntimeError(str(value['error']))
        result=value.get('result',{})
        if result.get('isError'): raise RuntimeError('Stata MCP returned an execution error; inspect the local log.')
        return result
    def initialize(self):
        self.call('initialize',{'protocolVersion':'2024-11-05','capabilities':{},'clientInfo':{'name':'empirical-apprentice-local','version':'0.1.0'}})
        self.call('notifications/initialized',notification=True)
    def tool(self,name,args,timeout=15): return self.call('tools/call',{'name':name,'arguments':args},timeout)

def stop_session(session):
    if not session or not session.startswith('ea_'): return False
    for action in ('stop','destroy'):
        try:
            if action=='stop': http('http://127.0.0.1:4000/sessions/'+session+'/stop',{})
            else: http('http://127.0.0.1:4000/sessions/'+session,method='DELETE')
        except Exception: pass
    try:
        listed=http('http://127.0.0.1:4000/sessions')[0]
        return listed.get('multi_session_enabled') is True and not any(s['session_id']==session for s in listed.get('sessions',[]))
    except Exception: return False

def stop_current(current):
    """Terminate only this task's owned process tree or MCP session."""
    proc = current.get('process')
    if proc and proc.poll() is None:
        if os.name == 'nt':
            subprocess.run(['taskkill','/PID',str(proc.pid),'/T','/F'],capture_output=True,timeout=15)
        else: proc.kill()
        proc.wait(timeout=15)
    return stop_session(current['session']) if current['task'].get('bridge_id','stata_mcp') == 'stata_mcp' else True

def engine_capabilities():
    caps = {'stata_mcp':{'available':STATE['mcp_available'],'version':STATE.get('mcp_version',''), 'acceptance':'experimental'},
            'stata_code':{'available':False,'acceptance':'experimental'}, 'statspai_local':{'available':False,'acceptance':'experimental'}}
    try:
        versions = pinned_versions()
        if sys.version_info[:2] != (3,11): raise ValueError('双引擎需要独立 Python 3.11 环境')
        caps['statspai_local'].update(available=importlib.util.find_spec('statspai') is not None,version=versions['statspai'])
        # Discovery is not runtime acceptance. Do not start licensed Stata in a heartbeat.
        from stata_code.core._runtime import _candidate_pystata_paths
        caps['stata_code'].update(available=any(Path(p).exists() for p in _candidate_pystata_paths()),version=versions['stata-code'])
    except Exception as error:
        caps['stata_code']['reason'] = caps['statspai_local']['reason'] = str(error)[:200]
    return caps

def read_input(path):
    path=Path(path).expanduser().resolve()
    data=path.read_bytes()
    if len(data)>2_000_000: raise ValueError('文件超过2 MB。')
    text=data.decode('utf-8-sig')
    rows=list(csv.reader(io.StringIO(text),delimiter='\t' if path.suffix.lower()=='.tsv' else ','))
    if len(rows)<2 or len(rows)>20001 or not 1<=len(rows[0])<=60: raise ValueError('需要1–20000行、1–60列。')
    names=rows[0]
    if len(set(names))!=len(names) or any(not n or len(n)>100 for n in names): raise ValueError('列名为空、重复或过长。')
    if any(len(row)!=len(names) for row in rows[1:]): raise ValueError('行列数不一致。')
    columns=[]
    for i,name in enumerate(names):
        values=[row[i] for row in rows[1:] if row[i].strip() not in ('','NA','N/A','null','NaN')]
        try: numeric=bool(values) and all(math.isfinite(float(x)) for x in values)
        except ValueError: numeric=False
        columns.append({'name':name,'numeric':numeric,'missing':len(rows)-1-len(values)})
    return {'path':str(path),'data':data,'rows':rows,'hash':digest(data),'profile':{'row_count':len(rows)-1,'columns':columns}}

def prepare(task):
    global CURRENT
    if not INPUT or INPUT['hash']!=task['input_sha256']: raise ValueError('请选择提交任务时的同一输入文件。')
    directory=HOME/'tasks'/task['id']; directory.mkdir(parents=True,exist_ok=True)
    aliases={name:f'v{i}' for i,name in enumerate(INPUT['rows'][0])}
    with (directory/'normalized.csv').open('w',newline='',encoding='utf-8') as f:
        writer=csv.writer(f);writer.writerow(list(aliases.values()));writer.writerows(INPUT['rows'][1:])
    (directory/'input.csv').write_bytes(INPUT['data'])
    if task['kind']=='template':
        plan=dict(task['plan'])
        for key in ('outcome','unit','time','treated','cluster'): plan[key]=aliases.get(plan.get(key),'')
        plan['predictors']=[aliases[n] for n in plan['predictors']]
        plan['labels']={v:k for k,v in aliases.items()}
        code,command=stata_script(plan); code=code.replace('exit, clear\n','')
    else:
        code='version 18.0\nclear all\nset more off\ncapture log close _all\nlog using execution.log, text replace\nimport delimited using normalized.csv, clear\n'+task['code']+'\nfile open ea_version using version.txt, write replace\nfile write ea_version (c(stata_version))\nfile close ea_version\nlog close _all\n'
        plan=None;command='User approved code'
    (directory/'estimate.do').write_text(code,encoding='utf-8',newline='\n')
    CURRENT={'task':task,'dir':directory,'code':code,'hash':digest(code.encode()),'plan':plan,'command':command,'session':'ea_'+task['id'].replace('-','')}
    engine = task.get('engine_id','stata_local_mcp')
    bridge = task.get('bridge_id','stata_mcp')
    if engine not in ('stata_local_mcp','statspai_local') or bridge not in ('stata_mcp','stata_code','statspai_python'): raise ValueError('不支持的本机引擎')
    if task['kind'] != 'template' and (engine != 'stata_local_mcp' or task.get('comparison_id')): raise ValueError('通用代码只开放真实 Stata 单引擎')
    legs = ['statspai_local'] if engine == 'statspai_local' else [bridge]
    if task.get('comparison_id'): legs.append('statspai_local')
    CURRENT['legs'] = legs
    frozen = {'estimate.do':code}
    if any(x != 'stata_mcp' for x in legs):
        frozen['dual_engines.py'] = (ROOT/'dual_engines.py').read_text(encoding='utf-8')
        frozen['adapter-request.json'] = json.dumps({'plan':plan,'session':CURRENT['session']}, ensure_ascii=False,sort_keys=True)
    for name,text in frozen.items(): (directory/name).write_text(text,encoding='utf-8',newline='\n')
    CURRENT['frozen'] = {name:digest(text.encode()) for name,text in frozen.items()}
    CURRENT['frozen'].update({name:digest((directory/name).read_bytes()) for name in ('input.csv','normalized.csv')})
    CURRENT['hash'] = digest(json.dumps(CURRENT['frozen'],sort_keys=True).encode())
    CURRENT['code'] = '\n\n'.join('### '+name+'\n'+text for name,text in frozen.items())
    if task['status']!='awaiting_upload':
        (directory/'manifest.json').write_text(json.dumps({'task':task,'code_sha256':CURRENT['hash'],'input_sha256':INPUT['hash'],'approved':False},ensure_ascii=False,indent=2),encoding='utf-8')
    STATE.update(task=task,code=CURRENT['code'],work_directory=str(directory),input_file=INPUT['path'],result=None,error='')
    if task['kind']=='template' and engine=='stata_local_mcp' and task['status']=='awaiting_approval':
        preview=teaching_manifest(code,plan,task['profile']['columns'])
        preview.update(input_sha256=task['input_sha256'],plan_sha256=task['plan_sha256'],code_sha256=CURRENT['hash'],script_sha256=CURRENT['frozen']['estimate.do'])
        CURRENT['teaching_preview']=preview
        try:
            remote('preview',{'task_id':task['id'],'preview':preview})
            CURRENT['preview_sent']=True
        except Exception:
            STATE['error']='教学预览未同步，可稍后重试；本机完整代码及批准流程仍保留。'


def result_from_files(current):
    folder=current['dir'];task=current['task']
    if task['kind']!='template':
        return {'summary':'通用批准代码已实际执行；未自动提取统计量。完整日志与输出保存在本机。','software_version':'Stata '+(folder/'version.txt').read_text().strip()}
    meta=next(csv.DictReader((folder/'metadata.csv').open(encoding='utf-8')))
    full=list(csv.DictReader((folder/'coefficients.csv').open(encoding='utf-8')))
    plan=current['plan']; coefficients=[]
    for row in full:
        alias=row['term']
        if alias not in plan['predictors']+(['policy_effect'] if plan['method']=='did' else [])+(['_cons'] if plan['method']=='ols' else []): continue
        item={key:float(row[key]) for key in ('estimate','std_error','p_value','ci_low','ci_high')}
        if not all(math.isfinite(v) for v in item.values()): raise ValueError('系数非有限数值。')
        item['term']='(Intercept)' if alias=='_cons' else 'DID effect' if alias=='policy_effect' else plan['labels'][alias]
        coefficients.append(item)
    used=[int(row['ea_row']) for row in csv.DictReader((folder/'sample.csv').open(encoding='utf-8'))]
    omitted=[plan['labels'].get(row['term'].removeprefix('o.'),row['term']) for row in full if float(row['std_error'])==0]
    return {'summary':'本机 Stata 实际执行；网站没有独立复算。显著性不自动证明因果。','software_version':'Stata '+meta['version'],'statistic_export_version':2,'n_used':int(float(meta['n_used'])),'coefficients':coefficients,'used_indices':used,'omitted_terms':omitted,'inference':{'df':float(meta['df']),'vcov':plan['vcov'],'cluster':current['task'].get('plan',{}).get('cluster',''),'confidence':.95,'correction':'Stata regress/xtreg finite sample correction'}}

def run_leg(current, adapter):
    folder=current['dir']/adapter;folder.mkdir(exist_ok=True)
    for name in ('normalized.csv','input.csv','estimate.do','dual_engines.py'):
        source=current['dir']/name
        if source.exists(): (folder/name).write_bytes(source.read_bytes())
    if adapter=='stata_mcp':
        mcp=MCP();mcp.initialize()
        timer=threading.Timer(120,lambda:stop_session(current['session']));timer.start()
        try:
            response=mcp.tool('stata_run_file',{'file_path':str(folder/'estimate.do'),'working_dir':str(folder),'session_id':current['session'],'timeout':120},130)
            (folder/'mcp-response.json').write_text(json.dumps(response,ensure_ascii=False),encoding='utf-8')
        finally: timer.cancel();stop_session(current['session'])
    else:
        payload=json.loads((current['dir']/'adapter-request.json').read_text(encoding='utf-8'));payload['adapter']=adapter
        (folder/'adapter-request.json').write_text(json.dumps(payload,ensure_ascii=False),encoding='utf-8')
        env=dict(os.environ,OMP_NUM_THREADS='1',OPENBLAS_NUM_THREADS='1')
        home=env.get('STATA_HOME') or env.get('STATA_PATH')
        if home and (Path(home)/'ado/base/py/sfi.py').exists():
            env['PYTHONPATH']=str(Path(home)/'ado/base/py')+os.pathsep+env.get('PYTHONPATH','')
        with (folder/'adapter.log').open('w',encoding='utf-8') as log:
            # Windows venv launchers may spawn the real interpreter before a
            # Job Object can be assigned. Use the actual interpreter, wait for
            # ownership assignment, then load the pinned venv packages.
            bootstrap="import sys;sys.stdin.buffer.read(1);import site,runpy;packages,script,folder=sys.argv[1:];site.addsitedir(packages);sys.argv=[script,folder];runpy.run_path(script,run_name='__main__')"
            packages=str(Path(sys.prefix)/('Lib/site-packages' if os.name=='nt' else 'lib/python3.11/site-packages'))
            env['PYTHONPATH']=packages+os.pathsep+env.get('PYTHONPATH','')
            current['process']=subprocess.Popen([getattr(sys,'_base_executable',sys.executable),'-c',bootstrap,packages,str(folder/'dual_engines.py'),str(folder)],stdin=subprocess.PIPE,stdout=log,stderr=subprocess.STDOUT,env=env)
            guard=ProcessGuard(current['process'])
            current['process'].stdin.write(b'1');current['process'].stdin.close()
            try: rc=current['process'].wait(timeout=120)
            except subprocess.TimeoutExpired:
                stop_current(current);raise TimeoutError('本机计算超过120秒，所属进程已停止')
            finally: guard.close()
        if rc: raise RuntimeError('本机适配器失败，请查看 '+str(folder/'adapter.log'))
    result=json.loads((folder/'adapter-result.json').read_text(encoding='utf-8')) if adapter=='statspai_local' else result_from_files(dict(current,dir=folder))
    result.update(engine_id='statspai_local' if adapter=='statspai_local' else 'stata_local_mcp',bridge_id='statspai_python' if adapter=='statspai_local' else adapter,
                  execution_location='local_python' if adapter=='statspai_local' else 'local_mcp',input_sha256=current['task']['input_sha256'],plan_sha256=current['task']['plan_sha256'])
    return result

def run_current(current):
    try:
        if current['task']['status']!='approving': return
        bridge_key=current['task'].get('bridge_id','stata_mcp')
        accepted=remote('event',{'task_id':current['task']['id'],'status':'running','code_sha256':current['hash'],'input_sha256':current['task']['input_sha256'],'mcp_version':STATE.get('mcp_version',''),
                               'bridge_id':bridge_key,'bridge_version':STATE.get('engines',{}).get('statspai_local' if bridge_key=='statspai_python' else bridge_key,{}).get('version','')})
        if accepted['task']['status']!='running' or current['task']['status']!='approving': return
        current['task']['status']='running';STATE['task']=current['task']
        (current['dir']/'manifest.json').write_text(json.dumps({'task':current['task'],'code_sha256':current['hash'],'input_sha256':current['task']['input_sha256'],'approved':True,'approved_at':time.time()},ensure_ascii=False,indent=2),encoding='utf-8')
        result=run_leg(current,current['legs'][0])
        if len(current['legs'])==2:
            if current['task']['status']!='running': return
            try:
                other=run_leg(current,current['legs'][1]);result['comparison_result']=other
                result['comparison']=comparison(result,other)
            except Exception as error:
                result['comparison']={'status':'unable_to_compare','reasons':[str(error)]}
            result['comparison_id']=current['task']['comparison_id']
        if current['task']['status']=='cancelled': return
        if current['task']['status']=='cancel_requested':
            remote('event',{'task_id':current['task']['id'],'status':'cancelled'});current['task']['status']='cancelled';return
        remote('event',{'task_id':current['task']['id'],'status':'awaiting_upload'})
        current['task']['status']='awaiting_upload';STATE['result']=result
        (current['dir']/'result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
        with zipfile.ZipFile(current['dir']/'reproduction.zip','w',zipfile.ZIP_DEFLATED) as archive:
            for file in current['dir'].rglob('*'):
                if file.is_file() and file.name!='reproduction.zip': archive.write(file,str(file.relative_to(current['dir'])))
    except Exception as error:
        if current['task']['status']=='cancelled': return
        if CURRENT is current: STATE['error']=str(error)
        status='cancelled' if current['task']['status']=='cancel_requested' else 'failed'
        try: remote('event',{'task_id':current['task']['id'],'status':status})
        except Exception: pass
        current['task']['status']=status;stop_current(current)

def poll():
    while not STOP.wait(3):
        try:
            try:
                health=http('http://127.0.0.1:4000/health')[0]
                STATE.update(mcp_available=health.get('stata_available') is True,mcp_version=health.get('version',''))
            except Exception: STATE['mcp_available']=False
            if not CONFIG: continue
            STATE['engines']=engine_capabilities()
            payload={'mcp_available':STATE['mcp_available'],'mcp_version':STATE.get('mcp_version',''),'engines':STATE['engines']}
            if INPUT: payload.update(profile=INPUT['profile'],input_sha256=INPUT['hash'])
            paired=remote('heartbeat',payload);STATE.update(paired=paired['paired'],online=True)
            if not paired['paired']: continue
            task=remote('claim',{})['task']
            if not task: continue
            if task['status']=='cancel_requested':
                if CURRENT and CURRENT['task']['id']==task['id'] and CURRENT['task']['status']=='running':
                    CURRENT['task']['status']='cancel_requested'
                    if stop_current(CURRENT):
                        remote('event',{'task_id':task['id'],'status':'cancelled'});CURRENT['task']['status']='cancelled'
                else: remote('event',{'task_id':task['id'],'status':'cancelled'});STATE['task']=dict(task,status='cancelled')
            elif not CURRENT or CURRENT['task']['id']!=task['id']:
                if task['status']=='awaiting_approval':
                    prepare(task)
                elif task['status']=='running':
                    stop_session('ea_'+task['id'].replace('-',''));remote('event',{'task_id':task['id'],'status':'interrupted'})
                    STATE['error']='助手重启后没有自动重跑；原任务标记为已中断。'
                elif task['status']=='awaiting_upload':
                    prepare(task);result_path=CURRENT['dir']/'result.json'
                    if result_path.exists(): STATE['result']=json.loads(result_path.read_text(encoding='utf-8'));CURRENT['task']['status']='awaiting_upload'
            if CURRENT and CURRENT['task']['status']=='awaiting_approval' and CURRENT.get('teaching_preview') and not CURRENT.get('preview_sent'):
                try:
                    remote('preview',{'task_id':CURRENT['task']['id'],'preview':CURRENT['teaching_preview']})
                    CURRENT['preview_sent']=True
                    STATE['error']=''
                except Exception: pass
        except Exception as error:
            STATE.update(online=False,error=str(error))
            if isinstance(error,urllib.error.HTTPError) and error.code==401 and CURRENT: stop_current(CURRENT)

PAGE='''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>实证学徒 · 本机计算助手</title><style>body{font:16px/1.6 system-ui;max-width:1000px;margin:30px auto;padding:20px;color:#19383b;background:#f6faf9}button,input,textarea{font:inherit;padding:12px;margin:8px 0;box-sizing:border-box}button{background:#087e76;color:white;border:0;border-radius:8px;cursor:pointer}input,textarea{width:100%}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:white;padding:20px}section{margin:20px 0}h1{font-size:26px}</style><h1>本机计算助手（试验）</h1><p>4000端口只在本机使用。代码以你的系统账号权限执行，工作目录不是权限沙箱。原始输入和完整日志保存在本机。</p><section><label>网站HTTPS地址</label><input id="site" placeholder="https://你的站点"><button onclick="act('pair',{site:site.value})">生成五分钟配对码</button><p id="pair"></p></section><section><label>本机CSV/TSV路径（不发送到网站）</label><input id="path"><button onclick="act('input',{path:path.value})">读取字段摘要</button></section><section><h2>执行前核对</h2><p id="state"></p><pre id="paths"></pre><textarea id="code" rows="18" readonly></textarea><p>本次最终代码与输入已经冻结。修改输入后须重新提交任务。仅在理解代码时批准。</p><button id="approve" onclick="act('approve',{})">批准本次完整代码并运行</button><button onclick="act('cancel',{})">取消当前任务</button></section><section><h2>拟上传内容预览</h2><pre id="result"></pre><button id="upload" onclick="act('upload',{})">确认上传以上结果摘要</button><a href="/reproduction.zip">下载本机完整复现包</a><p>不上传原始输入或完整日志。摘要可能含你的研究信息，请逐项检查。</p></section><script>const token='__TOKEN__';async function act(action,data){try{let r=await fetch('/'+action,{method:'POST',headers:{'Content-Type':'application/json','X-Local-CSRF':token},body:JSON.stringify(data)});let x=await r.json();if(!r.ok)throw Error(x.error);if(x.code)pair.textContent='配对码：'+x.code+'（五分钟内在网站输入）';await refresh()}catch(e){alert(e.message)}}async function refresh(){let r=await fetch('/state',{headers:{'X-Local-CSRF':token}});let s=await r.json();state.textContent=[s.paired?'已配对':'待配对',s.online?'网站在线':'网站未连接','引擎：'+Object.entries(s.engines||{}).map(([k,v])=>k+':'+(v.available?'已发现':'不可用')).join(' / '),s.task?.status||'',s.error].join(' · ');paths.textContent='软件：'+(s.task?.engine_id||'待选择')+'；桥接器：'+(s.task?.bridge_id||'待选择')+'；双引擎对照：'+(s.task?.comparison_id?'已明确要求':'未要求')+'\\n输入：'+(s.input_file||'未选择')+'\\n工作目录：'+(s.work_directory||'未创建');code.value=s.code||'';result.textContent=s.result?JSON.stringify(s.result,null,2):'尚无结果';approve.disabled=s.task?.status!=='awaiting_approval';upload.disabled=s.task?.status!=='awaiting_upload'||!s.result}setInterval(refresh,3000);refresh();</script></html>'''

class Handler(BaseHTTPRequestHandler):
    def log_message(self,*args): pass
    def send(self,value,status=200,content='application/json'):
        data=value if isinstance(value,bytes) else json.dumps(value,ensure_ascii=False).encode()
        self.send_response(status);self.send_header('Content-Type',content);self.send_header('Cache-Control','no-store');self.send_header('X-Content-Type-Options','nosniff');self.send_header('X-Frame-Options','DENY');self.send_header('Content-Security-Policy',"frame-ancestors 'none'; default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'");self.send_header('Referrer-Policy','no-referrer');self.end_headers();self.wfile.write(data)
    def allowed(self): return self.headers.get('Host') in ('127.0.0.1:8767','localhost:8767') and self.headers.get('X-Local-CSRF')==CSRF and self.headers.get('Origin','http://127.0.0.1:8767') in ('http://127.0.0.1:8767','http://localhost:8767')
    def do_GET(self):
        if self.headers.get('Host') not in ('127.0.0.1:8767','localhost:8767'): return self.send({'error':'Host rejected'},403)
        if self.path=='/': return self.send(PAGE.replace('__TOKEN__',CSRF).encode(),content='text/html; charset=utf-8')
        if self.path=='/state' and self.allowed(): return self.send(STATE)
        if self.path=='/reproduction.zip' and CURRENT and (CURRENT['dir']/'reproduction.zip').exists() and self.headers.get('Sec-Fetch-Site') in ('same-origin','none'):
            return self.send((CURRENT['dir']/'reproduction.zip').read_bytes(),content='application/zip')
        self.send({'error':'Not found'},404)
    def do_POST(self):
        global CONFIG,INPUT
        if not self.allowed(): return self.send({'error':'本机来源或凭据无效'},403)
        try:
            size=int(self.headers.get('Content-Length','0'))
            if size>20000: raise ValueError('请求过大')
            body=json.loads(self.rfile.read(size) or b'{}')
            with LOCK:
                if self.path=='/pair':
                    if CURRENT and CURRENT['task']['status'] in ('running','awaiting_upload','awaiting_approval'): raise ValueError('先完成或取消当前任务。')
                    site=body['site'].rstrip('/')
                    from urllib.parse import urlparse
                    url=urlparse(site)
                    if url.scheme!='https' and not (os.getenv('EA_LOCAL_TEST')=='1' and url.hostname=='127.0.0.1'): raise ValueError('需要HTTPS网站地址。')
                    if url.username or url.password or url.query or url.fragment or url.path: raise ValueError('请填写站点根地址。')
                    token=secrets.token_hex(32);code=str(secrets.randbelow(900000)+100000)
                    paired=http(site+'/api/local-stata/agent/pair',{'token':token,'code':code})[0]
                    CONFIG={'site':site,'token':token,'id':paired['id']}
                    (HOME/'connection.json').write_text(json.dumps(CONFIG),encoding='utf-8')
                    return self.send({'code':code})
                if self.path=='/input':
                    if CURRENT and CURRENT['task']['status'] in ('running','awaiting_upload','awaiting_approval'): raise ValueError('任务已冻结输入，请先取消。')
                    INPUT=read_input(body['path']);STATE['input_file']=INPUT['path'];return self.send({'profile':INPUT['profile']})
                if self.path=='/approve':
                    if not CURRENT or CURRENT['task']['status']!='awaiting_approval': raise ValueError('没有等待批准的任务。')
                    if digest(Path(INPUT['path']).read_bytes())!=CURRENT['task']['input_sha256']: raise ValueError('输入文件已经变化，不能沿用批准。')
                    if any(digest((CURRENT['dir']/name).read_bytes())!=sha for name,sha in CURRENT['frozen'].items()): raise ValueError('代码或参数已经变化，请重新提交。')
                    CURRENT['task']['status']='approving'
                    threading.Thread(target=run_current,args=(CURRENT,),daemon=True).start();return self.send({'started':True})
                if self.path=='/cancel':
                    if CURRENT:
                        previous=CURRENT['task']['status'];CURRENT['task']['status']='cancel_requested';stopped=stop_current(CURRENT)
                        if previous in ('awaiting_approval','awaiting_upload','approving'): remote('event',{'task_id':CURRENT['task']['id'],'status':'cancelled'});CURRENT['task']['status']='cancelled'
                        elif previous=='running' and stopped:
                            # No worker remains; pending MCP HTTP response may still time out later.
                            remote('event',{'task_id':CURRENT['task']['id'],'status':'cancelled'});CURRENT['task']['status']='cancelled'
                    return self.send({'cancel_requested':True})
                if self.path=='/upload':
                    if not CURRENT or CURRENT['task']['status']!='awaiting_upload' or not STATE['result']: raise ValueError('先完成本机执行并查看摘要。')
                    remote('publish',{'task_id':CURRENT['task']['id'],'code_sha256':CURRENT['hash'],'input_sha256':CURRENT['task']['input_sha256'],'result':STATE['result']})
                    CURRENT['task']['status']='succeeded';return self.send({'uploaded':True})
                self.send({'error':'Not found'},404)
        except Exception as error: self.send({'error':str(error)},422)

if __name__=='__main__':
    if (HOME/'connection.json').exists(): CONFIG=json.loads((HOME/'connection.json').read_text(encoding='utf-8'))
    threading.Thread(target=poll,daemon=True).start()
    print('Local assistant: http://127.0.0.1:8767 ; original inputs remain local.')
    try: ThreadingHTTPServer(('127.0.0.1',8767),Handler).serve_forever()
    finally:
        STOP.set()
        if CURRENT: stop_current(CURRENT)
