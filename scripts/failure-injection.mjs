import assert from 'node:assert/strict';
import {mkdir, writeFile} from 'node:fs/promises';
import {openStorage} from '../standalone/storage.mjs';
import worker from '../dist/server/index.js';

const storage=await openStorage('outputs/failure-injection-'+Date.now());
const env={DB:storage.DB,FILES:storage.FILES,MODEL_BASE_URL:'https://model.test/v1',MODEL_NAME:'controlled-failure',MODEL_API_KEY:'test-only'};
const origin='https://failure.test',evidence=[];let credentials='',sid='',version=0,revision=0,modelMode='5xx',executorMode='submit_timeout',submitted=null;
const pass=(name)=>{evidence.push({name,result:'pass'});console.log('PASS',name);};

const originalFetch=globalThis.fetch;
globalThis.fetch=async(url,options={})=>{
  const target=new URL(url);
  if(target.hostname==='model.test'){
    if(modelMode==='5xx')return new Response('private-provider-body',{status:500});
    return Response.json({id:'controlled-failure-1',model:'controlled-failure',choices:[{finish_reason:'stop',message:{content:JSON.stringify({method:null,reason:'先了解研究条件',questions:['研究对象是什么？'],proposed_cards:{}})}}]});
  }
  if(target.hostname==='executor.test'){
    if(executorMode==='down')throw new DOMException('private executor text','AbortError');
    if(target.pathname==='/v1/capabilities')return Response.json({statspai_cloud:{ready:true,status:'可用'},r_native:{ready:false,status:'未配置'}});
    if(target.pathname==='/v1/jobs'&&options.method==='POST'){
      if(executorMode==='submit_timeout')throw new DOMException('private executor text','AbortError');
      submitted=JSON.parse(options.body);
      return Response.json({...submitted,status:'queued'});
    }
    if(/^\/v1\/jobs\/[0-9a-f-]{36}$/.test(target.pathname)){
      if(executorMode==='queue_timeout')return Response.json({...submitted,status:'failed',error:'排队超过 20 分钟，请重新确认后再提交。'});
      return Response.json({...submitted,status:'queued'});
    }
    throw Error('unexpected executor route '+target.pathname);
  }
  throw Error('unexpected fetch '+target.hostname);
};

async function call(path,method='GET',body){
  if(body&&sid&&body.state_version===undefined&&(!body.session_id||body.session_id===sid))body={...body,state_version:version};
  const response=await worker.fetch(new Request(origin+path,{method,headers:{Origin:origin,Cookie:credentials,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})}),env);
  const value=await response.json();
  if(response.ok){if(Number.isInteger(value.state_version))version=value.state_version;if(Number.isInteger(value.research_revision))revision=value.research_revision;}
  return {status:response.status,value,cookie:response.headers.get('set-cookie')?.split(';')[0]};
}

