"""Live provider acceptance against the isolated candidate; no keys in output."""
import json,os,time,uuid,secrets,urllib.request,http.cookiejar
from pathlib import Path
origin=os.getenv('EA_TEST_URL','http://127.0.0.1:18795')
client=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
def api(path,body=None):
 req=urllib.request.Request(origin+path,headers={'Origin':origin,'Content-Type':'application/json'},data=None if body is None else json.dumps(body).encode())
 with client.open(req,timeout=35) as r:return json.load(r)
password=secrets.token_urlsafe(32)
api('/api/auth/register',dict(username='guide_'+str(time.time_ns()),password=password,password_confirmation=password))
state=api('/api/sessions',{})
turns=[]
try:
 for lesson,step,question in [('interface','locate','Stata的命令窗口和结果窗口有什么区别？'),('data','missing','每列缺失统计可以相加作为删除行数吗？'),('models','fixed-effects','xtreg, fe里的vce(robust)和regress的稳健标准误一样吗？')]:
  guide=api('/api/knowledge?guide=stata18&lesson_id='+lesson)
  assert any(s['id']==step for s in guide['guide']['lesson']['steps'])
  start=time.monotonic()
  response=api('/api/research/chat',dict(session_id=state['session_id'],state_version=state['state_version'],research_revision=state['research_revision'],request_id=str(uuid.uuid4()),intent='stata_guide',lesson_id=lesson,step_id=step,guide_version=guide['guide']['version'],message=question))
  m=response['message'];turns.append(dict(question=question,reply=m['content'],mode=m['output']['mode'],ms=round((time.monotonic()-start)*1000),reference=m['guide_reference']))
  assert m['output']['mode']=='model',m['output'].get('error_type','model unavailable')
  assert not m.get('actions') and m.get('related_task') is None
  assert response['research_revision']==state['research_revision']
  assert not any(label in m['content'] for label in ['analysis_context','lesson_','回答错误'])
  state=api('/api/sessions/'+state['session_id'])
  print('PASS live guide turn',len(turns))
 assert not state.get('local_stata_tasks')
 result=dict(status='passed',at=time.time(),provider='existing DeepSeek configuration',turns=turns)
except Exception as e:
 result=dict(status='failed',at=time.time(),error=type(e).__name__,turns=turns)
 raise
finally:
 Path('outputs/operation-guide-live.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
