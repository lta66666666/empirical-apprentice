import {loadOwnedSession,saveSession} from './sessions.js';
import {proposeCandidate,modelCapabilities,reserveModelCall} from './model.js';
import {didConflict} from './evidence.js';
import {knowledgeContext} from './knowledge.js';
export async function practicalMessages(env,owner,id){const rows=await env.DB.prepare('SELECT body FROM practical_messages WHERE session_id=? AND owner=? ORDER BY created_at DESC LIMIT 100').bind(id,owner).all();return rows.results.map(row=>JSON.parse(row.body)).reverse();}
export async function handlePractical(request,env,owner,path){
  if(path==='/api/knowledge'&&request.method==='GET'){const query=new URL(request.url).searchParams.get('q')||'';return Response.json({knowledge_version:'ea-kb-20261009-1',materials:await knowledgeContext(query.slice(0,2000))});}
  if(path!=='/api/research/chat')return null;
  const body=request.method==='GET'?{session_id:new URL(request.url).searchParams.get('session_id')}:await request.json();
  const state=await loadOwnedSession(env,owner,String(body.session_id||''));if(!state||state==='expired')return Response.json({detail:'练习不存在、已到期或不属于当前浏览器。'},{status:404});
  if(request.method==='GET')return Response.json({messages:await practicalMessages(env,owner,state.session_id)});
  if(request.method!=='POST')return Response.json({detail:'方法不支持'},{status:405});
  const question=String(body.message||'').trim().slice(0,2000);if(!question)return Response.json({detail:'请写下问题。'},{status:422});
  if(body.research_revision!==state.research_revision)return Response.json({detail:'资料已变化，请刷新核对后再提问。'},{status:409});
  const profile=body.profile||{row_count:0,columns:[]};
  if(!Number.isInteger(profile.row_count)||profile.row_count<0||profile.row_count>20000||!Array.isArray(profile.columns)||profile.columns.length>60)return Response.json({detail:'列摘要无效。'},{status:422});
  const clean={row_count:profile.row_count,columns:profile.columns.map(c=>({name:c.name,numeric:c.numeric,missing:c.missing}))};
  if(modelCapabilities(env).candidate!=='unconfigured'){try{await reserveModelCall(env,owner);}catch(e){return Response.json({detail:e.message},{status:429});}}
  const history=await practicalMessages(env,owner,state.session_id);
  const response=await proposeCandidate({question,profile:clean,preparation:{question_type:state.preparation.question_type,adoption_mode:state.preparation.adoption_mode,effective_date:state.preparation.cards.effective_date?.value||''},blocker:didConflict(state),history:history.slice(-4).map(x=>({role:x.role,content:x.content}))},env,{session_id:state.session_id,owner});
  const current=await loadOwnedSession(env,owner,state.session_id);if(!current||current==='expired'||current.research_revision!==state.research_revision)return Response.json({detail:'资料在回复期间已变化，请刷新后重试。'},{status:409});const output=await response.json(),now=Date.now();
  const assistant={id:crypto.randomUUID(),role:'assistant',content:[output.warning,output.reason||output.detail,...(output.questions||[]).map(q=>'请补充：'+q)].filter(Boolean).join('\n'),candidate:output.ready?output.candidate:null,output,retrieval:output.retrieval||[],created_at:now+1};
  for(const entry of [{id:crypto.randomUUID(),role:'user',content:question,created_at:now},assistant])await env.DB.prepare('INSERT INTO practical_messages VALUES(?,?,?,?,?)').bind(entry.id,state.session_id,owner,JSON.stringify(entry),entry.created_at).run();
  await saveSession(env,state);
  return Response.json({message:assistant,messages:await practicalMessages(env,owner,state.session_id),research_revision:state.research_revision});
}