try{
  const registered=await call('/api/auth/register','POST',{username:'failure_probe',password:'Failure-pass12!',password_confirmation:'Failure-pass12!'});
  assert.equal(registered.status,200,JSON.stringify(registered.value));credentials=registered.cookie;
  const session=await call('/api/sessions','POST',{});assert.equal(session.status,200);sid=session.value.session_id;version=session.value.state_version;revision=session.value.research_revision;

  // A. 模型连续 5xx：保留用户资料、给出固定帮助、可重试且不泄漏供应商响应体。
  const first=await call('/api/research/chat','POST',{session_id:sid,state_version:version,research_revision:revision,message:'请继续帮我整理研究',request_id:crypto.randomUUID(),profile:{row_count:0,columns:[]}});
  assert.equal(first.status,200,JSON.stringify(first.value));
  const firstMessage=first.value.message,dialogue=firstMessage.dialogue;
  assert.equal(dialogue.recovery.error_type,'http');assert.equal(dialogue.recovery.can_retry,true);
  assert.match(firstMessage.content,/在线模型暂不可用/);
  assert.equal(JSON.stringify(first.value).includes('private-provider-body'),false);
  const originalUser=dialogue.recovery.retry_of_message_id,usersBefore=first.value.messages.filter(x=>x.role==='user').length,oldReply=firstMessage.id;
  modelMode='ok';
  const retried=await call('/api/research/chat','POST',{session_id:sid,state_version:version,research_revision:first.value.research_revision,request_id:crypto.randomUUID(),retry_of_message_id:originalUser});
  assert.equal(retried.status,200,JSON.stringify(retried.value));
  assert.equal(retried.value.message.dialogue.recovery.can_retry,false);
  assert.notEqual(retried.value.message.id,oldReply);
  assert.equal(retried.value.messages.filter(x=>x.role==='user').length,usersBefore);
  pass('模型 5xx 保留资料与固定帮助，重试只新增回复不重复用户问题');

  // 生成云端方案，随后才注入执行节点配置。
  const example=(await call('/api/research/examples/ols')).value;
  const planned=await call('/api/sessions/'+sid+'/research/plan','POST',{filename:example.filename,text:example.text,candidate:{...example.plan,engine_id:'statspai_cloud'}});
  assert.equal(planned.status,200,JSON.stringify(planned.value));
  assert.equal(planned.value.plan.execution_location,'cloud_native');
  env.EXECUTOR_URL='https://executor.test';env.EXECUTOR_SECRET='test-executor-secret';
  const payload={filename:example.filename,text:example.text,plan:planned.value.plan,confirmation_token:planned.value.confirmation.token,confirmed:true,source:example.source||'模拟教学来源',dictionary:example.dictionary,simulated:true,request_id:crypto.randomUUID()};

  // C. 并发重复提交：同一 request_id 只产生一个任务。
  executorMode='submit_timeout';
  const duplicated=await Promise.all([call('/api/sessions/'+sid+'/research/jobs','POST',payload),call('/api/sessions/'+sid+'/research/jobs','POST',payload)]);
  assert.ok(duplicated.every(r=>r.status===202),JSON.stringify(duplicated.map(r=>({status:r.status,detail:r.value.detail}))));
  assert.equal(duplicated[0].value.id,duplicated[1].value.id);
  const jobId=duplicated[0].value.id;
  const rows=await storage.DB.prepare('SELECT id FROM jobs WHERE session_id=? AND request_id=?').bind(sid,payload.request_id).all();
  assert.equal(rows.results.length,1);
  assert.equal((await call('/api/sessions/'+sid+'/research/jobs','POST',{...payload,source:'不同来源'})).status,409);
  pass('重复提交幂等且同编号不同内容 409');

  // B. 提交超时与轮询弱网：任务保持 queued，恢复后依据快照重新提交。
  const submittedJob=await call('/api/research/jobs/'+jobId);
  assert.equal(submittedJob.status,200);assert.equal(submittedJob.value.status,'queued');
  assert.match(submittedJob.value.sync_error,/执行节点响应超时/);
  executorMode='down';
  const weak=await call('/api/research/jobs/'+jobId);
  assert.equal(weak.value.status,'queued');assert.match(weak.value.sync_error,/执行节点响应超时|执行节点连接失败/);
  assert.equal(JSON.stringify(weak.value).includes('private executor text'),false);
  executorMode='ok';
  const recovered=await call('/api/research/jobs/'+jobId);
  assert.equal(recovered.value.status,'queued');assert.equal(recovered.value.sync_error,null);
  pass('执行器提交超时与轮询中断保持 queued，恢复后用落盘快照重新提交');

  // D. 排队超时：执行节点中文文案原样同步，不产生结果。
  executorMode='queue_timeout';
  const expired=await call('/api/research/jobs/'+jobId);
  assert.equal(expired.value.status,'failed');
  assert.equal(expired.value.error,'排队超过 20 分钟，请重新确认后再提交。');
  assert.equal(expired.value.result,null);
  pass('执行器排队超时同步为 failed 且保留中文原因');

  await mkdir('outputs',{recursive:true});
  await writeFile('outputs/failure-injection.json',JSON.stringify({scope:'Controlled provider/executor stubs through the actual Worker and isolated SQLite; state machine and copy assertions only, no claim of real weak-network or load testing',date:new Date().toISOString(),checks:evidence},null,2));
  console.log(`PASS: ${evidence.length} failure injection groups.`);
}finally{globalThis.fetch=originalFetch;storage.close();}
