import {writeFile} from 'node:fs/promises';
import current from '../dist/server/index.js';
import baseline from '../outputs/perf-baseline/dist/server/index.js';
import {openStorage as currentStorage} from '../standalone/storage.mjs';
import {openStorage as oldStorage} from '../outputs/perf-baseline/standalone/storage.mjs';
async function measure(worker,openStorage,name){
  const storage=await openStorage('outputs/perf-'+name+'-'+Date.now()),counts={reads:0,content_writes:0,activity_writes:0};
  const DB={...storage.DB,prepare(sql){if(/^(SELECT)/.test(sql))counts.reads++;if(/(INSERT INTO sessions|UPDATE sessions SET body)/.test(sql))counts.content_writes++;if(/^UPDATE sessions SET last_activity/.test(sql))counts.activity_writes++;return storage.DB.prepare(sql);}};
  const env={DB,FILES:storage.FILES,AUTH_ROLLOUT:'preview'},origin='https://perf.test';let cookie='';
  const call=async(path,method='GET')=>{const response=await worker.fetch(new Request(origin+path,{method,headers:{Origin:origin,Cookie:cookie}}),env);if(response.headers.get('set-cookie'))cookie=response.headers.get('set-cookie').split(';')[0];return response;};
  try{
    const initial=await call('/api/sessions','POST'),sid=(await initial.json()).session_id;counts.reads=counts.content_writes=counts.activity_writes=0;const samples=[];let bytes;
    for(let i=0;i<20;i++){const start=performance.now(),r=await call('/api/sessions/'+sid);const text=await r.text();if(!r.ok)throw Error('performance read failed');samples.push(performance.now()-start);bytes=Buffer.byteLength(text);}
    const sorted=samples.slice().sort((a,b)=>a-b);return {name,requests:samples.length,p50_ms:Number(sorted[10].toFixed(2)),p95_ms:Number(sorted[19].toFixed(2)),response_bytes:bytes,counts};
  }finally{storage.close();}
}
const before=await measure(baseline,oldStorage,'before'),after=await measure(current,currentStorage,'after');
const result={scope:'20 isolated Worker/SQLite reads each; no network, model or R execution; milliseconds are local microbenchmarks, not public or device latency',before,after};
await writeFile('outputs/interaction-performance.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
