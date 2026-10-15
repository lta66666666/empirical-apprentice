/* Current-turn conversation is the analysis controller; existing engines remain mounted. */
(()=>{
 if(window.EA_MODULE!=='analysis'||!window.eaConversation)return;
 const parts=window.eaConversation,top=document.querySelector('.analysis-top'),dock=document.querySelector('.analysis-dock');
 const primary=el('div','analysis-primary'),aux=el('details','analysis-aux');aux.open=true;aux.append(el('summary','','知识与当前状态'));
 const mounted=[...top.children];top.replaceChildren(primary,aux);
 for(const n of mounted)if(n===parts.lesson)aux.append(n);else primary.append(n);
 const overview=el('section','analysis-overview');primary.prepend(overview);
 const current=el('section','analysis-current-turn');current.setAttribute('aria-label','当前一轮对话');dock.querySelector('.dock-shortcuts').after(current);
 const guideBar=el('section','analysis-guide');primary.prepend(guideBar);
 let lastTaskView='overview',localView='overview',localMode='analysis',lastSession='',reflection=null,busy=false,latestReply=null,pendingAction=null;
 const names={overview:'当前练习',prepare:'研究准备',data:'数据',health:'数据体检',plan:'方案确认',execute:'执行状态',explain:'结果解释',reports:'记录与报告'};
 const cardNames={question:'研究问题',sample:'对象与时期',outcome:'结果与单位',predictor:'解释变量',data_source:'数据来源',access:'获取条件'};
 const status=parts.status;
 const scope=()=>({session:sessionId,account:window.EA_ACCOUNT?.id});
 const same=c=>c.session===sessionId&&c.account===window.EA_ACCOUNT?.id;
 function info(text){status.textContent=text;}
 function setView(view,mode=localMode){
 if(view!=='reports')lastTaskView=view;localView=view;localMode=mode;window.eaCurrentAnalysisView=view;top.dataset.mode=mode;
 overview.hidden=view!=='overview';
 for(const pane of primary.querySelectorAll(':scope > [role=tabpanel]'))pane.hidden=true;
 if(view==='prepare'){$('pane-preparation').hidden=false;}
 else if(['data','health','plan','execute','explain'].includes(view)){$('pane-research').hidden=false;eaResearchStep(view);}
 if($('pcLocalStata'))$('pcLocalStata').hidden=!['data','plan','execute'].includes(view);
 else if(view==='reports'){eaSetTask('records');return;}
 if(eaTask==='records')eaSetTask('research');
 aux.open=innerWidth>900||mode!=='analysis';renderOverview();renderGuide();
 }
 async function action(payload,buttonNode){
 if(busy){info('上一项操作正在保存，请稍候。');return null;}busy=true;if(buttonNode)buttonNode.disabled=true;const c=scope(),configuration=researchConfigEpoch;info('正在校验并保存操作…');
 try{
 if(window.eaFlushAllDrafts&&!await eaFlushAllDrafts())throw Error('草稿未保存，请先处理冲突。');
 const signature=JSON.stringify([c,payload,researchConfigEpoch]);if(!pendingAction||pendingAction.signature!==signature)pendingAction={signature,id:crypto.randomUUID()};
 const r=await api('/api/sessions/'+c.session+'/analysis/actions',{method:'POST',body:{...payload,state_version:latestState.state_version,request_id:pendingAction.id}});pendingAction=null;
 if(!same(c))return null;
 Object.assign(latestState,{state_version:r.state_version,research_revision:r.research_revision,preparation:r.preparation,variable_dictionary:r.variable_dictionary,analysis_workspace:r.analysis_workspace});
 if(r.research_summary)latestState.research_summary=r.research_summary;
 if(!document.activeElement?.closest('#pane-preparation'))renderPreparation(latestState);setView(r.analysis_workspace.view,r.analysis_workspace.mode);
 if(r.action_result?.plan&&configuration!==researchConfigEpoch){info('建议已保存，但等待期间参数有变化；未覆盖本页参数，请重新核对。');return r;}
 if(r.action_result?.plan){if(researchProfileCache){researchSetFields(researchProfileCache,{...researchCandidate(),...r.action_result.plan});eaSaveWorkbenchDraft();await eaFlushDraft('workbench');}else if(window.eaLocalSummary?.profile){window.eaApplyLocalCandidate?.(r.action_result.plan);}else throw Error('建议已保存，请载入原数据后应用字段。');}
 if(r.action_result?.requires_reconfirmation){if(researchData)researchData.dictionary={...(researchData.dictionary||{}),...r.variable_dictionary};researchInvalidate();}
 info('操作已保存。'+(r.action_result?.requires_reconfirmation?'资料已变化，原执行确认失效。':''));return r;
 }catch(e){if(e.status&&e.status!==408)pendingAction=null;info(e.message+(e.uncertain?'；原操作编号已保留，请读取最新状态或重试同一操作。':''));return null;}finally{busy=false;if(buttonNode)buttonNode.disabled=false;}
 }
 async function navigate(view,mode='analysis'){return action({action_id:'view',view,mode});}
 function renderOverview(){
 overview.replaceChildren(el('span','eyebrow','边分析边学'),el('h1','','从你的问题开始'),el('p','','在下方提出研究问题、指定操作或询问知识点；需要分步指导时，请说“带我一步步做”。'),
 el('p','workspace-note',researchData?'当前数据：'+researchData.filename+' · '+(researchProfileCache?.row_count||0)+'行':'尚未载入原始数据；可以先讨论问题和资料。'),
 el('p','workspace-note',researchJob?.status==='succeeded'?'已有真实完成结果，可进入解释和修订。':'执行结果以实际完成任务为准。'));
 const manual=el('details');manual.append(el('summary','','手动操作与现有案例'));
 for(const v of ['prepare','data','health','plan','execute','explain'])manual.append(button(names[v],'btn-secondary',()=>navigate(v)));
 overview.append(manual);
 }
 function renderGuide(){
 const g=latestState?.analysis_workspace?.guide||{};guideBar.hidden=!['active','paused','completed'].includes(g.status);guideBar.replaceChildren();if(guideBar.hidden)return;
 const sequence=['prepare','data','health','plan','execute','explain','reports'];guideBar.append(el('h3','','分步引导 · '+names[sequence[g.index||0]]),el('p','',g.status==='paused'?'引导已暂停；当前输入仍保留。':g.status==='completed'?'已到报告核验步骤。':'请完成当前操作后确认推进；系统不会自动执行。'));
 for(const [label,command]of (g.status==='paused'?[['继续引导','resume'],['退出引导','exit']]:[['我已完成这一步','next'],['暂停引导','pause'],['退出引导','exit']])){let b=button(label,'btn-secondary',()=>action({action_id:'guide',command},b));guideBar.append(b);}
 }
 function teaching(reply){
 const context=reply?.context,root=parts.lesson;root.replaceChildren(el('span','eyebrow','对应当前任务的知识'));
 const method=context?.focus_method||context?.draft_plan?.method||context?.executed_result?.plan?.method;
 root.append(el('h3','',researchNames[method]||'研究准备'),el('p','',context?.executed_result?'讲解依据：已执行任务 '+context.executed_result.id:'当前为未确认草稿；没有执行结果。'));
 for(const item of reply?.teaching||[]){const section=el('section','context-material');section.append(el('h4','',item.title));const body=el('div','prose');markdown(body,item.content);section.append(body,el('p','muted',item.section+' · '+item.version+' · '+item.review_status));if(item.source&&/^(https:\/\/|\/static\/)/.test(item.source)){const link=el('a','','查看材料来源');link.href=item.source;link.target='_blank';link.rel='noopener';section.append(link);}root.append(section);}
 if(!reply?.teaching?.length)root.append(el('p','','提问后展示与当前任务匹配的课程和操作材料。'));
 if(context?.executed_result)root.append(el('p','workspace-note','实际样本 '+context.executed_result.n_used+'；单位按执行快照核对。'));
 }
 function proposal(reply,a){
 const panel=el('section','analysis-proposal');panel.append(el('h4','','核对将要填入的内容'));const edits={},dictionaryEdits={};
 for(const [k,v]of Object.entries(a.proposal.cards||{})){const l=el('label','',cardNames[k]||k),n=el('textarea');n.value=v;n.maxLength=1500;edits[k]=n;l.append(el('small','', '原值：'+(latestState.preparation?.cards?.[k]?.value||'未填写')),n);panel.append(l);}
 for(const [k,v]of Object.entries(a.proposal.dictionary||{})){const label=el('label','','变量 '+k+' 的含义与单位'),n=el('input');n.value=v;n.maxLength=300;dictionaryEdits[k]=n;label.append(n);panel.append(label);}
 const planEdits={};if(a.proposal.plan){panel.append(el('p','muted','核对候选方法与字段；可修改后应用。'));const columns=reply.context.profile.columns.map(c=>c.name);for(const key of ['method','outcome','unit','time','treated','cluster']){const label=el('label','',({method:'方法',outcome:'结果变量',unit:'个体编号',time:'时间',treated:'处理组',cluster:'聚类字段'})[key]),n=el('select');for(const val of (key==='method'?['ols','panel_fe','did']:['',...columns]))n.append(new Option(key==='method'?researchNames[val]:val||'留空',val));n.value=a.proposal.plan[key]||'';planEdits[key]=n;label.append(n);panel.append(label);}const predictors=el('fieldset');predictors.append(el('legend','','解释变量'));planEdits.predictors=[];for(const col of columns){const l=el('label'),n=el('input');n.type='checkbox';n.value=col;n.checked=a.proposal.plan.predictors.includes(col);planEdits.predictors.push(n);l.append(n,document.createTextNode(col));predictors.append(l);}panel.append(predictors);}
 panel.append(el('p','muted','建议只写入草稿；来源不会自动标为已核对，执行仍需重新确认。'));
 let b=button('应用到草稿','btn-primary',async()=>{const result=await action({message_id:reply.id,action_id:a.id,edits:Object.fromEntries(Object.entries(edits).map(([k,n])=>[k,n.value])),dictionary_edits:Object.fromEntries(Object.entries(dictionaryEdits).map(([k,n])=>[k,n.value])),...(a.proposal.plan?{plan_edits:Object.fromEntries(Object.entries(planEdits).map(([k,n])=>[k,k==='predictors'?n.filter(x=>x.checked).map(x=>x.value):n.value]))}:{})},b);if(result){b.textContent='已应用；修改后的方案仍需确认';b.disabled=true;}});panel.append(b);return panel;
 }
 async function openAnswer(taskId){
 const c=scope();try{
 let task,local=false;const selected=window.eaSelectedTask;
 const fromReply=latestReply?.context?.executed_result;
 if((selected?.id===taskId&&['stata_local_mcp','statspai_local'].includes(selected.engine_id))||(fromReply?.id===taskId&&['local_mcp','local_python'].includes(fromReply.execution_location))){local=true;task=(await api('/api/local-stata/pairings?session_id='+c.session)).tasks?.find(t=>t.id===taskId);}
 else {try{task=await api('/api/research/jobs/'+taskId);}catch(e){if(e.status!==404&&!String(e.message).includes('404'))throw e;local=true;task=(await api('/api/local-stata/pairings?session_id='+c.session)).tasks?.find(t=>t.id===taskId);}}
 if(!same(c))return;if(!task||task.status!=='succeeded'||!task.result)throw Error('尚无已完成结果，不能提交解释。');
 reflection={task,local,session:c.session,answer_version:task.reflections?.length||0,record_version:task.record_version};
 window.eaReflectionMode=reflection;setView('explain');parts.input.placeholder=(reflection.answer_version?'修订作答':'首次解释作答')+'：请说明系数、单位及尚未验证的条件。发送即提交。';modeLabel.textContent='正式'+(reflection.answer_version?'修订':'首次解释')+'作答 · 任务 '+task.id+' · 发送即保存成果';exitMode.hidden=false;
 if(task.reflections?.length){const last=task.reflections.at(-1);current.replaceChildren(el('h3','','最新已提交解释'),el('p','',last.answer));const f=el('div','prose');markdown(f,typeof last.feedback==='string'?last.feedback:last.feedback?.answer||'');current.append(f,el('p','muted','第 '+task.reflections.length+' 次 · 任务 '+task.id));}
 info('已进入正式作答模式。普通问答可点击“返回问答”。');parts.input.focus();
 }catch(e){info(e.message);}
 }
 const modeLabel=el('p','analysis-answer-mode','普通问答 · 发送不会提交解释成果'),exitMode=button('返回问答','btn-secondary',async()=>{if(!await action({action_id:'answer_exit'}))return;reflection=null;window.eaReflectionMode=null;modeLabel.textContent='普通问答 · 发送不会提交解释成果';exitMode.hidden=true;});exitMode.hidden=true;
 parts.input.before(modeLabel,exitMode);
 window.eaConversationHistory=history=>{
 const last=[...(history||[])].reverse().find(e=>e.role==='assistant');latestReply=last;current.replaceChildren();
 if(last){
 const question=(last.request_id?history.find(e=>e.role==='user'&&e.request_id===last.request_id):null)||history[history.indexOf(last)-1];
 if(question){current.append(el('h3','','我的问题'),el('p','',question.content),button('复用到输入草稿','text-btn',()=>window.eaReusePrompt(question.content)));}
 const body=el('div','prose');markdown(body,last.content);current.append(el('h3','',last.context?'当前回复':'旧对话 · 仅供回顾'),body);if(!last.context)current.append(el('p','workspace-note','此历史回复未绑定当前任务上下文，也没有本轮行动卡。请重新提问获取当前建议；不补造历史版本或行动。'));
 for(const a of last.actions||[]){const card=el('section','analysis-action');card.append(el('strong','',a.label),el('p','',a.reason));
 if(a.kind==='apply'){const details=el('details');details.append(el('summary','','查看修改预览'),proposal(last,a));card.append(details);}
 else {let b=button(a.label,'btn-secondary',async()=>{const r=await action({message_id:last.id,action_id:a.id},b);if(r?.action_result?.reflection_task)await openAnswer(r.action_result.reflection_task);});card.append(b);}
 current.append(card);}
 current.append(el('p','muted','资料版本 '+(last.research_revision??'历史未记录')+' · '+(last.output?.prompt_version||'固定提示')+(last.related_task?' · 关联任务 '+last.related_task:'')));
 // Older DOM entries remain in the expandable history only.
 const all=[...parts.messages.children];all.slice(-2).forEach(n=>n.remove());const historyTitle=dock.querySelector('.dock-history > summary');if(historyTitle)historyTitle.textContent='较早对话 · '+parts.messages.children.length+' 条记录';
 if(!busy&&last.intent==='guided')localMode='guided';else if(!busy)localMode=last.display_mode||'analysis';
 top.dataset.mode=localMode;teaching(last);
 }else {current.append(el('p','muted','等待你的问题；没有自动开始分析。'));teaching(null);}
 };
 // A knowledge shortcut never submits its generated prompt as a student's answer.
 for(const shortcut of dock.querySelectorAll('.dock-shortcuts button,.dock-actions button')){if(shortcut.textContent==='导出报告'||shortcut.textContent==='执行分析'||shortcut===parts.submit)continue;const original=shortcut.onclick;shortcut.onclick=async()=>{if(reflection){const key=(reflection.local?'local-reflection:':'reflection:')+reflection.task.id;eaQueueDraft(key,{answer:parts.input.value,submitted:false},parts.draftStatus);if(!await eaFlushDraft(key))return;await exitMode.onclick();if(reflection)return;}return original?.();};}
 const send=parts.submit,ordinarySend=send.onclick;
 send.onclick=async()=>{
 if(!reflection)return ordinarySend();
 if(window.eaComposerKind&&window.eaComposerKind!=='question'){info('正式解释请使用自然语言；代码讲解请先返回问答。');return;}
 if(send.disabled||!parts.input.value.trim()){info('请先写下自己的解释。');return;}
 const captured=scope(),mode=reflection,text=parts.input.value;send.disabled=true;info('正在保存正式解释与反馈…');
 try{
 const path=mode.local?'/api/local-stata/tasks/reflection':'/api/research/jobs/'+mode.task.id+'/reflection';
 const r=await api(path,{method:'POST',body:{session_id:captured.session,task_id:mode.task.id,record_version:mode.record_version,answer_version:mode.answer_version,answer:text}});
 if(!same(captured)||reflection!==mode)return;
 const task=mode.local?(r.task||r):r;
 if(!mode.local)await researchWatch(mode.task.id);
 const updated=mode.local?task:researchJob;
 if(!updated?.reflections?.length)throw Error('请读取最新任务核对解释保存状态。');
 mode.task=updated;mode.answer_version=updated.reflections.length;mode.record_version=updated.record_version;
 if(parts.input.value===text){parts.input.value='';parts.input.dispatchEvent(new Event('input'));}
 const feedback=updated.reflections.at(-1);current.replaceChildren(el('h3','','我的解释已提交'),el('p','',text));const prose=el('div','prose');markdown(prose,typeof feedback.feedback==='string'?feedback.feedback:feedback.feedback?.answer||'已保存，请查看报告。');current.append(prose,el('p','muted','第 '+mode.answer_version+' 次解释 · 任务 '+mode.task.id));
 modeLabel.textContent='正式修订作答 · 任务 '+mode.task.id+' · 发送即保存成果';info('解释与反馈已保存，可继续修订或查看报告。');
 }catch(e){info('未确认提交成功，文字保留：'+e.message);}finally{send.disabled=false;}
 };
 // The execution entry opens and builds the complete confirmation card.
 for(const b of dock.querySelectorAll('button'))if(b.textContent==='执行分析')b.onclick=async()=>{if(!researchData){await navigate('data');info('先载入数据并检查字段，再整理方案。');return;}await navigate('plan');await researchMakePlan();};
 const manual=el('details','analysis-manual');manual.append(el('summary','','打开手动操作'));
 for(const v of ['overview','prepare','data','health','plan','execute','explain'])manual.append(button(names[v],'btn-secondary',()=>navigate(v)));dock.append(manual);
 const formula=el('details','analysis-formula');formula.append(el('summary','','编辑公式并预览'));const formulaInput=el('textarea'),formulaPreview=el('output');formulaInput.setAttribute('aria-label','公式表达式');formulaInput.placeholder='例如 y = β₀ + β₁x + ε';formulaInput.oninput=()=>{formulaPreview.textContent=formulaInput.value;eaQueueDraft('analysis-formula',{formula:formulaInput.value},null);};formula.append(formulaInput,formulaPreview);dock.append(formula);
 const taskChanged=window.eaTaskChanged;window.eaTaskChanged=task=>{taskChanged?.(task);if(task!=='records')setView(localView==='reports'?lastTaskView:localView,localMode);};
 const restore=eaRestoreTask;eaRestoreTask=function(data,previous){const out=restore(data,previous);const changed=lastSession!==data.session_id;if(changed){lastSession=data.session_id;reflection=null;window.eaReflectionMode=null;exitMode.hidden=true;const wb=data.research_drafts?.workbench;localView=wb?.updated_at>(data.analysis_workspace?.updated_at||0)?wb.value.ui_view||'overview':data.analysis_workspace?.view||'overview';localMode=data.analysis_workspace?.mode||'analysis';}else if(data.analysis_workspace){localView=data.analysis_workspace.view;localMode=data.analysis_workspace.mode;}
 if(eaTask!=='records')setView(localView,localMode);renderGuide();window.eaConversationHistory(data.practical_messages||[]);
 formulaInput.value=eaDraftEntry('analysis-formula').value.formula||'';formulaPreview.textContent=formulaInput.value;if(changed&&data.analysis_workspace?.answer_task)openAnswer(data.analysis_workspace.answer_task);return out;};
 // Resources belong in the upper knowledge area, not an independent drawer.
 for(const b of document.querySelectorAll('.module-toolbar button'))if(b.textContent==='资料与手册')b.onclick=()=>{localMode='knowledge';top.dataset.mode='knowledge';aux.open=true;teaching(latestReply);};
 window.eaOpenAnswer=openAnswer;const previousStep=eaResearchStep;eaResearchStep=function(v){previousStep(v);localView=v;lastTaskView=v;overview.hidden=true;window.eaCurrentAnalysisView=v;for(const pane of primary.querySelectorAll(':scope > [role=tabpanel]'))pane.hidden=pane.id!=='pane-research';eaSaveWorkbenchDraft();};
 renderOverview();setView(latestState?.analysis_workspace?.view||'overview');if(latestState)eaRestoreTask(latestState,null);
})();
