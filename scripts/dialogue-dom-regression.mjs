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
 env.MODEL_BASE_URL='https://model.test/v1';env.MODEL_NAME='test';env.MODEL_API_KEY='test-only';
 const native=globalThis.fetch;globalThis.fetch=async()=>Response.json({choices:[{message:{content:JSON.stringify({method:null,reason:'请核对研究问题',questions:['变量单位是什么？'],proposed_cards:{question:'教育与收入'}})}}]});
 const dom=await open('/analysis'),w=dom.window,d=w.document;
 assert.equal(d.querySelector('.analysis-top').children.length,2);assert.equal(d.querySelector('#pane-research').hidden,true);assert.equal(d.querySelector('.analysis-overview').hidden,false);pass('初始简洁概览与固定两个上部容器');
 const input=w.eaConversation.input;input.value='我想研究教育和收入';input.dispatchEvent(new w.Event('input'));w.eaConversation.submit.click();
 await until(()=>d.querySelector('.analysis-proposal'),'proposal');assert.match(d.querySelector('.analysis-current-turn').textContent,/教育/);assert.equal(w.eval('latestState.preparation.cards.question'),undefined);
 const edit=d.querySelector('.analysis-proposal textarea');edit.value='学生核对后的问题';d.querySelector('.analysis-proposal .btn-primary').click();
 await until(()=>w.eval('latestState.preparation.cards.question?.value')==='学生核对后的问题');assert.equal(d.querySelector('#pane-preparation').hidden,false);assert.equal(d.querySelector('#pane-research').hidden,true);assert.equal(w.eval('latestState.preparation.cards.question.status'),'filled');pass('当前轮预览、编辑、应用与唯一任务区，无自动核实');
 const manual=[...d.querySelectorAll('.analysis-manual button')].find(n=>n.textContent==='数据');manual.click();await until(()=>!d.querySelector('#pane-research').hidden);assert.equal(d.querySelector('#pane-preparation').hidden,true);
 [...d.querySelectorAll('.module-toolbar button')].find(n=>n.textContent==='记录与报告').click();await until(()=>w.eval('eaTask')==='records');[...d.querySelectorAll('.module-toolbar button')].find(n=>n.textContent==='返回当前任务').click();assert.equal(w.eval('eaTask'),'research');pass('手动当前任务与报告往返不产生重复展示或递归');
 input.value='带我一步步做';input.dispatchEvent(new w.Event('input'));w.eaConversation.submit.click();await until(()=>[...d.querySelectorAll('.analysis-current-turn button')].some(n=>n.textContent==='开始分步引导'));
 [...d.querySelectorAll('.analysis-current-turn button')].find(n=>n.textContent==='开始分步引导').click();await until(()=>w.eval('latestState.analysis_workspace?.guide.status')==='active');
 [...d.querySelectorAll('.analysis-guide button')].find(n=>n.textContent==='暂停引导').click();await until(()=>w.eval('latestState.analysis_workspace.guide.status')==='paused');
 [...d.querySelectorAll('.analysis-guide button')].find(n=>n.textContent==='继续引导').click();await until(()=>w.eval('latestState.analysis_workspace.guide.status')==='active');pass('用户明确请求后开始、暂停和继续引导');
 assert.ok(d.querySelector('.context-material .prose'));assert.equal(d.querySelector('.knowledge-reading'),null);pass('知识显示对应材料正文，不复制整条聊天回复');
 const formula=d.querySelector('[aria-label="公式表达式"]');formula.value='y = β₀ + β₁x';formula.dispatchEvent(new w.Event('input'));assert.equal(d.querySelector('.analysis-formula output').textContent,formula.value);pass('公式可编辑与安全预览');


 globalThis.fetch=async()=>Response.json({choices:[{message:{content:JSON.stringify({method:'ols',outcome:'income',predictors:['education'],reason:'一般关联',questions:[],proposed_cards:{}})}}]});
 await w.researchSample('ols');input.value='使用OLS研究教育与收入关联';input.dispatchEvent(new w.Event('input'));w.eaConversation.submit.click();
 try{await until(()=>d.querySelector('.analysis-proposal select'),'candidate plan preview');}catch(e){console.log('candidate-debug',w.eval('JSON.stringify({status:eaConversation.status.textContent,last:latestState.practical_messages?.at(-1)?.output,dict:latestState.practical_messages?.at(-1)?.context?.dictionary})'));throw e;}
 const methodEdit=d.querySelector('.analysis-proposal select');assert.equal(methodEdit.value,'ols');
 d.querySelector('.analysis-proposal .btn-primary').click();await until(()=>d.querySelector('.analysis-proposal .btn-primary').textContent.includes('已应用'));
 assert.equal(w.eval('researchCandidate().outcome'),'income');assert.deepEqual(Array.from(w.eval('researchCandidate().predictors')),['education']);assert.equal(d.querySelector('#researchConfirm').checked,false);pass('真实模拟输入字段的候选预览与应用不勾选执行确认');

 env.MODEL_API_KEY='';env.MODEL_BASE_URL='';env.MODEL_NAME='';
 const sid=w.eval('sessionId'),owner=(await store.DB.prepare('SELECT owner FROM sessions WHERE id=?').bind(sid).first()).owner,id=crypto.randomUUID();
 const fixture={id,owner,session_id:sid,status:'succeeded',record_version:1,created:Date.now()/1000,last_activity:Date.now(),n_rows:1,execution_location:'browser_webr',engine_id:'browser_webr',plan:{method:'ols',outcome:'y',predictors:['x']},dictionary:{y:'测试单位',x:'测试单位'},description:{label:'测试夹具OLS',formula:'y ~ x',quiz:'用自己的话解释',checks:'不作为实际数值验收'},result:{n_used:1,coefficients:[],warnings:[],audit:{missing_removed_csv_lines:[],model_removed_count:0}},reflections:[]};
 await store.DB.prepare('INSERT INTO jobs(id,session_id,owner,body,status,input_key,created_at,last_activity) VALUES(?,?,?,?,?,?,?,?)').bind(id,sid,owner,JSON.stringify(fixture),'succeeded','test-fixture',Date.now(),Date.now()).run();
 w.researchWatch=async taskId=>{const response=await call('/api/research/jobs/'+taskId);w.eval('researchJob = '+JSON.stringify(await response.json()));};
 await w.eaOpenAnswer(id);assert.match(d.querySelector('.analysis-answer-mode').textContent,/首次/);
 input.value='首次解释：系数需要说明单位，关联不等于因果。';input.dispatchEvent(new w.Event('input'));w.eaConversation.submit.click();await until(()=>d.querySelector('.analysis-current-turn').textContent.includes('第 1 次解释'));
 input.value='修订：补充控制条件与遗漏变量局限。';input.dispatchEvent(new w.Event('input'));w.eaConversation.submit.click();await until(()=>d.querySelector('.analysis-current-turn').textContent.includes('第 2 次解释'));
 const report=await (await call('/api/sessions/'+sid+'/learning-report/json')).json();assert.equal(report.research_jobs.find(j=>j.id===id).reflections.length,2);pass('正式解释模式发送即提交，首次与修订进入同一持久报告（执行结果为测试夹具）');
 const countBeforeShortcut=report.research_jobs.find(j=>j.id===id).reflections.length;[...d.querySelectorAll('.dock-shortcuts button')].find(n=>n.textContent==='讲解知识点').click();await until(()=>d.querySelector('.analysis-answer-mode').textContent.includes('普通问答'));const unchanged=await (await call('/api/research/jobs/'+id)).json();assert.equal(unchanged.reflections.length,countBeforeShortcut);pass('快捷知识问答不被误提交为学生成果');
 const exit=[...d.querySelectorAll('button')].find(n=>n.textContent==='返回问答');exit.click();await until(()=>d.querySelector('.analysis-answer-mode').textContent.includes('普通问答'));assert.match(d.querySelector('.analysis-answer-mode').textContent,/普通问答/);

 await until(()=>!w.eval('busy')&&!w.eaConversation.submit.disabled);globalThis.fetch=native;
 assert.deepEqual(errors,[]);await writeFile('outputs/dialogue-dom-regression.json',JSON.stringify({date:new Date().toISOString(),scope:'JSDOM with actual Worker and controlled model; not real viewport/device',checks},null,2));
}finally{for(const dom of windows)dom.window.close();store.close();}
