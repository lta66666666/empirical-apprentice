import assert from 'node:assert/strict';
import {openStorage} from '../standalone/storage.mjs';
import {interpretationEndpoint} from '../worker/ai-interpretation.js';
const store=await openStorage('outputs/ai-interpretation-'+Date.now()),originalFetch=globalThis.fetch;
const job={id:crypto.randomUUID(),owner:'test-owner',session_id:crypto.randomUUID(),status:'succeeded',record_version:1,plan:{method:'ols'},dictionary:{income:'模拟指标'},result:{n_used:10,coefficients:[{term:'education',estimate:2,ci_low:1,ci_high:3}],warnings:[]},reflections:[]};
const env={DB:store.DB,MODEL_BASE_URL:'https://model.test',MODEL_NAME:'controlled-test',MODEL_API_KEY:'local-placeholder'};
let calls=0,release;const gate=new Promise(r=>release=r);
const request=retry=>new Request('https://app.test/api/research/jobs/'+job.id+'/ai-interpretation',{method:'POST',body:JSON.stringify({retry})});
try{
 await store.DB.prepare('INSERT INTO sessions(id,owner,body,created_at,last_activity) VALUES(?,?,?,?,?)').bind(job.session_id,job.owner,'{}',Date.now(),Date.now()).run();
 await store.DB.prepare('INSERT INTO jobs(id,session_id,owner,body,status,input_key,created_at,last_activity,lease_until) VALUES(?,?,?,?,?,?,?,?,?)').bind(job.id,job.session_id,job.owner,JSON.stringify(job),job.status,'test',Date.now(),Date.now(),0).run();
 globalThis.fetch=async()=>{calls++;await gate;return Response.json({model:'controlled-test',choices:[{finish_reason:'stop',message:{content:JSON.stringify({summary:'控制响应，仅用于验证保存和并发。',points:['估计值为2'],limitations:['不证明因果'],claims:[{term:'education',estimate:2,ci_low:1,ci_high:3}]})}}]});};
 const first=interpretationEndpoint(request(false),env,job);
 while(!calls)await new Promise(r=>setTimeout(r,5));
 assert.equal((await interpretationEndpoint(request(false),env,job)).status,202);
 const edited={...job,record_version:2,reflections:[{answer:'并发保存的学生解释'}]};await store.DB.prepare('UPDATE jobs SET body=? WHERE id=?').bind(JSON.stringify(edited),job.id).run();
 release();assert.equal((await (await first).json()).status,'succeeded');
 assert.equal((await (await interpretationEndpoint(request(false),env,job)).json()).status,'succeeded');assert.equal(calls,1);
 const saved=JSON.parse((await store.DB.prepare('SELECT body FROM jobs WHERE id=?').bind(job.id).first()).body);assert.equal(saved.reflections.length,1);assert.equal(saved.record_version,3);assert.equal(saved.ai_interpretation.status,'succeeded');
 assert.equal((await interpretationEndpoint(request(false),env,{...job,status:'awaiting_upload'})).status,409);
 console.log('PASS controlled model: concurrent duplicate/cache once, preserves concurrent student revision, increments export version, rejects unapproved result. Not real model acceptance.');
}finally{globalThis.fetch=originalFetch;store.close();}
