import { syncSessionNodes, deleteSessionNodes } from './executor.js';
import { curriculum, practiceCases } from './content.js';
import { analyzeTwoPeriod } from './analysis.js';
import { upgradeState, evidenceSnapshot, suitability } from './evidence.js';
import { modelFeedback, reserveModelCall, modelCapabilities } from './model.js';
import { draftEndpoint, readDrafts } from './drafts.js';
import {modelInteractions,modelEvidenceMarkdown} from './model-evidence.js';
import {practicalMessages} from './practical.js';
import {researchSummary,refreshUnderstandingFromPreparation} from './research-understanding.js';
import {localTasks} from './local-stata.js';
import {ensureLearningContext,coursePayload,openCourse,learningProjection,commitLearningProjection,courseView} from './course.js';

const DAY = 86400000;
const RETENTION = 7 * DAY;
const fields = ['treatment', 'outcome', 'time_range', 'sample', 'policy_batches', 'hypothesis', 'policy_doc', 'comparison', 'data_status', 'alternatives'];
const commonCards = ['question', 'sample', 'outcome', 'predictor', 'data_source', 'access'];
const policyCards = ['policy_doc', 'release_date', 'effective_date', 'expansion_date', 'treated_list', 'comparison'];
const methodAnswers = { ols: 'B', panel_fe: 'B' };

const answer = (value, status = 200) => Response.json(value, { status });
const error = (message, status = 422) => answer({ detail: message }, status);
const add = (state, text, role = 'assistant') => state.conversation.push({ role, content: text });
const lesson = (id) => curriculum.lessons.find((item) => item.id === id);
const blankField = () => ({ value: '', source_type: 'none', source_url: '', verification: 'unverified', design_status: 'open', note: '' });

export function newSession(owner) {
  const now = Date.now();
  const state = {
    state_version: 0, session_id: crypto.randomUUID().replaceAll('-', '').slice(0, 12), owner_id: owner,
    stage: 'entry', entry_path: '', lesson_idx: 0, lesson_records: [], learning_artifacts: {},
    preparation: { question_type: 'association', cards: {} }, method_learning: {}, analysis: {},
    tutorial: {}, artifact_reviews: {}, project: Object.fromEntries(fields.map((name) => [name, blankField()])),
    project_choice: '', current_case_id: null, case_answers: [], completed_case_ids: [],
    conversation: [], created_at: now / 1000, last_activity: now / 1000, last_question: '',
  };
  add(state, '你好，我是实证学徒。选择起点：完全不会，从八阶段案例学习；有想法但没有数据，先做研究准备；已有数据，先检查并核对分析方案。');
  return state;
}

export function requireSessionVersion(state, body) {
  if (!Number.isInteger(body?.state_version) || body.state_version !== state.state_version) {
    const cause = new Error(Number.isInteger(body?.state_version) ? '练习已在另一操作或标签页更新。当前输入已保留，请同步后核对两个版本。' : '页面版本已更新，请刷新并恢复草稿后再提交。');
    cause.status = 409; cause.state_version = state.state_version; throw cause;
  }
}
export async function touchSession(env,state) {
  const now=Date.now();
  const result=await env.DB.prepare('UPDATE sessions SET last_activity=MAX(last_activity,?) WHERE id=? AND owner=? AND last_activity>?').bind(now,state.session_id,state.owner_id,now-RETENTION).run();
  if(result.meta?.changes)state.last_activity=now/1000;
}
export async function loadOwnedSession(env, owner, id, touch = false) {
  const row = await env.DB.prepare('SELECT body,last_activity,state_version FROM sessions WHERE id=? AND owner=?').bind(id, owner).first();
  if (!row) return null;
  if (row.last_activity + RETENTION <= Date.now()) return 'expired';
  const state = upgradeState(JSON.parse(row.body));
  state.state_version=row.state_version; state.last_activity=row.last_activity/1000;
  Object.defineProperty(state,'_persisted',{value:true,writable:true,enumerable:false,configurable:true});
  if (touch) await touchSession(env, state);
  return state;
}
export async function saveSession(env, state) {
  const now = Date.now(),expected=state.state_version||0,next=expected+1;
  const body=JSON.stringify({...state,state_version:next,last_activity:now/1000});
  let result;
  if(!state._persisted){
    result=await env.DB.prepare('INSERT OR IGNORE INTO sessions(id,owner,body,created_at,last_activity,state_version) VALUES(?,?,?,?,?,?)').bind(state.session_id,state.owner_id,body,Math.round(state.created_at*1000),now,next).run();
  }else{
    result=await env.DB.prepare('UPDATE sessions SET body=?,last_activity=MAX(last_activity,?),state_version=? WHERE id=? AND owner=? AND state_version=? AND last_activity>?').bind(body,now,next,state.session_id,state.owner_id,expected,now-RETENTION).run();
  }
  if(!result.meta?.changes){
    const latest=await env.DB.prepare('SELECT state_version,last_activity FROM sessions WHERE id=? AND owner=?').bind(state.session_id,state.owner_id).first();
    const cause=new Error(latest&&latest.last_activity+RETENTION<=now?'练习已到期，输入保留在本机，请开始新练习。':'保存冲突：另一操作已更新练习。当前输入已保留，请先同步核对。');
    cause.status=latest?latest.last_activity+RETENTION<=now?410:409:404;cause.state_version=latest?.state_version;throw cause;
  }
  state.state_version=next;state.last_activity=now/1000;
  Object.defineProperty(state,'_persisted',{value:true,writable:true,enumerable:false,configurable:true});
}

