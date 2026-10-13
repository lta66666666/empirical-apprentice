/* One current task, persistent inputs, and explicit evidence access. */
let eaTask='learn',eaPreviousTask='learn',eaStep='data',eaSkipSync=false;
const eaOriginalTab=selectTab;
const eaNav=el('nav','ea-main-nav');eaNav.setAttribute('aria-label','主要任务');
for(const [task,label,description]of [['learn','学习','看图 · 练习 · 成果'],['prepare','研究准备','问题 · 来源 · 可得性'],['research','R 实操','数据 · 方案 · 执行'],['records','记录与报告','修订 · 证据 · 复现']]){
  const b=button(label,'',()=>eaSetTask(task));b.dataset.task=task;b.append(el('small','',description));eaNav.append(b);
}
document.querySelector('.layout').before(eaNav);
const eaDrawer=el('dialog','ea-evidence-drawer');eaDrawer.id='eaEvidence';eaDrawer.setAttribute('aria-label','资料与证据');
const drawerHead=el('div','ea-drawer-head');drawerHead.append(el('h2','','资料与证据'),button('关闭','btn-secondary',()=>eaCloseEvidence()));eaDrawer.append(drawerHead);document.body.append(eaDrawer);
const eaBody=document.querySelector('.workspace-body');
let eaEvidenceReturnTab=null;
function eaCloseEvidence(restore=true){for(const p of eaDrawer.querySelectorAll('[role=tabpanel]'))eaBody.append(p);eaDrawer.close();if(restore&&eaEvidenceReturnTab)eaOriginalTab(eaEvidenceReturnTab);eaEvidenceReturnTab=null;}
eaDrawer.addEventListener('cancel',()=>eaCloseEvidence());
selectTab=function(tab){
  if(['blueprint','materials'].includes(tab)){
    if(eaSkipSync)return eaOriginalTab(tab);
    const previousTab=activeTab;eaCloseEvidence(false);eaEvidenceReturnTab=previousTab;eaOriginalTab(tab);const p=$(`pane-${tab}`);eaDrawer.append(p);eaDrawer.showModal();return;
  }
  eaCloseEvidence(false);eaOriginalTab(tab);
  if(!eaSkipSync)eaSetTask(({preparation:'prepare',research:'research',records:'records',tutorial:'tutorial',analysis:'hand'})[tab]||'learn',true);
};
function eaSetTask(task,selected=false){
  eaCloseEvidence(false);if(eaTask!==task)eaPreviousTask=eaTask;eaTask=task;
  const map={prepare:'preparation',research:'research',records:'records',hand:'analysis',tutorial:'tutorial'};
  if(map[task]&&!selected){eaSkipSync=true;eaOriginalTab(map[task]);eaSkipSync=false;}
  const layout=document.querySelector('.layout');layout.dataset.task=task;
  layout.classList.remove('workspace-collapsed','work-view');
  layout.classList.toggle('research-focus',task==='research');layout.classList.toggle('tutorial-focus',['hand','tutorial'].includes(task));
  eaNav.querySelectorAll('button').forEach(b=>b.setAttribute('aria-current',b.dataset.task===(['hand','tutorial'].includes(task)?'learn':task)?'page':'false'));
  document.querySelector('.learning-scroll').scrollTop=0;
  if(typeof stopLearningAnimation==='function')stopLearningAnimation();
  if(task==='research')eaResearchStep(eaStep);
  window.eaTaskChanged?.(task);
}
function eaRestoreTask(data,previous){
  if(typeof eaRenderModelEvidence==='function')eaRenderModelEvidence(data.model_interactions||[]);
  eaHydrateDrafts(data);
  if(!previous||previous.session_id!==data.session_id)eaRestoreWorkbench(data);
  const statuses=data.model_capabilities||{};
  const statusBox=$('eaModelCapabilities');if(statusBox)statusBox.textContent=['candidate','tutor','reflection'].map((key,i)=>`${['候选方案','课程问答','解释反馈'][i]}：${statuses[key]==='configured_not_verified'?'已配置，待实测':'模型未配置'}`).join(' · ');
  if(!previous||previous.session_id!==data.session_id)eaSetTask(window.EA_MODULE==='analysis'?'research':'learn');
  const record=data.tutor_records?.at(-1);if(record){const box=$('eaTutorAnswer');box.replaceChildren(el('p','workspace-note',record.warning));const prose=el('div','prose');markdown(prose,record.answer);box.append(prose);}
}
document.querySelector('.header-actions').prepend(button('资料与证据','btn-secondary',()=>selectTab('materials')));
for(const b of document.querySelectorAll('.side-panel > button'))if(b.textContent.includes('没有数据？'))b.classList.add('ea-legacy-start');
$('learnViewBtn').onclick=()=>eaSetTask('learn');$('workViewBtn').onclick=()=>eaSetTask('research');
$('openResearch').onclick=()=>eaSetTask('research');
$('workspaceCloseBtn').hidden=true;
const motion=button('减少动画','btn-secondary',()=>{const reduced=!document.documentElement.classList.contains('motion-reduced');storageSet('ea_motion_reduced',reduced?'1':'0');document.documentElement.classList.toggle('motion-reduced',reduced);motion.setAttribute('aria-pressed',String(reduced));if(reduced&&typeof stopLearningAnimation==='function')stopLearningAnimation();});
motion.setAttribute('aria-pressed',String(storageGet('ea_motion_reduced')==='1'));document.documentElement.classList.toggle('motion-reduced',storageGet('ea_motion_reduced')==='1');document.querySelector('.header-actions').append(motion);
// Secondary tools use one keyboard-accessible menu; task navigation stays primary.
const toolsMenu=el('details','ea-tools-menu'),toolsSummary=el('summary','','资料与设置'),toolsBody=el('div','ea-tools-body');toolsMenu.append(toolsSummary,toolsBody);
const headerActions=document.querySelector('.header-actions');
for(const node of [...headerActions.children])if(node.id!=='newSessionBtn'&&node.id!=='openResearch')toolsBody.append(node);
$('openResearch').hidden=true;headerActions.prepend(toolsMenu);
document.addEventListener('click',e=>{if(!toolsMenu.contains(e.target))toolsMenu.open=false;});
toolsMenu.addEventListener('keydown',e=>{if(e.key==='Escape'){toolsMenu.open=false;toolsSummary.focus();}});
toolsBody.addEventListener('click',e=>{if(e.target.closest('button')!==motion)toolsMenu.open=false;});
if(window.visualViewport){const updateKeyboard=()=>document.documentElement.classList.toggle('ea-keyboard-open',window.innerHeight-window.visualViewport.height>180);window.visualViewport.addEventListener('resize',updateKeyboard);}
document.addEventListener('visibilitychange',()=>{if(document.hidden&&typeof stopLearningAnimation==='function')stopLearningAnimation();});
const tutor=el('details','ea-tutor');tutor.append(el('summary','','课程辅助问答'));
const tq=el('textarea');tq.rows=3;tq.maxLength=2000;tq.setAttribute('aria-label','课程问题');tq.placeholder='当前概念哪里还不清楚？';
const ta=el('div');ta.id='eaTutorAnswer';ta.setAttribute('aria-live','polite');
const ms=el('p','workspace-note');ms.id='eaModelCapabilities';
const tb=button('提问并保存学习记录','btn-secondary',async()=>{if(!tq.value.trim())return;tb.disabled=true;try{await mutate('tutor',{question:tq.value});}finally{tb.disabled=false;}});
tutor.append(ms,tq,el('p','workspace-note','基于当前课程与案例给出学习建议；未配置模型时使用固定自查清单。'),tb,ta);document.querySelector('.chat-panel').append(tutor);
async function downloadPersistentRecord(format){
  if(!sessionId)return;
  try{const response=await fetch(`/api/sessions/${sessionId}/learning-report/${format}`,{credentials:'same-origin'});if(!response.ok)throw new Error('记录读取失败');let content=await response.text();
    const drafts={};for(const item of latestState?.outline||[]){const value=storageGet(`ea_draft:${sessionId}:${item.id}`);if(value)drafts[item.id]=value;}
    if(format==='json'){const data=JSON.parse(content);data.unsaved_local_drafts=drafts;content=JSON.stringify(data,null,2);}else if(Object.keys(drafts).length)content+='\n## 本机未保存草稿（不属于已保存成果）\n'+JSON.stringify(drafts,null,2);
    const url=URL.createObjectURL(new Blob([content],{type:format==='json'?'application/json':'text/markdown;charset=utf-8'}));const a=el('a');a.href=url;a.download=`learning-report.${format}`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }catch(e){toast(e.message);}
}
const stepper=el('nav','ea-stepper');stepper.setAttribute('aria-label','R 实操步骤');
for(const [step,label]of [['data','1 数据'],['health','2 体检'],['plan','3 方案'],['execute','4 执行'],['explain','5 解释']]){const b=button(label,'',()=>eaResearchStep(step));b.dataset.step=step;stepper.append(b);}
$('researchRuntime').before(stepper);
function eaResearchStep(step){
  eaSaveWorkbenchDraft();
  const previousStep=eaStep;
  eaStep=step;$('pane-research').dataset.step=step;
  stepper.querySelectorAll('button').forEach(b=>b.setAttribute('aria-current',b.dataset.step===step?'step':'false'));
  const allowed={data:['data'],health:['health'],plan:['plan'],execute:['execute'],explain:['explain']}[step];
  document.querySelectorAll('[data-research-stage]').forEach(n=>n.classList.toggle('ea-stage-hidden',!allowed.includes(n.dataset.researchStage)));
  if(step==='health'){eaRenderDictionary();eaRenderDataExplorer();}
  eaUpdateStepAction();
  if(eaTask==='research'&&previousStep!==step)stepper.scrollIntoView({block:'start',behavior:learningMotionReduced()?'auto':'smooth'});
}
const mark=(node,stage)=>{if(node)node.dataset.researchStage=stage;};
const storageNote=[...$('pane-research').children].find(n=>n.tagName==='P'&&n.textContent.startsWith('匿名浏览器记录'));
if(storageNote){const disclosure=el('details','ea-storage-disclosure');disclosure.append(el('summary','','数据保存与试用说明'),storageNote);$('researchRuntime').after(disclosure);}
mark(document.querySelector('.research-cases'),'data');mark($('researchLesson'),'health');
for(const node of document.querySelector('.research-input').children){let stage='data';if(node.id==='researchProfile'||node.id==='researchDictionary'||node.id==='researchPrepTransfer')stage='health';if(node.classList.contains('research-parameters')||['researchMakePlan','researchAiCandidate','researchAiNote'].includes(node.id))stage='plan';mark(node,stage);}
for(const node of document.querySelector('.research-output').children)mark(node,node.id==='researchExplanation'?'explain':node.id==='researchResult'||node.id==='researchHistory'?'execute':'plan');
$('researchNotice').removeAttribute('data-research-stage');
const params=document.querySelector('.research-parameters');params.open=true;
const advanced=el('details','ea-advanced');advanced.append(el('summary','','高级参数：标准误与缺失处理'));
for(const id of ['researchVcov','researchCluster','researchMissing'])advanced.append($(id).closest('label'));params.append(advanced);
const draftStatus=el('p','ea-draft-status');draftStatus.id='eaDraftStatus';draftStatus.setAttribute('role','status');$('researchNotice').after(draftStatus);
const footer=el('div','ea-step-actions'),nextAction=button('检查数据与变量','btn-primary',async()=>{
  if(eaStep==='data'){if(!researchData&&!researchProfileCache){researchNotice('请选择模拟数据或上传 CSV/TSV，再检查字段。',true);return;}eaResearchStep('health');}
  else if(eaStep==='health')eaResearchStep('plan');
  else if(eaStep==='plan'){if(!researchPlan){await researchMakePlan();return;}await researchRun();}
  else if(eaStep==='execute'&&researchJob?.status==='succeeded'){eaResearchStep('explain');}
  else if(researchJob?.status==='succeeded'){if(window.eaOpenAnswer)await window.eaOpenAnswer(researchJob.id);else $('researchReflectionSubmit')?.click();}
  else{eaResearchStep('data');}
});nextAction.id='eaNextAction';footer.append(nextAction);$('pane-research').append(footer);
function eaUpdateStepAction(){
  if(!$('eaNextAction'))return;
  const confirmation=$('researchConfirm').closest('label');
  confirmation.classList.toggle('ea-stage-hidden',eaStep!=='plan'||!researchPlan);
  $('eaNextAction').textContent={data:'检查数据与变量',health:'选择方法并整理方案',plan:researchPlan?'核对确认后执行':'整理待确认方案',execute:'进入结果解释',explain:researchJob?.status==='succeeded'?(researchJob.reflections?.length?'提交修订并更新报告':'提交解释并更新报告'):'选择数据开始分析'}[eaStep];
  $('eaNextAction').disabled=researchRunning||researchInputBusy||(eaStep==='plan'&&(researchRunning||Boolean(researchPlan&&!$('researchConfirm').checked)))||(eaStep==='execute'&&researchJob?.status!=='succeeded')||(eaStep==='explain'&&Boolean($('researchReflectionSubmit')?.disabled));
  if(eaStep==='execute'&&researchJob?.status!=='succeeded')$('eaNextAction').textContent=['failed','interrupted','cancelled'].includes(researchJob?.status)?'执行未完成，请先处理上方提示':'等待计算完成';
  $('pane-research').querySelector(':scope>h2').textContent={data:'选择数据，开始一次分析',health:'核对数据与变量',plan:'整理方案，核对后执行',execute:'查看真实执行与结果',explain:'解释系数，记录自己的理解'}[eaStep];
  let hint=$('eaStepHint');if(!hint){hint=el('p','workspace-note');hint.id='eaStepHint';stepper.after(hint);}
  hint.textContent={data:'选择数据后检查字段；模拟数据与自己的研究分别记录。',health:researchProfileCache?'先填写所选变量的含义与单位；其他列可稍后补充。':'尚无数据。可先浏览方法短课，或返回数据步骤。',plan:researchData?'修改资料或参数后需重新整理方案、核对并确认。':'请载入原始数据后整理方案；仅有字段草稿不能执行。',execute:researchJob?'按真实任务状态查看结果；执行完成后即可下载。':'尚未提交任务。请在方案步骤核对并确认。',explain:researchJob?.status==='succeeded'?'解释练习可稍后完成；草稿保存不代表已提交。':'完成一次分析后，这里会出现系数解释练习。'}[eaStep];
}
const dictionaryEditor=el('section','ea-variable-editor');dictionaryEditor.id='eaDictionaryEditor';mark(dictionaryEditor,'health');document.querySelector('.research-input').append(dictionaryEditor);
function eaRenderDictionary(){
  const root=$('eaDictionaryEditor');if(!root)return;
  if(!researchProfileCache){root.replaceChildren(el('p','workspace-note','载入数据后可填写变量定义与单位。'));return;}
  const saved=eaDictionaryValues();root.dataset.inputHash=eaInputHash;root.replaceChildren(el('h3','','变量含义、单位与来源'),el('p','workspace-note','填写会自动保存草稿；点击“提交变量字典”后才纳入方案和执行快照。'));
  const p=researchCandidate(),selected=new Set([p.outcome,...p.predictors,p.unit,p.time,p.treated,p.cluster].filter(Boolean));
  const remaining=el('details','ea-other-columns');remaining.append(el('summary','',`其他数据列（${researchProfileCache.columns.filter(c=>!selected.has(c.name)).length}）`));
  for(const col of researchProfileCache.columns){const label=el('label','research-field',col.name),input=el('input');input.value=saved[col.name]||'';input.maxLength=300;input.dataset.column=col.name;input.placeholder='含义；单位；口径；来源';input.oninput=researchInvalidate;label.append(input);(selected.has(col.name)?root:remaining).append(label);}
  root.append(remaining,button('提交变量字典','btn-secondary',async()=>{
    const dict=eaDictionaryValues();await eaFlushDraft('workbench');const ok=await mutate('variable-dictionary',{dictionary:dict},{method:'PUT'});
    if(ok){if(researchData)researchData.dictionary=dict;researchInvalidate();toast('变量字典已提交，请重新核对方案。');eaSaveWorkbenchDraft();}
  }));
}
const explorer=el('section','ea-data-explorer');explorer.id='eaDataExplorer';mark(explorer,'health');document.querySelector('.research-input').append(explorer);
function eaRenderDataExplorer(){
  const root=$('eaDataExplorer');root.replaceChildren();if(!researchData?.simulated)return;
  const lines=researchData.text.trim().split('\n').map(l=>l.split(',')),headers=lines.shift(),rows=lines;
  const method=$('researchMethod').value,select=el('select');select.setAttribute('aria-label',method==='panel_fe'?'选择同一城市':'选择解释变量');
  const keys=method==='panel_fe'?[...new Set(rows.map(r=>r[headers.indexOf('city')]))]:headers.filter(h=>h!==$('researchOutcome').value&&researchProfileCache.columns.find(c=>c.name===h)?.numeric);
  for(const key of keys)select.append(new Option(key,key));
  const plot=el('div','ea-observation-chart'),info=el('p','workspace-note');root.append(el('h3','',method==='panel_fe'?'同一单位的历年观测':'观察变量与结果'),select,plot,info);
  const draw=()=>{plot.replaceChildren();const y= headers.indexOf($('researchOutcome').value),unit=headers.indexOf('city');const values=method==='panel_fe'?rows.filter(r=>r[unit]===select.value):rows.slice(0,40);const x=headers.indexOf(method==='panel_fe'?'year':select.value);const pairs=values.map(r=>[Number(r[x]),Number(r[y])]).filter(p=>p.every(Number.isFinite));if(!pairs.length)return;
    const xmin=Math.min(...pairs.map(p=>p[0])),xmax=Math.max(...pairs.map(p=>p[0])),ymin=Math.min(...pairs.map(p=>p[1])),ymax=Math.max(...pairs.map(p=>p[1]));
    const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 420 200');svg.setAttribute('role','img');svg.setAttribute('aria-label','现有模拟数据的观测点，无拟合线');
    for(const [vx,vy]of pairs){const c=document.createElementNS(svg.namespaceURI,'circle');c.setAttribute('cx',String(25+(vx-xmin)/(xmax-xmin||1)*370));c.setAttribute('cy',String(175-(vy-ymin)/(ymax-ymin||1)*150));c.setAttribute('r','4');c.setAttribute('fill','#087e75');svg.append(c);}plot.append(svg);
    info.textContent=`横轴：${method==='panel_fe'?'year':select.value}；纵轴：${headers[y]}。${method==='panel_fe'?`城市 ${select.value} 的 ${pairs.length} 个观测点；固定效应仍不能排除随时间变化的混杂。`:'仅展示前 40 行观测，未控制其他变量，不能由散点推断因果。'}`;};select.onchange=draw;draw();
}
eaSetTask('learn');eaResearchStep('data');
