import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {randomUUID,randomBytes} from 'node:crypto';
import {fixtures} from '../worker/fixtures.js';
const root=resolve('.'),origin='http://127.0.0.1:18810',secret=randomBytes(32).toString('hex');
const folder=resolve('outputs/site-acceptance-'+Date.now());await mkdir(folder,{recursive:true});
const python=resolve('../empirical_apprentice_sites/local_stata/.venv/Scripts/python.exe');
const processes=[],evidence={scope:'local HTTP website and real Python calculation; no JoyCode/public/browser acceptance',checks:[],jobs:[]};
let cookie='',state;
function start(command,args,env){const child=spawn(command,args,{cwd:root,env:{...process.env,...env},stdio:['ignore','pipe','pipe']});let log='';child.stdout.on('data',b=>log+=b);child.stderr.on('data',b=>log+=b);child.safeLog=()=>log;processes.push(child);return child;}
async function call(path,body,credentials=cookie,method=body===undefined?'GET':'POST'){
 const r=await fetch(origin+path,{method,headers:{Origin:origin,Cookie:credentials,...(body===undefined?{}:{'Content-Type':'application/json'})},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(30000)});
 if(credentials===cookie&&r.headers.getSetCookie().length)cookie=r.headers.getSetCookie()[0].split(';')[0];
 const type=r.headers.get('content-type')||'',value=type.includes('json')?await r.json():type.includes('text')?await r.text():Buffer.from(await r.arrayBuffer());
 return {status:r.status,value};
}
async function waitReady(){for(let i=0;i<100;i++){try{if((await call('/api/health')).status===200)return;}catch{}await new Promise(r=>setTimeout(r,150));}throw Error('Website startup failed');}
async function waitJob(id){for(let i=0;i<100;i++){const r=await call(`/api/research/jobs/${id}`);assert.equal(r.status,200);if(['succeeded','failed','interrupted','cancelled'].includes(r.value.status))return r.value;await new Promise(r=>setTimeout(r,250));}throw Error('Task did not finish');}
let node;
try{
 start(python,['-m','uvicorn','executor.app:app','--host','127.0.0.1','--port','8000','--no-access-log'],{
  PYTHONPATH:resolve('outputs/api-deps')+';'+root,EA_NODE_DATA:resolve(folder,'executor'),EA_NODE_SECRET:secret});
 const nodeEnv={PORT:'18810',PUBLIC_ORIGIN:origin,EA_DATA_DIR:resolve(folder,'web'),EXECUTOR_URL:'http://127.0.0.1:8000',EXECUTOR_SECRET:secret,EXECUTOR_INTERNAL_HOST:'loopback'};
 node=start('node',['standalone/server.mjs'],nodeEnv);await waitReady();
 const username='cloud_'+Date.now(),password=randomBytes(20).toString('hex');
 assert.equal((await call('/api/auth/register',{username,password,password_confirmation:'different'})).status,422);
 assert.equal((await call('/api/auth/register',{username,password,password_confirmation:password})).status,200);
 const ownedCookie=cookie;
 const other='other_'+Date.now();cookie='';assert.equal((await call('/api/auth/register',{username:other,password,password_confirmation:password})).status,200);const otherCookie=cookie;cookie=ownedCookie;
 let status;
 for(let i=0;i<100;i++){status=(await call('/api/research/status')).value;if(status.engines.statspai_cloud?.ready)break;await new Promise(r=>setTimeout(r,150));}
 assert.equal(status.default_engine,'statspai_cloud');assert.equal(status.engines.statspai_cloud.ready,true,JSON.stringify({capability:status.engines.statspai_cloud,executor_log:processes[0].safeLog()}));
 assert.equal((await call('/api/research/status',undefined,'')).status,401);
 evidence.checks.push('real signup/password confirmation, independent account, authenticated capability discovery');
 state=(await call('/api/sessions',{fixture_id:'did',fixture_version:'teaching-fixtures-v1',request_id:randomUUID()})).value;
 assert.equal(state.research_drafts.workbench.value.candidate.engine_id,'statspai_cloud');
 const sid=state.session_id;
 const uploadBytes=await readFile('outputs/dta-acceptance/hospital.dta');
 const multipart=new FormData();multipart.append('file',new Blob([uploadBytes]),'hospital.dta');multipart.append('state_version',state.state_version);multipart.append('request_id',randomUUID());
 let uploaded=await fetch(origin+`/api/sessions/${sid}/research/data`,{method:'POST',headers:{Origin:origin,Cookie:cookie},body:multipart});let data=await uploaded.json();assert.equal(uploaded.status,200,JSON.stringify(data));assert.equal(data.format,'dta');assert.equal(data.labels.value_labels.group['1'],'处理');assert.match(data.text,/-99/);
 assert.equal((await call(`/api/sessions/${sid}/research/data/${data.id}`,undefined,otherCookie)).status,404);
 const restored=await call(`/api/sessions/${sid}/research/data/${data.id}`);assert.equal(restored.value.text,data.text);
 state=(await call(`/api/sessions/${sid}`)).value;
 const preview=await call(`/api/sessions/${sid}/research/data/${data.id}`,{operation:'preview_year',column:'month',state_version:state.state_version});assert.equal(preview.status,200,JSON.stringify(preview.value));assert.equal(preview.value.min_year,2019);
 const transformation={operation:'year',column:'month',state_version:state.state_version,confirmed:true,request_id:randomUUID()};
 const converted=await call(`/api/sessions/${sid}/research/data/${data.id}`,transformation);assert.equal(converted.status,200,JSON.stringify(converted.value));assert.equal((await call(`/api/sessions/${sid}/research/data/${data.id}`,transformation)).value.id,converted.value.id);assert.match(converted.value.text,/month_year/);
 const datePlan=await call(`/api/sessions/${sid}/research/plan`,{state_version:state.state_version,data_id:data.id,candidate:{method:'panel_fe',engine_id:'statspai_cloud',outcome:'cost',predictors:['group'],unit:'hospital',time:'month',cluster:'hospital',vcov:'cluster',missing:'drop'}});assert.equal(datePlan.status,422);assert.match(datePlan.value.detail,/年度|年份/);
 evidence.checks.push('real DTA upload, original numeric codes/labels, negative code retained, owned refresh, monthly date rejects annual role, explicit year conversion and idempotence');

 let importedResults=[];
 for(const useMaterial of [true,false]){
  state=(await call(`/api/sessions/${sid}`)).value;
  const payload={state_version:state.state_version,...(useMaterial?{data_id:data.id}:{filename:'normalized.csv',text:data.text}),candidate:{method:'ols',outcome:'cost',predictors:['group'],engine_id:'statspai_cloud',vcov:'hetero',missing:'drop'}};
  const reviewed=await call(`/api/sessions/${sid}/research/plan`,payload);assert.equal(reviewed.status,200,JSON.stringify(reviewed.value));
  const submitted=await call(`/api/sessions/${sid}/research/jobs`,{...payload,plan:reviewed.value.plan,candidate:undefined,state_version:reviewed.value.state_version,confirmation_token:reviewed.value.confirmation.token,confirmed:true,request_id:randomUUID()});assert.equal(submitted.status,202,JSON.stringify(submitted.value));
  const job=await waitJob(submitted.value.id);assert.equal(job.status,'succeeded',JSON.stringify(job));assert.equal(job.result.n_used,9);importedResults.push(job.result);
  if(useMaterial){const pack=await call(`/api/research/jobs/${job.id}/package`);assert.equal(pack.status,200);await writeFile(resolve(folder,'imported-dta.zip'),pack.value);}
 }
 assert.deepEqual(importedResults[0].coefficients,importedResults[1].coefficients);assert.deepEqual(importedResults[0].covariance,importedResults[1].covariance);
 evidence.checks.push('DTA and normalized CSV real regressions agree exactly; 9 complete observations; raw DTA reproduction package generated');
 for(const [method,f] of Object.entries(fixtures)){
  state=(await call(`/api/sessions/${sid}`)).value;
  const plan=await call(`/api/sessions/${sid}/research/plan`,{state_version:state.state_version,filename:f.filename,text:f.text,candidate:{...f.plan,engine_id:'statspai_cloud',missing:'block'}});
  assert.equal(plan.status,200,JSON.stringify(plan.value));
  const preview=plan.value.confirmation.corresponding_code;assert.ok(preview?.commands?.length);assert.equal(preview.executed,false);
  const ref=new URLSearchParams({confirmation_token:plan.value.confirmation.token,preview_hash:preview.sha256,command_id:preview.core_command_id});
  const lesson=await call(`/api/sessions/${sid}/research/teaching?${ref}`);assert.equal(lesson.status,200,JSON.stringify(lesson.value));assert.match(lesson.value.card.content,/字段映射/);
  assert.equal((await call(`/api/sessions/${sid}/research/teaching?${ref}`,undefined,otherCookie)).status,404);
  const body={state_version:plan.value.state_version,request_id:randomUUID(),filename:f.filename,text:f.text,plan:plan.value.plan,confirmation_token:plan.value.confirmation.token,confirmed:true,source:f.source,dictionary:f.dictionary,simulated:true};
  assert.equal((await call(`/api/sessions/${sid}/research/jobs`,{...body,confirmed:false})).status,422);
  const submitted=await call(`/api/sessions/${sid}/research/jobs`,body);assert.equal(submitted.status,202,JSON.stringify(submitted.value));
  const repeated=await call(`/api/sessions/${sid}/research/jobs`,body);assert.equal(repeated.value.id,submitted.value.id);
  const id=submitted.value.id;
  assert.equal((await call(`/api/research/jobs/${id}`,undefined,otherCookie)).status,404);
  assert.equal((await call(`/api/research/jobs/${id}/complete`,{result:{}})).status,409);
  const job=await waitJob(id);assert.equal(job.status,'succeeded',JSON.stringify(job));assert.equal(job.result.software,'python');assert.equal(job.result.n_used,method==='ols'?160:384);
  const code=await call(`/api/research/jobs/${id}/stata-code`);assert.equal(code.status,200);assert.equal(code.value.executed,false);assert.equal(code.value.code,preview.code);assert.equal(code.value.plan_sha256,job.plan_sha256);
  const report=await call(`/api/research/jobs/${id}/report`);assert.equal(report.status,200);assert.match(report.value,/StatsPAI/);
  const zip=await call(`/api/research/jobs/${id}/package`);assert.equal(zip.status,200);assert.ok(zip.value.length>5000);await writeFile(resolve(folder,method+'.zip'),zip.value);
  evidence.jobs.push({method,id,n_used:job.result.n_used,record_version:job.record_version,code_sha256:code.value.sha256});
 }
 {
 const f=fixtures.did,lines=f.text.trim().split(/\r?\n/),headers=lines[0].split(','),ui=headers.indexOf(f.plan.unit),ti=headers.indexOf(f.plan.time),first=lines[1].split(',')[ui];
 const text=lines.filter((line,index)=>!index||!(line.split(',')[ui]===first&&Number(line.split(',')[ti])>=f.plan.policy_year)).join('\n')+'\n';
 state=(await call(`/api/sessions/${sid}`)).value;
 const rejected=await call(`/api/sessions/${sid}/research/plan`,{state_version:state.state_version,filename:f.filename,text,candidate:{...f.plan,engine_id:'statspai_cloud',missing:'block'}});
 assert.equal(rejected.status,422,JSON.stringify(rejected));assert.match(rejected.value.detail,/个体缺少政策前|个个体缺少政策前/);
 evidence.checks.push('DID unit without a post period rejected before confirmation');
 }
 const rerunBody={request_id:randomUUID()};const original=evidence.jobs[0].id;
 const repeats=await Promise.all([call(`/api/research/jobs/${original}/rerun`,rerunBody),call(`/api/research/jobs/${original}/rerun`,rerunBody)]);
 assert.equal(repeats[0].status,202,JSON.stringify(repeats[0]));assert.equal(repeats[1].status,202,JSON.stringify(repeats[1]));assert.equal(repeats[0].value.id,repeats[1].value.id);
 assert.equal((await call(`/api/research/jobs/${original}/rerun`,rerunBody)).value.id,repeats[0].value.id);
 assert.equal((await waitJob(repeats[0].value.id)).status,'succeeded');
 evidence.jobs[0].record_version=(await call(`/api/research/jobs/${original}`)).value.record_version;
 evidence.checks.push('concurrent rerun and lost-response retry return the same real computation');
 const reflectionJob=evidence.jobs.at(-1).id;
 for(let i=0;i<3;i++){const saved=await call(`/api/research/jobs/${reflectionJob}/reflection`,{answer:`第${i+1}版解释：模拟DID系数约-1.835，不能单独证明因果。`,answer_version:i});assert.equal(saved.status,200,JSON.stringify(saved.value));}
 const revised=(await call(`/api/research/jobs/${reflectionJob}`)).value;assert.equal(revised.record_version,4);assert.equal(revised.reflections.length,3);
 assert.equal((await call(`/api/research/jobs/${reflectionJob}/report?record_version=1`)).status,409);
 const revisedReport=await call(`/api/research/jobs/${reflectionJob}/report?record_version=4`);assert.match(revisedReport.value,/第3版解释/);
 const revisedZip=await call(`/api/research/jobs/${reflectionJob}/package?record_version=4`);assert.equal(revisedZip.status,200);await writeFile(resolve(folder,'revised-report.zip'),revisedZip.value);
 evidence.jobs.at(-1).record_version=4;evidence.checks.push('first explanation and two revisions saved in one versioned record; stale export rejected; Markdown and ZIP use version 4 (model unavailable in this test)');
 evidence.checks.push('three real website→signed queue→StatsPAI jobs','execution requires confirmation','idempotent repeat returns same job','two-account task isolation','browser cannot forge cloud completion','corresponding Stata code bound to task/plan','Markdown and ZIP generated; browser PDF pending');
 state=(await call(`/api/sessions/${sid}`)).value;
 const f=fixtures.ols,cancelPlan=await call(`/api/sessions/${sid}/research/plan`,{state_version:state.state_version,filename:f.filename,text:f.text,candidate:{...f.plan,engine_id:'statspai_cloud',missing:'block'}});
 assert.equal(cancelPlan.status,200);
 const pending=await call(`/api/sessions/${sid}/research/jobs`,{state_version:cancelPlan.value.state_version,request_id:randomUUID(),filename:f.filename,text:f.text,plan:cancelPlan.value.plan,confirmation_token:cancelPlan.value.confirmation.token,confirmed:true,simulated:true});
 assert.equal(pending.status,202);
 assert.equal((await call(`/api/research/jobs/${pending.value.id}/interrupt`,{})).status,200);
 const cancelled=await waitJob(pending.value.id);assert.ok(['cancelled','interrupted'].includes(cancelled.status),JSON.stringify(cancelled));assert.equal(cancelled.result,null);
 evidence.checks.push('queued/running cancellation has no fabricated result');
 await new Promise(resolve=>{node.once('exit',resolve);node.kill();});
 node=start('node',['standalone/server.mjs'],nodeEnv);await waitReady();
 assert.equal((await call('/api/auth/me')).status,200);
 for(const saved of evidence.jobs){const job=await call(`/api/research/jobs/${saved.id}`);assert.equal(job.value.status,'succeeded');assert.equal(job.value.record_version,saved.record_version);}
 evidence.checks.push('website process restart retains login, results and record versions');
 assert.equal((await call('/api/auth/logout',{})).status,200);assert.equal((await call('/api/auth/me',undefined,ownedCookie)).status,401);
 evidence.checks.push('logout revokes server session');
 await writeFile(resolve(folder,'acceptance.json'),JSON.stringify(evidence,null,2));
 console.log(JSON.stringify({checks:evidence.checks,evidence:resolve(folder,'acceptance.json')}));
}finally{for(const child of processes)if(child.exitCode===null)child.kill();}
