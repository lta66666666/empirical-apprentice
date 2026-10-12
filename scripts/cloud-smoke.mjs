import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fixtures} from '../worker/fixtures.js';
const root=process.env.EA_TEST_URL||'http://127.0.0.1:8791';let cookie='';
async function call(path,method='GET',body,owned=true){
  const r=await fetch(root+path,{method,headers:{Origin:root,...(cookie&&owned?{Cookie:cookie}:{}),...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})});
  if(owned&&r.headers.get('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];
  const value=(r.headers.get('content-type')||'').includes('json')?await r.json():await r.text();
  return {r,value};
}
const evidence={checks:[],jobs:[]};
const status=(await call('/api/research/status')).value;
assert.equal(status.engines.r_native.ready,true);assert.equal(status.engines.stata_native.ready,false);
const session=(await call('/api/sessions','POST')).value;const id=session.session_id;
for(const method of ['ols','panel_fe','did']){
  const f=fixtures[method];const candidate={...f.plan}; // Omission defaults to native R, never a silent browser fallback.
  const plan=(await call(`/api/sessions/${id}/research/plan`,'POST',{filename:f.filename,text:f.text,candidate})).value;
  assert.equal(plan.plan.engine_id,'r_native');
  const mismatched=await call(`/api/sessions/${id}/research/jobs`,'POST',{filename:f.filename,text:f.text,plan:{...plan.plan,engine_id:'browser_webr',execution_location:'browser_webr'},confirmation_token:plan.confirmation.token,confirmed:true,source:f.source});
  assert.equal(mismatched.r.status,409);
  const metadataConflict=await call(`/api/sessions/${id}/research/jobs`,'POST',{filename:f.filename,text:f.text,plan:{...plan.plan,software:'stata'},confirmation_token:plan.confirmation.token,confirmed:true,source:f.source});assert.equal(metadataConflict.r.status,422);
  let res=await call(`/api/sessions/${id}/research/jobs`,'POST',{filename:f.filename,text:f.text,plan:plan.plan,confirmation_token:plan.confirmation.token,confirmed:true,source:f.source,dictionary:f.dictionary});
  assert.equal(res.r.status,202,JSON.stringify(res.value));const jobId=res.value.id;
  assert.equal(res.value.execution_location,'cloud_native');
  assert.equal((await call(`/api/research/jobs/${jobId}`,'GET',undefined,false)).r.status,404);
  assert.equal((await call(`/api/research/jobs/${jobId}/complete`,'POST',{nonce:res.value.execution_nonce,result:{}})).r.status,409);
  // No browser heartbeat: let the durable node finish before viewing the result.
  await new Promise(r=>setTimeout(r,1500));
  for(let i=0;i<35;i++){
    res=await call(`/api/research/jobs/${jobId}`);
    if(['succeeded','failed','interrupted'].includes(res.value.status))break;
    await new Promise(r=>setTimeout(r,400));
  }
  assert.equal(res.value.status,'succeeded',JSON.stringify(res.value));assert.equal(res.value.sync_error,null);
  assert.ok(res.value.result.audit.used_indices.length);
  const report=await call(`/api/research/jobs/${jobId}/report`);assert.match(report.value,/云端原生 R/);
  const zip=await fetch(root+`/api/research/jobs/${jobId}/package`,{headers:{Cookie:cookie}});assert.equal(zip.status,200);
  fs.writeFileSync(`outputs/cloud-${method}.zip`,Buffer.from(await zip.arrayBuffer()));
  const rerunResponse=await call(`/api/research/jobs/${jobId}/rerun`,'POST',{});assert.equal(rerunResponse.r.status,202,JSON.stringify(rerunResponse.value));const rerun=rerunResponse.value;
  let checked;
  for(let i=0;i<40;i++){checked=(await call(`/api/research/jobs/${rerun.id}`)).value;if(checked.status==='succeeded')break;await new Promise(r=>setTimeout(r,300));}
  assert.equal(checked.verification?.status,'consistent',JSON.stringify(checked));
  evidence.jobs.push({method,id:jobId,n_used:res.value.result.n_used,rerun:checked.verification});
}
evidence.checks=['real Sites Worker→signed node→native R three methods','engine change invalidates confirmation','client cannot submit cloud result','other browser cannot read job','task finishes without browser heartbeat','same-engine rerun consistent','cloud reports and ZIP available'];
const jsonReport=(await call(`/api/sessions/${id}/learning-report/json`)).value;assert.equal(jsonReport.research_jobs.length,6);
const deleted=await call(`/api/sessions/${id}`,'DELETE');assert.equal(deleted.r.status,200,JSON.stringify(deleted.value));
evidence.checks.push('manual delete removes remote session and Sites records');
fs.writeFileSync('outputs/cloud-smoke-evidence.json',JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence));
