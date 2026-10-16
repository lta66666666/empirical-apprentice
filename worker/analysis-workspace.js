import {loadOwnedSession,saveSession,requireSessionVersion,sessionPayload} from './sessions.js';
import {suitability} from './evidence.js';
import {knowledgeContext} from './knowledge.js';
import {requestIdentity} from './request-consistency.js';
import {readDrafts} from './drafts.js';
import {applyUnderstanding,researchSummary} from './research-understanding.js';
const cards=['question','sample','outcome','predictor','data_source','access','policy_name','policy_doc','effective_date','treated_list','comparison'];
const methods=['ols','panel_fe','did'],steps=['prepare','data','health','plan','execute','explain','reports'];
const labels={prepare:'整理研究准备',data:'载入数据',health:'检查数据与变量',plan:'核对完整方案',execute:'确认并执行',explain:'解释与修订',reports:'下载并核验报告'};
const fail=(detail,status=422)=>Object.assign(Error(detail),{status});
export function workspace(state){return state.analysis_workspace||{view:'overview',mode:'analysis',guide:{status:'idle',index:0},applied:[]};}
export async function selectedResult(env,owner,state,id){
 const rows=await Promise.all(['jobs','local_stata_tasks'].map(t=>env.DB.prepare('SELECT body,created_at FROM '+t+" WHERE session_id=? AND owner=? AND status='succeeded' AND (? IS NULL OR id=?) ORDER BY created_at DESC LIMIT 1").bind(state.session_id,owner,id||null,id||null).first()));
 const row=rows.filter(Boolean).sort((a,b)=>b.created_at-a.created_at)[0];return row?JSON.parse(row.body):null;
}
export function safeDraft(raw,profile){
 const names=new Set(profile.columns.map(c=>c.name)),result={};
 if(methods.includes(raw?.method))result.method=raw.method;
 for(const key of ['outcome','unit','time','treated','cluster'])if(names.has(raw?.[key]))result[key]=raw[key];
 result.predictors=Array.isArray(raw?.predictors)?raw.predictors.filter(x=>names.has(x)).slice(0,12):[];
 return result;
}
export async function analysisContext(env,owner,state,body){
 const p=body.profile||{row_count:0,columns:[]};
 const profile={row_count:p.row_count,columns:(p.columns||[]).map(c=>({name:c.name,numeric:c.numeric,missing:c.missing}))};
 const draft=safeDraft(body.draft_plan||state.research_drafts?.workbench?.value?.candidate,profile);
 const selected=await selectedResult(env,owner,state,body.task_id);
 if(body.task_id&&!selected)throw fail('所选任务尚未完成或不可读取，不能讲解该任务的结果。',404);
 let dictionary={...(state.research_drafts?.workbench?.value?.dictionary||{}),...(state.variable_dictionary||{})};
 if(!state.research_drafts?.workbench?.value?.profile?.row_count&&state._local_input?.profile?.row_count)dictionary={...(state._local_input.metadata?.dictionary||{}),...dictionary};
 if(body.input_sha256){const row=await env.DB.prepare('SELECT body FROM local_pairings WHERE session_id=? AND owner=? AND revoked=0 ORDER BY created_at DESC LIMIT 1').bind(state.session_id,owner).first();const pair=row?JSON.parse(row.body):null;if(pair?.input_sha256===body.input_sha256)dictionary=pair.metadata?.dictionary||{};}
 const step=steps.includes(body.step)?body.step:'data';
 return {step,profile,draft_plan:draft,draft_status:'未确认草稿，不能当作执行结果',dictionary,
 preparation:state.preparation,gaps:suitability(state),
 executed_result:selected?{id:selected.id,record_version:selected.record_version,plan:selected.plan,dictionary:selected.dictionary,n_used:selected.result?.n_used,coefficients:selected.result?.coefficients,warnings:selected.result?.warnings,execution_location:selected.execution_location,server_recomputed:false}:null};
}
export async function teachingMaterials(question,context){
 const name={ols:'OLS 线性回归',panel_fe:'固定效应 面板',did:'DID 政策'}[context.focus_method]||'研究准备';
 const materials=await knowledgeContext(question+' '+name+' '+(context.focus_method?labels[context.step]||'':'研究对象、结果与单位'));
 return context.focus_method||/\b(?:stata|fixest|feols|vcov|ssc)\b|软件命令|剔除样本|实际样本/i.test(question)?materials:materials.filter(x=>x.id.startsWith('lesson_')||x.id.startsWith('textbook_')&&x.task_stages?.includes('prepare'));
}
export function messageActions(state,context,output,intent){
 const pendingCards=output.ready?Object.fromEntries(Object.entries(context.unconfirmed_preparation?.cards||{}).filter(([,v])=>v.status==='suggested').map(([k,v])=>[k,v.value])):{};
 const actions=[],proposal={cards:Object.fromEntries(Object.entries({...pendingCards,...output.proposed_cards}).filter(([k,v])=>cards.includes(k)&&typeof v==='string'&&v.trim()).map(([k,v])=>[k,v.slice(0,2000)])),plan:output.ready?output.candidate:null,dictionary:output.proposed_dictionary||{},design:{question_type:context.policy_request?'policy_evaluation':'association',adoption_mode:context.policy_request?context.unconfirmed_preparation?.adoption_mode||'unknown':'unknown'}};
 if(Object.keys(proposal.cards).length||proposal.plan||Object.keys(proposal.dictionary).length)actions.push({id:'apply',kind:'apply',label:'预览建议并应用到草稿',reason:output.reason||'核对对话整理的信息；不自动核实来源。',proposal});
 actions.push({id:'prepare',kind:'navigate',target:'prepare',label:'补充研究资料',reason:context.gaps.next});
 if(!context.profile.row_count)actions.push({id:'data',kind:'navigate',target:'data',label:'载入数据或模拟案例',reason:'真实计算前需要可检查的输入。'});
 else actions.push({id:'health',kind:'navigate',target:'health',label:'查看数据体检与单位',reason:'核对缺失、字段和单位。'},{id:'plan',kind:'navigate',target:'plan',label:'打开方案确认卡',reason:'完整整理并确认后才执行。'});
 if(context.executed_result)actions.push({id:'answer',kind:'reflection',label:'进入解释作答／修订',task_id:context.executed_result.id,reason:'正式作答模式发送即提交；普通问答不提交成果。'});
 if(intent==='guided')actions.push({id:'guide_start',kind:'guide',command:'start',label:'开始分步引导',reason:'完成操作并确认后才推进。'});
 actions.push({id:'reports',kind:'navigate',target:'reports',label:'查看记录与报告',reason:'读取持久版本。'});
 return {actions,proposal};
}
async function guideCondition(env,owner,state,index){
 const pairRow=await env.DB.prepare('SELECT body FROM local_pairings WHERE session_id=? AND owner=? AND revoked=0').bind(state.session_id,owner).first();const pair=pairRow?JSON.parse(pairRow.body):null;
 const draft=state.research_drafts?.workbench?.value||{},result=await selectedResult(env,owner,state,workspace(state).guide?.task_id);
 if(index===0)return !!state.preparation.cards.question?.value||!!state.research_understanding?.fields?.goal?.value||!!state.research_understanding?.fields?.outcome?.value||!!pair?.profile?.row_count||!!draft.profile?.row_count;
 if(index===1)return !!(draft.input_sha256&&draft.profile?.columns?.length>0)||!!pair?.profile?.columns?.length;
 if(index===2)return !!(draft.input_sha256&&draft.profile?.columns?.length>0)||!!pair?.profile?.columns?.length;
 if(index===3){if(state.pending_confirmation?.token&&state.pending_confirmation.input_sha256===draft.input_sha256&&state.pending_confirmation.research_revision===state.research_revision)return true;const row=await env.DB.prepare('SELECT body FROM local_stata_tasks WHERE session_id=? AND owner=? ORDER BY created_at DESC LIMIT 1').bind(state.session_id,owner).first();const t=row?JSON.parse(row.body):null;return !!t&&t.research_revision===state.research_revision&&t.input_sha256===pair?.input_sha256;}
 if(index===4)return !!result&&result.research_revision===state.research_revision&&!!result.input_sha256&&[draft.input_sha256,pair?.input_sha256].includes(result.input_sha256);
 if(index===5)return !!result?.reflections?.length&&result.research_revision===state.research_revision&&[draft.input_sha256,pair?.input_sha256].includes(result.input_sha256);
 return true;
}
export async function handleAnalysisAction(request,env,owner,path){
 const match=/^\/api\/sessions\/([^/]+)\/analysis\/actions$/.exec(path);if(!match)return null;
 try{
 if(request.method!=='POST')throw fail('方法不支持',405);
 const body=await request.json(),state=await loadOwnedSession(env,owner,match[1]);if(state==='expired')throw fail('练习已到期',410);if(!state)throw fail('练习不可读取',404);
 Object.defineProperty(state,'research_drafts',{value:await readDrafts(env,state.session_id),enumerable:false,configurable:true,writable:true});
 const current=workspace(state),op=String(body.request_id||'');if(!/^[a-zA-Z0-9-]{8,80}$/.test(op))throw fail('缺少有效操作编号');
 const fingerprint=(await requestIdentity({request_id:op,message_id:body.message_id,action_id:body.action_id,edits:body.edits,plan_edits:body.plan_edits,dictionary_edits:body.dictionary_edits,command:body.command,view:body.view,mode:body.mode})).sha256;
 const previous=(current.applied||[]).find(x=>x.id===op);if(previous){if(previous.fingerprint!==fingerprint)throw fail('同一操作编号内容不同',409);return Response.json({...(await sessionPayload(env,state)),action_result:previous.result});}
 requireSessionVersion(state,body);let result={},action;
 if(body.message_id){
 const row=await env.DB.prepare('SELECT body FROM practical_messages WHERE id=? AND session_id=? AND owner=?').bind(body.message_id,state.session_id,owner).first();
 if(!row)throw fail('建议记录不可读取',404);const message=JSON.parse(row.body);action=message.actions?.find(a=>a.id===body.action_id);if(!action)throw fail('行动不在保存的允许列表中');
 if(action.kind==='apply'&&message.research_revision!==state.research_revision)throw fail('资料已变化，建议过期；请重新提问',409);
 if(action.kind==='apply'){
 if(message.input_sha256!==(state.research_drafts?.workbench?.value?.input_sha256||''))throw fail('数据已变化，请重新提问',409);
 const proposal=action.proposal,edits=body.edits||{},allowed=Object.keys(proposal.cards||{});if(Object.keys(edits).some(k=>!allowed.includes(k)))throw fail('编辑字段超出建议范围');
 if(allowed.some(k=>edits[k]!==undefined&&typeof edits[k]!=='string'))throw fail('资料修改必须是文字');
 for(const k of allowed){const value=String(edits[k]??proposal.cards[k]).trim().slice(0,2000);state.preparation.cards[k]={value,status:value?'filled':'to_find',source_title:'对话整理，学生确认填写；来源待核对',source_url:'',accessed_on:''};}
 const dict=proposal.dictionary||{},dictEdits=body.dictionary_edits||{};if(Object.keys(dictEdits).some(k=>!Object.hasOwn(dict,k)))throw fail('单位修改超出当前建议字段');for(const [k,v]of Object.entries(dict)){const edited=dictEdits[k]??v;if(typeof edited!=='string'||edited.length>300)throw fail('变量单位须为300字以内文字');state.variable_dictionary[k]=edited;}
 if(proposal.design){state.preparation.question_type=proposal.design.question_type;state.preparation.adoption_mode=proposal.design.adoption_mode;}
 applyUnderstanding(state,proposal,edits,message.id);
 let plan=proposal.plan;
 if(body.plan_edits){if(!plan)throw fail('没有可编辑的候选方案');const allowedPlan=['method','outcome','predictors','unit','time','treated','cluster'];if(Object.keys(body.plan_edits).some(k=>!allowedPlan.includes(k)))throw fail('方案修改字段无效');const names=new Set(message.context.profile.columns.map(c=>c.name));for(const [k,v]of Object.entries(body.plan_edits)){if(k==='method'){if(!methods.includes(v))throw fail('尚未支持该方法');}else if(k==='predictors'){if(!Array.isArray(v)||v.length>12||v.some(n=>!names.has(n)))throw fail('解释变量不在当前字段中');}else if(v!==''&&!names.has(v))throw fail('变量不在当前字段中');}plan={...plan,...body.plan_edits,same_batch:false};}
 state.research_revision++;state.pending_confirmation=null;result={plan,requires_reconfirmation:true};current.view=proposal.plan?'plan':'prepare';
 }else if(action.kind==='navigate')current.view=action.target;
 else if(action.kind==='reflection'){if(!await selectedResult(env,owner,state,action.task_id))throw fail('任务未完成');result={reflection_task:action.task_id};current.answer_task=action.task_id;current.view='explain';}
 else if(action.kind==='guide')body.command=action.command;
 }else if(body.action_id==='answer_exit'){current.answer_task=null;
 }else if(body.action_id==='view'){
 if(!['overview',...steps].includes(body.view))throw fail('任务视图无效');current.view=body.view;
 if(['analysis','knowledge','guided'].includes(body.mode))current.mode=body.mode;
 }else if(body.action_id!=='guide')throw fail('行动无效');
 if(body.command){
 const guide=current.guide||{status:'idle',index:0};
 if(body.command==='start'){if(guide.status==='active')throw fail('引导已启动，请完成当前步骤或先退出',409);guide.status='active';guide.index=0;}
 else if(body.command==='pause')guide.status='paused';
 else if(body.command==='resume'){if(guide.status!=='paused')throw fail('没有暂停的引导');guide.status='active';}
 else if(body.command==='exit'){guide.status='idle';current.mode='analysis';}
 else if(body.command==='next'){if(guide.status!=='active')throw fail('引导未启动');if(!await guideCondition(env,owner,state,guide.index))throw fail('当前步骤尚未完成，请先完成操作；没有自动执行。');guide.index=Math.min(6,guide.index+1);if(guide.index===6)guide.status='completed';}
 else throw fail('引导操作无效');
 current.guide=guide;if(guide.status==='active'){current.view=steps[guide.index];current.mode='guided';}
 }
 current.updated_at=Date.now();current.applied=[...(current.applied||[]),{id:op,fingerprint,result,message_id:body.message_id||null,action_id:body.action_id}].slice(-30);state.analysis_workspace=current;await saveSession(env,state);
 return Response.json({...(await sessionPayload(env,state)),action_result:result});
 }catch(e){return Response.json({detail:e.message,state_version:e.state_version},{status:e.status||422});}
}
