import assert from 'node:assert/strict';
import {JSDOM,ResourceLoader,VirtualConsole} from '../outputs/ui-qa/node_modules/jsdom/lib/api.js';
import {webcrypto} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import {openStorage} from '../standalone/storage.mjs';
import worker from '../dist/server/index.js';
import {curriculum} from '../worker/content.js';
const store=await openStorage('outputs/interaction-dom-'+Date.now()),env={DB:store.DB,FILES:store.FILES},origin='https://dom.test',checks=[];
let auth='',errors=[],intercept=null;const windows=[];
async function call(url,opts={}){return worker.fetch(new Request(new URL(url,origin),{...opts,headers:{Origin:origin,Cookie:auth,...opts.headers}}),env);}
const registered=await call('/api/auth/register',{method:'POST',body:JSON.stringify({username:'dom_flow',password:'DOM-test-password12!',password_confirmation:'DOM-test-password12!'})});auth=registered.headers.get('set-cookie').split(';')[0];
class Loader extends ResourceLoader{fetch(url){return call(url).then(async r=>Buffer.from(await r.arrayBuffer()));}}
async function open(route,session){
  const console=new VirtualConsole();console.on('jsdomError',e=>{if(!e.message.includes('Not implemented'))errors.push(e.message);});
  const response=await call(route),dom=new JSDOM(await response.text(),{url:origin+route,runScripts:'dangerously',resources:new Loader(),pretendToBeVisual:true,virtualConsole:console,beforeParse(w){w.fetch=async(url,opts)=>{if(intercept){const r=await intercept(url,opts);if(r)return r;}return call(url,opts);};w.structuredClone=structuredClone;w.TextEncoder=TextEncoder;w.TextDecoder=TextDecoder;w.AbortSignal=AbortSignal;Object.defineProperty(w,'crypto',{value:webcrypto});w.matchMedia=()=>({matches:true,addEventListener(){},removeEventListener(){}});w.ResizeObserver=class{observe(){}disconnect(){}};w.HTMLElement.prototype.scrollIntoView=function(){};w.HTMLElement.prototype.scrollTo=function(){};w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};w.confirm=()=>true;if(session)w.localStorage.setItem('ea_account:'+JSON.parse(/window.EA_ACCOUNT=(.*?);window/.exec(response._html||'')?.[1]||'{}').id+':ea_session_id',session);}});
  windows.push(dom);await new Promise(r=>dom.window.addEventListener('load',()=>setTimeout(r,200)));await until(()=>dom.window.eval('!!latestState&&!busy'));return dom;
}
async function until(condition,label='operation'){const end=Date.now()+5000;while(Date.now()<end){if(condition())return;await new Promise(r=>setTimeout(r,10));}throw Error('Timed out: '+label);}
const pass=name=>{checks.push({name,result:'pass'});console.log('PASS',name);};
const visible=n=>n&&!n.hidden&&!n.closest('[hidden]');
try{
  const learn=await open('/learn'),w=learn.window,d=w.document;
  assert.equal(d.querySelectorAll('.course-card').length,8);assert.equal(d.querySelector('.layout').hidden,true);assert.equal(d.querySelector('.course-card .btn-primary').textContent,'开始学习');
  d.querySelectorAll('.course-card button')[7].click();await until(()=>visible(d.querySelector('#eaCoursePreview')));assert.match(d.querySelector('#eaCoursePreview').textContent,/预览/);
  d.querySelector('#eaCoursePreview button').click();assert.equal(d.querySelector('#eaCourseDirectory').hidden,false);
  d.querySelector('.course-card .btn-primary').click();await until(()=>w.eval('latestState.learning_context.status==="active"&&!busy'));assert.equal(d.querySelector('#lessonFocus').hidden,false);assert.ok(d.querySelector('#lessonPrompt').textContent);
  pass('首次目录、后续预览、返回目录与显式开课呈现真实内容');
  for(const item of curriculum.lessons){
    d.querySelector('[data-learn-pane="practice"]').click();await until(()=>!w.eval('busy'));
    for(const step of item.steps){const prior=w.eval('latestState.state_version');
      if(step.type==='choice'){const b=[...d.querySelectorAll('#lessonBox button')].find(n=>n.querySelector('.choice-key')?.textContent===String(step.answer));assert.ok(b);b.click();}
      else if(step.type==='calc'){d.querySelector('#calcInput').value=String(step.answer);d.querySelector('.calc-wrap').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));}
      else{d.querySelector('#userInput').value='研究问题、变量、单位与关联和因果需要核对。';d.querySelector('#userInput').dispatchEvent(new w.Event('input'));assert.equal(d.querySelector('#composerWrap').hidden,false);d.querySelector('#sendBtn').click();}
      await until(()=>w.eval('!busy&&latestState.state_version')>prior,'course answer');
    }
    const next=[...d.querySelectorAll('#lessonBox button')].find(n=>/继续|总结/.test(n.textContent));assert.ok(next);const prior=w.eval('latestState.state_version');next.click();await until(()=>w.eval('!busy&&latestState.state_version')>prior,'next lesson');
  }
  assert.equal(w.eval('latestState.learning_context.status'),'completed');assert.ok([...d.querySelectorAll('#quickActions button')].some(n=>n.textContent==='进入边分析边学'));pass('八阶段实际按钮、数值/自由作答、检查点与完成去向');
  w.eval("eaSetTask('tutorial')");assert.equal(d.querySelector('#pane-tutorial').hidden,false);w.eval("eaSetTask('prepare')");assert.equal(d.querySelector('#pane-preparation').hidden,false);w.eval("eaSetTask('research')");assert.equal(d.querySelector('#pane-research').hidden,false);
  [...d.querySelectorAll('.module-toolbar button')].find(n=>n.textContent==='记录与报告').click();await until(()=>w.eval('eaTask')==='records');assert.equal(d.querySelector('#pane-records').hidden,false);[...d.querySelectorAll('.module-toolbar button')].find(n=>n.textContent==='返回当前任务').click();assert.equal(w.eval('eaTask'),'research');assert.equal(d.querySelector('#pane-research').hidden,false);pass('导学、手算、准备、实操、报告往返不被旧页面覆盖');
  const analysis=await open('/analysis'),a=analysis.window,ad=a.document;
  const input=a.eaConversation.input;input.value='请解释OLS';input.dispatchEvent(new a.Event('input'));
  let release,started;const gate=new Promise(r=>release=r),entered=new Promise(r=>started=r);
  intercept=async(url,opts)=>{if(String(url)==='/api/research/chat'){const result=await call(url,opts);started();await gate;return result;}};
  a.eaConversation.submit.click();await entered;input.value='等待期间的新问题';input.dispatchEvent(new a.Event('input'));release();await until(()=>!a.eaConversation.submit.disabled);assert.equal(input.value,'等待期间的新问题');pass('迟到聊天回复不清空等待期间的新输入');intercept=null;
  a.confirm=()=>false;ad.querySelectorAll('.dock-shortcuts button')[1].click();assert.equal(input.value,'等待期间的新问题');a.confirm=()=>true;
  const type=ad.querySelector('.dock-format select');type.value='data';type.dispatchEvent(new a.Event('change',{bubbles:true}));input.value='x,y\n1,2\n2,3';input.dispatchEvent(new a.Event('input'));a.eaConversation.submit.click();await until(()=>!ad.querySelector('.fragment-preview').hidden);input.value+='\n3,4';input.dispatchEvent(new a.Event('input'));assert.equal(ad.querySelector('.fragment-preview').hidden,true);pass('快捷替换可取消，数据片段编辑立即撤销旧预览');
  await a.eval("researchSample('ols')");assert.equal(a.eval('researchData.fixture_method'),'ols');a.eval("document.getElementById('researchEngine').value='browser_webr';researchInvalidate()");
  let planRelease,planStarted;const planGate=new Promise(r=>planRelease=r),planEntered=new Promise(r=>planStarted=r);
  intercept=async(url,opts)=>{if(String(url).endsWith('/research/plan')){const r=await call(url,opts);planStarted();await planGate;return r;}};
  const pending=a.eval('researchMakePlan()');await planEntered;ad.querySelector('#researchMissing').value='drop';ad.querySelector('#researchMissing').dispatchEvent(new a.Event('change',{bubbles:true}));planRelease();await pending;assert.equal(a.eval('researchPlan'),null);assert.equal(ad.querySelector('#researchConfirm').checked,false);intercept=null;pass('参数变化后迟到方案不能恢复旧确认');
  type.value='question';type.dispatchEvent(new a.Event('change',{bubbles:true}));const sid=a.eval('sessionId');const entry=a.eval("eaDraftEntry('practical-chat')");input.value='统一保存队列测试';input.dispatchEvent(new a.Event('input'));let writes=0;
  intercept=async(url,opts)=>{if(String(url).includes('/drafts/practical-chat')&&opts?.method==='PUT'){writes++;await new Promise(r=>setTimeout(r,20));}};
  const results=await Promise.all([a.eval("eaFlushDraft('practical-chat')"),a.eval("eaFlushDraft('practical-chat')"),a.eval("eaFlushDraft('practical-chat')")]);assert.ok(results.every(Boolean));assert.equal(writes,1);assert.equal(entry.conflict,undefined);intercept=null;pass('同页多个保存调用共用一条串行队列');
  const remote=await call('/api/sessions/'+sid+'/drafts/practical-chat',{method:'PUT',body:JSON.stringify({version:entry.version,value:{message:'另一标签页的不同内容'}})});assert.equal(remote.status,200);
  input.value='本页未保存的新内容';input.dispatchEvent(new a.Event('input'));assert.equal(await a.eval("eaFlushDraft('practical-chat')"),false);assert.equal(entry.conflict,true);assert.equal(input.value,'本页未保存的新内容');entry.version=(await remote.json()).version;entry.conflict=false;entry.error='';await a.eval("eaFlushDraft('practical-chat')");pass('真实双标签版本冲突保留本页与服务器两份文字');
  let sampleRelease,sampleStarted;const sampleGate=new Promise(r=>sampleRelease=r),sampleEntered=new Promise(r=>sampleStarted=r);
  intercept=async(url,opts)=>{if(String(url).endsWith('/examples/ols')){const response=await call(url,opts);sampleStarted();await sampleGate;return response;}};
  const oldSample=a.eval("researchSample('ols')");await sampleEntered;await a.eval("researchSample('panel_fe')");sampleRelease();await oldSample;assert.equal(a.eval('researchData.fixture_method'),'panel_fe');assert.equal(ad.querySelector('#researchOutcome').value,a.eval('researchData.plan.outcome'));intercept=null;pass('乱序案例返回只采用最后一次选择的数据与字段');
  input.value='切换练习前的问题';input.dispatchEvent(new a.Event('input'));let chatRelease,chatStarted;const chatGate=new Promise(r=>chatRelease=r),chatEntered=new Promise(r=>chatStarted=r);
  type.value='question';type.dispatchEvent(new a.Event('change',{bubbles:true}));intercept=async(url,opts)=>{if(String(url)==='/api/research/chat'){const response=await call(url,opts);chatStarted();await chatGate;return response;}};
  a.eaConversation.submit.click();await chatEntered;await a.eval('newSession()');const newSid=a.eval('sessionId');assert.notEqual(newSid,sid);input.value='新练习保留的文字';input.dispatchEvent(new a.Event('input'));chatRelease();await new Promise(r=>setTimeout(r,50));assert.equal(input.value,'新练习保留的文字');assert.equal(ad.querySelectorAll('.pc-message').length,0);intercept=null;pass('切换练习后的旧聊天回复不能污染新练习');
  await a.eval('eaFlushAllDrafts()');intercept=async url=>String(url)==='/api/auth/logout'?Response.json({detail:'测试退出失败'},{status:503}):undefined;
  [...ad.querySelectorAll('.module-toolbar button')].find(n=>n.textContent==='退出').click();await until(()=>ad.querySelector('#toast').textContent.includes('退出未完成'));assert.equal(a.location.pathname,'/analysis');assert.equal((await call('/api/auth/me')).status,200);intercept=null;pass('退出失败保留当前页面，只有撤销确认成功才能跳转');
  const task={id:crypto.randomUUID(),session_id:newSid,status:'succeeded',kind:'template',created_at:Date.now(),record_version:1,plan:{method:'ols',outcome:'income',predictors:['education']},dictionary:{income:'千元',education:'年'},result:{n_used:10,coefficients:[{term:'education',estimate:1,std_error:.1,p_value:.01,ci_low:.8,ci_high:1.2}]},reflections:[]};
  intercept=async url=>String(url).startsWith('/api/local-stata/pairings?')?Response.json({pairing:null,tasks:[task]}):undefined;
  const local=ad.querySelector('#pcLocalStata');local.open=true;const refresh=[...local.querySelectorAll('button')].find(n=>n.textContent==='刷新设备与任务');refresh.click();await until(()=>local.querySelector('.pc-task textarea'));const answer=local.querySelector('.pc-task textarea');answer.value='轮询期间不应丢失的解释';answer.focus();answer.dispatchEvent(new a.Event('input'));task.record_version=2;task.reflections=[{answer:'先前回答',feedback:'测试状态更新'}];refresh.click();await until(()=>!refresh.disabled);assert.equal(local.querySelector('.pc-task textarea'),answer);assert.equal(answer.value,'轮询期间不应丢失的解释');assert.equal(ad.activeElement,answer);intercept=null;pass('Stata轮询更新反馈时保留同一个解释框、文字与焦点（模拟任务状态）');
  assert.deepEqual(errors,[]);await writeFile('outputs/interaction-dom-regression.json',JSON.stringify({scope:'JSDOM + actual Worker/SQLite; no viewport or real device claim',checks},null,2));
}finally{for(const dom of windows)dom.window.close();store.close();}