function position(state) {
  if(!state._course_projection){const context=ensureLearningContext(state);return [context.lesson_id,context.step_idx];}
  const match = /^l(\d+)s(\d+)$/.exec(state.last_question);
  return match ? [Number(match[1]), Number(match[2])] : [state.lesson_idx || 1, 0];
}

function lessonUi(state) {
  if(!state._course_projection)return courseView(state);
  if (state.stage !== 'lesson') return null;
  const [id, stepIndex] = position(state);
  const item = lesson(id);
  if (!item) return null;
  const step = item.steps[stepIndex] || (stepIndex === item.steps.length ? { type: 'checkpoint', prompt: '本阶段练习结束。请补写成果卡，再决定是否进入下一阶段。' } : null);
  if (!step) return null;
  return {
    lesson_id: id, title: item.title, banner: curriculum.case_banner || '',
    case_id: item.case_id || 'main', case_label: item.case_label || '', intro: item.intro,
    goal: item.goal || '', duration: item.duration || '', output: item.output || '',
    visual: item.visual || '', guide: item.guide || '', example: item.example || '',
    pitfalls: item.pitfalls || [], worksheet: item.worksheet || null, step_idx: stepIndex,
    total_steps: item.steps.length, step_type: step.type, prompt: step.prompt,
    options: step.options || null, total_lessons: curriculum.lessons.length,
    progress: `第 ${id}/${curriculum.lessons.length} 阶段 · ${item.title}`,
  };
}

export async function sessionPayload(env, state, {syncJobs=false}={}) {
  upgradeState(state);ensureLearningContext(state);
  const rows = await env.DB.prepare('SELECT body FROM jobs WHERE session_id=? AND owner=? ORDER BY created_at DESC LIMIT 30')
    .bind(state.session_id, state.owner_id).all();
  const {syncCloudJob}=await import('./research.js');
  const jobs = await Promise.all(rows.results.map(async (row) => {
    const job = JSON.parse(row.body);
    if(syncJobs)await syncCloudJob(env,job,state);
    return { id: job.id, record_version:job.record_version||1, status: job.status, created: job.created, plan: job.plan, description: job.description,execution_location:job.execution_location||'browser_webr',engine_id:job.engine_id||'browser_webr' };
  }));
  const messages=await practicalMessages(env,state.owner_id,state.session_id);
  return {
    session_id: state.session_id, state_version:state.state_version, analysis_workspace:state.analysis_workspace||null,research_summary:researchSummary(state,messages),learning_context:state.learning_context,course:coursePayload(state), stage: state.stage, entry_path: state.entry_path,
    blueprint: state.project, conversation: state.conversation, case_answers: state.case_answers,
    lesson_records: state.lesson_records, learning_artifacts: state.learning_artifacts,
    preparation: state.preparation, method_learning: state.method_learning,
    research_revision: state.research_revision, variable_dictionary: state.variable_dictionary,
    suitability: suitability(state), tutor_records: state.tutor_records,
    model_capabilities: modelCapabilities(env),
    model_interactions: await modelInteractions(env,state.session_id,state.owner_id),
    practical_messages: messages,
    local_stata_tasks: await localTasks(env,state.owner_id,state.session_id),
    research_drafts: await readDrafts(env,state.session_id),
    expires_at: state.last_activity + 7 * 86400, analysis: state.analysis,
    research_jobs: jobs, analysis_stale: !!state.analysis?.blueprint_snapshot && state.analysis.blueprint_snapshot !== JSON.stringify(state.project), tutorial: state.tutorial,
    artifact_reviews: state.artifact_reviews, lesson_ui: lessonUi(state),
    current_case_id: state.current_case_id, demo_mode: !(env.MODEL_API_KEY && env.MODEL_NAME && env.MODEL_BASE_URL),
    last_question: state.last_question, project_choice: state.project_choice,
    tasks: [], outline: curriculum.lessons.map((item) => ({
      id: item.id, title: item.title, intro: item.intro, goal: item.goal || '',
      duration: item.duration || '', output: item.output || '', visual: item.visual || '',
      guide: item.guide || '', example: item.example || '', pitfalls: item.pitfalls || [],
      worksheet: item.worksheet || null, total_steps: item.steps.length,
    })),
  };
}

