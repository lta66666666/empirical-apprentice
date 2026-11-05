import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {openStorage} from '../standalone/storage.mjs';
import {interpretationEndpoint} from '../worker/ai-interpretation.js';
import {fixtures} from '../worker/fixtures.js';
process.loadEnvFile('../empirical_apprentice_sites/.env.local');
const store=await openStorage('outputs/ai-real-model-'+Date.now()),checks=[];
try{
 const numeric=JSON.parse(await readFile('outputs/cloud-compute-acceptance.json','utf8'));
 for(const method of ['ols','panel_fe','did']){
  const job={id:crypto.randomUUID(),owner:'isolated-model-acceptance',session_id:crypto.randomUUID(),status:'succeeded',software:'python',engine_id:'statspai_cloud',record_version:1,plan:fixtures[method].plan,dictionary:fixtures[method].dictionary,result:numeric.results[method].result,reflections:[]};
  await store.DB.prepare('INSERT INTO sessions(id,owner,body,created_at,last_activity) VALUES(?,?,?,?,?)').bind(job.session_id,job.owner,'{}',Date.now(),Date.now()).run();
  await store.DB.prepare('INSERT INTO jobs(id,session_id,owner,body,status,input_key,created_at,last_activity,lease_until) VALUES(?,?,?,?,?,?,?,?,?)').bind(job.id,job.session_id,job.owner,JSON.stringify(job),job.status,'test',Date.now(),Date.now(),0).run();
  const request=()=>new Request('https://acceptance.test/api/research/jobs/'+job.id+'/ai-interpretation',{method:'POST',body:'{}'});
  const result=await (await interpretationEndpoint(request(),{...process.env,DB:store.DB},job)).json();
  const cached=await (await interpretationEndpoint(request(),{...process.env,DB:store.DB},job)).json();
  assert.equal(cached.status,result.status);if(result.status==='succeeded')assert.deepEqual(cached,result);
  checks.push({method,status:result.status,model:result.model||null,detail:result.detail||null,summary:result.summary,points:result.points,limitations:result.limitations,claims:result.claims});
  await writeFile('outputs/ai-real-model-acceptance.json',JSON.stringify({scope:'real existing DeepSeek, saved real local calculation summaries; not JoyCode, browser or teaching review',checks},null,2));
  console.log(JSON.stringify({method,status:result.status,model:result.model||null}));
 }
 if(checks.some(x=>x.status!=='succeeded'))process.exitCode=1;
}finally{store.close();}
