"use strict";
const $ = id => document.getElementById(id);
const LABELS = {treatment:"政策 / 干预", outcome:"结果变量", time_range:"样本与政策时间", sample:"研究对象", policy_batches:"政策批次", comparison:"比较对象", policy_doc:"官方文件", data_status:"数据可得性", alternatives:"其他解释", hypothesis:"研究假设"};
const STAGES = {entry:["开始学习","选择你的起点"], lesson:["入门课程","当前练习"], project_choice:["入门已完成","下一步，由你选择"], info_gathering:["我的研究","逐步构建研究蓝图"], blueprint:["我的研究","检查研究设计"], case_practice:["进阶练习","解读案例与证据"], summary:["本次总结","把收获带走"]};
let sessionId = storageGet("ea_session_id"), latestState = null, busy = false, showHistory = false;
let activeTab = "blueprint", expired = false, needsSync = false, toastTimer, chartKey = null, followBottom = true, answerJustSent = false;
let suppressNextScroll = false, autoScrolling = false, enterTop = false;
const chartCache = new Map();

function storageGet(key) { try { return localStorage.getItem(window.EA_ACCOUNT?`ea_account:${window.EA_ACCOUNT.id}:${key}`:key); } catch { return null; } }
function storageSet(key, value) { try { localStorage.setItem(window.EA_ACCOUNT?`ea_account:${window.EA_ACCOUNT.id}:${key}`:key, value); } catch { /* Private browsing can disable storage. */ } }
function storageRemove(key) {try{localStorage.removeItem(window.EA_ACCOUNT?`ea_account:${window.EA_ACCOUNT.id}:${key}`:key);}catch{}}
function el(tag, cls, text) { const n = document.createElement(tag); if (cls) n.className = cls; if(tag === "button") n.classList.add("btn"); if (text != null) n.textContent = text; return n; }
function icon(name) { const n = el("i"); n.dataset.lucide = name; return n; }
function icons() { window.lucide?.createIcons(); }
function button(text, cls, action) { const b = el("button", cls, text); b.type = "button"; b.onclick = action; return b; }
function safeURL(raw) { try { const u = new URL(raw); return ["https:","http:"].includes(u.protocol) ? u.href : null; } catch { return null; } }

// Markdown is parsed by marked, then rebuilt with an explicit safe DOM allowlist.
// No untrusted attributes, images, inline styles, or HTML event handlers survive.
function markdown(target, text) {
  target.replaceChildren();
  if (!window.marked) { target.textContent = text; return; }
  const template = document.createElement("template");
  template.innerHTML = marked.parse(String(text || ""), {breaks:true, gfm:true});
  const allowed = new Set(["P","BR","STRONG","EM","DEL","UL","OL","LI","H1","H2","H3","H4","H5","H6","BLOCKQUOTE","CODE","PRE","TABLE","THEAD","TBODY","TR","TH","TD","A","HR","DETAILS","SUMMARY"]);
  function clean(node) {
    if (node.nodeType === Node.TEXT_NODE) return document.createTextNode(node.textContent);
    if (node.nodeType !== Node.ELEMENT_NODE) return document.createTextNode("");
    if (!allowed.has(node.tagName)) return document.createTextNode(node.textContent);
    const out = document.createElement(node.tagName.toLowerCase());
    if (node.tagName === "A") { const url = safeURL(node.getAttribute("href")); if (url) { out.href = url; out.target = "_blank"; out.rel = "noopener noreferrer"; } }
    for (const child of node.childNodes) out.append(clean(child));
    if (node.tagName === "TABLE") { const wrap = el("div", "table-scroll"); wrap.append(out); return wrap; }
    return out;
  }
  for (const child of template.content.childNodes) target.append(clean(child));
}

const eaRequestMetrics=[];window.eaRequestMetrics=eaRequestMetrics;
let eaNavigationEpoch=0;
async function api(path, {method='GET', body, timeoutMs} = {}) {
  const writing=!['GET','HEAD'].includes(method), sid=(/^\/api\/sessions\/([a-z0-9]{12})/.exec(path)||[])[1]||body?.session_id;
  const captured=latestState?.session_id===sid?latestState:null;
  if(body&&captured&&!Object.hasOwn(body,'state_version'))body={...body,state_version:captured.state_version};
  const deadline=timeoutMs||(/\/auth\/|\/(?:chat|candidate|tutor|reflection)(?:$|\/)/.test(path)?30000:writing?20000:15000);
  let response;const started=performance.now();
  try {response=await fetch(path,{method,headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(deadline)});}
  catch {
    const e=new Error(writing?'提交未确认，输入已保留；请核对最新记录后再决定是否重试。':'读取超时或连接中断，当前页面与输入已保留。');e.uncertain=writing;e.status=0;
    if(writing&&sid){try{const r=await fetch('/api/sessions/'+sid,{signal:AbortSignal.timeout(15000)});if(r.ok)e.saved_snapshot=await r.json();}catch{}}
    throw e;
  }finally{eaRequestMetrics.push({route:path.split('?')[0].replace(/[a-z0-9]{12,}/g,':id'),method,duration_ms:Math.round(performance.now()-started),status:response?.status||0});if(eaRequestMetrics.length>200)eaRequestMetrics.shift();}
  if(response.status===401){window.eaPreserveInputs?.();location.assign('/login?return_to='+encodeURIComponent(location.pathname));const e=Error('登录已过期，草稿保留在此账号的浏览器缓存中。');e.status=401;throw e;}
  const value=await response.json().catch(()=>({}));
  if(!response.ok){
    const labels={404:'记录不存在或不可读取，请选择合法的练习。',409:'记录已更新，当前输入已保留，请同步并核对双方版本。',410:'练习已到期；请先导出可保留的输入，再开始新练习。'};
    const e=new Error(value.detail||labels[response.status]||'请求未完成，输入已保留。');e.status=response.status;e.uncertain=response.status>=500||response.status===409;e.server_version=value.state_version;throw e;
  }
  if(Number.isInteger(value.state_version)&&latestState&&sid&&latestState.session_id===sid)latestState.state_version=Math.max(latestState.state_version||0,value.state_version);
  return value;
}
window.eaRefreshRecords=async function(){
  if(!sessionId)return false;const id=sessionId,account=window.EA_ACCOUNT?.id;
  try{await window.eaFlushAllDrafts?.();const data=await api('/api/sessions/'+id+'?include=reports');if(id!==sessionId||account!==window.EA_ACCOUNT?.id)return false;
    latestState={...latestState,...data};renderRecords(data);window.eaRenderModelEvidence?.(data.model_interactions);window.eaReportOverview?.(data);return true;
  }catch(e){showError(e);return false;}
};
window.eaPreserveInputs=function(){
  if(!sessionId)return;storageSet('ea_unsent:'+sessionId,JSON.stringify({course:$('userInput')?.value||'',at:Date.now()}));
  window.eaCaptureDraft?.();
};

