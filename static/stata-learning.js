/* Read-only teaching, attached to an owned, prepared Stata task. Never executes. */
(()=>{
 if(window.EA_MODULE!=='analysis'||!window.eaConversation)return;
 const feed=document.querySelector('.coach-feed'),parts=window.eaConversation;
 if(!feed)return;
 const card=el('article','stata-learning-card');card.id='stataLearningCard';card.setAttribute('aria-label','Stata代码与结果讲解');card.hidden=true;feed.append(card);
 let tasks=[],selected=null,signature='',scope='',request=0,reference=null,viewed=new Set();
 const statusNames={queued:'等待助手准备代码',awaiting_approval:'本机已准备，尚未执行',running:'本机正在执行',awaiting_upload:'已完成计算，等待本机批准上传',succeeded:'对应本次实际执行及已批准上传结果',cancelled:'任务已取消',interrupted:'任务已中断',failed:'执行失败'};
 const brief={import:'读取本机归一化数据',numeric:'将字段转换为数值',missing:'按确认规则处理缺失行',sample:'检查最小可用样本',panel:'生成个体编号',cluster:'生成聚类编号',xtset:'声明个体与年份',post:'定义政策后时期',interaction:'生成处理组与政策后的交互项',estimate:'执行本次已确认模型'};
 function current(t){return t&&scope===sessionId&&selected?.id===t.id;}
 function viewRecord(t,id){const key='stata-reading',old=eaDraftEntry(key).value||{};if(old.task_id!==t.id||old.preview_hash!==t.teaching_preview.preview_hash)viewed=new Set();else viewed=new Set(old.viewed||[]);viewed.add(id);eaQueueDraft(key,{task_id:t.id,preview_hash:t.teaching_preview.preview_hash,command_id:id,viewed:[...viewed].slice(-100),view_only:true},parts.draftStatus);}
 async function explain(t,c,focus='command',term=null,reveal=true,part='command'){
  if(!current(t))return;const epoch=++request,params=new URLSearchParams({session_id:sessionId,task_id:t.id,preview_hash:t.teaching_preview.preview_hash,command_id:c.id,focus,part,...(term?{term}:{})});
  reference={intent:'stata_explain',task_id:t.id,command_id:c.id,preview_hash:t.teaching_preview.preview_hash,focus,term,part};window.eaStataQuestionContext=reference;
  parts.status.textContent='正在读取这条命令的讲解…';
  try{const result=await api('/api/local-stata/tasks/lesson?'+params);if(epoch!==request||!current(t))return;window.eaShowStataLesson?.(result.card,{reveal});viewRecord(t,c.id);parts.status.textContent='讲解已打开。可继续提问这条命令；不会执行代码。';}
  catch(e){if(epoch===request&&current(t))parts.status.textContent='讲解读取失败：'+e.message+'。代码与输入已保留，请再次点击重试。';}
 }
 function commandRow(t,c){const row=el('div','stata-command-row'),b=button(c.text,'stata-command',()=>explain(t,c));b.setAttribute('aria-label','讲解命令：'+c.text);row.append(b,el('small','muted',brief[c.topic]||'查看当前命令说明'));return row;}
 function focusButton(t,c,label,focus,term){return button(label,'stata-metric',()=>explain(t,c,focus,term));}
 function render(){
  const t=selected;if(t&&!feed.contains(card))feed.append(card);if(!t){card.hidden=true;window.eaStataTeachingTask=null;window.eaStataQuestionContext=null;signature='';return;}
  const next=JSON.stringify([t.id,t.status,t.teaching_preview?.preview_hash,t.result,t.record_version]);if(next===signature)return;
  const top=feed.scrollTop,atEnd=feed.scrollHeight-feed.scrollTop-feed.clientHeight<80;signature=next;card.hidden=false;card.replaceChildren(el('h3','','本次 Stata 代码'),el('p','muted',statusNames[t.status]||t.status));
  const preview=t.teaching_preview;
  if(t.status==='failed')card.append(button('查看排错提示','text-btn',()=>window.eaOpenStataGuide?.('files','error')));
  if(!preview){card.append(el('p','','助手准备代码后，这里会显示真实核心命令。旧版助手不支持讲解时，请下载新版；本机完整批准仍可使用。'));return;}
  card.append(el('p','','点击命令看左侧说明。这里只展示核心片段，完整脚本仍须在本机核对批准。'));
  const main=preview.commands.find(c=>c.topic==='estimate'),context=preview.commands.filter(c=>['xtset','post','interaction'].includes(c.topic));
  if(!context.length){const input=preview.commands.find(c=>c.topic==='import');if(input)context.push(input);}
  const visible=[...context.slice(-2),...(main?[main]:[])],shown=new Set(visible.map(c=>c.id));
  for(const c of visible)card.append(commandRow(t,c));
  if(main){const syntax=el('div','stata-syntax');syntax.append(el('small','','读懂语法：'));for(const [label,part]of [['变量列表','variables'],['逗号与选项','comma'],...(t.plan.method!=='ols'?[['i. 年份','year'],['fe','fe']]:[]),['vce()','vce']])syntax.append(button(label,'text-btn',()=>explain(t,main,'command',null,true,part)));card.append(syntax);}
  const details=el('details','stata-more-commands');details.append(el('summary','','字段对应与其他核心命令'));
  details.append(el('p','muted',preview.mapping.map(m=>m.alias+' = '+m.name).join('；')));
  for(const d of preview.derived)details.append(el('p','muted',d.alias+' ← '+d.sources.join('、')));
  for(const c of preview.commands)if(!shown.has(c.id))details.append(commandRow(t,c));card.append(details);
  const copy=button('复制核心片段','text-btn',async()=>{try{await navigator.clipboard.writeText(visible.map(c=>c.text).join('\n'));parts.status.textContent='已复制核心片段；完整脚本保存在本机。';}catch{parts.status.textContent='复制失败，请选择代码文本复制。';}});card.append(copy);
  if(main&&t.status==='succeeded'&&t.result&&t.code_sha256===preview.code_sha256){
   const results=el('section','stata-results');results.append(el('h4','','实际 Stata 结果整理视图'),focusButton(t,main,'实际样本 '+t.result.n_used,'sample'));
   const scroll=el('div','stata-table-scroll'),table=el('table'),head=el('thead'),hr=el('tr');for(const title of ['估计项','系数','标准误','95%区间'])hr.append(el('th','',title));head.append(hr);table.append(head);const body=el('tbody');
   for(const c of t.result.coefficients||[]){const row=el('tr');row.append(el('th','',c.term==='(Intercept)'?'截距':c.term));for(const [label,focus]of [[Number(c.estimate).toPrecision(5),'estimate'],[Number(c.std_error).toPrecision(5),'std_error'],['['+Number(c.ci_low).toPrecision(5)+', '+Number(c.ci_high).toPrecision(5)+']','interval']]){const td=el('td');td.append(focusButton(t,main,label,focus,c.term));row.append(td);}body.append(row);}table.append(body);scroll.append(table);results.append(scroll,el('small','muted','点击数值查看含义；这是已批准上传的摘要，完整原生日志留在本机。'));results.append(window.eaSampleEvidencePanel(t));card.append(results);
  }
  const record=eaDraftEntry('stata-reading').value;if(record?.task_id===t.id&&record.preview_hash===preview.preview_hash){const c=preview.commands.find(c=>c.id===record.command_id);if(c&&!reference)explain(t,c,'command',null,false);}
  if(atEnd)feed.scrollTop=feed.scrollHeight;else feed.scrollTop=top;
 }
 window.addEventListener('ea-local-tasks',e=>{
  if(e.detail.session!==sessionId)return;
  if(scope!==sessionId){scope=sessionId;signature='';selected=null;reference=null;request++;viewed.clear();window.eaShowStataLesson?.(null);}
  tasks=e.detail.tasks||[];
  const candidates=tasks.filter(t=>t.kind==='template'&&t.engine_id==='stata_local_mcp');
  const explicit=window.eaSelectedTask?.session_id===sessionId?window.eaSelectedTask.id:null;
  const next=explicit&&tasks.some(t=>t.id===explicit)?candidates.find(t=>t.id===explicit):candidates[0];
  if(selected?.id!==next?.id){request++;reference=null;window.eaStataQuestionContext=null;window.eaShowStataLesson?.(null);}
  selected=next;window.eaLocalTeachingActive=candidates.some(t=>['queued','awaiting_approval','running','awaiting_upload','cancel_requested'].includes(t.status));window.eaStataTeachingTask=selected;render();window.dispatchEvent(new Event('ea-stata-selection'));
 });
 // State restoration must work even before the user opens the connection dialog.
 if(latestState?.local_stata_tasks?.length)window.dispatchEvent(new CustomEvent('ea-local-tasks',{detail:{tasks:latestState.local_stata_tasks,session:sessionId}}));
 window.addEventListener('focus',()=>{if(window.eaLocalTeachingActive)window.eaRefreshLocalTasks?.();});
})();
