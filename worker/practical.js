import {loadOwnedSession,touchSession,requireSessionVersion} from './sessions.js';
import {requestIdentity} from './request-consistency.js';
import {proposeCandidate,modelFeedback,modelCapabilities,reserveModelCall} from './model.js';
import {didConflict} from './evidence.js';
import {knowledgeContext} from './knowledge.js';
import {readDrafts} from './drafts.js';
import {handleAnalysisAction,analysisContext,teachingMaterials,messageActions} from './analysis-workspace.js';
function nextIntakeQuestion(output,context,intake){
 if(output.ready)return '我整理了一份候选方案。请在右侧核对建议，确认后再计算。';
 if(output.mode==='manual'||output.mode==='rules')return '暂时无法获取在线建议，你的输入已保留，可以稍后重试。';
 const cards={...intake.cards,...Object.fromEntries(Object.entries(output.proposed_cards||{}).filter(([,v])=>v.trim()&&!/待明确|待核实|未提供|尚未确定/.test(v)).map(([k,value])=>[k,{value}]))};
 const known=k=>typeof cards[k]?.value==='string'&&cards[k].value.trim()&&!/待明确|待核实|未提供|尚未确定/.test(cards[k].value);
 if(!known('question')||/^(实证分析|时政分析|政策分析|研究|分析)$/.test(cards.question.value.trim()))return '你想研究什么现象，或者评估哪项政策的影响？';
 if(context.policy_request&&!intake.cards.policy_name?.value&&!known('policy_name')&&!known('policy_doc'))return '你想评估哪项政策的影响？可以先告诉我政策名称。';
 if(!known('sample'))return '研究对象是谁，你希望观察哪个时期？';
 if(!known('outcome'))return '你希望观察哪个结果？例如收入、就业或产出，请同时说明单位。';
 if(context.policy_request&&!known('effective_date'))return '这项政策实际从什么时候开始实施？发布日和实施日可能不同。';
 if(context.policy_request&&intake.adoption_mode==='unknown')return '政策是在同一批对象、同一时间实施，还是分批实施？';
 if(context.policy_request&&intake.adoption_mode==='staggered')return '政策分批实施，当前同批DID不能直接使用。你希望先整理数据与研究条件吗？';
 if(context.policy_request&&!known('policy_doc'))return '请提交政策原文或链接，我会结合资料核对实施条件。';
 if(!context.profile.row_count)return '请提交CSV或TSV数据。我会检查字段，再确定可以采用的方法。';
 return String(output.questions?.[0]||'数据已收到。你希望用哪一列表示要解释的结果？');
}