function showError(error) {
  expired = error.status === 410;
  needsSync = Boolean(error.uncertain);
  $("errorText").textContent = error.message;
  $("recoverBtn").textContent = expired ? "开始新练习" : "重新连接";
  $("errorBar").hidden = false;
}

function updateControls() {
  document.querySelectorAll(".entry-card,.choice-btn,.calc-wrap button,#quickActions button,.edit-field,#dialogActions button,.artifact-save,.tutorial-answer").forEach(b => b.disabled = busy || expired || needsSync);
  document.querySelectorAll(".workbook textarea").forEach(n=>n.disabled=busy);
  $("sendBtn").disabled = busy || expired || needsSync || !$("userInput").value.trim();
  $("newSessionBtn").disabled = busy;
  // 输入框始终可输入，仅在 busy 时禁用发送按钮，避免因异步时序卡住导致无法输入
  $("userInput").disabled = false;
  $("exportBtn").disabled = !latestState;
  $("exportRecordBtn").disabled = !latestState;
  document.querySelectorAll('.course-card button').forEach(n=>n.disabled=busy);if($('eaOperationStatus'))$('eaOperationStatus').textContent=busy?'正在处理当前操作…':'';
  $('waiting').hidden = !busy;
  $("learningScroll").setAttribute("aria-busy", String(busy));
}

async function mutate(endpoint, body, {method="POST", clearInput=false, render=true} = {}) {
  if (busy || expired || needsSync || !sessionId) {toast(busy?'上一项操作仍在处理中，请稍候。':expired?'练习已到期，请开始新练习。':'请先重新连接并核对最新状态。');return false;}
  const submittedSession=sessionId,account=window.EA_ACCOUNT?.id,submittedInput=$('userInput').value;
  busy = true; updateControls(); $('errorBar').hidden = true;
  try {
    const data = await api(`/api/sessions/${sessionId}/${endpoint}`, {method, body});
    if(sessionId!==submittedSession||account!==window.EA_ACCOUNT?.id)return false;
    showHistory = false;
    followBottom = true;
    answerJustSent = endpoint === "chat" || endpoint === "lesson_action";
    enterTop = endpoint === "entry";
    if (clearInput&&$('userInput').value===submittedInput) { $('userInput').value = ''; storageRemove('ea_unsent:'+sessionId);updateCount(); }
    if(render)renderState(data);else latestState={...latestState,learning_context:data.learning_context,course:data.course,state_version:data.state_version};
    return true;
  } catch (error) { showError(error); return false; }
  finally { busy = false; updateControls(); }
}

async function connect() {
  if (busy) {toast('正在同步练习，请稍候。');return;}
  const epoch=++eaNavigationEpoch,id=sessionId;busy = true; updateControls();
  try {
    const data=id?await api('/api/sessions/'+id):await api('/api/sessions',{method:'POST'});
    if(epoch!==eaNavigationEpoch||id&&id!==sessionId)return;renderState(data);
    try{const draft=JSON.parse(storageGet('ea_unsent:'+sessionId)||'null');if(draft?.course&&!$('userInput').value){$('userInput').value=draft.course;updateCount();}}catch{}
    expired = false; needsSync = false; $("errorBar").hidden = true;
  } catch (error) { showError(error); }
  finally { busy = false; updateControls(); }
}

async function newSession() {
  if(busy){toast('上一项操作仍在处理中，请稍候。');return;}
  if(window.eaBeforeLeave&&!await window.eaBeforeLeave())return;
  window.eaPreserveInputs?.();if(window.eaFlushAllDrafts&&!await window.eaFlushAllDrafts()){toast('草稿尚未保存，请处理保存错误后再切换练习。');return;}
  ++eaNavigationEpoch;
  busy = true; updateControls();
  try {
    const data = await api("/api/sessions", {method:"POST"});
    expired = false; needsSync = false; showHistory = false; chartKey = null; followBottom = true;
    clearTimeout(toastTimer); $("toast").hidden = true;
    $("userInput").value = ""; updateCount();
    $("errorBar").hidden = true; $("appDialog").close();
    setView(false); selectTab("blueprint"); renderState(data);
  } catch (error) { showError(error); }
  finally { busy = false; updateControls(); }
}

const eaRenderMetrics=[];window.eaRenderMetrics=eaRenderMetrics;
function renderState(data) {
  const renderStarted=performance.now();
  const previous = latestState;
  latestState = data; sessionId = data.session_id;if(typeof eaHydrateDrafts==='function')eaHydrateDrafts(data); storageSet("ea_session_id", sessionId);
  $("modeLabel").textContent = data.demo_mode ? "课程与自查可用" : "模型已配置 · 待实测";
  $("demoHint").textContent = "客观题按答案核对；自由回答的规则提示或 AI 建议不代表掌握认证。";
  renderOutline(data); renderBlueprint(data); renderRecords(data); renderMain(data); renderAnalysis(data); if(typeof renderTutorial==='function')renderTutorial(data); if(typeof renderResearch==='function')renderResearch(data); if(typeof renderPreparation==='function')renderPreparation(data);
  const caseId = data.stage === "case_practice" ? data.current_case_id : null;
  if (caseId) { loadCase(caseId); if (previous?.stage !== data.stage || previous?.lesson_ui?.lesson_id !== data.lesson_ui?.lesson_id) selectTab("materials"); }
  else { chartKey = null; $("caseCard").hidden = true; }
  if (data.stage === "summary" && previous?.stage !== "summary") selectTab("records");
  icons(); updateControls();
  if(typeof eaRestoreTask==='function')eaRestoreTask(data,previous);eaRenderMetrics.push({duration_ms:Math.round((performance.now()-renderStarted)*100)/100,node_count:document.querySelectorAll('*').length});if(eaRenderMetrics.length>100)eaRenderMetrics.shift();
}