async function learningMarkdown(env, state) {
  await sessionPayload(env,state,{syncJobs:true}); // Synchronize durable cloud results before all export formats.
  const lines = ['# 实证学徒 · 学生学习报告', '', '> 课程练习与个人研究分开记录；来源核实状态由学生标记，系统没有自动验证。', '',
    `- 起点：${state.entry_path || '未选择'}`, `- 当前阶段：${state.stage}`, `- 最近活动：${new Date(state.last_activity * 1000).toISOString()}`, '',
    '## 八阶段课程作答'];
  for (const record of state.lesson_records) {
    lines.push(`### ${record.stage}. ${record.title}`);
    for (const step of record.steps) {
      lines.push(`- 第 ${step.step_idx + 1} 题：${step.outcome || '未完成'}；尝试 ${step.attempts} 次；首次回答：${step.first_answer}；最后回答：${step.final_answer}`);
      for (const event of step.history || []) lines.push(`  - ${event.at}：${event.answer}；${event.feedback}`);
    }
  }
  lines.push('', '## 阶段成果草稿（保存不代表人工审核通过）');
  for (const [id, artifact] of Object.entries(state.learning_artifacts)) {
    lines.push(`### 阶段 ${id}`);
    for (const [key, value] of Object.entries(artifact)) lines.push(`- ${key}：${value || '待补充'}`);
  }
  lines.push('', '## 导学位置与对话',`- 当前阶段：${state.learning_context?.lesson_id||1}；题目：${(state.learning_context?.step_idx||0)+1}；显示：${state.learning_context?.view_mode||'directory'}`);
  for(const item of state.learning_context?.conversation||[])lines.push(`- ${item.role}：${item.content}`);
  lines.push('', '## 手算教学');
  for (const [index, record] of Object.entries(state.tutorial.records || {})) {
    lines.push(`- 第 ${Number(index) + 1} 步：作答 ${record.choice}；尝试 ${record.attempts} 次；${record.passed ? '已通过' : '待修正'}。`);
  }
  if (state.tutorial.analysis) lines.push(`- 教学数据的描述性 DID：${state.tutorial.analysis.estimate} 个指标单位；不等于因果证明。`);
  lines.push('', '## 资料准备');
  lines.push(`- 资料版本：${state.research_revision || 0}；实施类型：${state.preparation.adoption_mode || 'unknown'}`);
  for (const [key, card] of Object.entries(state.preparation.cards)) lines.push(`- ${key}：${card.value || '待查找'}；状态：${card.status}；来源：${card.source_title || '未提供'}；链接：${card.source_url || '未提供'}；查阅日期：${card.accessed_on || '未提供'}`);
  lines.push('', '## 个人研究蓝图');
  for (const [key, field] of Object.entries(state.project)) if (field.value) lines.push(`- ${key}：${field.value}；核实状态：${field.verification}；来源：${field.source_url || '未提供'}`);
  lines.push('', '## 方法短课');
  lines.push('', '### 当前变量字典（学生提供，未自动核实）');
  for(const [name,value]of Object.entries(state.variable_dictionary||{}))lines.push(`- ${name}：${value}`);
  for (const [method, answers] of Object.entries(state.method_learning)) for (const [index, item] of answers.entries()) lines.push(`- ${method} 第 ${index + 1} 次：${item.choice}；${item.skipped ? '已跳过，未验证掌握' : item.correct ? '正确' : '待修正'}`);
  lines.push('', '## 成果修订历史');
  for (const item of state.artifact_history || []) lines.push(`- 阶段 ${item.lesson_id} · ${item.at}：${JSON.stringify(item.fields)}`);
  lines.push('', '## 课程辅助问答');
  for (const item of state.tutor_records || []) lines.push(`- 问：${item.question}\n  答：${item.answer}；模式：${item.mode}；提示词：${item.prompt_version}`);
  lines.push('', '## 进阶案例解释与修订');
  for (const item of state.case_answers) lines.push(`- ${item.case_id}／${item.question_id}${item.revision ? ' 修订' : ' 首次或跳过'}：${item.answer}；${item.feedback}`);
  lines.push('', '## 分析任务与解释修订');
  const jobs = await env.DB.prepare('SELECT body FROM jobs WHERE session_id=? AND owner=? ORDER BY created_at').bind(state.session_id, state.owner_id).all();
  for (const row of jobs.results) {
    const job = JSON.parse(row.body);
    lines.push(`### ${job.description.label} · ${job.status}`, `- ${job.execution_location==='cloud_native'?'云端原生 '+(job.software==='stata'?'Stata':'R'):'浏览器 webR'}；输入 SHA-256：${job.input_sha256}；执行资料版本：${job.research_revision ?? '历史未记录'}；导出版本：${job.record_version || 1}`);
    if (job.result) lines.push(`- 实际估计 ${job.result.n_used} 行；${job.result.software_version||job.result.r_version}；包版本 ${JSON.stringify(job.result.package_versions)}；${job.result_origin}`);
    if(!job.reflections.length)lines.push('- 解释练习待完成；执行完成不代表学习完成。');
    for (const [index, item] of job.reflections.entries()) lines.push(`- 第 ${index + 1} 次解释：${item.answer}\n  反馈：${item.feedback}`);
  }
  lines.push('', '## 自动保存草稿（未提交，不作为已完成成果）');
  lines.push('', '## 边分析边学习 · 持久对话');
  for(const message of await practicalMessages(env,state.owner_id,state.session_id))lines.push(`- ${message.role}：${message.content}\n  检索材料：${JSON.stringify(message.retrieval||[])}`);
  lines.push('', '## 本机计算（Stata / StatsPAI） · 本机批准执行，云端未独立复算');
  for(const task of await localTasks(env,state.owner_id,state.session_id)){
    lines.push(`### ${task.id} · ${task.status}`,`- 导出版本 ${task.record_version}；输入哈希 ${task.input_sha256}；代码哈希 ${task.code_sha256||'待批准'}；执行资料版本 ${task.research_revision}`,`- 方案与来源快照：${JSON.stringify(task.evidence_snapshot)}；变量字典：${JSON.stringify(task.dictionary)}`,`- 原始输入及完整日志保存在本机，不包含在网站导出中。`);
    if(task.result)lines.push(`- 实际结果：${JSON.stringify(task.result)}`);
    for(const item of task.reflections||[])lines.push(`- 解释：${item.answer}\n  反馈：${JSON.stringify(item.feedback)}`);
  }
  for(const [key,draft]of Object.entries(await readDrafts(env,state.session_id)))if(Object.keys(draft.value).length&&!draft.value.submitted)lines.push(`- ${key} · 草稿版本 ${draft.version}：${JSON.stringify(draft.value)}`);
  return lines.join('\n') + '\n'+modelEvidenceMarkdown(await modelInteractions(env,state.session_id,state.owner_id),false);
}