export async function practicalMessages(env,owner,id){const rows=await env.DB.prepare('SELECT body FROM practical_messages WHERE session_id=? AND owner=? ORDER BY created_at DESC LIMIT 100').bind(id,owner).all();return rows.results.map(row=>JSON.parse(row.body)).reverse();}
export async function handlePractical(request,env,owner,path){
  try{
  const actionReply=await handleAnalysisAction(request,env,owner,path);if(actionReply)return actionReply;
  if(path==='/api/knowledge'&&request.method==='GET'){const query=new URL(request.url).searchParams.get('q')||'';return Response.json({knowledge_version:'ea-kb-20261009-1',materials:await knowledgeContext(query.slice(0,2000))});}
  if(path!=='/api/research/chat')return null;
  const body=request.method==='GET'?{session_id:new URL(request.url).searchParams.get('session_id')}:await request.json();
  const state=await loadOwnedSession(env,owner,String(body.session_id||''));if(state==='expired')return Response.json({detail:'练习已到期。'},{status:410});if(!state)return Response.json({detail:'练习不存在或不可读取。'},{status:404});
  Object.defineProperty(state,'research_drafts',{value:await readDrafts(env,state.session_id),enumerable:false,configurable:true,writable:true});
  if(request.method==='GET')return Response.json({messages:await practicalMessages(env,owner,state.session_id)});
  if(request.method!=='POST')return Response.json({detail:'方法不支持'},{status:405});
  const identity=await requestIdentity(body);
  let requestRecord=null,replyId=null,existing=null;
  if(identity.id){
    const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(owner+'\n'+state.session_id+'\n'+identity.id));
    const key=[...new Uint8Array(digest)].map(v=>v.toString(16).padStart(2,'0')).join('');requestRecord=key+'-question';replyId=key+'-reply';
    const saved=await env.DB.prepare('SELECT body FROM practical_messages WHERE id=? AND session_id=? AND owner=?').bind(requestRecord,state.session_id,owner).first();
    if(saved){existing=JSON.parse(saved.body);if(existing.request_sha256!==identity.sha256)return Response.json({detail:'同一请求编号的内容已变化，请重新发起问题。'},{status:409});const reply=await env.DB.prepare('SELECT body FROM practical_messages WHERE id=? AND session_id=? AND owner=?').bind(replyId,state.session_id,owner).first();if(reply){const message=JSON.parse(reply.body);return Response.json({message,messages:await practicalMessages(env,owner,state.session_id),display_mode:message.display_mode,research_revision:state.research_revision,state_version:state.state_version});}if(existing.request_status==='stale')return Response.json({detail:'资料在回复期间已变化，请同步后重新发送问题。',state_version:state.state_version},{status:409});if(existing.lease_until>Date.now())return Response.json({detail:'这条问题仍在处理，文字已保留。稍后重试会读取同一条回复。',retry_after_ms:1500},{status:409});}
  }
  requireSessionVersion(state,body);
  const question=String(body.message||'').trim().replace(/\binput\b[\s\S]*?\bend\b/gi,'[逐行数据已省略]').replace(/(?:[A-Za-z]:\\|\/home\/|\/Users\/)[^\s"']+/g,'[本机路径]').slice(0,16000);if(!question)return Response.json({detail:'请写下问题。'},{status:422});
  if(body.research_revision!==state.research_revision)return Response.json({detail:'资料已变化，请刷新核对后再提问。'},{status:409});
  const profile=body.profile||{row_count:0,columns:[]};
  if(!Number.isInteger(profile.row_count)||profile.row_count<0||profile.row_count>20000||!Array.isArray(profile.columns)||profile.columns.length>60||!profile.columns.every(c=>typeof c.name==='string'&&c.name.length<=100&&typeof c.numeric==='boolean'&&Number.isInteger(c.missing)&&c.missing>=0))return Response.json({detail:'列摘要无效。'},{status:422});
  const clean={row_count:profile.row_count,columns:profile.columns.map(c=>({name:c.name,numeric:c.numeric,missing:c.missing}))};
  const context=await analysisContext(env,owner,state,body);
  const history=await practicalMessages(env,owner,state.session_id);
  const pending=Object.assign({},...history.filter(x=>x.role==='assistant').map(x=>({...Object.fromEntries(Object.entries(x.context?.unconfirmed_preparation?.cards||{}).map(([k,c])=>[k,c.value])),...x.proposal?.cards})));
  const utterances=history.filter(x=>x.role==='user').map(x=>x.content).concat(question).join('\n');
  const adoption=/分批|不同年份|陆续实施/.test(utterances)?'staggered':/同批实施|同一天实施|同一时间实施|同年实施/.test(utterances)&&!/不是同批|不确定|尚未确定/.test(utterances)?'single_batch':state.preparation.adoption_mode;
  const intake={...state.preparation,adoption_mode:adoption,cards:{...Object.fromEntries(Object.entries(pending).map(([k,value])=>[k,{value,status:'suggested'}])),...state.preparation.cards}};
  const goal=[...history.filter(x=>x.role==='user').map(x=>x.content),question].reverse().find(x=>/(?:想|希望|需要|帮我|我要).*(?:研究|分析|评估|考察)/.test(x)&&!/^请讲解|我已提交|我已选择/.test(x))||state.preparation.cards.question?.value||'';
  if(goal&&!intake.cards.question?.value)intake.cards.question={value:goal,status:'suggested'};
 const prior=history.filter(x=>x.role==='assistant').at(-1);if(prior?.intake_field&&!/(?:想|希望|帮我).*(?:研究|分析|评估)|^讲解|^解释/.test(question)&&!intake.cards[prior.intake_field]?.value)intake.cards[prior.intake_field]={value:question,status:'suggested'};
 const policyNames=[...utterances.matchAll(/政策(?:名称)?(?:是|为|叫|：|:)([^，。;\n]{2,100})/g)];if(policyNames.length)intake.cards.policy_name={value:policyNames.at(-1)[1].trim(),status:'suggested'};
 context.unconfirmed_preparation=intake;context.policy_request=/政策|时政/.test(goal)||!!intake.cards.policy_doc?.value||state.preparation.question_type==='policy_evaluation';
  const user={id:requestRecord||crypto.randomUUID(),role:'user',content:question,request_id:identity.id,request_sha256:identity.sha256,request_status:'pending',lease_until:Date.now()+30000,created_at:existing?.created_at||Date.now()};
  if(identity.id){const reserved=existing?await env.DB.prepare('UPDATE practical_messages SET body=? WHERE id=? AND owner=? AND body=?').bind(JSON.stringify(user),user.id,owner,JSON.stringify(existing)).run():await env.DB.prepare('INSERT INTO practical_messages(id,session_id,owner,body,created_at) VALUES(?,?,?,?,?) ON CONFLICT(id) DO NOTHING').bind(user.id,state.session_id,owner,JSON.stringify(user),user.created_at).run();if(!reserved.meta.changes)return Response.json({detail:'这条问题仍在处理，请稍后读取同一条回复。',retry_after_ms:1500},{status:409});}
  if(modelCapabilities(env).candidate!=='unconfigured'){try{await reserveModelCall(env,owner);}catch(e){user.lease_until=0;if(identity.id)await env.DB.prepare('UPDATE practical_messages SET body=? WHERE id=? AND owner=?').bind(JSON.stringify(user),user.id,owner).run();return Response.json({detail:e.message},{status:429});}}
  const requested=['knowledge','reflection','guided','analysis'].includes(body.intent)?body.intent:null;
  const intent=requested||(/一步|逐步|带我/.test(question)?'guided':/解释.*结果|系数.*解释/.test(question)?'reflection':/讲解|是什么|假设|内生性|稳健性|代码/.test(question)?'knowledge':'analysis');
  context.focus_method=intent==='reflection'?context.executed_result?.plan?.method:context.draft_plan.method;
  const display_mode=intent==='guided'?'guided':intent==='analysis'?'analysis':'knowledge';
  let response;
  if(intent==='analysis'||intent==='guided')response=await proposeCandidate({question,profile:clean,preparation:intake,context,blocker:didConflict({...state,preparation:intake}),history:history.slice(-10).map(x=>({role:x.role,content:x.content}))},env,{session_id:state.session_id,owner});
  else{
    const retrieval=await teachingMaterials(question,context),materials=retrieval.map(c=>({id:c.id,content:c.content}));let related_task=null;
    if(intent==='reflection'){
      const selected=typeof body.task_id==='string'?body.task_id:null;
      const row=await env.DB.prepare("SELECT body,created_at FROM jobs WHERE owner=? AND session_id=? AND status='succeeded' AND (? IS NULL OR id=?) ORDER BY created_at DESC LIMIT 1").bind(owner,state.session_id,selected,selected).first();
      const localRow=await env.DB.prepare("SELECT body,created_at FROM local_stata_tasks WHERE owner=? AND session_id=? AND status='succeeded' AND (? IS NULL OR id=?) ORDER BY created_at DESC LIMIT 1").bind(owner,state.session_id,selected,selected).first();
      const jobBody=row?JSON.parse(row.body):null;
      if(localRow&&(!jobBody||localRow.created_at>row.created_at)){const task=JSON.parse(localRow.body);related_task=task.id;materials.push({id:'executed_result',content:{coefficients:task.result?.coefficients,n_used:task.result?.n_used,plan:task.plan,dictionary:task.dictionary,execution_location:'local_mcp',summary:task.result?.summary,server_recomputed:false}});}
      else if(row){const job=jobBody;related_task=job.id;materials.push({id:'executed_result',content:{coefficients:job.result?.coefficients,n_used:job.result?.n_used,warnings:job.result?.warnings,plan:job.plan,dictionary:job.dictionary,execution_location:job.execution_location}});}
    }
    const feedback=intent==='reflection'&&!related_task?{answer:'尚无可用的已执行结果。请先载入数据、核对方案并完成真实计算；目前不能解释未执行的系数或检验。',mode:'checklist',references:[]}:await modelFeedback(intent==='reflection'?'reflection':'tutor',{question,answer:question,materials:[...materials,{id:'analysis_context',content:context},{id:'research_preparation',content:state.preparation}]},env,{session_id:state.session_id,owner,task_id:related_task});
    response=Response.json({...feedback,reason:feedback.answer,warning:'教学建议；来源与识别条件未自动核实。未执行的诊断与检验不构成证据。',retrieval,related_task});
  }
  const current=await loadOwnedSession(env,owner,state.session_id);if(!current||current==='expired'||current.research_revision!==state.research_revision||current.state_version!==state.state_version){if(identity.id){user.request_status='stale';user.lease_until=0;await env.DB.prepare('UPDATE practical_messages SET body=? WHERE id=? AND owner=?').bind(JSON.stringify(user),user.id,owner).run();}return Response.json({detail:'资料或学习进度在回复期间已变化，请同步后重新发送问题。',state_version:current?.state_version},{status:409});}const output=await response.json(),now=Date.now();
  const assistant={id:replyId||crypto.randomUUID(),request_id:identity.id,role:'assistant',content:(intent==='analysis'||intent==='guided')?nextIntakeQuestion(output,context,intake):(output.answer||output.reason||output.detail||'请补充你想了解的内容。'),intent,display_mode,candidate:output.ready?output.candidate:null,allowed_next_steps:output.ready?['review_plan']:intent==='reflection'&&!output.related_task?['load_data','review_plan']:['ask','review_materials'],related_task:output.related_task||null,output,retrieval:output.retrieval||[],created_at:now+1};
  assistant.intake_field=/你想研究/.test(assistant.content)?'question':/可以先告诉我政策名称/.test(assistant.content)?'policy_name':/研究对象是谁/.test(assistant.content)?'sample':/希望观察哪个结果/.test(assistant.content)?'outcome':/实际从什么时候/.test(assistant.content)?'effective_date':null;
 assistant.input_sha256=state.research_drafts?.workbench?.value?.input_sha256||'';assistant.research_revision=state.research_revision;assistant.context=context;assistant.teaching=await teachingMaterials(question,context);Object.assign(assistant,messageActions(state,context,output,intent));
  user.request_status='complete';user.lease_until=0;
  if(identity.id)await env.DB.batch([env.DB.prepare('UPDATE practical_messages SET body=? WHERE id=? AND owner=?').bind(JSON.stringify(user),user.id,owner),env.DB.prepare('INSERT INTO practical_messages VALUES(?,?,?,?,?) ON CONFLICT(id) DO NOTHING').bind(assistant.id,state.session_id,owner,JSON.stringify(assistant),assistant.created_at)]);
  else for(const entry of [user,assistant])await env.DB.prepare('INSERT INTO practical_messages VALUES(?,?,?,?,?)').bind(entry.id,state.session_id,owner,JSON.stringify(entry),entry.created_at).run();
  await touchSession(env,current);
  return Response.json({message:assistant,messages:await practicalMessages(env,owner,state.session_id),display_mode,research_revision:current.research_revision,state_version:current.state_version});
  }catch(error){return Response.json({detail:error.message||'对话暂时不可用，文字已保留。',...(error.state_version!==undefined?{state_version:error.state_version}:{})},{status:error.status||422});}
}