function renderOutline(data) {
  const out = $("courseOutline"); out.replaceChildren();
  let completed = 0;
  for (const item of data.outline || []) {
    const record = data.lesson_records.find(r => r.stage === item.id);
    const done = (record?.steps.filter(s => s.outcome).length || 0) === item.total_steps;
    if (done) completed++;
    const current = data.lesson_ui?.lesson_id === item.id;
    const b = button("", `course-step${current ? " current" : ""}${done ? " done" : ""}`, () => showLessonReview(item));
    b.title = `查看${item.title}的内容与记录`;
    if (current) b.setAttribute("aria-current", "step");
    const number = el("span", "step-number", done ? "" : String(item.id).padStart(2,"0"));
    if (done) number.append(icon("check"));
    b.append(number, el("span", "", item.title));
    const li = el("li"); li.append(b); out.append(li);
  }
  $("railCount").textContent = `${completed} / ${(data.outline || []).length} 阶段已完成`;
  $("railProgress").value = completed;
  $("railProgress").max = (data.outline || []).length || 12;
  $("railRange").textContent = `01—${String((data.outline || []).length).padStart(2,"0")}`;
}

function renderMain(data) {
  const [eyebrow, title] = STAGES[data.stage] || STAGES.entry;
  $("stageEyebrow").textContent = eyebrow;
  $("stageTitle").textContent = showHistory ? "本次对话记录" : data.lesson_ui?.title || title;
  $("historyBtn").setAttribute("aria-pressed", String(showHistory));
  $("historyBtn").title = showHistory ? "返回当前任务" : "查看对话记录";
  $("historyBtn").setAttribute("aria-label", $("historyBtn").title);
  $("entryScreen").hidden = data.stage !== "entry" || showHistory;
  $("lessonFocus").hidden = data.stage !== "lesson" || showHistory;
  $("messages").hidden = !showHistory && ["entry","lesson"].includes(data.stage);
  const ui = data.lesson_ui;
  if (ui) renderLesson(ui, data);
  const scrollEl = $("learningScroll");
  const savedTop = scrollEl.scrollTop;
  const messages = $("messages"); messages.replaceChildren();
  const conversation = data.conversation;
  for (const msg of conversation) {
    const box = el("article", `msg ${msg.role === "user" ? "user" : "assistant"}`);
    if (msg.role === "user") box.textContent = msg.content;
    else { box.append(el("div", "msg-label", "实证学徒 · 学习反馈")); const body = el("div","prose"); markdown(body,msg.content); box.append(body); }
    messages.append(box);
  }
  $("composerWrap").hidden = showHistory || ["entry","project_choice","summary"].includes(data.stage) || (ui && ["choice","calc","checkpoint"].includes(ui.step_type));
  $("userInput").placeholder = ui ? "写下你的判断和理由…" : "写下你的研究想法，或补充当前问题…";
  renderActions(data);
  if (ui) Teaching.syncPane();
  if (showHistory) { followBottom = true; scrollEl.scrollTop = 0; }
  else if (enterTop) {
    scrollEl.scrollTop = 0;
    if (distanceFromBottom(scrollEl) > 90) followBottom = false;
  }
  else if (answerJustSent && !messages.hidden) { scrollToLastUserAnswer(scrollEl); }
  else if (followBottom) scrollEl.scrollTop = scrollEl.scrollHeight;
  else scrollEl.scrollTop = savedTop;
  enterTop = false;
  answerJustSent = false;
  updateJumpBtn();
}

// 把刚提交的用户回答定位到滚动区最上方，解答在其下方完整展开，避免被底部视口截断
function scrollToLastUserAnswer(box) {
  const userMsgs = box.querySelectorAll("#messages .msg.user");
  const last = userMsgs[userMsgs.length - 1];
  if (!last) { box.scrollTop = box.scrollHeight; return; }
  const paddingTop = parseFloat(getComputedStyle(box).paddingTop) || 0;
  const delta = last.getBoundingClientRect().top - box.getBoundingClientRect().top - paddingTop - 8;
  const target = Math.max(0, box.scrollTop + delta);
  if (target !== box.scrollTop) suppressNextScroll = true;
  box.scrollTop = target;
}

function lessonMastery(record) {
  const steps = record?.steps || [];
  if (!steps.length || steps.some(s => !s.outcome)) return null;
  if (steps.some(s => s.outcome === "revealed")) return { key: "review", label: "需复习", note: "有题目查看过示范" };
  if (steps.some(s => s.outcome === "corrected")) return { key: "suggest", label: "建议复习", note: "有题目经提示后修正" };
  if (steps.every(s => s.outcome === "independent_correct")) return { key: "mastered", label: "已掌握", note: "全部独立答对" };
  return { key: "done", label: "已完成", note: "含自评题" };
}

