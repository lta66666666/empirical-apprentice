/* A conversation first workspace; detail controllers stay mounted in a review dialog. */
(()=>{
 if(window.EA_MODULE!=='analysis'||!window.eaConversation)return;
 document.body.classList.add('coach-minimal');const resizeViewport=()=>{if(window.visualViewport)document.body.style.setProperty('--coach-height',window.visualViewport.height+'px');};window.visualViewport?.addEventListener('resize',resizeViewport);resizeViewport();
 const parts=eaConversation,shell=document.querySelector('.analysis-shell'),top=shell.querySelector('.analysis-top'),dock=shell.querySelector('.analysis-dock');
 const left=el('aside','coach-knowledge'),center=el('section','coach-center'),right=el('aside','coach-materials'),feed=el('div','coach-feed');
 left.append(el('h2','','相关知识'),parts.lesson);right.append(el('h2','','本次研究'));
 const rightBody=el('div');right.append(rightBody);center.append(feed,dock);shell.replaceChildren(left,center,right);
 const review=el('dialog','coach-review'),reviewTitle=el('h2','','核对资料与分析建议'),reviewBody=el('div'),reviewClose=button('关闭','text-btn',()=>review.close());
 review.append(reviewTitle,reviewClose,reviewBody,top);document.body.append(review);top.classList.add('coach-controller');
 const toolbar=document.querySelector('.module-toolbar'),home=toolbar.querySelector('a'),brand=toolbar.querySelector('strong'),more=el('details','coach-more');
 const menu=el('div','coach-menu');more.append(el('summary','','更多'),menu);for(const n of [...toolbar.children])if(n!==home&&n!==brand&&n.id!=='eaOperationStatus')menu.append(n);
 toolbar.replaceChildren(home,brand,button('知识','text-btn',()=>showSidebar(left)),button('材料','text-btn',()=>showSidebar(right)),more);
 const sideDialog=el('dialog','coach-side-dialog');sideDialog.append(button('关闭','text-btn',()=>sideDialog.close()));document.body.append(sideDialog);
 function showSidebar(panel){const prior=sideDialog.querySelector('aside');if(prior)shell.insertBefore(prior,prior===left?shell.firstChild:null);sideDialog.append(panel);sideDialog.showModal();}
 sideDialog.addEventListener('close',()=>{const p=sideDialog.querySelector('aside');if(p)shell.insertBefore(p,p===left?shell.firstChild:null);});
 let history=[],shown=8,lastReply=null,lastRendered='',queryBusy=false,dataEpoch=0;
 const historyHook=window.eaConversationHistory;
 window.eaConversationHistory=messages=>{history=messages||[];historyHook(messages);lastReply=[...history].reverse().find(x=>x.role==='assistant');paintFeed();paintMaterials();};
 function paintFeed(){
 feed.replaceChildren();
 if(!history.length){feed.append(el('h1','','你想研究什么？'),el('p','coach-welcome','直接说出你的目标。我会根据你的回答补问，需要政策材料或数据时再请你提交。'));return;}
 if(history.length>shown)feed.append(button('更早对话','text-btn',()=>{shown+=10;paintFeed();}));
 for(const item of history.slice(-shown)){const row=el('article','coach-message '+item.role),body=el('div','prose');row.append(el('small','',item.role==='user'?'你':'实证学徒'));
 if(item.role==='assistant'&&(!item.context||item.output?.prompt_version==='ea-candidate-v4-dialogue')){const old=el('details');old.append(el('summary','','查看之前的回复'));markdown(body,item.content);old.append(body);row.append(old);}
 else {if(item.role==='assistant'&&item.content.length>600){row.append(el('p','',item.content.slice(0,240)+'…'),el('small','muted','讲解预览'));const full=el('details');full.append(el('summary','','展开完整讲解'));markdown(body,item.content);full.append(body);row.append(full);}else{markdown(body,item.content);row.append(body);}}
 feed.append(row);}
 feed.scrollTop=feed.scrollHeight;
 }
 const actualFacts=()=>Object.fromEntries(Object.entries(latestState?.preparation?.cards||{}).map(([k,c])=>[k,c.value]));
 function paintMaterials(){
 rightBody.replaceChildren();const facts={...actualFacts(),...Object.assign({},...history.filter(m=>m.role==='assistant').map(m=>m.proposal?.cards||{}))};
 const factsBox=el('div','coach-facts');for(const [k,label]of [['question','目标'],['sample','对象与时期'],['outcome','结果'],['policy_name','政策名称'],['policy_doc','政策材料']])if(facts[k])factsBox.append(el('small','',label),el('p','',facts[k]));if(factsBox.children.length)rightBody.append(factsBox,el('small','muted','对话整理的资料，仍需核对。'));
 if(researchJob?.status==='running'){rightBody.append(el('p','','分析正在实际运行。'),button('查看运行情况','btn-secondary',()=>openController('execute','运行情况')));return;}
 if(researchJob?.status==='succeeded'&&researchJob.result&&researchJob.input_sha256===eaInputHash&&researchJob.research_revision===latestState.research_revision){
 const result=researchJob.result,c=result.coefficients?.find(x=>researchJob.plan.predictors?.includes(x.term))||result.coefficients?.[0];
 rightBody.append(el('h3','','分析结果'),el('p','',result.n_used+' 个实际估计样本'));
 if(c)rightBody.append(el('p','',c.term+'：'+Number(c.estimate).toPrecision(5)),el('small','', '95%区间 ['+Number(c.ci_low).toPrecision(5)+', '+Number(c.ci_high).toPrecision(5)+']'));
 rightBody.append(button('写下我的解释','btn-primary',async()=>{await eaOpenAnswer(researchJob.id);review.close();}),button('查看结果与报告','text-btn',()=>openController('explain','结果与报告')));return;
 }
 const apply=!latestState?.analysis_workspace?.applied?.some(x=>x.message_id===lastReply?.id&&x.action_id==='apply')?lastReply?.actions?.find(a=>a.kind==='apply'&&a.proposal.plan):null;
 if(apply){rightBody.append(el('h3','','分析建议'),el('p','',(researchNames[apply.proposal.plan.method]||'方法待核对')+' · '+apply.proposal.plan.outcome),button('核对建议','btn-primary',openProposal));return;}
 if(researchData){rightBody.append(el('p','','已收到 '+researchData.filename),el('small','',(researchProfileCache?.row_count||0)+' 行，'+(researchProfileCache?.columns?.length||0)+' 列。'));return;}
 const ask=lastReply?.content||'';
 if(/政策原文|政策文件|政策材料|政策链接/.test(ask))rightBody.append(button('提交政策材料','btn-primary',()=>openMaterials('policy')));
 else if(/提交.*数据|上传|数据文件|CSV|可用数据/.test(ask))rightBody.append(button('提交数据','btn-primary',()=>openMaterials('data')));
 else if(history.filter(x=>x.role==='user').at(-1)?.content.match(/stata/i)&&!window.eaLocalSummary?.profile)rightBody.append(button('连接本机Stata','btn-primary',()=>openController('data','本机Stata连接',true)));
 else if(!factsBox.children.length)rightBody.append(el('p','muted','需要材料时，我会在这里告诉你提交什么。'));
 }
 function openController(view,title,local=false){$('pane-research').classList.toggle('coach-local-view',local);if(local){$('pcLocalStata').hidden=false;$('pcLocalStata').open=true;}reviewTitle.textContent=title;reviewBody.replaceChildren();top.hidden=false;window.eaCurrentAnalysisView=view;eaResearchStep(view);review.showModal();}
 function openProposal(){
 const source=document.querySelector('.analysis-current-turn .analysis-proposal');if(!source){parts.status.textContent='建议已变化，请重新提问。';return;}
 reviewTitle.textContent='核对 AI 整理的资料';reviewBody.replaceChildren();top.hidden=true;
 const facts=lastReply.proposal?.cards||{};for(const [k,v]of Object.entries(facts))reviewBody.append(el('p','',({question:'目标',sample:'对象与时期',outcome:'结果与单位',predictor:'解释变量',data_source:'来源',access:'使用条件',policy_name:'政策名称',policy_doc:'政策材料',effective_date:'实施日期',treated_list:'实施对象',comparison:'比较对象'})[k]+ '：'+v));
 const edits=el('details');edits.append(el('summary','','需要修改？'));const apply=source.querySelector('.btn-primary');for(const n of [...source.children])if(n!==apply)edits.append(n);reviewBody.append(edits,apply);
 const runNext=button('继续核对执行方案','btn-primary',async()=>{top.hidden=false;eaResearchStep('plan');if(!researchData&&window.eaLocalSummary?.profile){$('pane-research').classList.add('coach-local-view');$('pcLocalStata').hidden=false;$('pcLocalStata').open=true;reviewTitle.textContent='本机Stata确认与批准';}else if(!$('researchEngine').value)researchNotice('请选择执行软件，再点击整理方案。确认后才会计算。');else await researchMakePlan();});
 runNext.hidden=true;reviewBody.append(runNext);const originalApply=apply.onclick;apply.onclick=async()=>{await originalApply();if(apply.textContent.includes('已应用')){runNext.hidden=false;apply.hidden=true;edits.open=false;paintMaterials();}};
 review.showModal();
 }
 const materialDialog=el('dialog','coach-upload');materialDialog.append(button('关闭','text-btn',()=>materialDialog.close()));const materialBody=el('div');materialDialog.append(materialBody);document.body.append(materialDialog);
 function openMaterials(kind){
 materialBody.replaceChildren(el('h2','',kind==='policy'?'提交政策资料':'提交数据'));
 if(kind==='data'){
 const note=el('p','','支持 CSV / TSV，最多2MB。原始观测不会发给模型。'),file=$('researchFile');file.setAttribute('aria-label','提交CSV或TSV数据');
 materialBody.append(note,file,button('使用现有教学数据','text-btn',()=>{const choices=el('div');for(const [key,label]of Object.entries(researchNames))choices.append(button(label,'btn-secondary',async()=>{await researchSample(key);materialDialog.close();paintMaterials();await askFromAction('我已选择现有模拟教学数据，请告诉我下一步需要补充什么。');}));materialBody.append(choices);}));
 }else{
 const url=el('input'),text=el('textarea'),file=el('input');url.type='url';url.placeholder='政策原文链接（可选）';url.setAttribute('aria-label','政策原文链接');text.placeholder='粘贴与研究有关的政策段落、实施日期等';text.setAttribute('aria-label','政策材料内容');text.maxLength=1500;file.type='file';file.accept='.txt,.md';
 file.onchange=async()=>{const f=file.files[0];if(f){if(f.size>2000000){parts.status.textContent='资料超过2MB，请提交相关段落。';return;}text.value=(await f.text()).slice(0,1500);}};
 materialBody.append(url,text,el('small','muted','可以粘贴原文或上传TXT/Markdown；保留来源，尚未自动核实。'),file,button('提交给本次研究','btn-primary',async()=>{
 if(!text.value.trim()&&!url.value.trim())return;const answer=text.value.trim()||'政策原文链接：'+url.value;
 if(!await mutate('preparation/type',{question_type:'policy_evaluation'},{method:'PUT'}))return;
 if(!await mutate('preparation/cards/policy_doc',{value:answer,source_url:url.value,source_title:'学生提交的政策材料',verify:false},{method:'PUT'}))return;
 materialDialog.close();await askFromAction('我提交了政策资料。请结合材料追问下一个必要条件。');
 }));
 }materialDialog.showModal();
 }
 const upload=button('＋ 提交材料','coach-attach',()=>{materialBody.replaceChildren(el('h2','','你要提交什么？'),button('数据 CSV / TSV','btn-primary',()=>openMaterials('data')),button('政策原文或链接','btn-secondary',()=>openMaterials('policy')));materialDialog.showModal();});
 parts.input.before(upload);
 const originalFile=$('researchFile').onchange;$('researchFile').onchange=async e=>{const epoch=++dataEpoch,before=researchData;await originalFile?.(e);if(epoch!==dataEpoch)return;if(researchData&&researchData!==before){materialDialog.close();paintMaterials();await askFromAction('我已提交数据，请结合字段摘要告诉我下一步。');}else{parts.status.textContent='提交失败：'+$('researchNotice').textContent;}};
 async function askFromAction(message){
 if(queryBusy||parts.submit.disabled){parts.status.textContent='材料已收到，上一条回复结束后请继续提问。';return;}queryBusy=true;const id=sessionId;
 try{if(window.eaFlushAllDrafts&&!await eaFlushAllDrafts())throw Error('材料草稿保存未完成。');
 const response=await api('/api/research/chat',{method:'POST',body:{session_id:id,state_version:latestState.state_version,research_revision:latestState.research_revision,request_id:crypto.randomUUID(),message,intent:'analysis',profile:researchProfileCache||window.eaLocalSummary?.profile||{row_count:0,columns:[]},draft_plan:researchProfileCache?researchCandidate():window.eaLocalDraftPlan?.()||{}}});
 if(id!==sessionId)return;latestState.practical_messages=response.messages;window.eaConversationHistory(response.messages);
 }catch(e){parts.status.textContent='材料已保留：'+e.message;}finally{queryBusy=false;}
 }
 const nativeDraw=researchDrawJob;researchDrawJob=function(job){nativeDraw(job);paintMaterials();};
 const legacyCurrent=document.querySelector('.analysis-current-turn');
 new MutationObserver(()=>{
 const title=legacyCurrent.querySelector('h3')?.textContent||'';
 if(/解释已提交|最新已提交解释/.test(title)&&legacyCurrent.textContent!==lastRendered){lastRendered=legacyCurrent.textContent;const item=el('article','coach-message assistant');item.append(...[...legacyCurrent.children].map(n=>n.cloneNode(true)));feed.append(item);feed.scrollTop=feed.scrollHeight;paintMaterials();}
 }).observe(legacyCurrent,{childList:true,subtree:true});
 for(const b of parts.dialogue.querySelectorAll(':scope > button'))if(b.textContent==='返回问答')b.classList.add('coach-exit');
 const mode=dock.querySelector('.analysis-answer-mode');new MutationObserver(()=>{mode.hidden=!window.eaReflectionMode;}).observe(mode,{childList:true,subtree:true});mode.hidden=true;
 const status=parts.status;new MutationObserver(()=>{status.hidden=!/正在|失败|错误|超时|过期|保留|处理中/.test(status.textContent);}).observe(status,{childList:true,subtree:true});status.hidden=true;
 for(const p of document.querySelectorAll('p'))if(p.textContent.startsWith('试用版：'))p.hidden=true;
 parts.input.placeholder='告诉我你想研究什么，或继续回答上一个问题…';
 paintFeed();paintMaterials();if(latestState)window.eaConversationHistory(latestState.practical_messages||[]);
})();
