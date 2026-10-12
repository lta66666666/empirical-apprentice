import assert from 'node:assert/strict';
const root=process.env.EA_TEST_URL||'http://127.0.0.1:8788';let cookie='';
async function call(path,method='GET',body,owned=true){const r=await fetch(root+path,{method,headers:{Origin:root,...(owned&&cookie?{Cookie:cookie}:{}),...(body!==undefined?{'Content-Type':'application/json'}:{})},body:body===undefined?undefined:JSON.stringify(body)});if(owned&&r.headers.get('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];const value=r.headers.get('content-type')?.includes('json')?await r.json():await r.text();return {status:r.status,value};}
await call('/api/auth/register','POST',{username:'smoke_'+Date.now(),password:'Smoke-test-password12!',password_confirmation:'Smoke-test-password12!'});
const sid=(await call('/api/sessions','POST')).value.session_id;
const candidate=await call('/api/research/candidate','POST',{session_id:sid,question:'数字化有没有用？'});
assert.equal(candidate.status,503);assert.ok(candidate.value.interaction_id);
await call(`/api/sessions/${sid}/tutor`,'POST',{question:'没有数据怎样开始？'});
const path=`/api/sessions/${sid}/model-evidence`;
const records=(await call(path+'/json')).value.records;assert.equal(records.length,2);assert.ok(records.every(x=>x.status==='unconfigured'&&x.messages.length===2));
assert.equal((await call(path+'/json','GET',undefined,false)).status,401);
const md=(await call(path+'/md')).value;assert.match(md,/实际提示词/);assert.ok(records.every(x=>md.includes(x.id)));
const report=(await call(`/api/sessions/${sid}/learning-report/json`)).value;assert.equal(report.model_interactions.length,2);
assert.match((await call(`/api/sessions/${sid}/learning-report/md`)).value,/Agent 交互记录/);
assert.equal(JSON.stringify(records).includes('test-only'),false);
await call(`/api/sessions/${sid}`,'DELETE');assert.equal((await call(path+'/json')).status,404);
console.log('PASS: no-data failure persisted, tutor fallback, owned evidence exports, report consistency and deletion.');