function renderLesson(ui, data) {
  Teaching.render(ui, data);
  $("lessonProgress").textContent = `阶段 ${ui.lesson_id} / ${ui.total_lessons} · ` + (ui.step_type === "checkpoint" ? "整理阶段成果" : `第 ${ui.step_idx + 1} / ${ui.total_steps} 题`);
  markdown($("lessonIntro"), ui.intro); markdown($("lessonPrompt"),ui.prompt);
  const conv = data.conversation, lastUser = conv.map(m => m.role).lastIndexOf("user");
  const feedback = conv.slice(lastUser+1).filter(m => m.role === "assistant" && !m.content.includes("### 阶段") && m.content !== `**${ui.prompt}**`);
  const isAnswer = lastUser >= 0 && !["我完全没接触过实证研究","我学过一些方法，但没有研究题目"].includes(conv[lastUser].content);
  $("lessonFeedback").hidden = !isAnswer || !feedback.length;
  const feedbackText = feedback.map(m => m.content).join("\n\n");
  if (conv.at(-1)?.content !== `**${ui.prompt}**`) {
    markdown($("lessonFeedback"), feedbackText);
  } else {
    const details = el("details"), body = el("div", "prose");
    details.append(el("summary", "", "查看上一题反馈"));
    markdown(body, feedbackText); details.append(body);
    $("lessonFeedback").replaceChildren(details);
  }
  const box = $("lessonBox"); box.replaceChildren();
  if (ui.step_type === "checkpoint") {
    const saved=data.learning_artifacts?.[String(ui.lesson_id)], wrap=el("div","quick-actions");
    const record=data.lesson_records?.find(r=>r.stage===ui.lesson_id);
    const counts=[["independent_correct","独立答对"],["corrected","提示后修正"],["revealed","查看示范"],["self_review","自评"]]
      .map(([key,label])=>[label,record?.steps?.filter(s=>s.outcome===key).length||0]).filter(([,n])=>n>0).map(([label,n])=>`${label} ${n}`).join(" · ")||"尚无作答记录";
    const next=data.outline?.find(x=>x.id===ui.lesson_id+1);
    const summary=el("div","stage-summary");
    summary.append(el("strong","","本阶段小结"),el("p","",`作答：${counts}`),el("p","",`${saved?"成果卡已保存":"成果卡未保存"} · ${next?`下一阶段：${next.title}`:"全部阶段已完成，可导出记录"}`));
    wrap.append(button("补写本阶段成果","btn-primary",()=>Teaching.selectPane("workbook")));
    const message = saved ? "继续下一阶段" : "稍后补写，继续";
    wrap.append(button(ui.lesson_id === ui.total_lessons ? (saved ? "完成路线，查看总结" : "稍后补写，查看总结") : message,"btn-secondary",()=>mutate("lesson_action",{message})));
    box.append(summary,wrap);
  } else if (ui.step_type === "choice") {
    const wrap = el("div","choice-wrap");
    for (const opt of ui.options || []) {
      const b = button("","choice-btn",() => mutate("lesson_action",{message:opt.key}));
      b.append(el("span","choice-key",opt.key),el("span","",opt.text)); wrap.append(b);
    }
    box.append(wrap);
  } else if (ui.step_type === "calc") {
    const wrap = el("form","calc-wrap"), input = el("input","calc-input");
    input.id = "calcInput"; input.type = "text"; input.inputMode = "text"; input.maxLength = 100;
    input.placeholder = "只填最终数值，可带负号"; input.setAttribute("aria-label","计算结果");
    const submit = button("提交计算","btn-primary",null); submit.type = "submit";
    wrap.onsubmit = async e => { e.preventDefault(); if (input.value.trim()) await mutate("lesson_action",{message:input.value.trim()}); else input.focus(); };
    wrap.append(input,submit); box.append(wrap);
  }
}

function renderActions(data) {
  const box = $("quickActions"); box.replaceChildren();
  if (showHistory) { box.append(button("返回当前任务","btn-secondary",toggleHistory)); return; }
  const add = (label,value,primary=false) => box.append(button(label,primary ? "btn-primary" : "btn-secondary",() => mutate("chat",{message:value})));
  const action=(label,value,task)=>box.append(button(label,'btn-secondary',async()=>{const ok=await mutate('actions',{action:value});if(ok&&task&&typeof eaSetTask==='function')eaSetTask(task);}));
  if (data.stage === "project_choice") { action('继续手算教学','hand','hand');action('进入 R 实操','research','research');action('整理自己的研究准备','prepare','prepare');action('保存学习成果','save','records'); }
  if (data.stage === "info_gathering") {
    const f = data.blueprint[data.last_question];
    if (f?.value) box.append(button('确认这项表述','btn-primary',()=>mutate('actions',{action:'confirm_field',field:data.last_question})));
    if (data.last_question === "hypothesis") action('暂时跳过假设','skip_field','prepare');
    box.append(button("查看政策查找指南","btn-secondary",() => { selectTab("materials"); if (innerWidth <= 720) setView(true); }));
    action('转到统一准备清单','prepare','prepare');
  }
  if (data.stage === "blueprint") { action('检查适用性','check_suitability','prepare'); add("单独练习案例","继续"); action('保存并查看记录','save','records'); }
  if (data.stage === "case_practice") { add("看参考要点","看答案"); add("跳过或进入下一题","下一题",true); }
  if (data.stage === "summary") { box.append(button("导出学习记录","btn-primary",exportDialog)); if (!data.current_case_id) add("继续进阶案例","继续"); }
}

function renderBlueprint(data) {
  const box = $("blueprintContent"); box.replaceChildren();
  const filled = Object.keys(LABELS).filter(k => data.blueprint[k]?.value);
  $("blueprintCount").textContent = `${filled.length}/10`;
  if (!filled.length) {
    const empty = el("div","empty-state"); empty.append(icon("notebook-pen"),el("h3","","你的研究，从这里生长"),el("p","",["entry","lesson","project_choice"].includes(data.stage) ? "先安心完成练习。模拟政策不会被填入你的个人蓝图。" : "还没有填写研究信息。先在准备清单中明确问题、变量与来源；只有政策评估才需要政策原文和实施时间。")); box.append(empty);
  }
  const editable = ["info_gathering","blueprint","summary"].includes(data.stage) && data.project_choice !== "record_only";
  const keys = filled.length || editable ? Object.keys(LABELS) : ["treatment","outcome","comparison","data_status"];
  for (const key of keys) {
    const f = data.blueprint[key] || {}, item = el("div","bp-item"), head = el("div","bp-header");
    head.append(el("span","",LABELS[key]));
    if (editable) { const edit = button("","icon-btn edit-field",() => editField(key)); edit.title = `编辑${LABELS[key]}`; edit.setAttribute("aria-label",edit.title); edit.append(icon("pencil")); head.append(edit); }
    item.append(head,el("div",`bp-value${f.value ? "" : " muted"}`,f.value || "待补充"));
    if (f.value) {
      const row = el("div","bp-status-row"); row.append(el("span","bp-status",f.design_status === "confirmed" ? "表述已确认" : "表述待讨论"),el("span",`bp-status${f.verification === "verified" ? "" : " unverified"}`, f.verification === "verified" ? "来源已核实" : "事实未核实")); item.append(row);
      if (safeURL(f.source_url)) { const a = el("a","source-link","查看来源"); a.href=safeURL(f.source_url); a.target="_blank"; a.rel="noopener noreferrer"; item.append(a); }
    }
    box.append(item);
  }
}

