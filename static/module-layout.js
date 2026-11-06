(()=>{
  const mode=window.EA_MODULE||'learn';document.body.classList.add('module-'+mode);
  const leave=async action=>{if(await window.eaBeforeLeave?.()===false)return;window.eaPreserveInputs?.();if(window.eaFlushAllDrafts&&!await window.eaFlushAllDrafts()){toast('草稿尚未保存，请先处理保存错误。');return;}return action();};
  const toolbar=el('header','module-toolbar');const home=el('a','','返回首页');home.href='/home';home.onclick=e=>{e.preventDefault();leave(()=>location.assign(home.href));};const title=el('strong','',mode==='learn'?'定向导学':'边分析边学');toolbar.append(home,title);
  let shell,top,dock,recordsPanel,returnTask=mode==='analysis'?'research':'learn',courseScreen='directory';
  const returnButton=button('返回当前任务','btn-secondary',()=>eaSetTask(returnTask));returnButton.hidden=true;
  window.eaOpenRecords=()=>showRecords();
  const reportButton=button('记录与报告','btn-secondary',()=>showRecords());
  toolbar.append(button('新练习','btn-secondary',()=>leave(()=>newSessionDialog())),reportButton,returnButton,button('历史练习','btn-secondary',()=>leave(()=>pastDialog())));
  const moduleLink=el('a','',mode==='learn'?'边分析边学':'定向导学');moduleLink.href=mode==='learn'?'/analysis':'/learn';moduleLink.onclick=e=>{e.preventDefault();leave(()=>location.assign(moduleLink.href));};toolbar.append(moduleLink);
  toolbar.append(button('减少动画','btn-secondary',()=>{document.documentElement.classList.toggle('motion-reduced');storageSet('ea_motion_reduced',document.documentElement.classList.contains('motion-reduced')?'1':'0');if(document.documentElement.classList.contains('motion-reduced'))window.stopLearningAnimation?.();}),button('退出','text-btn',()=>leave(async()=>{try{await api('/api/auth/logout',{method:'POST',body:{}});location.replace('/login');}catch(e){toast('退出未完成：'+e.message);}})));document.body.prepend(toolbar);const operationStatus=el('span','module-operation-status');operationStatus.id='eaOperationStatus';operationStatus.setAttribute('role','status');toolbar.append(operationStatus);
  function showRecords(){if(eaTask!=='records')returnTask=eaTask;eaSetTask('records');}
  const directory=el('section','course-directory');directory.id='eaCourseDirectory';directory.hidden=mode!=='learn';
  const previewLesson=el('section','course-preview');previewLesson.id='eaCoursePreview';previewLesson.hidden=true;
  if(mode==='learn'){
    const directoryButton=button('八阶段目录','btn-secondary',()=>showDirectory());directoryButton.id='eaCourseMap';toolbar.insertBefore(directoryButton,reportButton);
    document.querySelector('.layout').before(directory,previewLesson);
  }
  async function openLesson(id,kind){
    if(await window.eaBeforeLeave?.()===false)return;
    const oldScreen=courseScreen;courseScreen='lesson';
    if(await mutate('course/open',{lesson_id:id,mode:kind})){eaSetTask('learn');window.eaRenderCourse(latestState);}
    else{courseScreen=oldScreen;window.eaRenderCourse(latestState);}
  }
  function showDirectory(){courseScreen='directory';eaSetTask('learn');window.eaRenderCourse(latestState);}
  window.eaSaveCourseCursor=async value=>mutate('course/open',{mode:'cursor',...value},{render:false});
  window.eaCourseProjection=data=>{
    const context=data.learning_context;if(!context)return data;
    return {...data,stage:context.status==='active'?'lesson':context.status==='completed'?'project_choice':'entry',
      lesson_ui:data.course?.lesson_ui||data.lesson_ui,conversation:context.conversation||[],entry_path:'zero'};
  };
  const originalMain=renderMain;renderMain=function(data){originalMain(mode==='learn'?window.eaCourseProjection(data):data);};
  window.eaRenderCourse=data=>{
    if(mode!=='learn'||!data)return;
    const layout=document.querySelector('.layout'),context=data.learning_context||{},course=data.course;
    directory.hidden=eaTask!=='learn'||courseScreen!=='directory';previewLesson.hidden=true;
    layout.hidden=eaTask==='learn'&&courseScreen==='directory';
    if(eaTask!=='learn')return;
    if(courseScreen==='directory'){
      directory.replaceChildren(el('span','eyebrow','定向导学'),el('h1','','八阶段学习目录'),el('p','workspace-note','按顺序完成看图、练习与成果。已完成阶段可回顾，后续阶段可先预览；分析输入与结果保持原样。'));
      if(!course){directory.append(el('p','workspace-note','正在读取学习目录…'));return;}
      const ui=data.course?.lesson_ui||data.lesson_ui;
      const done=course.lessons.filter(x=>x.completed).length,total=course.lessons.length,current=course.lessons.find(x=>x.status==='current');
      const progress=el('div','course-progress');
      const meter=el('div','course-progress-meter');meter.setAttribute('role','progressbar');meter.setAttribute('aria-valuemin','0');meter.setAttribute('aria-valuemax',String(total));meter.setAttribute('aria-valuenow',String(done));meter.setAttribute('aria-label',`已完成 ${done} / ${total} 阶段`);
      const fill=el('span','course-progress-fill');fill.style.width=`${total?Math.round(done/total*100):0}%`;meter.append(fill);
      progress.append(el('span','course-progress-text',`已完成 ${done}/${total} 阶段`),meter);
      if(current){
        const pos=ui&&ui.lesson_id===current.id?(ui.step_type==='checkpoint'?'成果整理':`第 ${ui.step_idx+1}/${ui.total_steps} 题`):'';
        progress.append(button(context.status==='not_started'?'开始阶段 1':`继续：阶段 ${current.id}${pos?' · '+pos:''}`,'btn-primary course-resume',()=>openLesson(current.id,'continue')));
      }else if(done===total)progress.append(el('span','course-progress-text','全部阶段已完成，可回顾或导出记录'));
      directory.append(progress);
      const grid=el('div','course-grid');
      for(const item of course.lessons){
        const card=el('article','course-card'),kind=item.status==='completed'?'review':item.status==='current'?'continue':'preview';
        const record=data.lesson_records?.find(r=>r.stage===item.id),mastery=item.completed?lessonMastery(record):null;
        const stateText=item.status==='completed'?(mastery&&mastery.key!=='done'?`${mastery.label} · 可回顾`:'已完成 · 可回顾'):item.status==='current'?(context.status==='not_started'?'下一步 · 可开始':'当前阶段 · 可继续'):'后续阶段 · 可预览';
        const pos=ui&&ui.lesson_id===item.id?(ui.step_type==='checkpoint'?'成果整理':`第 ${ui.step_idx+1}/${ui.total_steps} 题`):'';
        const label=kind==='review'?'回顾本阶段':kind==='continue'?(context.status==='not_started'?'开始学习':(pos?`继续：${pos}`:'继续本阶段')):'预览内容';
        card.append(el('span','course-state',stateText),el('h2','',`${String(item.id).padStart(2,'0')} ${item.title}`),el('p','',item.goal),el('p','muted',`建议 ${item.duration} · ${item.output}`),button(label,kind==='continue'?'btn-primary':'btn-secondary',()=>openLesson(item.id,kind)));
        if(item.completed&&kind==='continue')card.append(button('回顾已完成练习','btn-secondary',()=>openLesson(item.id,'review')));
        grid.append(card);
      }
      directory.append(grid);return;
    }
    if(['preview','review'].includes(context.view_mode)){
      const item=data.outline?.find(value=>value.id===context.view_lesson_id);if(!item){showDirectory();return;}
      layout.hidden=true;previewLesson.hidden=false;previewLesson.replaceChildren(button('返回八阶段目录','btn-secondary',showDirectory),el('p','course-state',context.view_mode==='review'?'已完成阶段回顾 · 不改变学习进度':'后续阶段预览 · 不作答、不改变学习进度'),el('h1','',item.title));
      if(context.view_mode==='review')previewLesson.append(Teaching.review(item));else{const intro=el('div','prose');markdown(intro,item.intro);previewLesson.append(intro,...Teaching.visuals(item),Teaching.details(item));}return;
    }
    if(context.status==='completed'){
      $('quickActions').replaceChildren(button('继续手算教学','btn-secondary',()=>eaSetTask('hand')),button('进入边分析边学','btn-primary',()=>leave(()=>location.assign('/analysis'))),button('整理研究准备','btn-secondary',()=>eaSetTask('prepare')),button('查看学习记录','btn-secondary',showRecords));
    }
  };
  window.eaTaskChanged=task=>{
    returnButton.hidden=task!=='records';if(task==='records'){if(eaPreviousTask!=='records')returnTask=eaPreviousTask;const pane=$('pane-records');pane.setAttribute('aria-busy','true');operationStatus.textContent='正在同步任务、解释和报告版本…';Promise.resolve(window.eaRefreshRecords?.()).finally(()=>{pane.setAttribute('aria-busy','false');operationStatus.textContent='';});}
    if(mode==='analysis'&&shell){
      if(task==='records'){
        if(!recordsPanel){recordsPanel=el('section','module-records');recordsPanel.append(button('返回当前任务','btn-secondary',()=>eaSetTask(returnTask)),$('pane-records'));document.body.append(recordsPanel);}
        $('pane-records').hidden=false;recordsPanel.hidden=false;shell.hidden=true;
      }else{if(recordsPanel)recordsPanel.hidden=true;shell.hidden=false;const tab=({prepare:'preparation',hand:'analysis',tutorial:'tutorial'})[task]||'research';for(const id of ['research','preparation','analysis','tutorial']){const pane=$('pane-'+id);if(pane) pane.hidden=id!==tab;}}
    }
    window.eaRenderCourse(latestState);
  };
  window.eaDisplayMode=(value)=>{if(top)top.dataset.mode=['analysis','knowledge','guided'].includes(value)?value:'analysis';};
  if(mode==='analysis'){
    const parts=window.eaConversation;if(!parts)return;
    shell=el('main','analysis-shell');top=el('section','analysis-top');top.dataset.mode='analysis';dock=el('section','analysis-dock');for(const id of ['research','preparation','analysis','tutorial']){const pane=$('pane-'+id);if(pane)top.append(pane);}top.append(parts.lesson);parts.conversation.remove();dock.append(parts.dialogue);shell.append(top,dock);toolbar.after(shell);
    const shortcuts=el('div','dock-shortcuts');const history=el('details','dock-history'),summary=el('summary','','对话历史 · 尚未开始');history.append(summary,parts.messages);parts.dialogue.prepend(shortcuts,history);
    window.eaConversationHistory=(messages)=>{const last=messages?.at(-1);if(last?.role==='assistant'){let answer=parts.lesson.querySelector('.knowledge-reading');if(!answer){answer=el('div','knowledge-reading');parts.lesson.prepend(answer);}markdown(answer,last.content);}summary.textContent=last?'对话历史 · '+last.content.replace(/\s+/g,' ').slice(0,70):'对话历史 · 尚未开始';};
    const input=parts.input;input.maxLength=16000;let intent='auto',dataText='',inputKind='question';
    const note=el('p','dock-mode','自然语言模式 · 方案需要核对后执行'),format=el('div','dock-format'),actions=el('div','dock-actions');parts.dialogue.insertBefore(format,input);parts.dialogue.insertBefore(note,input);
    const select=el('select');select.setAttribute('aria-label','输入内容类型');for(const [key,label]of [['question','自然语言'],['code','代码'],['data','CSV/TSV数据片段']])select.append(new Option(label,key));format.append(select);
    window.eaReusePrompt=(text)=>{if(window.eaSetComposerText?.(text,{confirmReplace:true})===false)return false;select.value='question';select.onchange();return true;};
    select.onchange=()=>{inputKind=select.value;window.eaComposerKind=inputKind;if(inputKind!=='data'&&typeof pendingFragment!=='undefined'){pendingFragment=null;useFragment.hidden=true;preview.hidden=true;}input.placeholder=inputKind==='data'?'粘贴包含表头的CSV/TSV。数据只用于检查，原始观测不发模型。':inputKind==='code'?'粘贴需讲解的代码；通用Stata执行仍须在本机批准。':'写下你的问题或下一步操作目标';};
    function insert(text){input.setRangeText(text,input.selectionStart,input.selectionEnd,'end');input.dispatchEvent(new Event('input'));input.focus();}
    format.append(button('加粗','text-btn',()=>insert('**重点**')),button('代码块','text-btn',()=>insert('\n```stata\n\n```\n')),button('插入公式','text-btn',()=>insert('β̂ = (XᵀX)⁻¹Xᵀy')));
    let uploadEpoch=0;const upload=el('input');upload.type='file';upload.accept='.csv,.tsv';upload.hidden=true;upload.onchange=async()=>{const file=upload.files[0],epoch=++uploadEpoch,id=sessionId;if(!file)return;if(file.size>2000000){note.textContent='文件超过2MB上限';return;}try{const text=await file.text();if(epoch!==uploadEpoch||id!==sessionId)return;if(input.value.trim()&&input.value!==text&&!confirm('用文件内容替换当前未发送文字？'))return;dataText=text;input.value=dataText;select.value='data';select.onchange();input.dispatchEvent(new Event('input'));note.textContent='片段已载入，请先预览检查；未发送给模型。';}catch(e){note.textContent='文件读取失败：'+e.message;}};format.append(button('上传数据片段','text-btn',()=>upload.click()),upload);
    const preview=el('pre','fragment-preview');preview.hidden=true;parts.dialogue.insertBefore(preview,input);
    let pendingFragment=null,fragmentEpoch=0;
    const useFragment=button('确认载入数据片段','btn-secondary',async()=>{if(!pendingFragment||await window.eaBeforeLeave?.()===false)return;if(researchData&&!confirm('确认用这个数据片段替换当前输入？原方案将失效。'))return;const fragment=pendingFragment,id=sessionId;useFragment.disabled=true;try{if(!await window.eaLoadResearchInput({text:fragment.text,filename:fragment.filename,simulated:false,source:'学生提供的数据片段；来源待核对',dictionary:{}},fragment.profile,{}))return;pendingFragment=null;preview.hidden=true;if(sessionId!==id)return;eaResearchStep('health');note.textContent='已载入。请补充来源与变量单位；未向模型发送原始观测。';useFragment.hidden=true;}catch(e){note.textContent='载入未完成：'+e.message;}finally{useFragment.disabled=false;}});useFragment.hidden=true;parts.dialogue.insertBefore(useFragment,input);
    input.addEventListener('input',()=>{fragmentEpoch++;if(pendingFragment&&input.value!==pendingFragment.text){pendingFragment=null;useFragment.hidden=true;preview.hidden=true;note.textContent='输入已修改，请重新预览数据片段。';}});
    async function inspectFragment(){const text=input.value,id=sessionId,epoch=++fragmentEpoch;note.textContent='正在本机解析数据片段…';try{const filename=text.split('\n')[0].includes('\t')?'fragment.tsv':'fragment.csv';const parsed=await window.eaParseFragmentAsync(text,filename);if(id!==sessionId||epoch!==fragmentEpoch||text!==input.value)return false;pendingFragment={text,filename,profile:parsed.profile};preview.textContent=text.split('\n').slice(0,6).join('\n');preview.hidden=false;useFragment.hidden=false;note.textContent='本地预览 '+parsed.profile.row_count+' 行、'+parsed.profile.columns.length+' 列。点击确认载入后才能进入分析；原始观测不发模型。';return true;}catch(e){pendingFragment=null;useFragment.hidden=true;note.textContent=e.message;return false;}}
    const send=parts.submit;send.textContent='发送';send.remove();actions.append(send,button('执行分析','btn-primary',()=>{if(!researchData){note.textContent='还没有数据：请先点“用示范数据跑一次”，或上传 CSV/TSV。';document.querySelector('.analysis-start')?.scrollIntoView({block:'nearest'});return;}window.eaDisplayMode('analysis');eaResearchStep('plan');note.textContent='先整理完整方案并核对；这里不会直接开始计算。';$('researchConfirm').closest('label')?.scrollIntoView({block:'nearest'});}),button('知识点讲解','btn-secondary',()=>{intent='knowledge';window.eaDisplayMode('knowledge');send.click();}));parts.dialogue.append(actions);
    const originalSend=send.onclick;send.onclick=async()=>{if(inputKind==='data'){await inspectFragment();return;}window.eaChatIntent=intent;window.eaChatCode=inputKind==='code'?input.value:'';if(inputKind==='code'){const clean=input.value.replace(/(?:[A-Za-z]:\\|\/home\/|\/Users\/)[^\s"']+/g,'[本机路径]').replace(/\binput\b[\s\S]*?\bend\b/gi,'[逐行数据已省略]');window.eaChatCode=clean;input.value='请讲解以下代码，不能声称已经执行：\n'+clean;}await originalSend();intent='auto';window.eaChatCode='';};
    for(const [label,prompt,key]of [['解释当前结果','请解释当前已执行结果的系数、单位与局限。','reflection'],['内生性检查思路','讲解内生性检查思路、需要的条件和当前缺口；不要声称检验已执行。','knowledge'],['稳健性方案','推荐有依据的稳健性分析方案，说明当前执行能力与局限。','knowledge'],['导出报告','', 'export'],['讲解知识点','请讲解当前方法的核心假设与常见误区。','knowledge']])shortcuts.append(button(label,'btn-secondary',()=>{if(key==='export'){showRecords();return;}if(send.disabled){note.textContent='上一条请求仍在处理，请等待完成后再使用快捷指令。';return;}if(window.eaSetComposerText?.(prompt,{confirmReplace:true})===false)return;select.value='question';select.onchange();intent=key;send.click();}));
    parts.dialogue.append(button('将代码填入本机Stata批准区','text-btn',()=>{if(inputKind!=='code'||!input.value.trim()){note.textContent='请切换代码模式并粘贴代码。';return;}const target=window.eaLocalCode;if(!target){note.textContent='本机代码面板未就绪';return;}window.eaLocalCodeMode?.();target.value=input.value;target.dispatchEvent(new Event('input'));$('pcLocalStata').open=true;target.scrollIntoView({block:'center'});note.textContent='代码仅填入草稿；配对、网站确认及本机批准后才可执行。';}));
  }
  const oldSample=researchSample;researchSample=async function(name){if(researchData&&researchData.fixture_method!==name&&!confirm('确认切换模拟案例？当前输入和方案将替换，旧结果保留。'))return;return oldSample(name);};
  const originalDraw=researchDrawJob;researchDrawJob=function(job){originalDraw(job);if(mode!=='analysis')return;const lesson=window.eaConversation?.lesson;if(!lesson)return;let metrics=lesson.querySelector('.task-metrics');if(!metrics){metrics=el('section','task-metrics');lesson.prepend(metrics);}metrics.replaceChildren(el('h3','','当前执行摘要'),el('p','',job.description?.label||job.plan?.method||'当前任务'),el('p','',job.status+' · '+(job.execution_location==='cloud_native'?'云端原生执行':'浏览器webR执行')));if(job.status==='succeeded'&&job.result){metrics.append(el('p','', '实际估计 '+job.result.n_used+' 行'));for(const c of job.result.coefficients||[])if(job.plan?.predictors?.includes(c.term)||job.plan?.method==='did')metrics.append(el('p','',c.term+'：'+c.estimate+'；95%区间 ['+c.ci_low+', '+c.ci_high+']'));metrics.append(el('p','muted','单位按执行快照核对：'+JSON.stringify(job.dictionary||{})));}else metrics.append(el('p','muted','尚无可用完成结果。'));};
  const previousRestore=eaRestoreTask;eaRestoreTask=function(data,previous){previousRestore(data,previous);if(!previous||previous.session_id!==data.session_id){courseScreen='directory';returnTask=mode==='analysis'?'research':'learn';eaSetTask(returnTask);}window.eaRenderCourse(data);if(mode==='learn'&&data.learning_context?.status==='active'){const context=data.learning_context,key=`ea_course_answer:${data.session_id}:${context.lesson_id}:${context.step_idx}`,saved=storageGet(key);const target=data.course?.lesson_ui?.step_type==='calc'?$('calcInput'):$('userInput');if(saved&&target&&document.activeElement!==target)target.value=saved;}window.eaConversationHistory?.(data.practical_messages||[]);};
  document.addEventListener('input',event=>{if(mode!=='learn'||!['userInput','calcInput'].includes(event.target.id))return;const context=latestState?.learning_context;if(context?.status==='active')storageSet(`ea_course_answer:${sessionId}:${context.lesson_id}:${context.step_idx}`,event.target.value);});
  if(latestState)eaRestoreTask(latestState,null);
  document.querySelectorAll('.storage-note').forEach(n=>{n.textContent='记录归属当前账号；练习与文件按最后活动七天到期，账号持续保留。到期一小时内物理清理尚未验收，请提前导出。';});
  fetch('/api/auth/legacy-claim').then(r=>r.json()).then(info=>{if(!info.count||info.already_claimed)return;const box=el('section','legacy-claim');box.append(el('p','',`当前浏览器有 ${info.count} 项旧练习。确认认领后绑定到此账号，原七天期限不延长。`),button('确认认领旧记录','btn-secondary',async()=>{await api('/api/auth/legacy-claim',{method:'POST',body:{confirmed:true}});const legacy=localStorage.getItem('ea_session_id');if(legacy)storageSet('ea_session_id',legacy);location.reload();}),button('暂不认领','text-btn',()=>box.remove()));toolbar.after(box);}).catch(()=>{});
})();