function startLesson(state, id) {
  if(!state._course_projection){const projected=learningProjection(state);startLesson(projected,id);commitLearningProjection(state,projected);return;}
  const item = lesson(id);
  state.stage = 'lesson';
  state.lesson_idx = id;
  state.last_question = `l${id}s0`;
  if (!state.lesson_records.some((record) => record.stage === id)) state.lesson_records.push({ stage: id, title: item.title, steps: [] });
  add(state, `${curriculum.case_banner || ''}\n\n### 阶段 ${id}：${item.title}\n\n${item.intro}`);
  add(state, `**${item.steps[0].prompt}**`);
}

function chooseEntry(state, path) {
  if (state.stage !== 'entry') return;
  if (!['zero', 'some', 'idea', 'free', 'prepare', 'data'].includes(path)) throw new Error('入口不存在。');
  state.entry_path = path;
  if (path === 'zero' || path === 'some') {
    startLesson(state, path === 'zero' ? 1 : 3);
  } else if (path === 'idea') {
    state.stage = 'info_gathering';
    state.last_question = 'treatment';
    add(state, '先用自己的话写下研究问题或处理因素。资料来源和核实状态会单独记录。');
  } else {
    state.stage = 'free_chat';
    add(state, path === 'prepare' ? '请先到研究工作区填写准备清单；无需上传数据。' : path === 'data' ? '请到研究工作区上传 CSV/TSV，核对列、单位与方案后再由浏览器 webR 执行。' : '可以直接提问。在线模型尚未接入，当前仅提供已实现的课程与资料卡。');
  }
}

function readNumber(text) {
  const match = String(text).replace(/[−－]/g, '-').match(/[+-]?\d+(?:\.\d+)?/g);
  if (!match || match.length !== 1) return null;
  let value = Number(match[0]);
  if (!match[0].startsWith('-') && /下降|减少|降低|回落/.test(text) && !/上升|增加|提高|增长/.test(text)) value = -value;
  return value;
}

function checkFree(step, text) {
  if (step.check?.mode === 'research_question') {
    return /政策|试点|措施|改革|计划|补贴|税|禁令|规定|规划/.test(text)
      && /城市|企业|家庭|个人|地区|省份|行业|高校|学生|居民|试点|非试点/.test(text)
      && /使用量|用能|能耗|能源消耗|排放|消费|收入|就业|效率|成本|价格|产量|质量|数量|水平/.test(text)
      && /是否|能否|会不会|影响|导致|降低|提高|促进|抑制|比较|造成/.test(text);
  }
  const words = step.check?.any_of || [];
  return words.filter((word) => text.includes(word)).length >= (step.check?.min_hits || 1);
}

function lessonAction(state, raw) {
  if(!state._course_projection){
    if(ensureLearningContext(state).status!=='active'||ensureLearningContext(state).view_mode!=='continue')throw new Error('请先从课程目录开始或继续学习。');
    const projected=learningProjection(state);lessonAction(projected,raw);commitLearningProjection(state,projected);return;
  }
  if (state.stage !== 'lesson') throw new Error('当前不在课程阶段。');
  const value = String(raw).trim().slice(0, 2000);
  const [id, index] = position(state);
  const item = lesson(id);
  if (!item) throw new Error('课程不存在。');
  const step = item.steps[index];
  if (!step) {
    if (!['继续下一阶段', '稍后补写，继续'].includes(value)) {
      add(state, '请保存成果草稿后点击继续，也可以选择稍后补写。');
      return;
    }
    add(state, value, 'user');
    if (lesson(id + 1)) startLesson(state, id + 1);
    else {
      state.stage = 'project_choice';
      add(state, '八阶段课程完成。检查学习记录与成果草稿；接下来可继续手算教学、进入 R 实操，或整理自己的研究准备。');
    }
    return;
  }
  add(state, value, 'user');
  let record = state.lesson_records.find((entry) => entry.stage === id);
  if(!record){record={stage:id,title:item.title,steps:[]};state.lesson_records.push(record);}
  let attempt = record.steps.find((entry) => entry.step_idx === index);
  if (!attempt) {
    attempt = { lesson_id: id, step_idx: index, attempts: 0, first_answer: value, final_answer: '', outcome: '' };
    record.steps.push(attempt);
  }
  attempt.attempts++;
  attempt.history ||= [];
  if (!['choice', 'calc'].includes(step.type)) {
    const feedback = `${checkFree(step, value) ? '规则提示：回答覆盖了部分提示词，仍需自行核对。' : '规则提示：请检查问题、对象、变量和解释边界。'}\n参考要点：${step.reveal || '请对照本阶段讲解。'}`;
    attempt.final_answer = value; attempt.outcome = 'self_review';
    attempt.history.push({ answer: value, feedback, at: new Date().toISOString() });
    add(state, feedback);
    state.last_question = `l${id}s${index + 1}`;
    add(state, index + 1 < item.steps.length ? `**${item.steps[index + 1].prompt}**` : '本阶段作答已保存，请写成果；自由回答尚未验证掌握。');
    return;
  }
  const correct = step.type === 'choice' ? value.toUpperCase().slice(0, 1) === step.answer
    : step.type === 'calc' ? (() => { const n = readNumber(value); return n !== null && Math.abs(n - Number(step.answer)) <= Number(step.tolerance ?? .01); })()
      : checkFree(step, value);
  const event={answer:value,feedback:'',at:new Date().toISOString()};attempt.history.push(event);
  if (correct) {
    event.feedback=step.reveal||'客观题正确';
    attempt.final_answer = value;
    attempt.outcome = attempt.attempts === 1 ? 'independent_correct' : 'corrected';
    add(state, `✅ ${step.reveal || '正确。'}`);
  } else if (attempt.attempts < 3) {
    const hints = step.hints || [];
    event.feedback=`提示：${hints[Math.min(attempt.attempts-1,hints.length-1)]||'再想一想。'}`;
    add(state, `这个回答还不完全对。提示：${hints[Math.min(attempt.attempts - 1, hints.length - 1)] || '再想一想。'}\n\n再试一次？`);
    return;
  } else {
    event.feedback=`查看示范：${step.reveal||step.answer}`;
    attempt.final_answer = value;
    attempt.outcome = 'revealed';
    add(state, `看这里的示范答案，理解它比一次答对更重要：\n\n${step.reveal || ''}`);
  }
  state.last_question = `l${id}s${index + 1}`;
  if (index + 1 < item.steps.length) add(state, `**${item.steps[index + 1].prompt}**`);
  else add(state, `阶段 ${id}「${item.title}」练习结束。请打开“写成果”补写阶段卡片，再继续下一阶段。`);
}