function renderRecords(data) {
  const box = $("recordContent"); box.replaceChildren();
  const steps = data.lesson_records.flatMap(r => r.steps), stats = el("div","record-stats");
  for (const [key,label] of [["independent_correct","独立答对"],["corrected","提示后修正"],["revealed","查看示范"]]) {
    const cell=el("div"); cell.append(el("strong","",String(steps.filter(s => s.outcome===key).length)),el("span","",label)); stats.append(cell);
  }
  box.append(stats);
  if (!steps.length) box.append(el("p","workspace-note","完成第一道练习后，这里会记录你的学习过程。"));
  for (const r of data.lesson_records) {
    const item = el("div","record-item"); item.append(el("strong","",`${r.stage}. ${r.title}`),el("small","",`${r.steps.filter(s => s.outcome).length} 题已完成 · ${r.steps.reduce((n,s)=>n+s.attempts,0)} 次作答`)); box.append(item);
    const mastery = lessonMastery(r);
    if (mastery && mastery.key !== "done") { const badge=el("p",`badge mastery-${mastery.key}`,mastery.label); badge.title=mastery.note; item.append(badge); }
    const lesson=(data.outline||[]).find(l=>l.id===r.stage);
    if(lesson)item.append(button("回顾图解 / 补写成果","text-btn record-review",()=>showLessonReview(lesson)));
  }
  const artifacts = data.learning_artifacts || {};
  box.append(el("h3","",`成果草稿 ${Object.keys(artifacts).length} / ${data.outline?.length || 12}`));
  box.append(el("p","workspace-note","草稿保存不代表学术审核通过。可从课程回顾中补写，随学习记录一起导出。"));
  for(const [id,fields] of Object.entries(artifacts)){
    const lesson=(data.outline||[]).find(l=>String(l.id)===id), card=el("div","artifact-card");
    card.append(el("strong","",lesson?.worksheet?.title || `阶段 ${id}`),el("p","",`已填写 ${Object.values(fields).filter(v=>v.trim()).length} / ${lesson?.worksheet?.fields?.length || 0} 项 · 待人工复核`));box.append(card);
  }
  if (data.case_answers.length) box.append(el("p","workspace-note",`进阶案例：已记录 ${data.case_answers.length} 次作答。完整回答保存在导出文件中。`));
  $("taskCard").hidden = !data.tasks?.length;
  $("taskContent").replaceChildren();
  for (const t of data.tasks || []) {
    const item=el("div","task-item"), head=el("div","task-head"); head.append(el("strong","",`${t.rank}. ${t.title}`),el("span","",t.priority)); item.append(head,el("p","task-detail",t.detail));
    if (t.why) { const why=el("details"); why.append(el("summary","","为什么现在做"),el("p","",t.why)); item.append(why); }
    $("taskContent").append(item);
  }
}

function selectTab(tab) {
  activeTab=tab;
  if(typeof stopLearningAnimation==='function')stopLearningAnimation();
  document.querySelector('.layout').classList.toggle('tutorial-focus',tab==='tutorial');
  document.querySelector('.layout').classList.toggle('research-focus',tab==='research');
  document.querySelectorAll("[data-tab]").forEach(b => { const on=b.dataset.tab===tab; b.setAttribute("aria-selected",String(on)); b.tabIndex=on ? 0 : -1; $("pane-"+b.dataset.tab).hidden=!on; });
  $("pane-preparation").hidden=tab!=="preparation";
  document.querySelector(`[data-tab="${tab}"]`)?.scrollIntoView({block:"nearest",inline:"nearest"});
}
function setView(work) { if(!work&&['tutorial','research'].includes(activeTab))selectTab('blueprint'); document.querySelector(".layout").classList.toggle("work-view",work); $("workViewBtn").classList.toggle("active",work); $("learnViewBtn").classList.toggle("active",!work); $("workViewBtn").setAttribute("aria-pressed",String(work)); $("learnViewBtn").setAttribute("aria-pressed",String(!work)); }
// 随时收起 / 展开右侧研究工作区（桌面端）；收起时中间面板右缘出现展开按钮
function setWorkspace(open) {
  if(!open&&['tutorial','research'].includes(activeTab))selectTab('blueprint');
  const layout = document.querySelector(".layout");
  layout.classList.toggle("workspace-collapsed", !open);
  $("workspaceCloseBtn").setAttribute("aria-expanded", String(open));
  $("workspaceOpenBtn").setAttribute("aria-expanded", String(open));
  $("workspaceOpenBtn").hidden = open;
  if (!open && innerWidth <= 720) setView(false);
}
function toggleHistory() { if (!latestState) return; showHistory=!showHistory; renderMain(latestState); icons(); updateControls(); }
function distanceFromBottom(box) { return box.scrollHeight - box.scrollTop - box.clientHeight; }
function updateJumpBtn() { $("jumpBottomWrap").hidden = showHistory || followBottom; }
function bindScrollFollow() {
  const box = $("learningScroll");
  box.addEventListener("scroll", () => {
    if (suppressNextScroll) { suppressNextScroll = false; return; }
    const dist = distanceFromBottom(box);
    if (autoScrolling) {
      if (dist < 28) { autoScrolling = false; followBottom = true; }
      updateJumpBtn();
      return;
    }
    if (followBottom && dist > 90) { followBottom = false; updateJumpBtn(); }
    else if (!followBottom && dist < 28) { followBottom = true; updateJumpBtn(); }
  });
}
function updateCount() { const input=$("userInput"); $("charCount").textContent=`${input.value.length} / 2000`; input.style.height="auto"; input.style.height=Math.min(input.scrollHeight,130)+"px"; updateControls(); }
async function sendMessage() { const value=$("userInput").value.trim(); if (value) { const ok=await mutate((latestState?.stage==='lesson'||window.EA_MODULE==='learn'&&latestState.learning_context?.status==='active'&&latestState.learning_context?.view_mode==='continue')?'lesson_action':'chat',{message:value},{clearInput:true}); if (ok && !$("composerWrap").hidden && innerWidth > 720) $("userInput").focus(); } }

