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
 const dom=await open('/analysis'),w=dom.window,d=w.document,sid=w.eval('sessionId'),revision=w.eval('latestState.research_revision');
 assert.equal(d.querySelectorAll('.stata-guide').length,1);
 await w.eaOpenStataGuide('interface','locate');let modal=d.querySelector('.stata-guide');assert.equal(modal.open,true);assert.equal(modal.querySelectorAll('select option').length,7);assert.equal(modal.querySelectorAll('img').length,1);assert.match(modal.textContent,/无需安装或配对/);assert.equal(modal.querySelectorAll('textarea').length,0);
 const cursor=w.eaDraftEntry('stata-guide').value;assert.equal(cursor.step_id,'locate');assert.equal(w.eval('latestState.research_revision'),revision);
 await w.eaOpenStataGuide('do-files','open');assert.match(modal.querySelector('pre').textContent,/doedit/);assert.match(modal.textContent,/未执行/);modal.close();await w.eaOpenStataGuide();assert.match(modal.querySelector('h3').textContent,/打开脚本/);modal.close();
 pass('未配对即可读七章；示意图与只读示例标识；阅读位置恢复不改研究版本');
 const response=await w.eaConversation.send({intent:'stata_guide',lesson_id:'data',step_id:'missing',message:'我应该把每列缺失数相加吗？'});assert.equal(response.ok,true,JSON.stringify(response));const message=w.eval('latestState.practical_messages').at(-1);assert.equal(message.intent,'stata_guide');assert.equal(message.guide_reference.lesson_id,'data');assert.equal(message.related_task,null);assert.equal(message.actions.length,0);assert.match(message.dialogue.learning_card.content,/不能把各列缺失数/);assert.match(message.dialogue.summary,/在线模型未配置/);assert.equal(w.eval('latestState.research_revision'),revision);
 assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM jobs WHERE session_id=?').bind(sid).first()).n,0);assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM local_stata_tasks WHERE session_id=?').bind(sid).first()).n,0);
 pass('指南咨询固定回退、无假任务或哈希、不执行、不提交成果');
 const invalid=await call('/api/knowledge?guide=stata18&lesson_id=bad');assert.equal(invalid.status,422);const state=w.eval('latestState');const stale=await call('/api/research/chat',{method:'POST',body:JSON.stringify({session_id:sid,state_version:state.state_version,research_revision:state.research_revision,request_id:crypto.randomUUID(),intent:'stata_guide',lesson_id:'data',step_id:'missing',guide_version:'stale',message:'test'})});assert.equal(stale.status,409);
 pass('无效指南422，过期版本409；不能复用错误步骤');
 assert.equal(errors.length,0,errors.join('\n'));await writeFile('outputs/operation-guide-dom.json',JSON.stringify({at:new Date().toISOString(),checks},null,2));
}finally{for(const dom of windows)dom.window.close();store.close();}