export function applyCourseAnswer(state,message){lessonAction(state,message);}

function chatAction(state, message) {
  const text = String(message || '').trim().slice(0, 2000);
  if (!text) throw new Error('请输入具体内容。');
  if (state.stage === 'lesson'&&ensureLearningContext(state).status==='active') return lessonAction(state, text);
  if (state.stage === 'entry') return chooseEntry(state, ({ '1': 'zero', '2': 'prepare', '3': 'data', '4': 'some', '5': 'free' })[text[0]] || 'zero');
  add(state, text, 'user');
  if (state.stage === 'case_practice') return caseAction(state, text);
  if (state.stage === 'project_choice') {
    const choice = text.toUpperCase()[0];
    if (choice === 'C') { state.project_choice = 'record_only'; state.stage = 'summary'; add(state, '入门记录已保存，可在记录区导出。'); }
    else if (choice === 'A' || choice === 'B') { state.project_choice = 'own_idea'; state.stage = 'free_chat'; state.last_question = ''; add(state, '请打开研究准备，按问题类型填写资料卡。'); }
    else add(state, '请选择 A、B 或 C。');
  } else if (state.stage === 'info_gathering') {
    const name = fields.includes(state.last_question) ? state.last_question : 'treatment';
    const field = state.project[name];
    field.value = text;
    field.source_type = 'student';
    field.design_status = 'open';
    field.verification = 'unverified';
    const next = fields.find((key) => !state.project[key].value);
    if (next) { state.last_question = next; add(state, `已记录为待核实的学生表述。请继续填写「${next}」，也可在蓝图区逐项修改。`); }
    else { state.stage = 'blueprint'; state.last_question = ''; add(state, '蓝图草稿已形成。请逐项核对来源与方法条件，再进入实操。'); }
  } else if (state.stage === 'blueprint' && text === '确认') {
    state.stage = 'summary'; add(state, '蓝图已保存；来源核实状态以每项标记为准。');
  } else if (state.stage === 'blueprint' && text === '结束') {
    state.stage = 'summary'; add(state, '研究蓝图已保存。未核实项目会继续标记为待核实。');
  } else if ((state.stage === 'blueprint' || state.stage === 'summary') && text === '继续') {
    startPracticeCase(state);
  } else add(state, '该回答已记录。使用“课程辅助问答”获得基于当前课程的帮助；未配置模型时仍可查看图解和自查要点。');
}

function startPracticeCase(state, requested) {
  const ids = Object.keys(practiceCases).sort();
  const id = requested && practiceCases[requested] ? requested : ids.find((item) => !state.completed_case_ids.includes(item)) || ids[0];
  const item = practiceCases[id];
  if (!item) throw new Error('没有可用的进阶案例。');
  state.stage = 'case_practice'; state.current_case_id = id; state.case_question_index = 0; state.case_awaiting_revision = false;
  add(state, `📊 **案例：${item.title}**\n\n数据来源：${item.data_source}\n\n${item.data_description}\n\n这些图表与数值按案例原文标注，可能是教学示意，不能当作真实估计。`);
  add(state, `**问题：**\n${item.questions[0].prompt}`);
}