function dialog(title, body, actions=[]) {
  $("dialogTitle").textContent=title; $("dialogBody").replaceChildren(body); $("dialogActions").replaceChildren(...actions);
  if (!$("appDialog").open) $("appDialog").showModal(); icons();
}
function showLessonReview(item) {
  const body=Teaching.review(item);
  const record=latestState.lesson_records.find(r=>r.stage===item.id);
  body.append(el("p","workspace-note",record ? `本阶段已完成 ${record.steps.filter(s=>s.outcome).length}/${item.total_steps} 题。此处仅回顾内容，不改变学习进度。` : "本阶段尚未完成。此处仅预览内容，不改变学习进度。"));
  dialog(item.title,body,[button("返回学习","btn-primary",()=>$("appDialog").close())]);
}
function editField(key) {
  const f = latestState.blueprint[key] || {};
  const body=el("div"), label=el("label","",LABELS[key]), input=el("textarea");
  input.id="fieldValue"; input.maxLength=2000; input.value=f.value || ""; label.htmlFor=input.id;
  body.append(label,input,el("p","storage-note","修改后会重新确认表述，并重置来源核实状态。留空可清除此项。"));
  const actions=[button("取消","btn-secondary",()=>$("appDialog").close())];
  if (f.value && f.verification !== "verified") {
    actions.push(button("标记已核实","btn-secondary",async()=>{
      const dlg=$("appDialog"); const url=prompt("已查阅原始来源？请粘贴来源链接（政策原文 / 数据说明等）：", f.source_url || "");
      if (url === null) return;
      if (await mutate(`fields/${key}/verify`,{source_url:url||""},{method:"PUT"})) { toast("已标记为来源已核实"); }
    }));
  }
  actions.push(button("保存修改","btn-primary",async()=>{ if (await mutate(`fields/${key}`,{value:input.value},{method:"PATCH"})) { $("appDialog").close(); toast("已更新，待重新讨论与核实"); } }));
  dialog(`编辑${LABELS[key]}`,body,actions);
  input.focus();
}
function newSessionDialog() {
  if (!latestState) { newSession(); return; }
  dialog("开始新的练习？",el("p","","当前页面会切换到新练习。尚未导出的记录建议先保存；当前输入草稿不会带入新练习。"),[button("取消","btn-secondary",()=>$("appDialog").close()),button("先导出记录","btn-secondary",()=>downloadRecord("md")),button("开始新练习","btn-primary",newSession)]);
}
// ---------- 历史练习记录 ----------

const ENTRY_LABELS = {zero:"零基础八阶段", some:"学过一些方法", idea:"已有研究想法", prepare:"研究准备", data:"已有数据", free:"自由问答"};
const STAGE_LABELS = {entry:"未开始", lesson:"课程学习中", free_chat:"自由问答中", project_choice:"选择下一步", info_gathering:"梳理研究中", blueprint:"蓝图检查中", case_practice:"进阶案例中", summary:"已完成"};

async function pastDialog() {
  const body = el("div","past-list");
  body.append(el("p","muted","正在读取历史练习…"));
  dialog("历史练习记录", body, [button("关闭","btn-secondary",()=>$("appDialog").close())]);
  icons();
  try {
    const data = await api("/api/sessions");
    renderPast(body, data.sessions || []);
  } catch (e) {
    body.replaceChildren(el("p","muted","暂时读不到历史记录：" + e.message));
  }
}

