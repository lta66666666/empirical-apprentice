let tutorialCase=null, tutorialStep=0;
async function goTutorialStep(index){if(window.eaSaveCourseCursor&&!await window.eaSaveCourseCursor({tutorial_step:index,pane:'tutorial'}))return;tutorialStep=index;renderTutorial(latestState||{});const body=$('pane-tutorial').parentElement;body.scrollTo({top:0,behavior:learningMotionReduced()?'auto':'smooth'});}
function initTutorial(){
 if(storageGet('ea_reduce_motion')==='true')document.documentElement.classList.add('motion-reduced');
 const tab=button('新手案例','',()=>selectTab('tutorial'));tab.id='tab-tutorial';tab.dataset.tab='tutorial';tab.setAttribute('role','tab');tab.setAttribute('aria-selected','false');tab.setAttribute('aria-controls','pane-tutorial');tab.tabIndex=-1;
 document.querySelector('.workspace-tabs').prepend(tab);
 const pane=el('section');pane.id='pane-tutorial';pane.hidden=true;pane.setAttribute('role','tabpanel');pane.setAttribute('aria-labelledby','tab-tutorial');document.querySelector('.workspace-body').append(pane);
 document.querySelector('.workspace-body').before(button('没有数据？从完整模拟案例开始','btn-secondary full-width',()=>selectTab('tutorial')));
 document.querySelector('.panel-toolbar').append(button('新手案例','btn-secondary',()=>{setView(true);setWorkspace(true);selectTab('tutorial');}));
 document.querySelector('.workspace-tabs').addEventListener('keydown',e=>{if(e.defaultPrevented||!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;const buttons=[...document.querySelectorAll('[data-tab]')],i=buttons.indexOf(e.target);if(i<0)return;e.preventDefault();const j=e.key==='Home'?0:e.key==='End'?buttons.length-1:(i+(e.key==='ArrowRight'?1:-1)+buttons.length)%buttons.length;buttons[j].focus();selectTab(buttons[j].dataset.tab);});
 api('/api/tutorial').then(c=>{tutorialCase=c;renderTutorial(latestState||{});}).catch(e=>pane.append(el('p','',e.message)));
}
function renderTutorial(data){
 if(!tutorialCase)return;
 if(Number.isInteger(data.learning_context?.tutorial_step))tutorialStep=data.learning_context.tutorial_step;if(typeof stopLearningAnimation==='function')stopLearningAnimation();const root=$('pane-tutorial');root.replaceChildren();
 const progress=data.tutorial||{},records=progress.records||{},steps=tutorialCase.steps;
 const next=steps.findIndex((s,i)=>!records[String(i)]?.passed),unlocked=next<0?steps.length-1:next;
 tutorialStep=Math.min(tutorialStep,unlocked);const s=steps[tutorialStep],record=records[String(tutorialStep)];
 const done=steps.filter((s,i)=>records[String(i)]?.passed).length,hero=el('header','tutorial-hero');
 hero.append(el('span','eyebrow','EMPIRICAL APPRENTICE · 新手实验室'),el('h3','',tutorialCase.title),el('p','','不需要先会写代码，也不需要准备数据。从一次判断开始，亲手发现“变化之差”。'));
 const chips=el('div','tutorial-chip-row');for(const label of ['全程模拟','无需 API 密钥','6 个小任务'])chips.append(el('span','tutorial-chip',label));hero.append(chips);
 const line=el('div','tutorial-progress-line'),progressBar=el('progress');progressBar.max=6;progressBar.value=done;progressBar.setAttribute('aria-label','案例已通过步骤');
 const motion=button(document.documentElement.classList.contains('motion-reduced')?'已减少动画':'减少动画','tutorial-motion',()=>{const reduce=!document.documentElement.classList.contains('motion-reduced');document.documentElement.classList.toggle('motion-reduced',reduce);storageSet('ea_reduce_motion',String(reduce));stopLearningAnimation();renderTutorial(latestState||{});});motion.setAttribute('aria-pressed',String(document.documentElement.classList.contains('motion-reduced')));
 line.append(el('span','',`${done}/6 步已通过`),progressBar,motion);hero.append(line);root.append(hero);
 const nav=el('nav','tutorial-nav');nav.setAttribute('aria-label','案例六步学习流程');steps.forEach((s,i)=>{const b=button('','btn-secondary',()=>goTutorialStep(i));b.append(el('span','step-orb',records[String(i)]?.passed?'✓':String(i+1)),el('span','',s.title));b.disabled=i>unlocked;b.title=i>unlocked?'先完成前面的任务':`进入第 ${i+1} 步`;b.setAttribute('aria-current',i===tutorialStep?'step':'false');nav.append(b);});root.append(nav);
 const pane=el('article','lesson-stage');root.append(pane);
 pane.append(el('h4','',`${tutorialStep+1}/6 · ${s.title}`),el('p','',s.body));
 if(tutorialStep===0){const time=el('div','tutorial-timeline');time.append(el('div','','2014：政策前；A/B 属于处理组，尚未实施'),el('div','','2015：政策后；A/B 实施，C/D 未实施'));pane.append(time);}
 if(tutorialStep===1||tutorialStep===2){const table=el('div');markdown(table,'|城市|年份|能耗指标|处理组|\n|---|---|---|---|\n'+tutorialCase.csv.trim().split('\n').slice(1).map(r=>'|'+r.split(',').join('|')+'|').join('\n'));pane.append(table,el('p','','A/B 是处理组，C/D 是对照组。每个城市两行：这就是两期面板。'));}
 if(tutorialStep===2)pane.append(el('p','','问题数据额外插入：A,2014,10,1 和 E,2014,,0。请下载对照检查。'));
 if(tutorialStep===3||tutorialStep===4){const grid=el('div','tutorial-grid');for(const text of ['处理组政策前：11','处理组政策后：8','对照组政策前：9','对照组政策后：8'])grid.append(el('div','',text));pane.append(grid,el('p','','先沿每一行看前后变化，再比较两行的变化。'));if(typeof createDidExplorer==='function')pane.append(createDidExplorer(Boolean(records['3']?.passed),tutorialCase.animation));}
 pane.append(el('h4','',s.question));s.options.forEach((option,i)=>{const b=button(option,'btn-secondary full-width tutorial-answer',()=>mutate('tutorial/answer',{step:tutorialStep,choice:i}));b.disabled=busy||!sessionId;pane.append(b);});
 if(record){const feedback=el('div','tutorial-feedback'+(record.last_correct?' correct':''));feedback.setAttribute('role','status');feedback.append(el('strong','',record.last_correct?'✓ 本次回答正确，继续探索':'再想一想：错误也是线索'),el('p','',record.feedback));pane.append(feedback);}
 if(record?.passed&&tutorialStep<5)pane.append(button('下一步 →','btn-primary',()=>goTutorialStep(tutorialStep+1)));
 if(progress.analysis&&tutorialStep>=3&&record?.passed){const details=el('details'),summary=el('summary','','查看实际审计与计算记录');details.append(summary);const report=el('div');markdown(report,progress.analysis.report_markdown);details.append(report);pane.append(details);}
 if(progress.complete&&tutorialStep===5){const finish=el('section','tutorial-completion');finish.append(el('span','completion-seal','✓'),el('h4','','第一轮探索完成'),el('p','','你已完成这组六步入门练习。自己的研究仍需真实证据；完成两期案例不意味着掌握全部实证方法。'));pane.append(finish,button('继续手算教学','btn-secondary',()=>{selectTab('analysis');setView(true);}),button('有想法、没数据：填写准备清单','btn-primary',()=>{selectTab('preparation');setView(true);}),button('已有数据：进入 R 实操','btn-secondary',()=>{selectTab('research');setView(true);}));const list=el('div');markdown(list,'### 没有数据也能推进\n1. 写下研究问题、对象和结果。\n2. 记录数据来源、年份、频率、单位与获取条件。\n3. 只有研究政策作用时才需核对原文、发布与实施日期、名单和批次。\n4. 找不到关键字段时先调整问题，不编造观察值。');pane.append(list);}
 const links=el('div','tutorial-downloads');for(const [variant,label]of [['clean','下载干净数据'],['broken','下载问题数据']]){const a=el('a','source-link',label);a.href='/api/tutorial/data/'+variant;a.download='synthetic-energy-'+variant+'.csv';links.append(a);}pane.append(links);
 const pack=el('a','resource-download','下载完整案例复算包（数据、字典说明、Python脚本）');pack.href='/api/tutorial/package';pack.download='synthetic-energy-lab.zip';pane.append(pack);
 pane.append(button('下载案例学习记录','btn-secondary',()=>{const blob=new Blob([JSON.stringify({case_id:tutorialCase.id,simulation:true,source:tutorialCase.data_source,progress},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='tutorial-record.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}));
}
initTutorial();