function caseAction(state, text) {
  const item = practiceCases[state.current_case_id];
  const question = item?.questions?.[state.case_question_index];
  if (!question) throw new Error('案例进度无效。');
  const points = () => (question.standard_points || []).map((point) => `- ${point}`).join('\n');
  if (/^(看答案|参考答案|公布答案)$/.test(text)) {
    add(state, `参考要点（用于自查，不是对你答案的自动评分）：\n${points()}`);
    return;
  }
  if (/^(下一题|跳过)$/.test(text)) {
    if (!state.case_awaiting_revision) state.case_answers.push({ case_id: state.current_case_id, question_id: question.id,
      answer: '（跳过）', feedback: '学生选择跳过；未进行自动语义评分。', at: Date.now() / 1000 });
    state.case_question_index++;
    state.case_awaiting_revision = false;
    const next = item.questions[state.case_question_index];
    if (next) add(state, `**问题：**\n${next.prompt}`);
    else {
      state.completed_case_ids.push(state.current_case_id);
      state.current_case_id = null; state.stage = 'summary';
      add(state, '本张进阶案例已完成。请导出学习记录，核对自己的首次回答和修订；案例反馈不构成研究结论。');
    }
    return;
  }
  const revision = state.case_awaiting_revision;
  state.case_answers.push({ case_id: state.current_case_id, question_id: question.id, answer: text,
    feedback: '下面列出案例原有参考要点，请自行对照；系统未做自动语义判分。', revision, at: Date.now() / 1000 });
  state.case_awaiting_revision = true;
  add(state, `${revision ? '修订已保存。' : '首次解释已保存。'}请对照案例原有参考要点：\n${points()}\n\n你可以补充或修订回答，也可点击「下一题」。`);
}

