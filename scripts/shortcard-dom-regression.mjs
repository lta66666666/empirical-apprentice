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
 const dom=await open('/analysis'),w=dom.window,d=w.document,input=w.eaConversation.input,feed=d.querySelector('.coach-feed');
 const shown=n=>{for(let p=n;p;p=p.parentElement){if(p.hidden||w.getComputedStyle(p).display==='none'||p.tagName==='DIALOG'&&!p.open||p.tagName==='DETAILS'&&!p.open&&n!==p.querySelector('summary'))return false;}return true;};
 assert.deepEqual([...d.querySelector('.analysis-shell').children].map(x=>x.className),['coach-knowledge','coach-center','coach-materials']);
 assert.equal([...d.querySelectorAll('.analysis-dock button')].filter(shown).length,2);
 assert.equal(d.querySelectorAll('.coach-knowledge h3').length,1);
 assert.doesNotMatch(d.querySelector('.coach-knowledge').textContent,/OLS|fixest|ssc|剔除/);
 pass('默认知识仅研究准备短卡，输入区只有发送与提交材料');
 const state=w.eval('latestState'),sid=state.session_id;let calls=[];
 const card={id:'unit',title:'指标与单位',summary:'指标说明观察什么，单位说明如何计量。',example:'碳排放总量通常要查看数据说明确认单位。',reminder:'不要猜测真实单位。',content:'## 指标与单位\n\n完整讲解正文。\n\n未知单位不能成为已确认值。',source:'https://source.example/unit',version:'test-v1',review_status:'待审校'};
 const summary={schema_version:1,revision:1,fields:{goal:{label:'目标',value:'评估低碳政策影响',status:'provided'},policy:{label:'政策',value:'低碳城市试点政策',status:'provided'},outcome:{label:'结果指标',value:'城市年度碳排放总量',status:'provided'},unit:{label:'单位',value:'',status:'unknown'}},next_gap:{field:'unit',label:'指标单位',prompt:'需要核对数据说明。'}};
 const chat=[{id:'u0',role:'user',content:'不知道单位是什么',request_id:'0'},{id:'a0',role:'assistant',content:'不可见的完整内部回复',request_id:'0',proposal:{cards:{question:'错误的旧历史目标'}},dialogue:{summary:'先看数据说明确认单位。你想怎么继续？',current_question:{id:'a0:unit',field:'unit',prompt:'你想怎么继续？'},choices:[{id:'read',label:'查看数据说明',answer:'我想查看数据说明'},{id:'later',label:'等数据后确认',answer:'等待数据后确认单位'}],learning_card:card,next_gap:summary.next_gap,recovery:{can_retry:false}}}];
 w.eval('latestState').research_summary=summary;w.eaConversationHistory(chat);
 assert.doesNotMatch(d.querySelector('.coach-materials').textContent,/错误的旧历史目标/);
 assert.match(d.querySelector('.coach-materials').textContent,/城市年度碳排放总量/);assert.match(d.querySelector('.coach-materials').textContent,/你已提供/);assert.match(d.querySelector('.coach-materials').textContent,/指标单位/);
 assert.match(d.querySelector('.coach-knowledge').textContent,/指标与单位/);assert.doesNotMatch(d.querySelector('.coach-knowledge').textContent,/完整讲解正文/);
 [...d.querySelectorAll('.coach-knowledge button')].find(x=>x.textContent==='完整讲解').click();assert.equal(d.querySelector('.coach-reading').open,true);assert.match(d.querySelector('.coach-reading').textContent,/完整讲解正文/);assert.equal(d.querySelector('.coach-reading .coach-source').open,false);d.querySelector('.coach-reading button').click();
 assert.match(d.querySelector('.coach-message.assistant').textContent,/先看数据说明/);assert.doesNotMatch(d.querySelector('.coach-message.assistant').textContent,/不可见的完整内部回复/);
 pass('显示服务端摘要与单张知识卡，完整讲解和来源按需阅读');
 intercept=async(url,opts)=>{if(String(url).includes('/api/research/chat')){const body=JSON.parse(opts.body);calls.push(body);await new Promise(r=>setTimeout(r,40));const answer=body.retry_of_message_id?null:{id:'u'+calls.length,role:'user',content:body.choice_id?'等待数据后确认单位':body.message,request_id:body.request_id};if(answer)chat.push(answer);chat.push({id:'a'+calls.length,role:'assistant',content:'已保留回答。',request_id:body.request_id,dialogue:{summary:'已保留回答，请继续提交材料。',current_question:{id:'a'+calls.length+(calls.length===1?':unit':':data'),field:calls.length===1?'unit':'data',prompt:calls.length===1?'如何核对单位？':'提交数据？'},choices:calls.length===1?[{id:'read',label:'查看数据说明',answer:'查看数据说明'},{id:'later',label:'等数据后确认',answer:'等待数据后确认单位'}]:[],learning_card:card,recovery:{can_retry:false}}});return Response.json({messages:chat,state_version:state.state_version,research_revision:state.research_revision,research_summary:summary,display_mode:'analysis'});}return null;};
 input.value='还没发送的草稿';input.dispatchEvent(new w.Event('input'));d.querySelector('[data-choice-id=later]').click();await until(()=>calls.length===1&&!w.eaConversation.submit.disabled);assert.equal(calls[0].question_id,'a0:unit');assert.equal(calls[0].choice_id,'later');assert.equal(input.value,'还没发送的草稿');await until(()=>d.querySelectorAll('.coach-choices button').length===2&&[...d.querySelectorAll('.coach-choices button')].every(b=>!b.disabled),'new choices enabled after finally');assert.ok([...d.querySelectorAll('.coach-choices button')].every(b=>b.dataset.questionId==='a1:unit'));assert.equal(w.eval('researchJob'),null);
 pass('只有当前选项可点击，携带问题编号发送且保留输入草稿、不创建任务');
 const retryUserCount=chat.filter(x=>x.role==='user').length;chat.at(-1).dialogue.recovery={can_retry:true,retry_of_message_id:'u1',label:'重试在线辅导'};w.eaConversationHistory(chat);d.querySelector('.coach-recovery button').click();await until(()=>calls.length===2&&!w.eaConversation.submit.disabled);assert.equal(calls[1].retry_of_message_id,'u1');assert.equal(chat.filter(x=>x.role==='user').length,retryUserCount);assert.equal(input.value,'还没发送的草稿');
 pass('模型恢复重试关联原问题、不重复用户消息且不清空新草稿');
 const staleReply=chat.at(-1);staleReply.dialogue.current_question={id:'expired:unit',field:'unit',prompt:'需要核对单位'};staleReply.dialogue.choices=[{id:'later',label:'等数据后确认',answer:'等待数据后确认单位'}];w.eaConversationHistory(chat);
 let staleCalls=0;intercept=async(url,opts)=>{if(String(url).includes('/api/research/chat')){staleCalls++;return Response.json({detail:'这个问题已更新，请使用当前一轮的选项。'},{status:409});}return null;};d.querySelector('.coach-choices button').click();await until(()=>staleCalls===1&&!w.eaConversation.submit.disabled&&d.querySelector('.coach-choices button').disabled,'stale question remains disabled after 409');assert.equal(d.querySelector('.coach-choices button').disabled,true);assert.equal(input.value,'还没发送的草稿');
 staleReply.dialogue.current_question.id='fresh:unit';w.eaConversationHistory(chat);await until(()=>!d.querySelector('.coach-choices button').disabled);
 pass('迟到的过期选项被永久禁用，新问题的选项正常可用');
 const height=()=>feed.querySelectorAll('.coach-message').length*200;Object.defineProperty(feed,'scrollHeight',{get:height,configurable:true});Object.defineProperty(feed,'clientHeight',{value:300,configurable:true});feed.scrollTop=20;const first=d.querySelector('[data-message-id=u0]');chat.push({id:'u3',role:'user',content:'新的问题'},{id:'a3',role:'assistant',content:'新的回复',dialogue:{summary:'新的回复',learning_card:card,choices:[],recovery:{can_retry:false}}});w.eaConversationHistory(chat);assert.equal(feed.scrollTop,20);assert.equal(first,d.querySelector('[data-message-id=u0]'));assert.equal(d.querySelector('.coach-newest').hidden,false);d.querySelector('.coach-newest').click();assert.equal(feed.scrollTop,feed.scrollHeight);
 pass('增量消息复用节点，回看时保留滚动位置并提供最新回复入口');
 for(let i=4;i<12;i++)chat.push({id:'u'+i,role:'user',content:'历史问题'+i},{id:'a'+i,role:'assistant',content:'历史回复'+i,dialogue:{summary:'历史回复'+i,learning_card:card,choices:[],recovery:{can_retry:false}}});w.eaConversationHistory(chat);feed.scrollTop=40;const previousHeight=feed.scrollHeight;d.querySelector('.coach-earlier').click();assert.equal(feed.scrollTop,40+feed.scrollHeight-previousHeight);
 pass('展开更早记录时按新增高度补偿阅读位置');
 [...d.querySelectorAll('.module-toolbar button')].find(x=>x.textContent==='知识').click();assert.equal(d.querySelector('.coach-side-dialog').open,true);assert.ok(d.querySelector('.coach-side-dialog .coach-knowledge'));d.querySelector('.coach-side-dialog').dispatchEvent(new w.Event('close'));assert.ok(d.querySelector('.analysis-shell > .coach-knowledge'));
 const css=await (await call('/static/module-layout.css')).text();assert.match(css,/240px minmax\(0,1fr\) 280px/);assert.match(css,/max-width:1600px/);assert.match(css,/@media\(max-width:1199px\)/);
 pass('窄屏知识研究使用可恢复侧栏，桌面宽度与断点规则符合计划');
 const upload=[...d.querySelectorAll('button')].find(b=>b.textContent==='＋ 提交材料');let retained;
 for(let n=0;n<3;n++){upload.click();[...d.querySelector('.coach-upload').querySelectorAll('button')].find(b=>b.textContent==='数据 CSV / TSV').click();const input=d.querySelector('#researchFile');assert.ok(input);if(retained)assert.equal(input,retained);retained=input;assert.ok([...d.querySelector('.coach-upload').querySelectorAll('button')].some(b=>b.textContent==='使用现有教学数据'));d.querySelector('.coach-upload').close();}
 pass('连续三次提交材料保留同一文件控件，教学数据入口不丢失');
 await until(()=>!w.eval('busy')&&!w.eaConversation.submit.disabled);assert.deepEqual(errors,[]);
 await writeFile('outputs/shortcard-dom-regression.json',JSON.stringify({date:new Date().toISOString(),scope:'Actual Worker/SQLite page resources with controlled chat responses in JSDOM; no real device, model or numerical execution acceptance claim',checks},null,2));
}finally{for(const dom of windows)dom.window.close();store.close();}
