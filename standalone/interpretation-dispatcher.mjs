import {getJob} from '../dist/server/research.js';
import {loadOwnedSession} from '../dist/server/sessions.js';
import {interpretationEndpoint} from '../dist/server/ai-interpretation.js';

// Persistent task flags and interpretation rows are the queue. No browser lease
// or activity refresh is used, and failed calls require an explicit manual retry.
export async function interpretationTick(env){
 for(const table of ['jobs','local_stata_tasks']){
  const rows=await env.DB.prepare(`SELECT t.body FROM ${table} t JOIN sessions s ON s.id=t.session_id AND s.owner=t.owner WHERE s.last_activity>? AND json_extract(t.body,'$.auto_interpretation')=1 AND t.status IN ('succeeded','running','queued','preparing','estimating','saving') AND NOT EXISTS(SELECT 1 FROM ai_interpretations a WHERE a.owner=t.owner AND a.task_id=t.id) ORDER BY t.created_at LIMIT 5`).bind(Date.now()-7*86400000).all();
  for(const row of rows.results){
   const stored=JSON.parse(row.body),session=await loadOwnedSession(env,stored.owner,stored.session_id);
   if(!session||session==='expired')continue;
   const job=table==='jobs'?await getJob(env,stored.owner,stored.id):stored;
   if(job?.status!=='succeeded'||!job.result?.coefficients?.length)continue;
   const account=await env.DB.prepare('SELECT user_id FROM account_owners WHERE owner=?').bind(job.owner).first();
   const scoped={...env,...(account?{ACCOUNT_ID:account.user_id}:{})};
   await interpretationEndpoint(new Request('http://internal/ai-interpretation',{method:'POST',body:'{}'}),scoped,job,table);
  }
 }
}

export function startInterpretationDispatcher(env){
 let stopping=false,inflight=null;
 const run=()=>{if(stopping||inflight)return;inflight=interpretationTick(env).catch(()=>console.error('Interpretation queue unavailable; retry scheduled.')).finally(()=>inflight=null);};
 const timer=setInterval(run,5000);timer.unref();run();
 return async()=>{stopping=true;clearInterval(timer);await inflight;};
}
