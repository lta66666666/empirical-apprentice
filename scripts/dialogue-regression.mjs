import assert from 'node:assert/strict';
import {openStorage} from '../standalone/storage.mjs';
import worker from '../dist/server/index.js';
import {writeFile} from 'node:fs/promises';
const storage=await openStorage('outputs/dialogue-regression-'+Date.now()),env={DB:storage.DB,FILES:storage.FILES,MODEL_BASE_URL:'https://model.test/v1',MODEL_NAME:'test-model',MODEL_API_KEY:'test-only'};
const origin='https://dialogue.test',checks=[];let cookie='',sid='',version,modelInput;
const original=globalThis.fetch;
globalThis.fetch=async(url,opts)=>{modelInput=JSON.parse(JSON.parse(opts.body).messages.at(-1).content);return Response.json({choices:[{message:{content:JSON.stringify({method:null,reason:'请明确变量单位',questions:['研究对象是什么？'],proposed_cards:{question:'教育与收入的关联',sample:'学生、2020年',outcome:'收入千元',predictor:'教育年',data_source:'模拟教学',access:'教学使用',verified:'不允许'}})}}]});};
async function call(path,method='GET',body,auth=cookie){const r=await worker.fetch(new Request(origin+path,{method,headers:{Origin:origin,Cookie:auth,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})}),env);const v=(r.headers.get('content-type')||'').includes('json')?await r.json():await r.text();if(r.ok&&Number.isInteger(v?.state_version))version=v.state_version;return {status:r.status,value:v,cookie:r.headers.get('set-cookie')?.split(';')[0]};}
function pass(name){checks.push({name,result:'pass'});console.log('PASS',name);}
try{
 const a=await call('/api/auth/register','POST',{username:'dialogue_a',password:'Dialogue-password12!',password_confirmation:'Dialogue-password12!'});cookie=a.cookie;
 const s=await call('/api/sessions','POST',{});sid=s.value.session_id;version=s.value.state_version;
 const body={session_id:sid,state_version:version,research_revision:0,message:'我想研究教育和收入',request_id:crypto.randomUUID(),profile:{row_count:0,columns:[]}};
 const reply=await call('/api/research/chat','POST',body);assert.equal(reply.status,200);const m=reply.value.message;assert.equal(m.intent,'analysis');assert.ok(m.actions.some(x=>x.kind==='apply'));assert.equal(m.proposal.cards.verified,undefined);assert.equal((await call('/api/sessions/'+sid)).value.preparation.cards.question,undefined);pass('普通提问不自动引导、不修改资料；持久白名单建议可预览');
 const payload={message_id:m.id,action_id:'apply',request_id:crypto.randomUUID(),state_version:version,edits:{question:'我确认的研究问题'}};
 const applied=await call('/api/sessions/'+sid+'/analysis/actions','POST',payload);assert.equal(applied.status,200);assert.equal(applied.value.preparation.cards.question.value,'我确认的研究问题');assert.equal(applied.value.preparation.cards.question.status,'filled');const rev=applied.value.research_revision;
 const retry=await call('/api/sessions/'+sid+'/analysis/actions','POST',payload);assert.equal(retry.status,200);assert.equal(retry.value.research_revision,rev);pass('应用建议保留学生编辑、来源未核实且同编号不重复修改');
 assert.equal((await call('/api/sessions/'+sid+'/analysis/actions','POST',{...payload,request_id:crypto.randomUUID(),state_version:version})).status,409);pass('过期建议拒绝应用');
 const invalid=await call('/api/sessions/'+sid+'/analysis/actions','POST',{action_id:'execute_arbitrary_code',request_id:crypto.randomUUID(),state_version:version});assert.equal(invalid.status,422);pass('任意行动无法执行代码');
 const started=await call('/api/sessions/'+sid+'/analysis/actions','POST',{action_id:'guide',command:'start',request_id:crypto.randomUUID(),state_version:version});assert.equal(started.status,200);
 let r=await call('/api/sessions/'+sid+'/analysis/actions','POST',{action_id:'guide',command:'next',request_id:crypto.randomUUID(),state_version:version});assert.equal(r.status,200);assert.equal(r.value.analysis_workspace.guide.index,1);
 r=await call('/api/sessions/'+sid+'/analysis/actions','POST',{action_id:'guide',command:'next',request_id:crypto.randomUUID(),state_version:version});assert.equal(r.status,422);
 r=await call('/api/sessions/'+sid+'/analysis/actions','POST',{action_id:'guide',command:'pause',request_id:crypto.randomUUID(),state_version:version});assert.equal(r.status,200);assert.equal((await call('/api/sessions/'+sid)).value.analysis_workspace.guide.status,'paused');pass('引导前置条件、暂停与持久恢复');
 const b=await call('/api/auth/register','POST',{username:'dialogue_b',password:'Dialogue-password12!',password_confirmation:'Dialogue-password12!'});
 assert.equal((await call('/api/sessions/'+sid+'/analysis/actions','POST',payload,b.cookie)).status,404);pass('行动按账号与练习隔离');
 const columns=[{name:'y',numeric:true,missing:0},{name:'x',numeric:true,missing:0}];
 for(const method of ['ols','panel_fe','did']){
 await call('/api/research/chat','POST',{session_id:sid,state_version:version,research_revision:rev,message:'讲解当前方法',intent:'knowledge',profile:{row_count:10,columns},draft_plan:{method,outcome:'y',predictors:['x']},request_id:crypto.randomUUID(),step:'plan'});
 const context=modelInput.materials.find(x=>x.id==='analysis_context').content;assert.equal(context.draft_plan.method,method);assert.equal(context.executed_result,null);assert.equal(context.profile.columns.length,2);
 }pass('三方法知识请求带入当前草稿、字段与未执行标识');
 await writeFile('outputs/dialogue-regression.json',JSON.stringify({date:new Date().toISOString(),scope:'Actual Worker/SQLite with controlled model responses; not numerical or device acceptance',checks},null,2));
}finally{globalThis.fetch=original;storage.close();}
