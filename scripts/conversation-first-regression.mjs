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
 const native=globalThis.fetch;let turn=0,modelInputs=[];
 const replies=[
 {method:null,reason:'待补充',questions:['不显示清单'],proposed_cards:{question:'评估政策对就业的影响'}},
 {method:null,reason:'待补充',questions:['不显示清单'],proposed_cards:{policy_name:'就业扶持政策'}},
 {method:null,reason:'待补充',questions:['不显示清单'],proposed_cards:{sample:'某地区2010至2020年',outcome:'就业人数，单位人',effective_date:'2015年'}}
 ];
 globalThis.fetch=async(u,o)=>{modelInputs.push(JSON.parse(o.body));return Response.json({choices:[{message:{content:JSON.stringify(replies[turn++]||replies[2])}}]});};
 const dom=await open('/analysis'),w=dom.window,d=w.document,input=w.eaConversation.input;
 const shown=n=>{for(let p=n;p;p=p.parentElement){if(p.hidden||w.getComputedStyle(p).display==='none'||p.tagName==='DIALOG'&&!p.open||p.tagName==='DETAILS'&&!p.open&&n!==p.querySelector('summary'))return false;}return true;};
 assert.deepEqual([...d.querySelector('.analysis-shell').children].map(x=>x.className),['coach-knowledge','coach-center','coach-materials']);
 assert.equal([...d.querySelectorAll('.analysis-dock button')].filter(shown).length,2);
 assert.ok(!shown(d.querySelector('.ea-stepper')));assert.equal(d.querySelector('.coach-review').open,false);
 pass('中央只有发送与提交材料，技术步骤和旧行动墙不展示');
 async function say(text){input.value=text;input.dispatchEvent(new w.Event('input'));w.eaConversation.submit.click();await until(()=>!w.eval('busy')&&!w.eaConversation.submit.disabled&&d.querySelectorAll('.coach-message.assistant').length===turn);}
 await say('我想评估政策对就业的影响');
 assert.match(d.querySelector('.coach-message.assistant').textContent,/哪项政策/);assert.doesNotMatch(d.querySelector('.coach-message.assistant').textContent,/method|row_count|请补充：/);assert.equal(w.eval('latestState.preparation.cards.question'),undefined);
 await say('政策是就业扶持政策');assert.match([...d.querySelectorAll('.coach-message.assistant')].at(-1).textContent,/对象|时期/);
 await say('某地区2010至2020年，就业人数单位人，2015年同批实施');
 assert.match([...d.querySelectorAll('.coach-message.assistant')].at(-1).textContent,/提交政策原文/);
 assert.match(JSON.stringify(modelInputs[2]),/就业扶持政策/);
 pass('多轮逐项补问、记住前文，未确认信息不自动修改资料');
 assert.equal([...d.querySelectorAll('.coach-materials button')].filter(shown).length,1);
 assert.equal([...d.querySelectorAll('.coach-materials button')].filter(shown)[0].textContent,'提交政策材料');
 pass('右侧只出现当前需要的提交入口');
 d.querySelector('.coach-attach').click();assert.equal(d.querySelector('.coach-upload').open,true);
 [...d.querySelectorAll('.coach-upload button')].find(x=>x.textContent==='政策原文或链接').click();
 const policy=d.querySelector('.coach-upload textarea');policy.value='原文规定自2015年实施';
 d.querySelector('.coach-upload input[type=url]').value='https://policy.example/document';
 [...d.querySelectorAll('.coach-upload button')].find(x=>x.textContent==='提交给本次研究').click();
 await until(()=>w.eval('latestState.preparation.cards.policy_doc?.value')==='原文规定自2015年实施');
 await until(()=>d.querySelector('.coach-upload').open===false);
 await until(()=>d.querySelectorAll('.coach-message.assistant').length===turn);
 assert.equal(w.eval('latestState.preparation.cards.policy_doc.status'),'filled');
 pass('材料从对话附件提交并保留来源，不自动标为已核实');
 
 await until(()=>!w.eval('busy')&&!w.eaConversation.submit.disabled);
 await w.newSession();await w.researchSample('ols');
 globalThis.fetch=async()=>Response.json({choices:[{message:{content:JSON.stringify({method:'ols',outcome:'income',predictors:['education'],reason:'一般关联',questions:[],proposed_cards:{question:'教育与收入关联',sample:'现有模拟个体样本',outcome:'income，年收入',predictor:'education，受教育年限',data_source:'模拟教学数据',access:'仅教学演示'}})}}]});
 input.value='我想分析教育与收入的一般关联';input.dispatchEvent(new w.Event('input'));w.eaConversation.submit.click();
 await until(()=>[...d.querySelectorAll('.coach-materials button')].some(x=>x.textContent==='核对建议'));
 [...d.querySelectorAll('.coach-materials button')].find(x=>x.textContent==='核对建议').click();
 assert.equal(d.querySelector('.coach-review').open,true);
 assert.equal(d.querySelector('.coach-review details').open,false);
 [...d.querySelectorAll('.coach-review button')].find(x=>x.textContent==='应用到草稿').click();
 await until(()=>[...d.querySelectorAll('.coach-review button')].some(x=>x.textContent==='继续核对执行方案'&&!x.hidden));
 d.querySelector('#researchEngine').value='browser_webr';d.querySelector('#researchEngine').dispatchEvent(new w.Event('change'));
 [...d.querySelectorAll('.coach-review button')].find(x=>x.textContent==='继续核对执行方案').click();
 await until(()=>w.eval('researchPlan?.confirmation?.token'));
 assert.equal(d.querySelector('#researchConfirm').checked,false);
 pass('候选建议只在按需窗口核对与应用，生成完整方案仍未自动批准执行');
 
 await w.newSession();
 globalThis.fetch=async()=>Response.json({choices:[{message:{content:JSON.stringify({method:null,reason:'缺条件',questions:[],proposed_cards:{}})}}]});
 async function answerWithoutExtraction(text){const before=d.querySelectorAll('.coach-message.assistant').length;input.value=text;input.dispatchEvent(new w.Event('input'));w.eaConversation.submit.click();await until(()=>!w.eval('busy')&&!w.eaConversation.submit.disabled&&d.querySelectorAll('.coach-message.assistant').length>before);}
 await answerWithoutExtraction('我想评估就业政策的影响');
 assert.match([...d.querySelectorAll('.coach-message.assistant')].at(-1).textContent,/政策名称/);
 await answerWithoutExtraction('政策是就业扶持政策');
 assert.match([...d.querySelectorAll('.coach-message.assistant')].at(-1).textContent,/对象|时期/);
 await answerWithoutExtraction('某地区企业，2010至2020年');
 assert.match([...d.querySelectorAll('.coach-message.assistant')].at(-1).textContent,/哪个结果/);
 await answerWithoutExtraction('就业人数，单位人');
 assert.match([...d.querySelectorAll('.coach-message.assistant')].at(-1).textContent,/什么时候/);
 pass('模型完全漏抽取字段时仍保留明确目标与逐轮原文回答，不回退重问');
 globalThis.fetch=native;
 assert.deepEqual(errors,[]);

 await writeFile('outputs/conversation-first-regression.json',JSON.stringify({date:new Date().toISOString(),scope:'actual Worker/SQLite and JSDOM with controlled model; no device or numerical execution claim',checks},null,2));
}finally{for(const dom of windows)dom.window.close();store.close();}