function renderPast(body, sessions) {
  body.replaceChildren();
  if (!sessions.length) {
    body.append(el("p","muted","还没有历史练习。完成一次练习后会自动保存在这里，不导出也不会丢。"));
    return;
  }
  for (const s of sessions) {
    const isCurrent = s.session_id === sessionId;
    const card = el("div","past-card" + (isCurrent ? " current" : ""));
    const head = el("div","past-head");
    const date = new Date(s.created_at * 1000);
    head.append(
      el("span","past-date",date.toLocaleString("zh-CN",{month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit"})),
      el("span","past-tag", ENTRY_LABELS[s.entry_path] || "未选择入口"),
    );
    if (isCurrent) head.append(el("span","past-current-tag","当前练习"));
    const meta = el("div","past-meta");
    meta.append(
      el("span","", STAGE_LABELS[s.stage] || s.stage),
      el("span","", `课程 ${s.lesson_count}`),
      el("span","", `案例 ${s.case_completed_count||0} 完成`),
      el("span","", `蓝图 ${s.blueprint_filled}/10`),
      el("span","", `对话 ${s.message_count}`),
    );
    const actions = el("div","past-actions");
    actions.append(
      button(isCurrent ? "回到当前练习" : "继续这个练习","btn-primary",()=>resumeSession(s.session_id)),
      button("删除","btn-secondary",()=>removePast(s.session_id, body)),
    );
    card.append(head, meta, actions);
    body.append(card);
  }
  icons();
}

async function resumeSession(id) {
  if(busy){toast('正在处理当前操作，请稍候。');return;}
  if(id===sessionId){$('appDialog').close();window.eaNavigateCurrent?.();toast('已在当前练习中');return;}
  if(window.eaBeforeLeave&&!await window.eaBeforeLeave())return;
  window.eaPreserveInputs?.();try{if(window.eaFlushAllDrafts&&!await window.eaFlushAllDrafts()){toast('草稿尚未保存，请先处理保存错误。');return;}}catch(e){showError(e);return;}
  busy=true;updateControls();const epoch=++eaNavigationEpoch;
  try{const data=await api('/api/sessions/'+id);if(epoch!==eaNavigationEpoch)return;
    $('appDialog').close();showHistory=false;chartKey=null;followBottom=true;$('userInput').value='';updateCount();
    expired=false;needsSync=false;renderState(data);toast('已恢复该练习');
  }catch(e){showError(e);}finally{busy=false;updateControls();}
}

async function removePast(id, body) {
  if (id === sessionId) { toast("正在使用的练习不能删除"); return; }
  try {
    await api(`/api/sessions/${id}`, {method:"DELETE"});
    const data = await api("/api/sessions");
    renderPast(body, data.sessions || []);
    toast("已删除该练习");
  } catch (e) { toast("删除失败：" + e.message); }
}

function exportDialog() {
  if (!latestState) return;
  dialog("导出学习记录",
    el("p", "", "包含课程作答、个人蓝图、研究任务与对话。Markdown 和 PDF 都在当前浏览器导出；PDF 使用本机中文字体排版。"),
    [
      button("Markdown 文档", "btn-secondary", () => downloadRecord("md")),
      button("PDF 文档", "btn-primary", () => eaDownloadPdf(`/api/sessions/${sessionId}/learning-report/md`, `实证学徒_学习报告_${sessionId}.pdf`).catch(e=>toast("PDF 导出失败："+e.message))),
    ]);
}
function downloadServer(fmt) {
  if (!sessionId) { toast("当前没有可导出的会话"); return; }
  // 用 fetch 拿 blob 再触发下载，可捕获错误并显示 toast
  fetch(`/api/sessions/${sessionId}/export/${fmt}`)
    .then(async r => {
      if (!r.ok) throw new Error((await r.json()).detail || "导出失败");
      const blob = await r.blob();
      const cd = r.headers.get("Content-Disposition") || "";
      const m = cd.match(/filename="?([^";]+)"?/);
      const name = m ? decodeURIComponent(m[1]) : `实证学徒_学习记录.${fmt}`;
      const url = URL.createObjectURL(blob);
      const a = el("a"); a.href = url; a.download = name; document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast(`已导出 ${fmt.toUpperCase()} 文档`);
    })
    .catch(e => toast("导出失败：" + e.message));
}
function downloadRecord(format) {
  downloadPersistentRecord(format);return;
  const s=latestState;
  const localDrafts={};
  for(const item of s.outline||[]){try{const draft=JSON.parse(storageGet(`ea_draft:${sessionId}:${item.id}`)||"null");if(draft)localDrafts[item.id]=draft;}catch{/* malformed local draft */}}
  const record={version:7,exported_at:new Date().toISOString(),entry_path:s.entry_path,stage:s.stage,tutorial:s.tutorial||{},analysis:s.analysis||{},analysis_stale:s.analysis_stale,lesson_case:{label:"教学练习，模拟与真实来源分别标注",records:s.lesson_records,case_answers:s.case_answers},learning_artifacts:s.learning_artifacts||{},unsaved_local_drafts:localDrafts,project_blueprint:s.blueprint,tasks:s.tasks||[],conversation:s.conversation};
  let content=JSON.stringify(record,null,2);
  if (format === "md") {
    const lines=["# 实证学徒 · 学习记录",`导出时间：${new Date().toLocaleString("zh-CN")}`,"\n## 课程记录（模拟教学案例）"];
    for (const r of s.lesson_records) { lines.push(`\n### ${r.stage}. ${r.title}`); for (const a of r.steps) lines.push(`- 第 ${a.step_idx+1} 题 | 尝试 ${a.attempts} 次 | ${a.outcome || "未完成"}\n  首次回答：${a.first_answer}\n  最后回答：${a.final_answer}`); }
    lines.push("\n## 阶段成果草稿（保存不等于通过学术审核）");
    for (const [heading, artifacts] of [["已保存",s.learning_artifacts||{}],["尚未保存到会话的本机草稿",localDrafts]]){
      lines.push(`\n### ${heading}`);
      for(const [id,fields] of Object.entries(artifacts)){
        const lesson=s.outline?.find(l=>String(l.id)===id);lines.push(`\n#### ${id}. ${lesson?.worksheet?.title || "成果草稿"}`);
        for(const [k,v] of Object.entries(fields))lines.push(`\n**${lesson?.worksheet?.fields.find(f=>f.key===k)?.label || k}**\n${v || "待补充"}`);
      }
    }
    lines.push("\n## 个人研究蓝图（与模拟案例分离）");
    const filled=Object.keys(LABELS).filter(k=>s.blueprint[k]?.value);
    if (!filled.length) lines.push("尚未建立个人研究蓝图。");
    for (const k of filled) { const f=s.blueprint[k]; lines.push(`- ${LABELS[k]}：${f.value}\n  表述：${f.design_status}；核实：${f.verification}${f.source_url ? "；来源："+f.source_url : ""}`); }
    lines.push("\n## 研究任务"); for (const t of s.tasks||[]) lines.push(`- [${t.priority}] ${t.title}：${t.detail}`);
    if (!s.tasks?.length) lines.push("当前没有个人研究任务。");
    lines.push("\n## 完整对话"); for (const m of s.conversation) lines.push(`\n### ${m.role==="user" ? "我的回答" : "实证学徒"}\n${m.content}`);
    content=lines.join("\n");
  }
  const url=URL.createObjectURL(new Blob([content],{type:format==="md" ? "text/markdown;charset=utf-8" : "application/json;charset=utf-8"}));
  const a=el("a"); a.href=url; a.download=`实证学徒_学习记录_${sessionId}.${format}`; document.body.append(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url),1000); toast("学习记录已导出");
}
function toast(text) { clearTimeout(toastTimer); $("toast").textContent=text; $("toast").hidden=false; toastTimer=setTimeout(()=>$("toast").hidden=true,3200); }

async function loadCase(id) {
  const key=`${sessionId}:${id}`;
  if (chartKey===key) return;
  chartKey=key; $("caseCard").hidden=false; $("caseInfo").textContent="正在读取案例…"; $("eventChart").replaceChildren();
  try {
    let data=chartCache.get(id); if (!data) { data=await api(`/api/cases/${id}`); chartCache.set(id,data); }
    if (chartKey!==key) return;
    $("caseInfo").textContent=`${data.title}。${data.data_source}`;
    if (data.event_study) renderChart(data.event_study);
    else $("eventChart").append(el("p","muted","此案例为研究设计反例，没有事件研究系数。"));
  } catch { if (chartKey!==key) return; chartKey=null; $("caseInfo").textContent="案例图表暂时无法加载。"; $("eventChart").append(button("重新加载","btn-secondary",()=>loadCase(id))); }
}

function renderChart(es) {
  const data=es.coefficients.filter(c=>[c.time,c.estimate,c.ci_low,c.ci_high].every(Number.isFinite));
  if (!data.length) return;
  const box=$("eventChart"); box.replaceChildren();
  const ns="http://www.w3.org/2000/svg";
  const svg=(tag,attrs,text)=>{ const n=document.createElementNS(ns,tag); for (const [k,v] of Object.entries(attrs)) n.setAttribute(k,String(v)); if(text!=null)n.textContent=text; return n; };
  const plot=svg("svg",{viewBox:"0 0 300 220",role:"img","aria-label":"事件研究系数与95%置信区间，完整数值见下方表格"});
  const min=Math.min(0,...data.map(c=>c.ci_low))-.03, max=Math.max(0,...data.map(c=>c.ci_high))+.03;
  const times=data.map(c=>c.time), minTime=Math.min(...times), maxTime=Math.max(...times);
  const x=i=>43+(data[i].time-minTime)*237/Math.max(1,maxTime-minTime), y=v=>177-(v-min)/(max-min)*148;
  for(let i=0;i<5;i++){ const v=min+(max-min)*i/4, yy=y(v); plot.append(svg("line",{x1:40,y1:yy,x2:287,y2:yy,stroke:"#e2e8e5"}),svg("text",{x:34,y:yy+3,"text-anchor":"end","font-size":9,fill:"#66736f"},v.toFixed(2))); }
  plot.append(svg("line",{x1:40,y1:y(0),x2:287,y2:y(0),stroke:"#b34747","stroke-dasharray":"3 3"}));
  const eventIndex=data.findIndex(c=>c.time===0);
  if(eventIndex>=0) plot.append(svg("line",{x1:x(eventIndex),y1:22,x2:x(eventIndex),y2:183,stroke:"#b8c9c0","stroke-dasharray":"3 3"}));
  data.forEach((c,i)=>{ const xx=x(i); plot.append(svg("line",{x1:xx,y1:y(c.ci_low),x2:xx,y2:y(c.ci_high),stroke:"#75aa99","stroke-width":1.5})); for(const v of [c.ci_low,c.ci_high]) plot.append(svg("line",{x1:xx-4,y1:y(v),x2:xx+4,y2:y(v),stroke:"#75aa99"})); plot.append(svg("circle",{cx:xx,cy:y(c.estimate),r:3.3,fill:"#087e75"}),svg("text",{x:xx,y:198,"text-anchor":"middle","font-size":9,fill:"#66736f"},c.time)); });
  plot.append(svg("text",{x:163,y:216,"text-anchor":"middle","font-size":10,fill:"#66736f"},"相对政策时点（t=0）")); box.append(plot,el("p","muted",`点：系数估计；竖线：95% 置信区间。基准期：${es.baseline || "见案例说明"}。`));
  const detail=el("details"), table=el("table"), head=el("tr"); detail.append(el("summary","","查看完整数值"));
  for(const h of ["时期","估计","下界","上界"])head.append(el("th","",h));table.append(head);
  for(const c of data){const row=el("tr");for(const v of [c.time,c.estimate,c.ci_low,c.ci_high])row.append(el("td","",String(v)));table.append(row);}detail.append(table);box.append(detail);
}

document.querySelectorAll("[data-path]").forEach(b=>b.onclick=async()=>{
  const path=b.dataset.path;
  if(await mutate("entry",{path})){
    if(path==='prepare'||path==='data'){
      setWorkspace(true);setView(true);selectTab(path==='prepare'?'preparation':'research');
    }
  }
});
document.querySelectorAll("[data-tab]").forEach((b,i,buttons)=>{ b.onclick=()=>selectTab(b.dataset.tab); b.onkeydown=e=>{ if (["ArrowLeft","ArrowRight","Home","End"].includes(e.key)) { e.preventDefault(); const next=e.key==="Home"?0:e.key==="End"?buttons.length-1:(i+(e.key==="ArrowRight"?1:-1)+buttons.length)%buttons.length; buttons[next].focus(); selectTab(buttons[next].dataset.tab); } }; });
$("sendBtn").onclick=sendMessage;
$("startPracticeCase").onclick=()=>mutate("cases/start",{});
$("userInput").oninput=updateCount;
// 兜底：任何情况下输入框获得焦点时都确保未被禁用，避免残留 disabled 卡住输入
$("userInput").addEventListener("pointerdown",()=>{ $("userInput").disabled=false; });
$("userInput").addEventListener("focus",()=>{ $("userInput").disabled=false; });
$("userInput").onkeydown=e=>{ if(e.key==="Enter"&&!e.shiftKey&&!e.isComposing&&e.keyCode!==229&&innerWidth>720){e.preventDefault();sendMessage();} };
$("historyBtn").onclick=toggleHistory;
$("jumpBottomBtn").onclick=()=>{ followBottom=true; autoScrolling=true; $("learningScroll").scrollTo({top:$("learningScroll").scrollHeight,behavior:"smooth"}); updateJumpBtn(); };
bindScrollFollow();
$("courseMapBtn").onclick=()=>{
  if(!latestState)return;
  const body=el("div","course-map");
  for(const item of latestState.outline||[])body.append(button(`${String(item.id).padStart(2,"0")} · ${item.title}`,"course-step",()=>showLessonReview(item)));
  dialog("8 阶段学习地图",body,[button("返回当前任务","btn-primary",()=>$("appDialog").close())]);
};
$("learnViewBtn").onclick=()=>setView(false); $("workViewBtn").onclick=()=>setView(true);
$("workspaceCloseBtn").onclick=()=>setWorkspace(false);
$("workspaceOpenBtn").onclick=()=>setWorkspace(true);
$("newSessionBtn").onclick=newSessionDialog;
$("exportBtn").onclick=exportDialog; $("exportRecordBtn").onclick=exportDialog;
$("pastBtn").onclick=pastDialog;
$("closeDialog").onclick=()=>$("appDialog").close();
$("recoverBtn").onclick=()=>expired?newSessionDialog():connect();
$("dismissError").onclick=()=>{if(!expired&&!needsSync)$("errorBar").hidden=true;};
icons(); connect();
