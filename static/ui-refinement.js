/* Presentation only: no changes to confirmation, evidence revisions or server payloads. */
function eaRefreshEnvironment(collapse=false){
  const root=$('researchRuntime'),summary=root?.querySelector(':scope>summary');if(!summary)return;
  const selected=$('researchEngine').value;
  summary.textContent=selected==='browser_webr'?(eaWebR?'浏览器 R 已就绪 · 查看或更换执行方式':'已选择浏览器 R · 点击检查环境'):selected?'已选择云端引擎 · 查看环境状态':'先选择执行方式 · 浏览器 R 无需云端配置';
  if(collapse&&selected==='browser_webr'&&eaWebR)root.open=false;
}
const eaInitBeforeRefinement=eaInitWebR;
eaInitWebR=async function(){try{const runtime=await eaInitBeforeRefinement();eaRefreshEnvironment(true);return runtime;}catch(e){$('researchRuntime').open=true;throw e;}};
$('researchEngine').addEventListener('change',()=>{eaRefreshEnvironment();if(!eaWebR&&$('researchEngine').value==='browser_webr')$('researchRuntime').open=true;});
$('researchRuntime').addEventListener('click',e=>{const selected=e.target.closest('button')?.textContent==='使用浏览器 R / fixest';queueMicrotask(()=>eaRefreshEnvironment(selected));});
for(const id of ['researchMakePlan','researchRun'])$(id).hidden=true;
const confirmation=$('researchConfirm').closest('label');document.querySelector('.ea-step-actions').prepend(confirmation);
eaUpdateStepAction();
const dictionaryShortcut=button('查看或补充变量单位','btn-secondary',()=>{eaResearchStep('health');$('eaDictionaryEditor').scrollIntoView({block:'start'});$('eaDictionaryEditor').querySelector('input')?.focus();});dictionaryShortcut.dataset.researchStage='plan';dictionaryShortcut.classList.add('ea-stage-hidden');document.querySelector('.research-input').append(dictionaryShortcut);
function eaReportOverview(data){
  let section=$('eaReportOverview');if(!section){section=el('section','ea-report-overview');section.id='eaReportOverview';$('pane-records').prepend(section);}
  const jobs=data.research_jobs||[],done=jobs.filter(j=>j.status==='succeeded');
  section.replaceChildren(el('span','section-kicker','本次练习'),el('h2','','学习成果与复现材料'),el('p','workspace-note',`资料版本 ${data.research_revision||0} · 已完成分析 ${done.length} 次 · Agent 交互 ${(data.model_interactions||[]).length} 条。草稿与已提交成果分别记录。`));
  const learning=el('section','ea-report-card');learning.append(el('h3','','学生学习报告'),el('p','','查看学习、跳过、首次回答、反馈与修订。'));
  const links=el('div','research-actions');links.append(researchDownload(`/api/sessions/${data.session_id}/learning-report/md`,'学习报告.md'),researchDownload(`/api/sessions/${data.session_id}/learning-report/pdf`,'学习报告.pdf'),button('学习报告.json','btn-secondary',()=>downloadPersistentRecord('json')));learning.append(links);section.append(learning);
  if(!done.length)section.append(el('p','workspace-note','完成分析后，这里会出现分析报告与复现包。'));
  for(const job of done){const card=el('section','ea-report-card');card.append(el('h3','',job.description?.label||researchNames[job.plan?.method]||'已完成分析'),el('p','workspace-note',`导出版本 ${job.record_version||1} · ${job.execution_location==='cloud_native'?'云端执行':'浏览器执行'} · 来源与识别条件仍须核对`));const downloads=el('div','research-actions');downloads.append(researchDownload(`/api/research/jobs/${job.id}/report`,'分析报告.md'),researchDownload(`/api/research/jobs/${job.id}/report.pdf`,'分析报告.pdf'),researchDownload(`/api/research/jobs/${job.id}/package`,'复现包.zip'));card.append(downloads,button('查看任务与解释修订','text-btn',()=>{eaSetTask('research');eaResearchStep('execute');researchWatch(job.id);window.eaWorkspaceOpen?.('execute','分析结果');}));section.append(card);}
}
const eaRestoreBeforeRefinement=eaRestoreTask;
eaRestoreTask=function(data,previous){eaRestoreBeforeRefinement(data,previous);eaReportOverview(data);};
const eaHistoryBeforeRefinement=researchHistory;
researchHistory=function(jobs){eaHistoryBeforeRefinement(jobs);if(latestState)eaReportOverview({...latestState,research_jobs:jobs});};
if(latestState)eaReportOverview(latestState);
for(const selector of ['#exportRecordBtn','#pane-records>.report-actions'])document.querySelector(selector)?.setAttribute('hidden','');
const entryDescriptions=['适合从零开始。先看一个图解，再完成第一道练习。','适合有研究想法但没有数据。先写问题，再列资料清单。','适合已有 CSV／TSV。先检查数据，再核对方案并计算。'];
document.querySelectorAll('.entry-card .entry-desc').forEach((node,i)=>{if(entryDescriptions[i])node.textContent=entryDescriptions[i];});
const eaPrepBeforeRefinement=renderPreparation;
renderPreparation=function(data){eaPrepBeforeRefinement(data);const root=$('preparationContent'),status=root.querySelector('.ea-prep-summary');if(status)root.querySelector('h3').after(status);};
if(latestState)renderPreparation(latestState);
