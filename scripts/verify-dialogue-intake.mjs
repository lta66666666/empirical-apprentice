import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {newSession} from '../worker/sessions.js';
import {absorbAnswer,absorbQuotedFacts,understanding} from '../worker/research-understanding.js';
import {inputIdentity} from '../worker/input-identity.js';
import {parseCsv} from '../worker/research.js';
import {openStorage} from '../standalone/storage.mjs';
import worker from '../dist/server/index.js';
const checks=[],state=newSession('owner');
let result=absorbAnswer(state,[],'研究对象是医院，结果指标是年度平均住院费用，时间为2018到2022年。费用还有哪些衡量方式？','one');state.research_understanding=result.understanding;
assert.equal(result.understanding.fields.object.value,'医院');assert.equal(result.understanding.fields.outcome.value,'年度平均住院费用');assert.equal(result.understanding.fields.period.value,'2018–2022年');checks.push('mixed unfamiliar-topic facts and consultation retained separately with provenance');
state.research_understanding.active_question={field:'outcome',id:'q1'};result=absorbAnswer(state,[],'单位暂时不知道，接下来怎么做？','two');state.research_understanding=result.understanding;
assert.equal(result.understanding.fields.outcome.value,'年度平均住院费用');assert.equal(result.understanding.fields.unit.status,'awaiting_data');checks.push('unknown unit does not erase known outcome or become a guessed unit');
result=absorbAnswer(state,[],'先了解区别','three',{kind:'consult',field:'outcome',status:null,value:'先了解区别'});assert.equal(result.understanding.fields.outcome.value,'年度平均住院费用');
result=absorbQuotedFacts(state,[{field:'outcome',value:'工资',source_span:'工资有哪些'}],{id:'four',content:'工资有哪些？'});assert.equal(result.changed,false);checks.push('consult choices and model quotes from questions cannot become facts');
result=absorbAnswer(state,[],'结果指标改为每次住院费用，单位改为元。费用还有哪些衡量方式？','five');assert.equal(result.understanding.fields.outcome.value,'每次住院费用');assert.equal(result.understanding.fields.unit.value,'元');checks.push('explicit correction inside consultation updates the selected fact and unit');
assert.equal(parseCsv('x,y\n,\n1,2\n').profile.row_count,2);assert.equal(parseCsv('x\n""\n1\n').profile.row_count,2);checks.push('all-missing observation rows and their positions retained');
const store=await openStorage('outputs/dialogue-intake-'+Date.now()),env={DB:store.DB,FILES:store.FILES},origin='https://intake.test';let cookie='';
async function call(path,body){const r=await worker.fetch(new Request(origin+path,{method:body?'POST':'GET',headers:{Origin:origin,Cookie:cookie,'CF-Connecting-IP':'192.0.2.9','Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}),env);if(r.headers.get('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];return {status:r.status,value:await r.json()};}
try{
 const password=crypto.randomUUID();assert.equal((await call('/api/auth/register',{username:'topic_'+Date.now(),password,password_confirmation:password})).status,200);
 const original=(await call('/api/sessions',{})).value;
 const reply=await call('/api/research/chat',{session_id:original.session_id,state_version:original.state_version,research_revision:original.research_revision,request_id:crypto.randomUUID(),message:'换个题目，研究医院费用。',intent:'auto',profile:{row_count:0,columns:[]}});assert.equal(reply.status,200,JSON.stringify(reply.value));assert.ok(reply.value.message.topic_switch);
 const prior=(await call('/api/sessions/'+original.session_id)).value,request={request_id:crypto.randomUUID(),topic_switch:{from_session:original.session_id,message_id:reply.value.message.id,state_version:prior.state_version}};
 const created=await call('/api/sessions',request);assert.equal(created.status,200,JSON.stringify(created.value));const fresh=created.value;assert.notEqual(fresh.session_id,prior.session_id);assert.equal((await call('/api/sessions',request)).value.session_id,fresh.session_id);assert.equal(fresh.research_jobs.length,0);assert.equal(fresh.local_stata_tasks.length,0);assert.ok(fresh.practical_messages[0].dialogue.summary);
 const after=(await call('/api/sessions/'+prior.session_id)).value;assert.deepEqual(after.preparation,prior.preparation);assert.deepEqual(after.practical_messages,prior.practical_messages);checks.push('persisted topic confirmation creates independent idempotent exercise; original content and messages unchanged');
 await writeFile('outputs/dialogue-intake-acceptance.json',JSON.stringify({checks,model:'fixed fallback in this test; real browser DeepSeek checked separately'},null,2));console.log(JSON.stringify({checks}));
}finally{store.close();}
