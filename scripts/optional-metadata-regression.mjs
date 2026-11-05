import assert from 'node:assert/strict';
import {createHash,randomBytes} from 'node:crypto';
import {openStorage} from '../standalone/storage.mjs';
import worker from '../dist/server/index.js';
import {fixtures} from '../worker/fixtures.js';
import {datasetMetadata} from '../worker/dataset-metadata.js';
const hash=text=>createHash('sha256').update(text).digest('hex');
const f=fixtures.ols,profile={row_count:160,columns:['income','education','experience'].map(name=>({name,numeric:true,missing:0}))};
for(const text of [f.text,f.text.replaceAll('\n','\r\n'),'\uFEFF'+f.text]){const meta=await datasetMetadata(hash(text),profile);assert.equal(meta.dictionary.income,'模拟月收入，千元');assert.equal(meta.provenance.income,'builtin_fixture');}
const unknownHash=hash(f.text.replace('10.993041','10.993042'));
assert.deepEqual((await datasetMetadata(unknownHash,profile)).dictionary,{},'same headers do not identify a fixture');
assert.deepEqual((await datasetMetadata(unknownHash,profile,{income:'用户说明，单位待查',bad:'excluded',education:123})).dictionary,{income:'用户说明，单位待查'});
const store=await openStorage('outputs/optional-metadata-'+Date.now()),env={DB:store.DB,FILES:store.FILES},origin='https://metadata.test';let cookie='';
async function call(path,body,token,method=body?'POST':'GET'){
 const sid=body?.session_id;if(sid){const state=await (await call('/api/sessions/'+sid)).json();body={...body,state_version:state.state_version};}
 return worker.fetch(new Request(origin+path,{method,headers:{Origin:origin,Cookie:cookie,'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:body?JSON.stringify(body):undefined}),env);
}
try{
 const password=randomBytes(24).toString('hex');const registration=await call('/api/auth/register',{username:'metadata_'+Date.now(),password,password_confirmation:password});cookie=registration.headers.get('set-cookie').split(';')[0];
 const state=await (await call('/api/sessions',{})).json(),sid=state.session_id;
 const token=randomBytes(32).toString('hex'),pair=await (await call('/api/local-stata/agent/pair',{token,code:'581274'})).json(),base='/api/local-stata/agent/'+pair.id;
 assert.equal((await call('/api/local-stata/pairings/claim',{session_id:sid,code:'581274'})).status,200);
 // Simulate the actual user's pre-existing unknown research description.
 const row=await env.DB.prepare('SELECT body FROM sessions WHERE id=?').bind(sid).first(),saved=JSON.parse(row.body);
 saved.research_understanding={schema_version:1,revision:1,fields:Object.fromEntries(['outcome','unit','period'].map(k=>[k,{value:'',status:'unknown',source:{kind:'user',message_id:'prior-question'}}]))};
 await env.DB.prepare('UPDATE sessions SET body=? WHERE id=?').bind(JSON.stringify(saved),sid).run();
 async function heartbeat(input_sha256,dictionary){assert.equal((await call(base+'/heartbeat',{input_sha256,profile,dictionary,mcp_available:true,mcp_version:'test'},token)).status,200);}
 async function submit(input_sha256,plan){return call('/api/local-stata/tasks',{session_id:sid,request_id:crypto.randomUUID(),kind:'template',engine_id:'stata_local_mcp',confirmed:true,research_revision:state.research_revision,input_sha256,plan:plan||{method:'ols',outcome:'income',predictors:['education','experience'],missing:'drop',vcov:'hetero'}});}
 await heartbeat(hash(f.text));let pairState=await (await call('/api/local-stata/pairings?session_id='+sid)).json();assert.equal(pairState.pairing.metadata.dictionary.income,'模拟月收入，千元');
 let response=await submit(hash(f.text));assert.equal(response.status,202);let task=(await response.json()).task;assert.equal(task.dictionary.income,'模拟月收入，千元');assert.equal(task.metadata.provenance.income,'builtin_fixture');assert.equal(task.status,'queued');assert.equal(task.result,null);
 await call('/api/local-stata/tasks/cancel',{session_id:sid,task_id:task.id});
 await heartbeat(unknownHash);response=await submit(unknownHash);assert.equal(response.status,202);task=(await response.json()).task;assert.deepEqual(task.dictionary,{});assert.match(task.interpretation_warnings[0],/不猜测/);
 await call('/api/local-stata/tasks/cancel',{session_id:sid,task_id:task.id});
 await heartbeat(unknownHash,{income:'自带字典：收入，元'});response=await submit(unknownHash);assert.equal(response.status,202);task=(await response.json()).task;assert.equal(task.dictionary.income,'自带字典：收入，元');assert.equal(task.metadata.provenance.income,'supplied_dictionary');
 await call('/api/local-stata/tasks/cancel',{session_id:sid,task_id:task.id});
 assert.equal((await submit(unknownHash,{method:'ols',outcome:'not_a_column',predictors:['education']})).status,422);
 assert.equal((await submit(unknownHash,{method:'panel_fe',outcome:'income',predictors:['education']})).status,422);
 const rPlan=await call('/api/sessions/'+sid+'/research/plan',{session_id:sid,filename:'unknown.csv',text:f.text,candidate:{method:'ols',outcome:'income',predictors:['education'],engine_id:'browser_webr',vcov:'hetero',missing:'drop'}});assert.equal(rPlan.status,200,await rPlan.clone().text());
 const confirmed=await rPlan.json();const job=await call('/api/sessions/'+sid+'/research/jobs',{session_id:sid,request_id:crypto.randomUUID(),filename:'unknown.csv',text:f.text,plan:confirmed.plan,confirmation_token:confirmed.confirmation.token,confirmed:true,dictionary:{},source:''});assert.equal(job.status,202,await job.clone().text());const jobValue=await job.json();assert.equal(jobValue.dictionary.income,'模拟月收入，千元');
 console.log('PASS fixture hash/BOM/CRLF recognition, no header guessing, bounded dictionaries, unknown descriptions do not block local/R plans, task snapshot metadata/warnings and model prerequisites remain enforced; no execution approval issued.');
}finally{store.close();}
