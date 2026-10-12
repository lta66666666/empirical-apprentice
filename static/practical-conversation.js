/* Task conversation and paired device are separate from the raw-upload R API. */
(()=>{
  const pane=$('pane-research');if(!pane)return;
  const conversation=el('section','pc-workspace'),dialogue=el('div','pc-dialogue'),lesson=el('aside','pc-teaching');
  dialogue.append(el('span','eyebrow','边分析边学习'),el('h2','','先说说你想研究什么'));
  const messages=el('div','pc-messages');messages.setAttribute('aria-live','polite');
  const input=el('textarea');input.rows=3;input.placeholder='例如：我有城市年度数据，想比较政策前后排放的变化。';input.setAttribute('aria-label','研究问题与补充信息');
  const chatDraftStatus=el('p','muted');input.maxLength=2000;input.addEventListener('input',()=>{if(window.eaComposerKind!=='data')eaQueueDraft('practical-chat',{message:input.value},chatDraftStatus);});
  const submit=button('发送问题，整理候选方案','btn-primary',async()=>{
    if(!sessionId||!input.value.trim())return;submit.disabled=true;
    try{const r=await api('/api/research/chat',{method:'POST',body:{session_id:sessionId,research_revision:latestState.research_revision,message:input.value,intent:window.eaChatIntent||"auto",profile:researchProfileCache||{row_count:0,columns:[]}}});input.value='';eaQueueDraft('practical-chat',{message:''},chatDraftStatus);latestState.practical_messages=r.messages;drawMessages(r.messages);window.eaDisplayMode?.(r.display_mode);window.eaConversationHistory?.(r.messages);}catch(e){researchNotice(e.message,true);}finally{submit.disabled=false;}
  });dialogue.append(messages,input,chatDraftStatus,submit);
  lesson.append(el('span','eyebrow','同步教学 · 资料可追溯'),el('h3','','当前方法与核对条件'));const materials=el('div');lesson.append(materials);
  conversation.append(dialogue,lesson);pane.prepend(conversation);window.eaConversation={input,submit,messages,lesson,conversation,dialogue,draftStatus:chatDraftStatus};
  function drawMessages(history){messages.replaceChildren();for(const entry of (history||[]).slice(-100)){
    const card=el('article','pc-message '+entry.role);card.append(el('strong','',entry.role==='user'?'我的问题':'Agent 的补问与建议'),el('p','',entry.content));
    if(entry.candidate)card.append(button('核对后填入候选方案','btn-secondary',()=>{if(!researchProfileCache){researchNotice('先选择数据并检查字段，再填入方案。',true);return;}researchSetFields(researchProfileCache,entry.candidate);eaResearchStep('plan');researchInvalidate();}));
    messages.append(card);
  }const latest=[...(history||[])].reverse().find(x=>x.role==='assistant');drawTeaching(latest?.retrieval||[]);}
  function drawTeaching(sources){materials.replaceChildren(el('p','',`${researchNames[$('researchMethod').value]||'方法待定'}：先核对变量、单位、样本与识别条件；AI建议不代表已经执行。`));for(const item of sources){const details=el('details'),summary=el('summary','',item.title),link=el('a','','查看来源');const url=typeof item.source==='string'?item.source:item.source?.url;if(url&&(/^(https:\/\/|\/static\/)/.test(url))){link.href=url;link.target='_blank';link.rel='noopener';}else link.removeAttribute('href');details.append(summary,link,el('p','muted',`材料 ${item.id} · ${item.review_status||'待审校'} · 哈希 ${(item.content_hash||'').slice(0,12)}`));materials.append(details);}}
  $('researchMethod').addEventListener('change',()=>drawTeaching([]));
  const oldSetFields=researchSetFields;researchSetFields=function(...args){const result=oldSetFields(...args);drawTeaching([]);return result;};
  const originalRestore=eaRestoreTask;eaRestoreTask=function(...args){const value=originalRestore(...args);if(latestState){eaHydrateDrafts(latestState);if(document.activeElement!==input)input.value=eaDraftEntry('practical-chat').value.message||'';}drawMessages(latestState?.practical_messages||[]);return value;};
  const entries=document.querySelector('.entry-cards');if(entries&&!window.EA_MODULE){
    const zero=entries.querySelector('[data-path="zero"]'),data=entries.querySelector('[data-path="data"]'),prepare=entries.querySelector('[data-path="prepare"]');
    zero.querySelector('.entry-title').textContent='零基础：从一个案例开始';data.querySelector('.entry-title').textContent='边分析边学习';data.querySelector('.entry-desc').textContent='用已有数据提出问题，核对方案后真实计算。没有数据也可以先整理准备。';prepare.classList.add('pc-secondary-entry');entries.parentNode.insertBefore(prepare,entries.nextSibling);
    const demo=button('用现有同批 DID 模拟数据开始','btn-secondary',async()=>{if(!sessionId)await newSession();if(latestState.stage==='entry')await mutate('entry',{path:'data'});eaSetTask('research');await researchSample('did');eaResearchStep('plan');});entries.parentNode.insertBefore(demo,entries.nextSibling);
  }
  const local=el('details','pc-local');local.id='pcLocalStata';local.append(el('summary','','本机 Stata MCP · 配对、批准与结果'));
  local.append(el('p','','需有效 Stata 安装、正在运行的 MCP 扩展和本机助手。网页无法直接访问电脑的 localhost。原始输入留在本机。'));
  const kit=el('a','btn-secondary','下载 Windows 本机助手');kit.href='/static/local-stata-assistant.zip';kit.download='local-stata-assistant.zip';local.append(kit);
  const open=el('a','btn-secondary','打开本机批准窗口');open.href='http://127.0.0.1:8767/';open.target='_blank';open.rel='noopener';local.append(open);
  const pairCode=el('input');pairCode.placeholder='助手生成的六位配对码';pairCode.inputMode='numeric';pairCode.maxLength=6;pairCode.setAttribute('aria-label','六位配对码');local.append(pairCode);
  const localState=el('p','muted'),localFields=el('div','pc-local-fields'),taskList=el('div');local.append(localState);
  let pairing=null,localTasks=[],localConfirmed=false,confirmedRevision=null,refreshing=false,tasksSignature='';
  async function call(path,body,method='POST'){return api('/api/local-stata/'+path,{method,body:method==='GET'?undefined:{session_id:sessionId,...body}});}
  local.append(button('配对当前练习','btn-primary',async()=>{try{await call('pairings/claim',{code:pairCode.value});pairCode.value='';await refresh();}catch(e){localState.textContent=e.message;}}),button('刷新设备与任务','btn-secondary',refresh),button('解除配对','text-btn',async()=>{try{await call('pairings/revoke',{});await refresh();}catch(e){localState.textContent=e.message;}}));
  const mode=el('select');mode.setAttribute('aria-label','本机执行类型');mode.append(new Option('三种已有方法：结构化结果','template'),new Option('通用批准代码：试验功能','code'));local.append(mode);
  const method=el('select');method.setAttribute('aria-label','本机计量方法');for(const [key,name]of Object.entries(researchNames))method.append(new Option(name,key));
  const selects={};for(const [key,title]of Object.entries({outcome:'结果变量',unit:'个体列（面板）',time:'年份列（面板）',treated:'处理组列（DID）',cluster:'聚类列（留空使用稳健标准误）'})){const label=el('label','research-field',title),select=el('select');selects[key]=select;label.append(select);localFields.append(label);}
  const predictors=el('div','pc-local-predictors'),year=el('input');year.type='number';year.placeholder='同批政策实施年';
  year.setAttribute('aria-label','同批政策实施年份');
  const sameLabel=el('label','research-check'),same=el('input');same.type='checkbox';sameLabel.append(same,document.createTextNode('已核对同批实施，不存在分批或时点冲突'));
  const dropLabel=el('label','research-check'),drop=el('input');drop.type='checkbox';dropLabel.append(drop,document.createTextNode('允许删除选定变量的缺失行；否则阻止执行'));
  localFields.prepend(method);localFields.append(el('p','','解释变量／DID控制变量'),predictors,year,sameLabel,dropLabel);local.append(localFields);
  const goal=el('textarea');goal.rows=2;goal.placeholder='操作目标与需要解释的问题';const code=el('textarea');code.rows=12;code.placeholder='待本机预览批准的 Stata 代码（输入为 normalized.csv，列映射见上方）';code.hidden=true;local.append(goal,code);window.eaLocalCode=code;window.eaLocalCodeMode=()=>{mode.value="code";mode.onchange();};
  const localDictionary=el('details'),unitFields=el('div');localDictionary.append(el('summary','','本机数据变量字典：含义、单位、口径与来源'),el('p','muted','填写不会自动核实来源。未知内容请标为待核实；提交将改变资料版本，需要重新确认。'),unitFields,button('保存变量字典，重新核对方案','btn-secondary',async()=>{const dictionary=Object.fromEntries([...unitFields.querySelectorAll('input')].map(n=>[n.dataset.column,n.value]));if(await mutate('variable-dictionary',{dictionary},{method:'PUT'})){localConfirmed=false;confirm.checked=false;localState.textContent='字典已保存，资料版本变化，请重新核对。';}}));local.append(localDictionary);
  const ai=button('AI 生成待批准代码','btn-secondary',async()=>{ai.disabled=true;try{const result=await call('tasks/code',{question:goal.value});code.value=result.code;localState.textContent=result.explanation;localConfirmed=false;confirm.checked=false;}catch(e){localState.textContent=e.message;}finally{ai.disabled=false;}});ai.hidden=true;local.append(ai);
  const confirmLabel=el('label','research-check'),confirm=el('input');confirm.type='checkbox';confirmLabel.append(confirm,document.createTextNode('已核对以上输入摘要、方案和代码；仍需在本机批准执行'));local.append(confirmLabel);
  confirm.onchange=()=>{localConfirmed=confirm.checked;confirmedRevision=latestState.research_revision;};
  local.addEventListener('input',e=>{if(e.target!==confirm){localConfirmed=false;confirm.checked=false;}});
  mode.onchange=()=>{localFields.hidden=mode.value==='code';code.hidden=ai.hidden=mode.value!=='code';};
  local.append(button('提交到本机，等待本机批准','btn-primary',async()=>{
    try{if(!pairing?.profile||!localConfirmed||confirmedRevision!==latestState.research_revision)throw Error('输入或资料有变化，请重新核对方案。');const plan={method:method.value,predictors:[...predictors.querySelectorAll('input:checked')].map(x=>x.value),...Object.fromEntries(Object.entries(selects).map(([k,n])=>[k,n.value])),policy_year:year.value?Number(year.value):null,same_batch:same.checked,missing:drop.checked?'drop':'block',vcov:selects.cluster.value?'cluster':'hetero'};await call('tasks',{kind:mode.value,plan,code:code.value,question:goal.value,confirmed:true,input_sha256:pairing.input_sha256,research_revision:latestState.research_revision});confirm.checked=false;localConfirmed=false;await refresh();}catch(e){localState.textContent=e.message;}
  }));local.append(taskList);pane.append(local);
  async function refresh(){if(!sessionId||refreshing)return;refreshing=true;try{
    const result=await call('pairings?session_id='+encodeURIComponent(sessionId),null,'GET');
    if(result.pairing?.input_sha256!==pairing?.input_sha256){localConfirmed=false;confirm.checked=false;for(const select of Object.values(selects)){select.replaceChildren(new Option('请选择／留空',''));for(const c of result.pairing?.profile?.columns||[])select.append(new Option(c.name,c.name));}predictors.replaceChildren();for(const [i,c]of (result.pairing?.profile?.columns||[]).entries()){const label=el('label','research-check'),check=el('input');check.type='checkbox';check.value=c.name;label.append(check,document.createTextNode(`${c.name} → v${i} · 缺失${c.missing}`));predictors.append(label);}}
    if(result.pairing?.input_sha256!==pairing?.input_sha256){unitFields.replaceChildren();for(const c of result.pairing?.profile?.columns||[]){const label=el('label','research-field',c.name),n=el('input');n.dataset.column=c.name;n.maxLength=300;n.placeholder='含义；单位；口径；来源（未知标为待核实）';n.value=latestState.variable_dictionary?.[c.name]||'';label.append(n);unitFields.append(label);}}
    pairing=result.pairing;localTasks=result.tasks;localState.textContent=pairing?`${pairing.online?'助手在线':'助手离线'} · ${pairing.mcp_available?'MCP可用':'MCP未就绪'} · ${pairing.profile?.row_count||0}行 · 原始数据留本机`:'尚未配对。在本机运行 start.ps1，填写网站地址并生成配对码。';const signature=JSON.stringify(localTasks);if(signature!==tasksSignature){tasksSignature=signature;drawTasks();}
  }catch(e){localState.textContent=e.message;}finally{refreshing=false;}}
  function download(name,text){const url=URL.createObjectURL(new Blob([text],{type:'application/octet-stream'})),a=el('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  function report(task){return ['# 本机 Stata 分析报告',`导出版本：${task.record_version}`,`执行位置：本机 Stata 经 MCP；云端未独立复算。`,`原始数据与完整日志不包含在网站下载中。`,`输入 SHA256：${task.input_sha256}`,`代码 SHA256：${task.code_sha256||'待批准'}`,`资料版本：${task.research_revision}`,`方案：${JSON.stringify(task.plan)}`,`执行证据：${JSON.stringify(task.evidence_snapshot)}`,`变量字典：${JSON.stringify(task.dictionary)}`,`结果：${JSON.stringify(task.result)}`,...task.reflections.map((r,i)=>`## 第${i+1}次解释\n${r.answer}\n反馈：${JSON.stringify(r.feedback)}`)].join('\n\n');}
  function drawTasks(){taskList.replaceChildren();for(const task of localTasks.slice().reverse()){
    const card=el('article','pc-task');card.append(el('h3','',`${task.kind==='template'?researchNames[task.plan.method]:'通用批准代码'} · ${task.status}`),el('p','muted','本机执行；原始数据未上传。每次执行都需要本机批准。'));
    if(!['succeeded','failed','cancelled','interrupted'].includes(task.status))card.append(button('请求取消该任务','btn-secondary',async()=>{await call('tasks/cancel',{task_id:task.id});await refresh();}));
    if(task.result){card.append(el('p','',task.result.summary));for(const c of task.result.coefficients||[])card.append(el('p','',`${c.term==='(Intercept)'?'截距':c.term}：${c.estimate.toFixed(6)}；95%区间 [${c.ci_low.toFixed(6)}, ${c.ci_high.toFixed(6)}]`));
      card.append(button('分析报告.md','btn-secondary',()=>download('local-stata-report.md',report(task))),button('分析记录.json','btn-secondary',()=>download('local-stata-record.json',JSON.stringify(task,null,2))),button('分析报告.pdf','btn-secondary',()=>download('local-stata-report.pdf',eaPdfFromCanvases(eaRenderPdfPages(report(task))))));
      const draftKey='local-reflection:'+task.id,answer=el('textarea'),draftStatus=el('p','muted');answer.maxLength=4000;answer.value=eaDraftEntry(draftKey).value.answer||'';answer.placeholder='写下系数单位、模型控制与局限；再次提交将保留修订。';answer.setAttribute('aria-label','本机Stata结果解释');answer.addEventListener('input',()=>eaQueueDraft(draftKey,{answer:answer.value,submitted:false},draftStatus));card.append(answer,draftStatus,button('提交解释或修订','btn-primary',async()=>{try{await eaFlushDraft(draftKey);await call('tasks/reflection',{task_id:task.id,record_version:task.record_version,answer:answer.value});eaQueueDraft(draftKey,{answer:answer.value,submitted:true},draftStatus);await eaFlushDraft(draftKey);await refresh();}catch(e){localState.textContent=e.message;}}));for(const r of task.reflections||[]){const d=el('details');d.append(el('summary','','解释与反馈历史'),el('p','',r.answer),el('p','',typeof r.feedback==='string'?r.feedback:JSON.stringify(r.feedback)));card.append(d);}
    }taskList.append(card);
  }}
  setInterval(()=>{if(local.open&&!document.hidden)refresh();},5000);local.addEventListener('toggle',()=>{if(local.open)refresh();});
  if(latestState){eaHydrateDrafts(latestState);input.value=eaDraftEntry('practical-chat').value.message||'';}
  drawMessages(latestState?.practical_messages||[]);
})();
