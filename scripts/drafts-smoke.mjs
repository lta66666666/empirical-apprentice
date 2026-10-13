import assert from 'node:assert/strict';
import {fixtures} from '../worker/fixtures.js';
const root=process.env.EA_TEST_URL||'http://127.0.0.1:8788';let cookie='';const versions=new Map();
async function call(path,method='GET',body,owned=true){
  const sid=(/^\/api\/sessions\/([a-z0-9]{12})/.exec(path)||[])[1]||body?.session_id;if(body&&sid&&versions.has(sid)&&body.state_version===undefined)body={...body,state_version:versions.get(sid)};
  const response=await fetch(root+path,{method,headers:{Origin:root,...(owned&&cookie?{Cookie:cookie}:{}),...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})});
  if(owned&&response.headers.get('set-cookie'))cookie=response.headers.get('set-cookie').split(';')[0];
  const value=(response.headers.get('content-type')||'').includes('json')?await response.json():await response.text();if(Number.isInteger(value?.state_version)&&value.session_id||Number.isInteger(value?.state_version)&&sid)versions.set(value.session_id||sid,value.state_version);return {status:response.status,value};
}
await call('/api/auth/register','POST',{username:'smoke_'+Date.now(),password:'Smoke-test-password12!',password_confirmation:'Smoke-test-password12!'});
const session=(await call('/api/sessions','POST')).value,id=session.session_id;
const value={dictionary:{income:'草稿单位：千元'},question:'尚未提交',candidate:{method:'ols'}};
const saved=await call(`/api/sessions/${id}/drafts/workbench`,'PUT',{version:0,value});assert.equal(saved.status,200);assert.equal(saved.value.version,1);
assert.equal((await call(`/api/sessions/${id}/drafts`,'GET',undefined,false)).status,401);
assert.equal((await call(`/api/sessions/${id}/drafts/workbench`,'PUT',{version:0,value})).status,409);
assert.deepEqual((await call(`/api/sessions/${id}/drafts`)).value.drafts.workbench.value,value);
const reloaded=(await call(`/api/sessions/${id}`)).value;assert.deepEqual(reloaded.research_drafts.workbench.value,value);assert.deepEqual(reloaded.variable_dictionary,{});assert.equal(reloaded.research_revision,session.research_revision);
const json=(await call(`/api/sessions/${id}/learning-report/json`)).value;assert.deepEqual(json.research_drafts.workbench.value,value);
assert.match((await call(`/api/sessions/${id}/learning-report/md`)).value,/未提交，不作为已完成成果/);
const f=fixtures.ols,plan=(await call(`/api/sessions/${id}/research/plan`,'POST',{filename:f.filename,text:f.text,candidate:{...f.plan,engine_id:'browser_webr'}})).value;
const job=(await call(`/api/sessions/${id}/research/jobs`,'POST',{filename:f.filename,text:f.text,plan:plan.plan,confirmation_token:plan.confirmation.token,confirmed:true,source:f.source,dictionary:f.dictionary,simulated:true})).value;
const reflectionKey=`reflection:${job.id}`,answer='控制工作经验后的关联，不能直接解释为因果。';
assert.equal((await call(`/api/sessions/${id}/drafts/${reflectionKey}`,'PUT',{version:0,value:{answer}})).status,200);
assert.equal((await call(`/api/sessions/${id}/drafts/reflection:00000000-0000-0000-0000-000000000000`,'PUT',{version:0,value:{answer}})).status,404);
// A client-supplied fixture tests API/report behavior, not numerical acceptance.
const result={r_version:'R 4.6.0',package_versions:{fixest:'0.14.2'},n_used:160,coefficients:[{term:'education',estimate:.773997,std_error:.0322823,p_value:.001,ci_low:.710233,ci_high:.837761}],warnings:['API test fixture, not a new computation.']};
const complete=await call(`/api/research/jobs/${job.id}/complete`,'POST',{nonce:job.execution_nonce,result});assert.equal(complete.status,200,JSON.stringify(complete.value));
assert.match((await call(`/api/research/jobs/${job.id}/report`)).value,/解释练习待完成/);
assert.equal((await call(`/api/research/jobs/${job.id}/package`)).status,200);
assert.equal((await call(`/api/research/jobs/${job.id}/reflection`,'POST',{answer})).status,200);
const latest=(await call(`/api/research/jobs/${job.id}`)).value;assert.equal(latest.reflections.length,1);assert.equal(latest.record_version,2);
assert.match((await call(`/api/research/jobs/${job.id}/report`)).value,/控制工作经验后的关联/);
await call(`/api/sessions/${id}`,'DELETE');assert.equal((await call(`/api/sessions/${id}/drafts`)).status,404);
console.log('PASS: draft persistence, ownership, optimistic version conflict, no evidence revision on autosave, report draft separation, immediate download, submitted explanation and deletion.');
