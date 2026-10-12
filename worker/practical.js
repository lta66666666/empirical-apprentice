import {loadOwnedSession,saveSession} from './sessions.js';
import {proposeCandidate,modelFeedback,modelCapabilities,reserveModelCall} from './model.js';
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
  const question=String(body.message||'').trim().replace(/\binput\b[\s\S]*?\bend\b/gi,'[逐行数据已省略]').replace(/(?:[A-Za-z]:\\|\/home\/|\/Users\/)[^\s"']+/g,'[本机路径]').slice(0,16000);if(!question)return Response.json({detail:'请写下问题。'},{status:422});
  if(body.research_revision!==state.research_revision)return Response.json({detail:'资料已变化，请刷新核对后再提问。'},{status:409});
  const profile=body.profile||{row_count:0,columns:[]};
  if(!Number.isInteger(profile.row_count)||profile.row_count<0||profile.row_count>20000||!Array.isArray(profile.columns)||profile.columns.length>60)return Response.json({detail:'列摘要无效。'},{status:422});
  const clean={row_count:profile.row_count,columns:profile.columns.map(c=>({name:c.name,numeric:c.numeric,missing:c.missing}))};
  if(modelCapabilities(env).candidate!=='unconfigured'){try{await reserveModelCall(env,owner);}catch(e){return Response.json({detail:e.message},{status:429});}}
  const history=await practicalMessages(env,owner,state.session_id);
  const requested=['knowledge','reflection','guided','analysis'].includes(body.intent)?body.intent:null;
  const intent=requested||(/一步|逐步|带我/.test(question)?'guided':/解释.*结果|系数.*解释/.test(question)?'reflection':/讲解|是什么|假设|内生性|稳健性|代码/.test(question)?'knowledge':'analysis');
  const display_mode=intent==='guided'?'guided':intent==='analysis'?'analysis':'knowledge';
  let response;
  if(intent==='analysis')response=await proposeCandidate({question,profile:clean,preparation:{question_type:state.preparation.question_type,adoption_mode:state.preparation.adoption_mode,effective_date:state.preparation.cards.effective_date?.value||''},blocker:didConflict(state),history:history.slice(-4).map(x=>({role:x.role,content:x.content}))},env,{session_id:state.session_id,owner});
  else{
    const retrieval=await knowledgeContext(question),materials=retrieval.map(c=>({id:c.id,content:c.content}));let related_task=null;
    if(intent==='reflection'){
      const row=await env.DB.prepare("SELECT body FROM jobs WHERE owner=? AND session_id=? AND status='succeeded' ORDER BY created_at DESC LIMIT 1").bind(owner,state.session_id).first();
      const localRow=await env.DB.prepare("SELECT body,created_at FROM local_stata_tasks WHERE owner=? AND session_id=? AND status='succeeded' ORDER BY created_at DESC LIMIT 1").bind(owner,state.session_id).first();
      const jobBody=row?JSON.parse(row.body):null;
      if(localRow&&(!jobBody||localRow.created_at>jobBody.created_at)){const task=JSON.parse(localRow.body);related_task=task.id;materials.push({id:'executed_result',content:{coefficients:task.result?.coefficients,n_rows:task.result?.n_used,plan:task.plan,dictionary:task.dictionary,execution_location:'local_mcp',summary:task.result?.summary,server_recomputed:false}});}
      else if(row){const job=jobBody;related_task=job.id;materials.push({id:'executed_result',content:{coefficients:job.result?.coefficients,n_rows:job.result?.n_rows,warnings:job.result?.warnings,plan:job.plan,dictionary:job.dictionary,execution_location:job.execution_location}});}
    }
    const feedback=intent==='reflection'&&!related_task?{answer:'尚无可用的已执行结果。请先载入数据、核对方案并完成真实计算；目前不能解释未执行的系数或检验。',mode:'checklist',references:[]}:await modelFeedback(intent==='reflection'?'reflection':'tutor',{question,answer:question,materials:[...materials,{id:'research_preparation',content:state.preparation}]},env,{session_id:state.session_id,owner,task_id:related_task});
    response=Response.json({...feedback,reason:feedback.answer,warning:'教学建议；来源与识别条件未自动核实。未执行的诊断与检验不构成证据。',retrieval,related_task});
  }
  const current=await loadOwnedSession(env,owner,state.session_id);if(!current||current==='expired'||current.research_revision!==state.research_revision)return Response.json({detail:'资料在回复期间已变化，请刷新后重试。'},{status:409});const output=await response.json(),now=Date.now();
  const assistant={id:crypto.randomUUID(),role:'assistant',content:[output.warning,output.reason||output.detail,...(output.questions||[]).map(q=>'请补充：'+q)].filter(Boolean).join('\n'),intent,display_mode,candidate:output.ready?output.candidate:null,allowed_next_steps:output.ready?['review_plan']:intent==='reflection'&&!output.related_task?['load_data','review_plan']:['ask','review_materials'],related_task:output.related_task||null,output,retrieval:output.retrieval||[],created_at:now+1};
  for(const entry of [{id:crypto.randomUUID(),role:'user',content:question,created_at:now},assistant])await env.DB.prepare('INSERT INTO practical_messages VALUES(?,?,?,?,?)').bind(entry.id,state.session_id,owner,JSON.stringify(entry),entry.created_at).run();
  await saveSession(env,state);
  return Response.json({message:assistant,messages:await practicalMessages(env,owner,state.session_id),display_mode,research_revision:state.research_revision});
}