export async function handleSessions(request, env, owner, path) {
  if (!env.DB) return error('会话存储未就绪。', 503);
  if (path === '/api/sessions') {
    if (request.method === 'POST') {
      const state = newSession(owner);
      await saveSession(env, state);
      return answer(await sessionPayload(env, state));
    }
    if (request.method === 'GET') {
      const rows = await env.DB.prepare(env.ACCOUNT_ID?'SELECT body FROM sessions WHERE owner IN (SELECT owner FROM account_owners WHERE user_id=?) AND last_activity>? ORDER BY created_at DESC LIMIT 100':'SELECT body FROM sessions WHERE owner=? AND last_activity>? ORDER BY created_at DESC LIMIT 100')
        .bind(env.ACCOUNT_ID||owner, Date.now() - RETENTION).all();
      return answer({ sessions: rows.results.map(({ body }) => {
        const state = JSON.parse(body);
        return { session_id: state.session_id, created_at: state.created_at, entry_path: state.entry_path,
          stage: state.stage, lesson_idx: state.lesson_idx, lesson_count: state.lesson_records.length,
          case_answer_count: state.case_answers.length, case_completed_count: state.completed_case_ids.length,
          blueprint_filled: Object.values(state.project).filter((field) => field.value).length,
          message_count: state.conversation.length };
      }) });
    }
    return error('方法不支持。', 405);
  }
  const match = /^\/api\/sessions\/([a-z0-9]{12})(?:\/(.*))?$/.exec(path);
  if (!match) return null;
  const id = match[1], tail = match[2] || '';
  const state = await loadOwnedSession(env, owner, id);
  if (state === 'expired') return error('会话已到期，请开始新练习。', 410);
  if (!state) return error('会话不存在或不属于当前浏览器。', 404);
  try {
    if(tail==='course'&&request.method==='GET'){await touchSession(env,state);return answer({...coursePayload(state),session_id:id,state_version:state.state_version});}
    if(tail==='course/open'&&request.method==='POST'){const body=await request.json();requireSessionVersion(state,body);openCourse(state,body);await saveSession(env,state);return answer(await sessionPayload(env,state));}
    if(tail==='model-evidence/json'&&request.method==='GET')return answer({session_id:id,records:await modelInteractions(env,id,owner),exported_at:new Date().toISOString(),warning:'实际接口响应不代表结论或来源已认证；仅包含最近 200 条。'});
    if(tail==='model-evidence/md'&&request.method==='GET')return new Response('# 实证学徒 · Agent 交互证据\n\n'+modelEvidenceMarkdown(await modelInteractions(env,id,owner)),{headers:{'Content-Type':'text/markdown; charset=utf-8','Content-Disposition':'attachment; filename="agent-evidence.md"'}});
    if(tail==='drafts'||tail.startsWith('drafts/')){
      const response=await draftEndpoint(request,env,state,tail);
      if(response){if(response.ok){await touchSession(env,state);}return response;}
      return error('草稿路径或方法无效。',405);
    }
    if (!tail && request.method === 'GET') { await touchSession(env, state); return answer(await sessionPayload(env, state,{syncJobs:new URL(request.url).searchParams.get('include')==='reports'})); }
    if (!tail && request.method === 'DELETE') {
      const localRunning=await env.DB.prepare("SELECT id FROM local_stata_tasks WHERE session_id=? AND owner=? AND status IN ('running','cancel_requested') LIMIT 1").bind(id,owner).first();
      if(localRunning)return error('本机 Stata 任务仍在执行或取消待确认，请先在本机停止并同步状态。',409);
      try {await deleteSessionNodes(env,state);}catch(e){return error('云端删除尚未完成，请稍后重试：'+e.message,503);}
      const running = await env.DB.prepare("SELECT id FROM jobs WHERE session_id=? AND owner=? AND status='running' AND lease_until>=? LIMIT 1").bind(id, owner, Date.now()).first();
      if (running) return error('分析正在运行，请先中断。', 409);
      const jobs = await env.DB.prepare('SELECT id,input_key FROM jobs WHERE session_id=? AND owner=?').bind(id, owner).all();
      for (const job of jobs.results) await env.FILES.delete([job.input_key,job.input_key+'.node.json']);
      await env.DB.prepare('DELETE FROM jobs WHERE session_id=? AND owner=?').bind(id, owner).run();
      await env.DB.prepare('DELETE FROM sessions WHERE id=? AND owner=?').bind(id, owner).run();
      return answer({ ok: true });
    }
    if (tail === 'learning-report/md' && request.method === 'GET') {
      return new Response(await learningMarkdown(env, state), { headers: { 'Content-Type': 'text/markdown; charset=utf-8', 'Content-Disposition': 'attachment; filename="learning-report.md"' } });
    }
    if (tail === 'learning-report/json' && request.method === 'GET') {
      const payload = await sessionPayload(env, state,{syncJobs:true});
      const jobs = await env.DB.prepare('SELECT body FROM jobs WHERE session_id=? AND owner=? ORDER BY created_at').bind(id, owner).all();
      payload.research_jobs = jobs.results.map(({body}) => { const {owner,nonce,input_key,node_artifacts,...job} = JSON.parse(body); return job; });
      return answer({ ...payload, artifact_history: state.artifact_history, exported_at: new Date().toISOString() });
    }
    if (tail === 'analysis/report' && request.method === 'GET') {
      if (!state.analysis?.report_markdown) return error('请先完成数据审计。', 404);
      const stale = state.analysis.blueprint_snapshot !== JSON.stringify(state.project);
      return new Response((stale ? '> 注意：研究蓝图已修改，本报告为旧设计的历史结果，请重新计算。\n\n' : '') + state.analysis.report_markdown, { headers: { 'Content-Type': 'text/markdown; charset=utf-8', 'Content-Disposition': 'attachment; filename="analysis-report.md"' } });
    }
    const body = ['POST', 'PUT', 'PATCH'].includes(request.method) ? await request.json() : null;
    if(body)requireSessionVersion(state,body);
    const previousEvidence = JSON.stringify(evidenceSnapshot(state));
    if (tail === 'actions' && request.method === 'POST') {
      const action = body?.action;
      if (['prepare', 'research', 'hand', 'save'].includes(action)) {
        state.stage = action === 'save' ? 'summary' : 'free_chat'; state.last_question = '';
        add(state, action === 'save' ? '学习成果已保存，可下载报告。' : action === 'prepare' ? '按问题类型填写研究准备；没有数据也可以开始。' : action === 'hand' ? '进入独立手算教学，数据与课程主案例分别标注。' : '进入 R 实操，先检查数据再核对方案。');
      } else if (action === 'check_suitability') state.suitability = suitability(state);
      else if (action === 'skip_field') { state.last_question = ''; state.stage = 'free_chat'; add(state, '已跳过旧问答字段，可在准备卡记录当前缺口。'); }
      else if (action === 'confirm_field') {
        if (!fields.includes(body.field)) throw new Error('字段不存在。');
        state.project[body.field].design_status = 'confirmed';
      } else throw new Error('操作不存在。');
    }
    else if (tail === 'tutor' && request.method === 'POST') {
      const question = String(body.question || '').trim();
      if (!question || question.length > 2000) throw new Error('问题须为 1 到 2000 字。');
      if (modelCapabilities(env).tutor !== 'unconfigured') await reserveModelCall(env, owner);
      const item = lesson(state.learning_context?.lesson_id || state.lesson_idx || 1), currentCase = practiceCases[state.current_case_id];
      const materials = [{id:'current_lesson', content:item ? {title:item.title,intro:item.intro,guide:item.guide,example:item.example} : {}}];
      materials.push({id:'research_preparation',content:{question_type:state.preparation.question_type,adoption_mode:state.preparation.adoption_mode,question:state.preparation.cards.question?.value||'',sample:state.preparation.cards.sample?.value||'',outcome:state.preparation.cards.outcome?.value||'',predictor:state.preparation.cards.predictor?.value||'',limitations:suitability(state)}});
      if (currentCase) materials.push({id:'current_case',content:{title:currentCase.title,data_description:currentCase.data_description}});
      const result = await modelFeedback('tutor', {question,materials,student_answer:state.lesson_records.at(-1)?.steps.at(-1)?.final_answer || ''}, env,{session_id:id,owner});
      state.tutor_records.push({question,...result,answer_version:state.tutor_records.length+1,lesson_id:state.learning_context?.lesson_id||state.lesson_idx||null,at:new Date().toISOString()});
    }
    else if (tail === 'variable-dictionary' && request.method === 'PUT') {
      if (!body.dictionary || Array.isArray(body.dictionary) || Object.keys(body.dictionary).length > 60) throw new Error('变量字典无效。');
      state.variable_dictionary = Object.fromEntries(Object.entries(body.dictionary).map(([key,value]) => [key.slice(0,100),String(value).slice(0,300)]));
    }
    else if (tail === 'preparation/design' && request.method === 'PUT') {
      if (!['unknown','single_batch','staggered'].includes(body.adoption_mode)) throw new Error('实施类型无效。');
      state.preparation.adoption_mode = body.adoption_mode;
      state.preparation.sample_batch_note = String(body.sample_batch_note || '').slice(0,500);
    }
    else if (tail === 'entry' && request.method === 'POST') chooseEntry(state, body?.path);
    else if (tail === 'lesson_action' && request.method === 'POST') lessonAction(state, body?.message);
    else if (tail === 'chat' && request.method === 'POST') chatAction(state, body?.message);
    else if (tail === 'cases/start' && request.method === 'POST') startPracticeCase(state, body?.case_id);
    else if (tail === 'analysis/run' && request.method === 'POST') {
      const batches = state.project.policy_batches.value;
      if (/分批/.test(batches) && !/没有分批|不是分批|非分批/.test(batches)) throw new Error('蓝图记录了分批实施：当前两期 DID 工具不适用，请先核实设计。');
      state.analysis = await analyzeTwoPeriod(body);
      state.analysis.blueprint_snapshot = JSON.stringify(state.project);
      state.analysis.report_markdown += '\n## 研究背景与证据（学生提供，未自动核实）\n' +
        Object.entries(state.analysis.context).map(([key, value]) => `- ${key}：${value || '尚未提供'}`).join('\n') +
        '\n\n## 研究蓝图快照\n' + Object.entries(state.project).map(([key, field]) => `- ${key}：${field.value || '尚未填写'}；核实状态：${field.verification}`).join('\n') + '\n';
    }
    else if (tail === 'preparation/type' && request.method === 'PUT') {
      if (!['association', 'policy_evaluation'].includes(body?.question_type)) throw new Error('问题类型无效。');
      state.preparation.question_type = body.question_type;
    } else if (/^preparation\/cards\/[a-z_]+$/.test(tail) && request.method === 'PUT') {
      const key = tail.split('/').pop();
      const visible = state.preparation.question_type === 'policy_evaluation' ? [...commonCards, ...policyCards] : commonCards;
      if (!visible.includes(key)) throw new Error('当前问题类型不需要这张资料卡。');
      const card = Object.fromEntries(['value', 'source_title', 'source_url', 'accessed_on', 'note'].map((name) => [name, String(body?.[name] || '').trim()]));
      if (card.value.length > 1500 || card.source_title.length > 300 || card.source_url.length > 500 || card.note.length > 500) throw new Error('资料卡字段超出长度限制。');
      if (card.source_url && !/^https?:\/\//.test(card.source_url)) throw new Error('来源链接须为 http 或 https。');
      if (body?.verify && (!card.value || !(card.source_title || card.source_url))) throw new Error('已核对需要内容与可回查来源。');
      card.status = body?.verify ? 'verified' : card.value ? 'filled' : 'to_find';
      state.preparation.cards[key] = card;
      refreshUnderstandingFromPreparation(state,key);
    } else if (/^method-learning\/(ols|panel_fe)$/.test(tail) && request.method === 'POST') {
      const method = tail.split('/').pop(), choice = String(body?.choice || '');
      if (!/^[ABC]$/.test(choice) && choice !== 'skip') throw new Error('请选 A、B 或 C。');
      (state.method_learning[method] ||= []).push({ choice, skipped:choice==='skip', correct: choice === methodAnswers[method], at: Date.now() / 1000 });
    } else if (/^fields\/[a-z_]+$/.test(tail) && request.method === 'PATCH') {
      const name = tail.split('/')[1];
      if (!fields.includes(name)) return error('字段不存在。', 404);
      const field = state.project[name];
      field.value = String(body?.value || '').trim().slice(0, 2000);
      field.source_type = field.value ? 'student' : 'none'; field.source_url = ''; field.verification = 'unverified';
      field.design_status = 'open'; field.note = '手动修改，尚待讨论与核实';
      state.stage = 'info_gathering'; state.last_question = name;
      add(state, `修改 ${name}：${field.value || '清空'}`, 'user');
      add(state, '已记录为待核实的学生表述。');
    } else if (/^fields\/[a-z_]+\/verify$/.test(tail) && request.method === 'PUT') {
      const name = tail.split('/')[1];
      if (!fields.includes(name)) return error('字段不存在。', 404);
      const field = state.project[name];
      if (!field.value) throw new Error('请先填写内容。');
      field.verification = 'verified'; field.source_type = 'student'; field.source_url = String(body?.source_url || '').trim().slice(0, 500);
      field.note = '学生自行标记已核实；系统未自动验证来源真实性';
      add(state, `${name} 已由你标记为来源已核实；系统未自动验证。`);
    } else if (/^artifacts\/\d+$/.test(tail) && request.method === 'PUT') {
      const lid = Number(tail.split('/')[1]), item = lesson(lid);
      if (!item) return error('课程不存在。', 404);
      const allowed = new Set((item.worksheet?.fields || []).map((field) => field.key));
      const values = body?.fields || {};
      if (Object.keys(values).length > 8 || Object.keys(values).some((key) => !allowed.has(key) || String(values[key]).length > 1500)) throw new Error('成果字段与课程不匹配。');
      if (Object.values(values).some(Boolean)) state.learning_artifacts[lid] = values;
      else delete state.learning_artifacts[lid];
      state.artifact_history.push({lesson_id:lid,fields:values,at:new Date().toISOString()});
    } else if (tail === 'tasks' && request.method === 'GET') return answer({ tasks: [] });
    else return null;
    if (JSON.stringify(evidenceSnapshot(state)) !== previousEvidence) state.research_revision++;
    await saveSession(env, state);
    return answer(await sessionPayload(env, state));
  } catch (cause) { return answer({detail:cause?.message||'请求无法处理。',...(cause.state_version!==undefined?{state_version:cause.state_version}:{})},cause.status||422); }
}
