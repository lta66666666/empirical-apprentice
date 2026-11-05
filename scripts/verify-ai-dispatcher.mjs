import assert from 'node:assert/strict';
import {openStorage} from '../standalone/storage.mjs';
import {newSession,saveSession} from '../dist/server/sessions.js';
import {interpretationTick} from '../standalone/interpretation-dispatcher.mjs';
const store=await openStorage('outputs/ai-dispatcher-'+Date.now()),originalFetch=globalThis.fetch;
const env={DB:store.DB,FILES:store.FILES,MODEL_BASE_URL:'https://model.test',MODEL_NAME:'controlled-test',MODEL_API_KEY:'placeholder'};
try{
 const owner=crypto.randomUUID(),session=newSession(owner);await saveSession(env,session);
 const before=await store.DB.prepare('SELECT last_activity,state_version FROM sessions WHERE id=?').bind(session.session_id).first();
 const job={id:crypto.randomUUID(),owner,session_id:session.session_id,auto_interpretation:true,status:'succeeded',record_version:1,plan:{method:'ols'},dictionary:{},result:{n_used:10,coefficients:[{term:'x',estimate:2,ci_low:1,ci_high:3}]},reflections:[]};
 await store.DB.prepare('INSERT INTO jobs(id,session_id,owner,body,status,input_key,created_at,last_activity,lease_until) VALUES(?,?,?,?,?,?,?,?,?)').bind(job.id,job.session_id,owner,JSON.stringify(job),job.status,'test',Date.now(),Date.now(),0).run();
 let calls=0;globalThis.fetch=async()=>{calls++;return Response.json({model:'controlled-test',choices:[{finish_reason:'stop',message:{content:JSON.stringify({summary:'仅用于调度验收',points:['估计值为2'],limitations:['不证明因果'],claims:[{term:'x',estimate:2,ci_low:1,ci_high:3}]})}}]});};
 await interpretationTick(env);await interpretationTick(env);assert.equal(calls,1);
 const saved=JSON.parse((await store.DB.prepare('SELECT body FROM jobs WHERE id=?').bind(job.id).first()).body);
 assert.equal(saved.ai_interpretation.status,'succeeded');assert.equal(saved.reflections.length,0);
 assert.deepEqual(await store.DB.prepare('SELECT last_activity,state_version FROM sessions WHERE id=?').bind(session.session_id).first(),before);
 console.log('PASS dispatcher without browser: one saved interpretation; no student answer or retention refresh. Controlled model only.');
}finally{globalThis.fetch=originalFetch;store.close();}
