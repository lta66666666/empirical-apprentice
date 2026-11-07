import assert from 'node:assert/strict';
import {writeFile,mkdir} from 'node:fs/promises';
import {openStorage} from '../standalone/storage.mjs';
import worker from '../dist/server/index.js';
import {loadOwnedSession,saveSession,touchSession} from '../worker/sessions.js';
import {curriculum,tutorialSteps} from '../worker/content.js';
const storage=await openStorage('outputs/interaction-'+Date.now());
const env={DB:storage.DB,FILES:storage.FILES},origin='https://interaction.test',evidence=[];let credentials='',sid='',version;
async function call(path,method='GET',body){
  if(body&&sid&&body.state_version===undefined&&(!body.session_id||body.session_id===sid))body={...body,state_version:version};
  const started=performance.now(),r=await worker.fetch(new Request(origin+path,{method,headers:{Origin:origin,Cookie:credentials,'CF-Connecting-IP':'192.0.2.12',...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})}),env);
  const type=r.headers.get('content-type'),value=type?.includes('json')?await r.json():type?.includes('text')?await r.text():new Uint8Array(await r.arrayBuffer());
  if(r.ok&&Number.isInteger(value?.state_version)&&(!value.session_id||value.session_id===sid))version=value.state_version;
  return {status:r.status,value,cookie:r.headers.get('set-cookie')?.split(';')[0],ms:Math.round(performance.now()-started)};
}
const pass=(name,extra={})=>{evidence.push({name,result:'pass',...extra});console.log('PASS',name);};
try{
  const registered=await call('/api/auth/register','POST',{username:'flow_student',password:'Flow-test-password12!',password_confirmation:'Flow-test-password12!'});assert.equal(registered.status,200);credentials=registered.cookie;
  const fresh=await call('/api/sessions','POST',{});assert.equal(fresh.status,200);sid=fresh.value.session_id;version=fresh.value.state_version;assert.equal(fresh.value.learning_context.status,'not_started');assert.equal(fresh.value.course.lessons.length,8);
  const owner=(await storage.DB.prepare('SELECT owner FROM sessions WHERE id=?').bind(sid).first()).owner;
  const initial=await storage.DB.prepare('SELECT body,state_version FROM sessions WHERE id=?').bind(sid).first();
  for(let n=0;n<3;n++)assert.equal((await call('/api/sessions/'+sid)).status,200);
  assert.deepEqual(await storage.DB.prepare('SELECT body,state_version FROM sessions WHERE id=?').bind(sid).first(),initial);pass('读取只触碰活动时间，不重写内容或版本');
  const seeded=await loadOwnedSession(env,owner,sid);seeded.stage='free_chat';seeded.analysis={preserved:'result'};seeded.pending_confirmation={preserved:'confirmation'};seeded.preparation.cards.question={value:'保持原研究',status:'filled'};await saveSession(env,seeded);version=seeded.state_version;
  const preserved=JSON.stringify([seeded.analysis,seeded.pending_confirmation,seeded.preparation]);
  assert.equal((await call('/api/sessions/'+sid+'/course/open','POST',{lesson_id:8,mode:'continue'})).status,422);
  assert.equal((await call('/api/sessions/'+sid+'/course/open','POST',{lesson_id:8,mode:'preview'})).status,200);
  assert.equal((await call('/api/sessions/'+sid+'/lesson_action','POST',{message:'A'})).status,422);
  assert.equal((await call('/api/sessions/'+sid+'/course/open','POST',{lesson_id:1,mode:'continue'})).status,200);
  for(const item of curriculum.lessons){
    for(const step of item.steps){const r=await call('/api/sessions/'+sid+'/lesson_action','POST',{message:['choice','calc'].includes(step.type)?String(step.answer):'研究问题、变量、单位与关联和因果仍需核对。'});assert.equal(r.status,200);}
    assert.equal((await call('/api/sessions/'+sid+'/lesson_action','POST',{message:'稍后补写，继续'})).status,200);
  }
  const course=(await call('/api/sessions/'+sid)).value;assert.equal(course.learning_context.status,'completed');assert.equal(course.lesson_records.length,8);assert.ok(course.course.lessons.every(x=>x.status==='completed'));
  const after=await loadOwnedSession(env,owner,sid);assert.equal(JSON.stringify([after.analysis,after.pending_confirmation,after.preparation]),preserved);assert.equal(after.stage,'free_chat');pass('分析后进入导学、顺序八阶段作答及研究资料不被重置');
  assert.equal((await call('/api/sessions/'+sid+'/course/open','POST',{lesson_id:2,mode:'review'})).status,200);assert.equal((await call('/api/sessions/'+sid+'/lesson_action','POST',{message:'A'})).status,422);
  assert.equal((await call('/api/sessions/'+sid+'/course/open','POST',{mode:'directory'})).status,200);pass('后续预览、完成回顾均不能推进作答');
  for(const [step,item] of tutorialSteps.entries())assert.equal((await call('/api/sessions/'+sid+'/tutorial/answer','POST',{step,choice:item.correct})).status,200);
  assert.equal((await call('/api/sessions/'+sid)).value.learning_context.tutorial_step,5);pass('独立六步手算与持久位置恢复');
  const a=await loadOwnedSession(env,owner,sid),b=await loadOwnedSession(env,owner,sid);a.variable_dictionary={income:'千元'};await saveSession(env,a);b.variable_dictionary={income:'旧值'};await assert.rejects(()=>saveSession(env,b),e=>e.status===409);await touchSession(env,b);assert.equal((await loadOwnedSession(env,owner,sid)).variable_dictionary.income,'千元');
  const stale=await call('/api/sessions/'+sid+'/variable-dictionary','PUT',{dictionary:{income:'旧值'},state_version:b.state_version});assert.equal(stale.status,409);
  const missing=await worker.fetch(new Request(origin+'/api/sessions/'+sid+'/variable-dictionary',{method:'PUT',headers:{Origin:origin,Cookie:credentials,'Content-Type':'application/json'},body:JSON.stringify({dictionary:{}})}),env);assert.equal(missing.status,409);version=a.state_version;pass('双快照与旧客户端写入冲突不丢失新版本');
  const example=(await call('/api/research/examples/ols')).value;
  const plan=(await call('/api/sessions/'+sid+'/research/plan','POST',{filename:example.filename,text:example.text,candidate:{...example.plan,engine_id:'browser_webr'},state_version:version}));assert.equal(plan.status,200);
  const payload={filename:example.filename,text:example.text,plan:plan.value.plan,confirmation_token:plan.value.confirmation.token,confirmed:true,source:example.source||'模拟教学来源',dictionary:example.dictionary,simulated:true,request_id:crypto.randomUUID()};
  const submitted=await Promise.all([call('/api/sessions/'+sid+'/research/jobs','POST',payload),call('/api/sessions/'+sid+'/research/jobs','POST',payload)]);assert.ok(submitted.every(r=>r.status===202),JSON.stringify(submitted.map(r=>({status:r.status,detail:r.value.detail}))));assert.equal(submitted[0].value.id,submitted[1].value.id);const job=submitted[0].value;
  assert.equal((await call('/api/sessions/'+sid+'/research/jobs','POST',{...payload,source:'不同内容'})).status,409);pass('并发任务提交幂等与同编号不同内容拒绝');
  const originalPrepare=storage.DB.prepare.bind(storage.DB);let release,entered;const paused=new Promise(r=>entered=r),gate=new Promise(r=>release=r);
  env.DB={...storage.DB,prepare(sql){const query=originalPrepare(sql);if(sql.startsWith('UPDATE jobs SET last_activity=')&&sql.includes("status='running'")){const run=query.run.bind(query);query.run=async()=>{entered();await gate;return run();};}return query;}};
  const heartbeat=call('/api/research/jobs/'+job.id+'/heartbeat','POST');await Promise.race([paused,new Promise((_,reject)=>setTimeout(()=>reject(Error('heartbeat hook not reached')),2000))]);
  assert.equal((await call('/api/research/jobs/'+job.id+'/interrupt','POST')).status,200);release();assert.equal((await heartbeat).status,409);env.DB=storage.DB;
  assert.equal((await call('/api/research/jobs/'+job.id)).value.status,'interrupted');pass('暂停心跳后中断，迟到心跳不能复活终态');
  const report=(await call('/api/sessions/'+sid+'/learning-report/json')).value;const md=(await call('/api/sessions/'+sid+'/learning-report/md')).value;assert.equal(report.lesson_records.length,8);assert.equal(report.learning_context.status,'completed');assert.match(md,/导学位置与对话/);assert.match(md,/保持原研究/);assert.equal(report.research_jobs[0].status,'interrupted');pass('学习报告 MD/JSON读取同一持久课程、准备与任务记录');
  await storage.DB.prepare('UPDATE sessions SET last_activity=0 WHERE id=?').bind(sid).run();assert.equal((await call('/api/sessions/'+sid)).status,410);assert.equal((await call('/api/auth/me')).status,200);pass('练习410到期不删除账号');
  const output={scope:'Actual Worker + isolated SQLite/R2; task completion numerical values and real device are separate acceptance gates',date:new Date().toISOString(),checks:evidence};await mkdir('outputs',{recursive:true});await writeFile('outputs/interaction-regression.json',JSON.stringify(output,null,2));
}finally{storage.close();}
