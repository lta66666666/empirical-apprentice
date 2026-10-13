import {loadOwnedSession,requireSessionVersion} from './sessions.js';
import {requestIdentity} from './request-consistency.js';
import {proposeCandidate,modelFeedback,modelCapabilities,reserveModelCall} from './model.js';
import {didConflict} from './evidence.js';
import {knowledgeContext} from './knowledge.js';
import {readDrafts} from './drafts.js';
import {handleAnalysisAction,analysisContext,teachingMaterials,messageActions} from './analysis-workspace.js';
import {understanding,absorbAnswer,validateChoice,intakePreparation,isPolicyRequest,researchSummary,mergeSuggestions,coachingDialogue,understandingExecutionGap} from './research-understanding.js';
const RETENTION=7*86400000;
const fail=(detail,status=422)=>Object.assign(Error(detail),{status});
const inputHash=state=>state.research_drafts?.workbench?.value?.input_sha256||state.research_drafts?.['local-workbench']?.value?.input_sha256||'';
const redact=value=>String(value||'').trim().replace(/\binput\b[\s\S]*?\bend\b/gi,'[逐行数据已省略]').replace(/(?:[A-Za-z]:\\|\/home\/|\/Users\/)[^\s"']+/g,'[本机路径]').slice(0,16000);
async function hydrate(env,state){Object.defineProperty(state,'research_drafts',{value:await readDrafts(env,state.session_id),enumerable:false,configurable:true,writable:true});return state;}
export async function practicalMessages(env,owner,id){const rows=await env.DB.prepare('SELECT body FROM practical_messages WHERE session_id=? AND owner=? ORDER BY created_at DESC LIMIT 100').bind(id,owner).all();return rows.results.map(row=>JSON.parse(row.body)).reverse();}

// The session update and messages share one conditional transaction. A losing request
// cannot insert a message, and a model response never overwrites an older session body.
async function persistTurn(env,state,user,assistant=null,{newUser=false}={}){
 const now=Date.now(),expected=state.state_version,next=expected+1,raw=JSON.stringify({...state,state_version:next,last_activity:now/1000});
 const statements=[env.DB.prepare('UPDATE sessions SET body=?,state_version=?,last_activity=MAX(last_activity,?) WHERE id=? AND owner=? AND state_version=? AND last_activity>?').bind(raw,next,now,state.session_id,state.owner_id,expected,now-RETENTION)];
 const exists='EXISTS(SELECT 1 FROM sessions WHERE id=? AND owner=? AND state_version=? AND body=?)';
 if(newUser)statements.push(env.DB.prepare('INSERT INTO practical_messages(id,session_id,owner,body,created_at) SELECT ?,?,?,?,? WHERE '+exists+' ON CONFLICT(id) DO NOTHING').bind(user.id,state.session_id,state.owner_id,JSON.stringify(user),user.created_at,state.session_id,state.owner_id,next,raw));
 else if(user)statements.push(env.DB.prepare('UPDATE practical_messages SET body=? WHERE id=? AND session_id=? AND owner=? AND '+exists).bind(JSON.stringify(user),user.id,state.session_id,state.owner_id,state.session_id,state.owner_id,next,raw));
 if(assistant)statements.push(env.DB.prepare('INSERT INTO practical_messages(id,session_id,owner,body,created_at) SELECT ?,?,?,?,? WHERE '+exists+' ON CONFLICT(id) DO NOTHING').bind(assistant.id,state.session_id,state.owner_id,JSON.stringify(assistant),assistant.created_at,state.session_id,state.owner_id,next,raw));
 const results=await env.DB.batch(statements);
 if(!results[0].meta?.changes){const current=await loadOwnedSession(env,state.owner_id,state.session_id);throw Object.assign(fail('练习在另一操作中更新，当前文字已保留。请同步后重试。',current==='expired'?410:current?409:404),{state_version:current?.state_version});}
 state.state_version=next;state.last_activity=now/1000;
}
async function retryQuestion(env,state,owner,body,history){
 if(!body.retry_of_message_id)return null;
 if(typeof body.retry_of_message_id!=='string'||body.retry_of_message_id.length>160)throw fail('重试问题编号无效');
 const row=await env.DB.prepare('SELECT body FROM practical_messages WHERE id=? AND session_id=? AND owner=?').bind(body.retry_of_message_id,state.session_id,owner).first();
 if(!row)throw fail('原问题不可读取',404);const original=JSON.parse(row.body);
 const failed=history.filter(x=>x.role==='assistant').at(-1);
 if(original.role!=='user'||!failed?.dialogue?.recovery?.can_retry||failed.dialogue.recovery.retry_of_message_id!==original.id)throw fail('这条问题没有可重试的模型响应');
 if(original.retry_lease_until>Date.now())throw fail('这条问题正在重试，请等待当前回复。',409);
 const latest=history.filter(x=>x.role==='user').at(-1);
 if(latest?.id!==original.id||failed.research_revision!==state.research_revision||failed.input_sha256!==inputHash(state))throw fail('研究资料或问题已经更新，请继续当前对话。',409);
 return original;
}
function readProfile(body,state){
 const profile=body.profile||state.research_drafts?.workbench?.value?.profile||{row_count:0,columns:[]};
 if(!Number.isInteger(profile.row_count)||profile.row_count<0||profile.row_count>20000||!Array.isArray(profile.columns)||profile.columns.length>60||!profile.columns.every(c=>typeof c.name==='string'&&c.name.length<=100&&typeof c.numeric==='boolean'&&Number.isInteger(c.missing)&&c.missing>=0))throw fail('列摘要无效。');
 return {row_count:profile.row_count,columns:profile.columns.map(c=>({name:c.name,numeric:c.numeric,missing:c.missing})),...(profile.time_range&&typeof profile.time_range==='object'?{time_range:profile.time_range}:{})};
}
function chooseIntent(body,question,u){
 const asked=['knowledge','reflection','guided','analysis'].includes(body.intent)?body.intent:null;
 if(asked==='reflection'||asked==='guided')return asked;
 if(u.active_question&&(/不知道|不清楚|不确定|全部时期|是什么|什么单位/.test(question)||body.choice_id))return 'analysis';
 if(asked)return asked;
 return /一步|逐步|带我/.test(question)?'guided':/解释.*结果|系数.*解释/.test(question)?'reflection':/讲解|是什么|假设|内生性|稳健性|代码/.test(question)?'knowledge':'analysis';
}
export async function handlePractical(request,env,owner,path){
 try{
 const actionReply=await handleAnalysisAction(request,env,owner,path);if(actionReply)return actionReply;
 if(path==='/api/knowledge'&&request.method==='GET'){const query=new URL(request.url).searchParams.get('q')||'';return Response.json({knowledge_version:'ea-kb-20261009-1',materials:await knowledgeContext(query.slice(0,2000))});}
 if(path!=='/api/research/chat')return null;
 const body=request.method==='GET'?{session_id:new URL(request.url).searchParams.get('session_id')}:await request.json();
 let state=await loadOwnedSession(env,owner,String(body.session_id||''));if(state==='expired')throw fail('练习已到期。',410);if(!state)throw fail('练习不存在或不可读取。',404);await hydrate(env,state);
 let history=await practicalMessages(env,owner,state.session_id);
 if(request.method==='GET')return Response.json({messages:history,research_summary:researchSummary(state,history),research_revision:state.research_revision,state_version:state.state_version});
 if(request.method!=='POST')throw fail('方法不支持',405);
 const identity=await requestIdentity(body);let existing=null,requestRecord=null,replyId=null;
 if(identity.id){
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(owner+'\n'+state.session_id+'\n'+identity.id)),key=[...new Uint8Array(digest)].map(v=>v.toString(16).padStart(2,'0')).join('');requestRecord=key+'-question';replyId=key+'-reply';
  const saved=await env.DB.prepare('SELECT body FROM practical_messages WHERE id=? AND session_id=? AND owner=?').bind(requestRecord,state.session_id,owner).first();
  if(saved){existing=JSON.parse(saved.body);if(existing.request_sha256!==identity.sha256)throw fail('同一请求编号的内容已变化，请重新发起问题。',409);}
  const reply=await env.DB.prepare('SELECT body FROM practical_messages WHERE id=? AND session_id=? AND owner=?').bind(replyId,state.session_id,owner).first();
  if(reply){const message=JSON.parse(reply.body);if(message.request_sha256!==identity.sha256)throw fail('同一请求编号的内容已变化，请重新发起问题。',409);return Response.json({message,messages:history,display_mode:message.display_mode,research_summary:researchSummary(state,history),research_revision:state.research_revision,state_version:state.state_version});}
  if(existing?.request_status==='stale')throw fail('资料在回复期间已变化，请同步后重新发送问题。',409);
  if(existing?.lease_until>Date.now())return Response.json({detail:'这条问题仍在处理，文字已保留。稍后重试会读取同一条回复。',retry_after_ms:1500,state_version:state.state_version},{status:409});
 }
 requireSessionVersion(state,body);if(body.research_revision!==state.research_revision)throw fail('资料已变化，请刷新核对后再提问。',409);
 const originalRetry=await retryQuestion(env,state,owner,body,history),choice=originalRetry?null:validateChoice(state,history,body);
 const question=redact(originalRetry?.content||existing?.content||choice?.answer||body.message);if(!question)throw fail('请写下问题。');
 const clean=readProfile(body,state),priorUnderstanding=understanding(state,history),intent=chooseIntent(body,question,priorUnderstanding),display_mode=intent==='guided'?'guided':intent==='analysis'?'analysis':'knowledge';
 let user=originalRetry||existing||{id:requestRecord||crypto.randomUUID(),role:'user',content:question,request_id:identity.id,request_sha256:identity.sha256,request_status:'pending',lease_until:Date.now()+30000,created_at:Math.max(Date.now(),(history.at(-1)?.created_at||0)+1)};
 if(!originalRetry&&!existing){
  const absorbed=['knowledge','reflection'].includes(intent)?{understanding:priorUnderstanding,changed:false,answer_field:null}:absorbAnswer(state,history,question,user.id,choice);state.research_understanding=absorbed.understanding;user.intent=intent;user.answer_field=absorbed.answer_field;user.question_id=body.question_id||null;user.choice_id=body.choice_id||null;
  if(absorbed.changed){state.research_revision++;state.pending_confirmation=null;}
  user.research_revision=state.research_revision;user.input_sha256=inputHash(state);await persistTurn(env,state,user,null,{newUser:true});history=await practicalMessages(env,owner,state.session_id);
 }else if(originalRetry){
  user={...originalRetry,retry_request_id:identity.id,retry_request_sha256:identity.sha256,retry_lease_until:Date.now()+30000};await persistTurn(env,state,user);
 }else if(existing){
  if(existing.research_revision!==state.research_revision||existing.input_sha256!==inputHash(state))throw fail('这条问题的资料已经变化，请同步后重新发起。',409);
  user={...existing,lease_until:Date.now()+30000,request_status:'pending'};await persistTurn(env,state,user);
 }
 const context=await analysisContext(env,owner,state,{...body,profile:clean}),u=understanding(state,history),intake=intakePreparation(state,u);
 context.unconfirmed_preparation=intake;context.research_understanding=u;context.current_question=priorUnderstanding.active_question;context.coaching={kind:'research_tutor'};context.policy_request=isPolicyRequest(state,u);
 context.focus_method=intent==='reflection'?context.executed_result?.plan?.method:body.method_explicit===true?context.draft_plan.method:null;
 let output,limitError;
 if(modelCapabilities(env).candidate!=='unconfigured')try{await reserveModelCall(env,owner);}catch(e){limitError=e;}
 if(limitError)output={mode:'checklist',error_type:'rate_limit',failure_reason:'今日模型调用额度已用完，回答仍可保存。',ready:false};
 else if(intent==='analysis'||intent==='guided'){
  const response=await proposeCandidate({question,profile:clean,preparation:intake,context,blocker:didConflict({...state,preparation:intake}),history:history.filter(x=>x.id!==user.id).slice(-10).map(x=>({role:x.role,content:x.content}))},env,{session_id:state.session_id,owner});output=await response.json();
  const blocker=understandingExecutionGap(state,u);if(output.ready&&blocker){output.ready=false;output.mode='needs_information';output.reason=blocker;output.candidate=null;}
 }else{
  const retrieval=await teachingMaterials(question,context),materials=retrieval.map(c=>({id:c.id,content:c.content}));let related_task=null;
  if(intent==='reflection'&&context.executed_result){related_task=context.executed_result.id;materials.push({id:'executed_result',content:context.executed_result});}
  const feedback=intent==='reflection'&&!related_task?{answer:'尚无可用的已执行结果。请先核对方案并完成真实计算，不能解释未执行的系数或检验。',mode:'checklist',references:[]}:await modelFeedback(intent==='reflection'?'reflection':'tutor',{question,answer:question,coaching:{kind:'research_tutor'},research_understanding:u,current_question:priorUnderstanding.active_question,materials:[...materials,{id:'analysis_context',content:context},{id:'research_preparation',content:state.preparation}]},env,{session_id:state.session_id,owner,task_id:related_task});
  output={...feedback,reason:feedback.answer,retrieval,related_task};
 }
 let current=await loadOwnedSession(env,owner,state.session_id);if(current&&current!=='expired')await hydrate(env,current);
 if(!current||current==='expired'||current.research_revision!==state.research_revision||inputHash(current)!==inputHash(state)){
  if(!originalRetry){user.request_status='stale';user.lease_until=0;await env.DB.prepare('UPDATE practical_messages SET body=? WHERE id=? AND session_id=? AND owner=?').bind(JSON.stringify(user),user.id,state.session_id,owner).run();}
  throw Object.assign(fail('资料在回复期间已变化，回答已保留。请同步后继续。',409),{state_version:current?.state_version});
 }
 const now=Date.now(),assistant={id:replyId||crypto.randomUUID(),request_id:identity.id,request_sha256:identity.sha256,retry_of_message_id:originalRetry?.id||null,role:'assistant',intent,display_mode,candidate:output.ready?output.candidate:null,allowed_next_steps:output.ready?['review_plan']:['ask','review_materials'],related_task:output.related_task||null,output,retrieval:output.retrieval||[],created_at:Math.max(now+1,user.created_at+1,(history.at(-1)?.created_at||0)+1)};
 const updated=mergeSuggestions(understanding(current,history),output,assistant.id),dialogue=coachingDialogue(current,updated,output,context,user,assistant.id,intent);
 assistant.dialogue=dialogue;assistant.content=dialogue.summary;assistant.intake_field=dialogue.current_question?.field||null;assistant.input_sha256=inputHash(current);assistant.research_revision=current.research_revision;assistant.context=context;assistant.teaching=await teachingMaterials(question,context);Object.assign(assistant,messageActions(current,context,output,intent));
 updated.active_question=dialogue.current_question;current.research_understanding=updated;
 if(!originalRetry){user.request_status='complete';user.lease_until=0;}else user.retry_lease_until=0;
 await persistTurn(env,current,user,assistant);history=await practicalMessages(env,owner,current.session_id);
 return Response.json({message:assistant,messages:history,display_mode,research_summary:researchSummary(current,history),research_revision:current.research_revision,state_version:current.state_version});
 }catch(error){return Response.json({detail:error.message||'对话暂时不可用，文字已保留。',...(error.state_version!==undefined?{state_version:error.state_version}:{})},{status:error.status||422});}
}
