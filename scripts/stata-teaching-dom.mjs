import assert from 'node:assert/strict';
import {JSDOM,ResourceLoader,VirtualConsole} from '../outputs/ui-qa/node_modules/jsdom/lib/api.js';
import {webcrypto} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import {openStorage} from '../standalone/storage.mjs';
import worker from '../dist/server/index.js';
import {expectedStataTeaching,validateStataPreview} from '../worker/stata-teaching.js';
import {curriculum} from '../worker/content.js';
const store=await openStorage('outputs/interaction-dom-'+Date.now()),env={DB:store.DB,FILES:store.FILES},origin='https://dom.test',checks=[];
let auth='',errors=[],intercept=null;const windows=[];
async function call(url,opts={}){return worker.fetch(new Request(new URL(url,origin),{...opts,headers:{Origin:origin,Cookie:auth,...opts.headers}}),env);}
const testPassword=crypto.randomUUID()+'aA1!';
const registered=await call('/api/auth/register',{method:'POST',body:JSON.stringify({username:'dom_flow',password:testPassword,password_confirmation:testPassword})});auth=registered.headers.get('set-cookie').split(';')[0];
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
 const dom=await open('/analysis'),w=dom.window,d=w.document,state=w.eval('latestState'),sid=state.session_id;state.owner_id=(await env.DB.prepare('SELECT owner FROM sessions WHERE id=?').bind(sid).first()).owner;
 const task={id:crypto.randomUUID(),session_id:sid,pairing_id:crypto.randomUUID(),owner:state.owner_id,kind:'template',engine_id:'stata_local_mcp',bridge_id:'stata_mcp',status:'awaiting_approval',created_at:Date.now(),updated_at:Date.now(),record_version:1,research_revision:state.research_revision,input_sha256:'a'.repeat(64),plan_sha256:'b'.repeat(64),profile:{row_count:160,columns:[{name:'income',numeric:true,missing:0},{name:'education',numeric:true,missing:0}]},dictionary:{},plan:{method:'ols',outcome:'income',predictors:['education'],unit:'',time:'',treated:'',cluster:'',missing:'drop',vcov:'hetero'},result:null,reflections:[]};
 task.teaching_preview=await validateStataPreview({...expectedStataTeaching(task),input_sha256:task.input_sha256,plan_sha256:task.plan_sha256,code_sha256:'c'.repeat(64),script_sha256:'d'.repeat(64)},task);
 async function save(){await env.DB.prepare('INSERT OR REPLACE INTO local_stata_tasks(id,pairing_id,session_id,owner,status,body,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').bind(task.id,task.pairing_id,sid,state.owner_id,task.status,JSON.stringify(task),task.created_at,task.updated_at).run();}
 await env.DB.prepare('INSERT INTO local_pairings(id,code,token_hash,owner,session_id,created_at,expires_at,body) VALUES(?,?,?,?,?,?,?,?)').bind(task.pairing_id,'123456','e'.repeat(64),state.owner_id,sid,Date.now(),Date.now()+3600000,'{}').run();
 await save();
 const event=()=>w.dispatchEvent(new w.CustomEvent('ea-local-tasks',{detail:{session:sid,tasks:[task]}}));event();
 const main=task.teaching_preview.commands.find(c=>c.topic==='estimate'),code=d.querySelector('.stata-command[aria-label="讲解命令：'+main.text+'"]');assert.ok(code,JSON.stringify({card:d.querySelector('#stataLearningCard')?.outerHTML,errors,selected:w.eaStataTeachingTask,session:w.eval('sessionId')}));assert.doesNotMatch(d.querySelector('#stataLearningCard').textContent,/实际 Stata 结果整理视图/);assert.equal(d.querySelectorAll('#stataLearningCard textarea').length,0);
 code.click();await until(()=>d.querySelector('.coach-knowledge').textContent.includes('执行已确认模型'));
 assert.match(d.querySelector('.coach-knowledge').textContent,/regress v0 v1/);assert.match(d.querySelector('.coach-knowledge').textContent,/显著性/);
 const still=JSON.parse((await env.DB.prepare('SELECT body FROM local_stata_tasks WHERE id=?').bind(task.id).first()).body);assert.equal(still.status,'awaiting_approval');assert.equal(still.result,null);
 await w.eaFlushAllDrafts();const read=(await (await call('/api/sessions/'+sid+'/drafts')).json()).drafts['stata-reading'];assert.equal(read.value.view_only,true);assert.equal(read.value.command_id,main.id);
 pass('实际核心片段只读、点击讲解、保存阅读位置且不执行不生成成果');
 const before=state.research_revision;await w.eaConversation.send({intent:'stata_explain',task_id:task.id,command_id:main.id,preview_hash:task.teaching_preview.preview_hash,message:'请解释这条命令的标准误。'});
 assert.match(d.querySelector('.coach-feed').textContent,/固定语法说明/);const updated=await (await call('/api/sessions/'+sid)).json();assert.equal(updated.research_revision,before);assert.equal(updated.practical_messages.at(-1).intent,'stata_explain');assert.equal(updated.practical_messages.at(-1).stata_reference.command_id,main.id);
 const report=await (await call('/api/sessions/'+sid+'/learning-report/json')).json();assert.equal(report.local_stata_tasks[0].reflections.length,0);
 pass('命令讲解意图正确持久化、模型不可用固定说明、研究版本与成果不被修改');
 const focus=w.eaConversation.input;focus.value='未发送的新文字';focus.focus();event();assert.equal(d.activeElement,focus);assert.equal(focus.value,'未发送的新文字');
 task.status='succeeded';task.code_sha256=task.teaching_preview.code_sha256;task.record_version=2;task.result={summary:'DOM fixture only',n_used:159,coefficients:[{term:'education',estimate:.7,std_error:.1,ci_low:.5,ci_high:.9}]};await save();event();
 assert.match(d.querySelector('#stataLearningCard').textContent,/实际 Stata 结果整理视图/);assert.equal(d.activeElement,focus);const metric=[...d.querySelectorAll('.stata-metric')].find(x=>x.textContent.includes('实际样本'));metric.click();await until(()=>d.querySelector('.coach-knowledge h3').textContent.includes('实际样本'));
 assert.match(d.querySelector('.coach-knowledge').textContent,/159/);assert.equal(focus.value,'未发送的新文字');
 pass('真实结果整理视图点击讲解、轮询保留焦点和未发送文字');
 const params=new URLSearchParams({session_id:sid,task_id:task.id,command_id:main.id,preview_hash:'f'.repeat(64)});assert.equal((await call('/api/local-stata/tasks/lesson?'+params)).status,409);
 const previousAuth=auth;const another=await call('/api/auth/register',{method:'POST',body:JSON.stringify({username:'another_stata',password:testPassword,password_confirmation:testPassword})});auth=another.headers.get('set-cookie').split(';')[0];assert.equal((await call('/api/local-stata/tasks/lesson?'+params)).status,404);auth=previousAuth;
 pass('过期预览拒绝、其他账号不可读取');
 assert.equal(errors.length,0,errors.join('\n'));console.log(JSON.stringify(checks));
}finally{for(const dom of windows)dom.window.close();store.close();}
