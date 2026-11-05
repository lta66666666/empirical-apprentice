/* R execution workbench: textContent only for user data, no arbitrary code editor. */
let researchData=null,researchPlan=null,researchSession=null,researchJob=null,researchPoll=null,researchEpoch=0,researchRunning=false,researchProfileCache=null;
const researchNames={ols:'线性回归',panel_fe:'面板固定效应',did:'同批 DID'};
let researchRuntime=null;
let researchInputEpoch=0,researchConfigEpoch=0,researchOperationEpoch=0,researchInputBusy=false,researchPendingSubmission=null;
function researchContext(){return {session:sessionId,account:window.EA_ACCOUNT?.id||'',input:researchInputEpoch,config:researchConfigEpoch,revision:latestState?.research_revision};}
function researchContextCurrent(context,config=true){return context.session===sessionId&&context.account===(window.EA_ACCOUNT?.id||'')&&context.input===researchInputEpoch&&(!config||(context.config===researchConfigEpoch&&context.revision===latestState?.research_revision));}
function researchBusyFeedback(text){researchNotice(text);if(typeof eaUpdateStepAction==='function')eaUpdateStepAction();}
function researchBeginInput(){researchInputEpoch++;if(typeof eaDraftRestoreEpoch!=='undefined')eaDraftRestoreEpoch++;researchInvalidate();researchInputBusy=true;researchBusyFeedback('正在读取并检查数据；只采用最后一次选择。');return researchContext();}
async function researchCommitInput(data,profile,preset,context){
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(data.text));
  if(!researchContextCurrent(context,false))return false;
  // Input, column summary, dictionary and hash become visible together.
  if(typeof eaInputHash!=='undefined')eaInputHash=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
  researchData={...data,dictionary:{...(data.dictionary||{})}};
  $('eaDictionaryEditor')?.replaceChildren();$('researchInstruction').value=data.question||'';$('researchSource').value=data.source||'';
  researchSetFields(profile,preset||{});$('researchDictionary').replaceChildren();
  if(Object.keys(researchData.dictionary).length){$('researchDictionary').append(el('summary','','查看案例变量与单位'));for(const [name,meaning]of Object.entries(researchData.dictionary))$('researchDictionary').append(el('p','',`${name}：${meaning}`));}
  researchRenderImportDetails(data);
  if(typeof eaCaptureInput==='function')await eaCaptureInput();
  if(data.data_id)window.dispatchEvent(new CustomEvent('ea-research-input-ready',{detail:{session:sessionId}}));
  return researchContextCurrent(context,false);
}
function researchRenderImportDetails(data=researchData){$('eaImportDetails')?.remove();if(!data)return;
  if(data.labels){
    const info=el('details');info.id='eaImportDetails';info.append(el('summary','','文件标签与日期（来自文件，未独立核实）'));
    for(const [name,values]of Object.entries(data.labels.value_labels||{}))info.append(el('p','muted',name+'：'+Object.entries(values).map(([code,label])=>code+' = '+label).join('；')+'。计算保留原编码。'));
    for(const [column,format]of Object.entries(data.labels.date_formats||{})){
      info.append(el('p','muted',column+'：'+format));if(!/^%t[mqd]/.test(format)||!data.data_id)continue;
      const convert=button('预览 '+column+' 提取年度','text-btn',async()=>{
        const captured=researchContext(),message=el('p','muted','正在生成转换预览…');info.append(message);convert.disabled=true;
        const request_id=crypto.randomUUID(),url=`/api/sessions/${sessionId}/research/data/${data.data_id}`;
        try{const preview=await api(url,{method:'POST',body:{operation:'preview_year',column}});if(!researchContextCurrent(captured))return;
          message.textContent=`新增 ${preview.new_column}，范围 ${preview.min_year}–${preview.max_year}。${preview.warning}`;
          if(!confirm(message.textContent+'\n确认新增年度列？'))return;
          const result=await api(url,{method:'POST',body:{operation:'year',column,request_id,confirmed:true}});if(!researchContextCurrent(captured))return;
          const question=$('researchInstruction').value,preset={...researchCandidate(),time:preview.new_column};
          await eaLoadResearchInput({...result,filename:'normalized.csv',source_filename:result.filename,question,dictionary:result.metadata.dictionary,source:data.source},result.profile,preset);
          researchNotice('已新增年度列，原日期列与原始文件仍保留。请重新核对方案。');
        }catch(error){if(researchContextCurrent(captured,false))message.textContent=error.message;}finally{convert.disabled=false;}
      });info.append(convert);
    }
    $('researchDictionary').append(info);
  }
}
window.eaLoadResearchInput=async(data,profile,preset={})=>{if(researchRunning){researchNotice('请等待当前操作完成或取消计算，再更换数据。',true);return false;}const context=researchBeginInput();try{return await researchCommitInput(data,profile,preset,context);}finally{if(researchContextCurrent(context,false)){researchInputBusy=false;if(typeof eaUpdateStepAction==='function')eaUpdateStepAction();}}};
function researchField(id,title,type='select'){
  const l=el('label','research-field',title),n=el(type);n.id=id;
  if(type==='select')n.append(new Option('请选择',''));
  l.append(n);return l;
}
function researchNotice(text,error=false){$('researchNotice').textContent=text;$('researchNotice').classList.toggle('is-error',error);$('researchNotice').classList.toggle('ea-restore-note',text.startsWith('已恢复'));}
function researchInvalidate(){researchConfigEpoch++;researchPendingSubmission=null;researchPlan=null;$('researchConfirm').checked=false;$('researchRun').disabled=true;$('researchPlanCard').replaceChildren(el('p','muted','参数或数据已变化，请重新整理方案。'));if(typeof eaUpdateStepAction==='function')eaUpdateStepAction();}
function researchCandidate(){
  const method=$('researchMethod').value;
  return {method,engine_id:$('researchEngine').value,outcome:$('researchOutcome').value,predictors:[...document.querySelectorAll('#researchPredictors input:checked')].map(n=>n.value),
    unit:method==='ols'?'':$('researchUnit').value,time:method==='ols'?'':$('researchTime').value,
    treated:method==='did'?$('researchTreated').value:'',policy_year:method==='did'&&$('researchYear').value?Number($('researchYear').value):null,
    vcov:$('researchVcov').value,cluster:$('researchVcov').value==='cluster'?$('researchCluster').value:'',missing:$('researchMissing').value,same_batch:method==='did'&&$('researchSameBatch').checked};
}
function researchSetFields(profile,preset={}){
  researchProfileCache=profile;
  for(const id of ['researchOutcome','researchUnit','researchTime','researchTreated','researchCluster']){
    const n=$(id);n.replaceChildren(new Option('请选择',''));for(const c of profile.columns)n.append(new Option(c.name,c.name));
  }
  const predictors=$('researchPredictors');predictors.replaceChildren();
  for(const c of profile.columns){const label=el('label','research-check'),input=el('input');input.type='checkbox';input.value=c.name;label.append(input,document.createTextNode(c.name));predictors.append(label);}
  for(const [key,id] of Object.entries({engine_id:'researchEngine',method:'researchMethod',outcome:'researchOutcome',unit:'researchUnit',time:'researchTime',treated:'researchTreated',cluster:'researchCluster',vcov:'researchVcov',missing:'researchMissing'}))if(preset[key]!=null)$(id).value=preset[key];
  if(preset.policy_year)$('researchYear').value=preset.policy_year;
  $('researchSameBatch').checked=Boolean(preset.same_batch);
  for(const n of predictors.querySelectorAll('input'))n.checked=(preset.predictors||[]).includes(n.value);
  $('researchProfile').replaceChildren(el('strong','',`${profile.row_count} 行 · ${profile.columns.length} 列`));
  for(const c of profile.columns)$('researchProfile').append(el('span','research-chip',`${c.name} · ${c.numeric?'数值':'文本'} · 缺失 ${c.missing}`));
  researchMethodChange(false);researchInvalidate();researchOfferPreparation();
  if(typeof eaRenderDictionary==='function')eaRenderDictionary();
}
function researchMethodChange(invalidate=true,methodChanged=false){
  const m=$('researchMethod').value;
  $('researchPanelFields').hidden=m==='ols';$('researchDidFields').hidden=m!=='did';
  if(methodChanged){$('researchVcov').value=m==='ols'?'hetero':'cluster';if(m!=='ols')$('researchCluster').value=$('researchUnit').value;}
  for(const option of $('researchVcov').options)option.disabled=m!=='ols'&&option.value!=='cluster';
  $('researchClusterWrap').hidden=$('researchVcov').value!=='cluster';
  if(invalidate)researchInvalidate();
  researchRenderLesson();
}

function researchRenderLesson(data=latestState){
  const root=$('researchLesson');if(!root)return;
  const method=$('researchMethod')?.value||'ols';
  root.replaceChildren();
  if(method==='did'){
    root.append(el('h3','','方法提示 · 同批 DID'),el('p','','先核对政策时间、固定组别与比较对象；趋势图只能描述变化，不能证明平行趋势。'));
    return;
  }
  const ols=method==='ols',name=ols?'OLS／多元线性回归':'个体与年份固定效应';
  root.append(el('span','section-kicker','执行前短课'),el('h3','',name),
    el('p','',ols?'一行通常是一个观察对象；比较解释变量 X 与结果 Y 的条件关联，并明确两者的单位。':'一行是同一个单位在某个年份的观测；控制单位不随时间变化的差异和共同年份冲击。'));
  const diagram=el('div','method-diagram');
  for(const label of (ols?['解释变量 X','控制变量','结果 Y']:['同一单位 × 多年','单位固定效应＋年份固定效应','结果 Y']))diagram.append(el('span','',label));
  root.append(diagram,el('p','workspace-note',ols?'控制已观测变量不等于消除所有混杂；显著系数本身不证明因果。':'固定效应不能自动排除随时间变化且与 X 同时相关的因素；系数默认按关联解释。'));
  const quiz=el('fieldset','method-quiz');quiz.append(el('legend','',ols?'判断：显著的 OLS 系数能直接证明因果吗？':'判断：两类固定效应能自动排除所有随时间变化的混杂因素吗？'));
  const options=ols?['A. 可以，只要 p 值小','B. 不可以，还要核对研究设计与遗漏因素']:['A. 可以，固定效应已控制一切','B. 不可以，随时间变化的混杂因素仍可能存在'];
  options.forEach((label,i)=>{const row=el('label','method-option'),input=el('input');input.type='radio';input.name='methodQuiz';input.value=i?'B':'A';row.append(input,document.createTextNode(label));quiz.append(row);});
  quiz.append(button('提交判断','btn-secondary',async()=>{
    const choice=quiz.querySelector('input:checked')?.value;if(!choice)return;
    await mutate(`method-learning/${method}`,{choice});
  }));
  const attempts=data?.method_learning?.[method]||[];
  if(attempts.length&&!attempts.at(-1).skipped)quiz.append(el('p',attempts.at(-1).correct?'method-correct':'resource-caution',attempts.at(-1).correct?'判断正确。执行后还要解释系数单位与局限。':'再想想：控制一部分因素不等于完成因果识别。'));
  root.append(quiz);
  root.append(button('暂时跳过短课（记录未验证掌握）','text-btn',()=>mutate(`method-learning/${method}`,{choice:'skip'})));
  if(attempts.at(-1)?.skipped)root.append(el('p','workspace-note','短课已跳过；执行前仍须核对方法条件。'));
}

function researchOfferPreparation(){
  const root=$('researchPrepTransfer');if(!root)return;
  root.replaceChildren();
  const prep=latestState?.preparation;
  if(!prep||!Object.keys(prep.cards||{}).length)return;
  root.append(el('h4','','核对研究准备与数据列的映射'));
  const rows=[['准备卡','已填写内容','数据列候选']];
  for(const [key,label] of [['outcome','结果变量'],['predictor','解释变量']]){
    const value=prep.cards[key]?.value?.trim()||'';
    rows.push([label,value||'尚未填写',researchProfileCache?.columns.some(c=>c.name===value)?value:'未匹配，请手动选择']);
  }
  const table=el('table');for(const row of rows){const tr=el('tr');for(const cell of row)tr.append(el(row===rows[0]?'th':'td','',cell));table.append(tr);}root.append(table);
  root.append(el('p','workspace-note','来源状态由学生填写，系统未核实。请在下方核对研究问题、来源和每一个变量列。'));
  root.append(button('核对后带入文字与完全同名的列','btn-secondary',()=>{
    if(!researchProfileCache){researchNotice('请先载入 CSV/TSV 或模拟数据，再核对映射。',true);return;}
    const cards=prep.cards||{},question=cards.question?.value||'',source=cards.data_source?.value||'';
    if(question)$('researchInstruction').value=question;
    if(source)$('researchSource').value=source;
    const outcome=cards.outcome?.value?.trim();if(researchProfileCache.columns.some(c=>c.name===outcome))$('researchOutcome').value=outcome;
    const predictor=cards.predictor?.value?.trim();if(researchProfileCache.columns.some(c=>c.name===predictor)){
      for(const input of $('researchPredictors').querySelectorAll('input'))if(input.value===predictor)input.checked=true;
    }
    researchInvalidate();researchNotice('已带入可对应信息。请逐项核对列、单位和来源，再整理方案。');
  }));
}
async function researchSample(name){
  if(!sessionId){researchNotice('练习正在连接，请稍后载入数据。',true);return;}
  if(researchRunning){researchNotice('当前操作尚未完成，请等待或取消后更换数据。',true);return;}
  const context=researchBeginInput();
  try{
    const d=await api(`/api/research/examples/${name}`);if(!researchContextCurrent(context,false))return;
    const p=await api(`/api/sessions/${context.session}/research/inspect`,{method:'POST',body:{filename:d.filename,text:d.text}});
    if(await researchCommitInput({...d,fixture_method:name},p,d.plan,context))researchNotice(`已载入“${d.title}”。这是模拟数据；请阅读字段与方法条件，再整理方案。`);
  }catch(e){if(researchContextCurrent(context,false))researchNotice(e.message,true);}
  finally{if(researchContextCurrent(context,false)){researchInputBusy=false;if(typeof eaUpdateStepAction==='function')eaUpdateStepAction();}}
}
function researchRenderPlan(answer){
  researchPlan=answer;const box=$('researchPlanCard');box.replaceChildren(el('span','section-kicker','02 核对方案'),el('h3','',answer.description.label),el('code','research-formula',answer.description.formula),el('p','',answer.description.meaning),el('p','',`请核实：${answer.description.checks}`),el('p','muted',answer.note));
  if(answer.confirmation?.corresponding_code&&window.eaCorrespondingCard)box.append(eaCorrespondingCard(answer.confirmation.corresponding_code,{confirmation_token:answer.confirmation.token}));
  const p=answer.plan;box.append(el('p','workspace-note',`执行软件与位置：${p.engine_id==='browser_webr'?'浏览器 webR':p.software==='stata'?'云端原生 Stata':p.software==='python'?'云端计算':'云端原生 R'}；切换引擎须重新确认。`));box.append(el('p','',`标准误：${p.vcov}${p.cluster?'；聚类列：'+p.cluster:''}。缺失处理：${p.missing==='drop'?'删除选定变量不完整的行，并记录行号':'有缺失则停止'}。`));
  box.append(el('p','workspace-note',`核对资料版本：${answer.confirmation.research_revision}；变量说明：${JSON.stringify(researchData.dictionary||latestState.variable_dictionary||{})}；来源：${$('researchSource').value||'未提供，尚未核对'}`));
  if(p.method==='did')box.append(el('p','resource-caution','仅同批实施；组均值图不是事件研究，也不会自动验证平行趋势。'));
  $('researchRun').disabled=!researchRuntime?.engines?.[$('researchEngine').value]?.ready;
  if(!researchRuntime?.engines?.[$('researchEngine').value]?.ready)researchNotice('方案已整理，但所选执行环境不可用。可明确选择浏览器 webR 后重新整理与确认。',true);
  else researchNotice('方案已整理。请核对变量、方法条件，再勾选确认并执行。');
  if(typeof eaUpdateStepAction==='function')eaUpdateStepAction();
  box.scrollIntoView({block:'start',behavior:learningMotionReduced()?'auto':'smooth'});
}
async function researchMakePlan(){
  if(!$('researchEngine').value){researchNotice('请先点击“使用浏览器 R / fixest”，或选择已经可用的云端引擎，再整理方案。',true);return;}
  if(researchRunning||researchInputBusy){researchNotice('数据或方案正在处理中，请等待完成。',true);return;}
  if(!researchData||!sessionId){researchNotice('请先选择模拟案例或上传数据。',true);return;}
  const context=researchContext(),operation=++researchOperationEpoch,snapshot={filename:researchData.filename,text:researchData.text,data_id:researchData.data_id||undefined,instruction:$('researchInstruction').value,candidate:researchCandidate()};
  researchRunning=true;$('researchMakePlan').disabled=true;researchBusyFeedback('正在整理当前方案，完成前不会执行计算。');
  try{
    if(typeof eaFlushDraft==='function'){
      if(!await eaFlushDraft('workbench',context.session)){researchNotice('草稿尚未保存。请先重试或核对冲突，再整理方案。',true);return;}
      if(!researchContextCurrent(context))return;
      const dict=eaDictionaryValues(),submitted=researchData.dictionary||latestState.variable_dictionary||{};
      if(Object.keys(dict).some(k=>(dict[k]||'')!==(submitted[k]||''))){researchNotice('变量字典仍有未提交修改。请在体检步骤提交字典，再整理方案。',true);eaResearchStep('health');return;}
    }
    const a=await api(`/api/sessions/${context.session}/research/plan`,{method:'POST',body:snapshot});
    if(!researchContextCurrent(context)){if(context.session===sessionId)researchNotice('参数、数据或资料已经变化，旧方案回复已丢弃。请重新整理。');return;}
    researchRenderPlan(a);researchPlan.context=researchContext();
  }catch(e){if(context.session===sessionId)researchNotice(e.message,true);}finally{if(operation===researchOperationEpoch){researchRunning=false;$('researchMakePlan').disabled=false;if(typeof eaUpdateStepAction==='function')eaUpdateStepAction();}}
}
async function researchAskModel(){
  if(!researchData||!sessionId){researchNotice('请先载入数据，在线模型只会收到列摘要。',true);return;}
  const button=$('researchAiCandidate');if(button.disabled)return;button.disabled=true;
  researchInvalidate();
  const context=researchContext(),snapshot={session_id:context.session,filename:researchData.filename,text:researchData.text,question:$('researchInstruction').value};
  try{
    researchNotice('正在获取受约束的候选方案；逐行数据不会发送给模型。');
    const result=await api('/api/research/candidate',{method:'POST',body:snapshot});
    if(!researchContextCurrent(context)){if(context.session===sessionId)researchNotice('输入已变化，旧候选回复未填入表单。请核对当前数据后重新提问。');return;}
    if(result.candidate&&researchProfileCache)researchSetFields(researchProfileCache,result.candidate);else researchInvalidate();
    const box=$('researchAiNote');box.replaceChildren(el('p','',result.warning),el('p','',result.reason||'模型未给出理由。'));
    for(const question of result.questions||[])box.append(el('p','',`待核对：${question}`));
    researchNotice(result.ready?'AI 候选方案已填入表单，请检查后再整理与确认。':'仍需补充信息或核对方法条件；请先回答补问。');
    if(typeof eaSaveWorkbenchDraft==='function')eaSaveWorkbenchDraft();
  }catch(e){if(context.session===sessionId)researchNotice(e.message,true);}finally{button.disabled=false;if(context.session===sessionId&&typeof eaRefreshModelEvidence==='function')eaRefreshModelEvidence();}
}
async function researchRun({confirmed=false}={}){
  if(researchRunning||researchInputBusy){researchNotice('当前操作正在处理中，请等待完成。',true);return;}
  if(!researchPlan||!researchData){researchNotice('请先载入原始数据并整理当前方案。',true);return;}
  if(researchPlan.context&&!researchContextCurrent(researchPlan.context)){researchInvalidate();researchNotice('输入、资料或参数已变化，请重新整理方案。',true);return;}
  if(!researchRuntime?.engines?.[$('researchEngine').value]?.ready){researchNotice('当前执行环境不可用。请选择可用引擎，再重新整理与确认方案。',true);return;}
  if(!(confirmed===true||$('researchConfirm').checked)){researchNotice('请先核对完整方案，再点击确认方案并开始计算。',true);return;}
  const context=researchContext(),operation=++researchOperationEpoch;
  const payload={filename:researchData.filename,text:researchData.text,data_id:researchData.data_id||undefined,plan:researchPlan.plan,confirmation_token:researchPlan.confirmation.token,confirmed:true,source:$('researchSource').value,dictionary:researchData.dictionary||latestState.variable_dictionary||{},simulated:Boolean(researchData.simulated),question:$('researchInstruction').value};
  const signature=JSON.stringify([context.session,payload]);if(!researchPendingSubmission||researchPendingSubmission.signature!==signature)researchPendingSubmission={signature,id:crypto.randomUUID()};payload.request_id=researchPendingSubmission.id;
  researchRunning=true;$('researchRun').disabled=true;researchBusyFeedback('正在保存已确认的执行任务，请勿重复提交。');
  try{
    const j=await api(`/api/sessions/${context.session}/research/jobs`,{method:'POST',body:payload});
    if(!researchContextCurrent(context,false))return;
    researchPendingSubmission=null;
    if(typeof eaResearchStep==='function')eaResearchStep('execute');
    storageSet('ea_auto_ai:'+j.id,'pending');researchWatch(j.id);if(j.execution_location==='browser_webr')await browserRunJob(j);else researchNotice('任务已提交云端；关闭网页后仍继续执行。');
  }catch(e){if(context.session===sessionId)researchNotice(e.uncertain?'提交结果待确认；输入已保留。重新提交同一方案会核对原任务，不会重复计算。':e.message,true);}finally{if(operation===researchOperationEpoch){researchRunning=false;$('researchRun').disabled=!researchPlan||!researchRuntime?.engines?.[$('researchEngine').value]?.ready;if(typeof eaUpdateStepAction==='function')eaUpdateStepAction();}}
}
function researchDownload(url,filename){const a=el('a','btn-secondary',filename);a.href=url;a.download=filename;return a;}
function researchWarning(text){
  const messages={
    'The displayed p-values do not establish causality. Model selection must not target statistical significance.':'p 值不能证明因果关系。不要为了得到显著结果反复调整模型。',
    'The group-mean plot is descriptive, not an event-study regression or proof of parallel trends. Causal claims require design evidence.':'组均值图只描述变化，不是事件研究回归，也不能证明平行趋势。因果解释需要研究设计证据。',
    'Fewer than three pre-policy periods: descriptive pretrend information is limited.':'政策前少于三个观测时期，趋势信息有限。',
    'Complete-case deletion may change sample composition; it does not resolve missing-data bias.':'删除不完整行可能改变样本构成，不能自动解决缺失数据造成的偏差。',
    'Fewer than 30 clusters; conventional cluster-robust inference can be fragile. This threshold is a teaching reminder, not a guarantee.':'聚类数少于 30，常规聚类稳健推断可能不稳定。30 是教学提醒阈值，不是可靠性的保证。'
  };
  return messages[text]||text;
}
function researchDrawJob(j){
  const signature=JSON.stringify([j.id,j.status,j.record_version,j.error,j.sync_error,j.stale,j.verification]);
  researchJob=j;window.eaCorrespondingQuestionContext=null;window.eaSelectedTask={id:j.id,session_id:j.session_id||sessionId,engine_id:j.engine_id||'browser_webr'};const box=$('researchResult');
  if(typeof eaUpdateStepAction==='function')eaUpdateStepAction();
  if(box.dataset.signature===signature)return;
  box.dataset.signature=signature;box.replaceChildren();
  const explanation=$('researchExplanation');explanation.replaceChildren(el('h3','','结果解释'),el('p','workspace-note','分析完成后，可用自己的话解释系数、单位与局限。'));
  const statuses={queued:'排队中',preparing:'准备数据',estimating:'正在估计',saving:'正在保存',cancelled:'已取消',running:'正在执行',succeeded:'分析完成',failed:'执行失败',interrupted:'执行已中断'};
  box.append(el('span','section-kicker','分析结果'),el('h3','',`${j.description.label} · ${statuses[j.status]||j.status}`));
  const steps=el('ol','research-progress');
  const stopped=['failed','interrupted','cancelled'].includes(j.status);
  for(const [label,done]of [['方案已确认',true],[j.execution_location==='cloud_native'?'云端任务已记录':'浏览器任务已创建',true],[j.status==='succeeded'?'计算已完成':stopped?'计算未完成':'等待计算完成',j.status==='succeeded'],[j.status==='succeeded'?'结果已保存':stopped?'没有可用结果':'等待保存结果',j.status==='succeeded']]){const li=el('li',done?'done':'',label);steps.append(li);}box.append(steps);
  if(['failed','interrupted','cancelled'].includes(j.status))steps.setAttribute('aria-label','执行未完成，未产生已保存结果');
  box.append(el('p','',j.simulated?'模拟教学数据 · 不能作为真实政策证据':'用户提供数据 · 来源和识别条件未自动核实'),el('p','workspace-note',j.execution_location==='cloud_native'?`本次由云端原生 ${j.software==='stata'?'Stata':j.software==='python'?'Python / StatsPAI':'R/fixest'}执行。网站保存结果与证据，未另行复算。`:'本次 R/fixest 在浏览器执行。服务器保存并校验提交格式，没有独立重算数值。'),el('code','research-formula',j.description.formula));
  if(j.stale)box.append(el('p','resource-caution','研究蓝图已改变：下方对应旧方案，请核对后重新运行。'));
  if(['queued','running','preparing','estimating','saving'].includes(j.status))box.append(button('取消当前计算','btn-secondary',()=> (j.execution_location==='cloud_native'?api(`/api/research/jobs/${j.id}/interrupt`,{method:'POST'}).then(()=>researchWatch(j.id)):browserInterruptJob(j.id)).catch(e=>researchNotice(e.message,true))));
  if(j.sync_error)box.append(el('p','resource-caution',`云端状态暂未同步：${j.sync_error}。任务记录保留，请稍后刷新。`));
  if(['failed','interrupted','cancelled'].includes(j.status)){
    box.append(el('p','resource-caution',j.error||'执行中断。没有产生可用回归结果。'));
    box.append(button('检查执行环境','btn-secondary',()=>{eaResearchStep('data');$('researchRuntime').open=true;$('researchRuntime').scrollIntoView({block:'start'});}));
    box.append(button('载入已保存输入，重新核对方案','btn-secondary',async()=>{
      if(researchRunning){researchNotice('请等待当前操作完成。',true);return;}const context=researchBeginInput();
      try{
        const material=j.data_id?await api(`/api/sessions/${context.session}/research/data/${j.data_id}`):null;
        const saved=material?{filename:material.format==='dta'?'normalized.csv':material.filename,original_text:material.text}:await api(`/api/research/jobs/${j.id}/input`);
        if(!researchContextCurrent(context,false))return;
        const profile=await api(`/api/sessions/${context.session}/research/inspect`,{method:'POST',body:{filename:saved.filename,text:saved.original_text}});
        if(!await researchCommitInput({...material,data_id:j.data_id||null,filename:saved.filename,text:saved.original_text,source_filename:material?.filename||j.source_filename,simulated:j.simulated,dictionary:j.dictionary,source:j.source||'',question:j.question||''},profile,j.plan,context))return;
        eaResearchStep('plan');
        researchNotice('已恢复输入。请重新整理并确认方案后再运行。');
      }catch(e){if(researchContextCurrent(context,false))researchNotice(e.message,true);}finally{if(researchContextCurrent(context,false)){researchInputBusy=false;if(typeof eaUpdateStepAction==='function')eaUpdateStepAction();}}
    }));return;
  }
  if(j.status!=='succeeded'){box.append(el('p','muted','任务保存在服务器，刷新后可从当前练习的分析记录继续查看。'));return;}
  const r=j.result;
  const evidence=el('details','ea-result-evidence'),evidenceBody=el('div');evidence.append(el('summary','','计算详情、完整表图与核验'),evidenceBody);
  for(const node of [box.querySelector('.research-progress'),box.querySelector(':scope>.workspace-note'),box.querySelector(':scope>.research-formula')])if(node)evidenceBody.append(node);
  box.append(el('p','ea-result-summary',`估计样本 ${r.n_used} 行 · 资料版本 ${j.research_revision??'历史未记录'} · 导出版本 ${j.record_version||1} · ${j.verification?.status==='consistent'?'同引擎复算一致':j.verification?.status==='inconsistent'?'同引擎复算有差异':'尚未独立核对'}`));
  if(j.verification?.differences?.length)evidenceBody.append(el('pre','',JSON.stringify(j.verification.differences,null,2)));
  let rerunRequestId=null;const rerun=button('从原始输入独立重跑核对','btn-secondary',async()=>{if(researchRunning){researchNotice('当前操作正在处理中，请稍后重跑。',true);return;}const context=researchContext(),operation=++researchOperationEpoch;researchRunning=true;rerun.disabled=true;researchBusyFeedback('正在创建独立重跑任务…');rerunRequestId||=crypto.randomUUID();try{const next=await api(`/api/research/jobs/${j.id}/rerun`,{method:'POST',body:{request_id:rerunRequestId}});if(!researchContextCurrent(context,false))return;rerunRequestId=null;researchNotice('独立重跑任务已创建，正在计算。');storageSet('ea_auto_ai:'+next.id,'pending');eaResearchStep('execute');await researchWatch(next.id);if(next.execution_location!=='cloud_native')await browserRunJob(next,true);}catch(e){if(context.session===sessionId)researchNotice(e.message,true);}finally{if(operation===researchOperationEpoch){researchRunning=false;rerun.disabled=false;if(typeof eaUpdateStepAction==='function')eaUpdateStepAction();}}});evidenceBody.append(rerun);
  evidenceBody.append(el('p','',`${r.software_version||r.r_version} · ${JSON.stringify(r.package_versions)} · 实际估计 ${r.n_used} 行${r.clusters?' · '+r.clusters+' 个聚类':''}`));
  const wrap=el('div','table-scroll'),table=el('table','research-table'),head=el('tr');
  for(const label of ['变量','系数','标准误','p 值','95% 区间'])head.append(el('th','',label));table.append(head);
  const focus=el('section','ea-coefficient-focus');focus.setAttribute('aria-live','polite');
  function selectCoefficient(c,row){
    for(const tr of table.querySelectorAll('tr'))tr.classList.remove('ea-selected-coefficient');row.classList.add('ea-selected-coefficient');const currentSelector=box.querySelector('.ea-coefficient-selector');if(currentSelector)currentSelector.value=c.term;window.eaCorrespondingQuestionContext=null;
    focus.replaceChildren(el('h4','',`${c.term==='(Intercept)'?'截距':c.term}：系数与区间`),el('p','',`估计 ${c.estimate.toPrecision(6)}；95% 区间 [${c.ci_low.toPrecision(6)}, ${c.ci_high.toPrecision(6)}]`),el('p','workspace-note',`结果变量：${j.dictionary?.[j.plan.outcome]||'含义与单位未提供，请核对'}；解释变量：${j.dictionary?.[c.term]||(c.term==='DID effect'?'政策后的处理组额外变化':c.term==='(Intercept)'?'截距（解释依赖变量零点）':'含义与单位未提供，请核对')}`));
    const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 440 64');svg.setAttribute('role','img');svg.setAttribute('aria-label',`${c.term} 的实际估计及95%区间`);
    const lo=Math.min(0,c.ci_low),hi=Math.max(0,c.ci_high),x=v=>24+(v-lo)/(hi-lo||1)*392;
    for(const [tag,attrs]of [['line',{x1:x(0),x2:x(0),y1:8,y2:56,stroke:'#9aacae','stroke-dasharray':'3 3'}],['line',{x1:x(c.ci_low),x2:x(c.ci_high),y1:32,y2:32,stroke:'#087e75','stroke-width':4}],['circle',{cx:x(c.estimate),cy:32,r:6,fill:'#087e75'}]]){const mark=document.createElementNS(svg.namespaceURI,tag);for(const[k,v]of Object.entries(attrs))mark.setAttribute(k,v);svg.append(mark);}focus.append(svg,el('p','workspace-note','圆点：估计；横线：95% 区间；虚线：零。区间与显著性不能单独证明因果。'));
    window.dispatchEvent(new CustomEvent('ea-teaching-context',{detail:{kind:'result',task:j,term:c.term}}));
    const mirror=$('researchExplanation')?.querySelector('.ea-coefficient-focus');if(mirror)mirror.replaceChildren(...[...focus.childNodes].map(n=>n.cloneNode(true)));
    if(!document.hidden&&!learningMotionReduced())focus.animate([{opacity:.65,transform:'translateY(3px)'},{opacity:1,transform:'translateY(0)'}],{duration:180});
  }
  for(const c of r.coefficients){const row=el('tr');row.tabIndex=0;row.setAttribute('aria-label',`选择 ${c.term} 查看区间与单位`);row.onclick=()=>selectCoefficient(c,row);row.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();selectCoefficient(c,row);}};for(const value of [c.term,c.estimate.toPrecision(5),c.std_error.toPrecision(4),c.p_value.toPrecision(4),`[${c.ci_low.toPrecision(4)}, ${c.ci_high.toPrecision(4)}]`])row.append(el('td','',value));table.append(row);}
  wrap.append(table);evidenceBody.append(wrap);
  box.append(focus);if(window.eaInterpretationCard)box.append(eaInterpretationCard(j,{onSaved:value=>{const summary=box.querySelector('.ea-result-summary');if(summary)summary.textContent=summary.textContent.replace(/导出版本 \d+/,'导出版本 '+value.record_version);}}));const sampleDetails=el('details');sampleDetails.append(el('summary','','样本处理与核验'),window.eaSampleEvidencePanel(j));box.append(sampleDetails);selectCoefficient(r.coefficients.find(c=>c.term!=='(Intercept)')||r.coefficients[0],table.querySelectorAll('tr')[r.coefficients.findIndex(c=>c.term!=='(Intercept)')+1]||table.querySelectorAll('tr')[1]);
  if(j.engine_id==='statspai_cloud'){
    const teaching=el('details','ea-corresponding-code'),body=el('div');teaching.append(el('summary','','Stata 对应代码'),body);
    let loaded=false;teaching.addEventListener('toggle',async()=>{if(!teaching.open||loaded)return;body.textContent='正在读取对应代码…';
      try{const context=researchContext(),code=await api(`/api/research/jobs/${j.id}/stata-code`);if(!researchContextCurrent(context,false)||researchJob?.id!==j.id)return;
        if(window.eaCorrespondingCard){body.replaceChildren(eaCorrespondingCard(code,{task_id:j.id,result:j.result}));loaded=true;return;}
        const pre=el('pre');pre.textContent=code.code;body.replaceChildren(el('p','muted','教学代码，可复制到 Stata 阅读和运行；本次计算由 StatsPAI 完成。'),pre);
        for(const note of code.differences||[])body.append(el('p','muted',note));
        const copy=button('复制代码','btn-secondary',async()=>{try{await navigator.clipboard.writeText(code.code);copy.textContent='已复制';}catch{copy.textContent='复制失败，请选择代码后复制';}});body.append(copy);loaded=true;
      }catch(e){body.textContent='读取失败：'+e.message+'；关闭后重新展开可重试。';}});box.append(teaching);
  }
  const selector=el('select');selector.setAttribute('aria-label','选择要解释的系数');for(const c of r.coefficients)selector.append(new Option(c.term,c.term));selector.value=(r.coefficients.find(c=>c.term!=='(Intercept)')||r.coefficients[0]).term;
  for(const option of selector.options)option.textContent=option.value==='(Intercept)'?'截距（查看零点含义）':`${option.value} · 查看系数、区间与单位`;
  selector.className='ea-coefficient-selector';selector.onchange=()=>{const index=r.coefficients.findIndex(c=>c.term===selector.value);selectCoefficient(r.coefficients[index],table.querySelectorAll('tr')[index+1]);const other=$('researchExplanation')?.querySelector('.ea-coefficient-selector');if(other)other.value=selector.value;};box.insertBefore(selector,focus);
  const figure=el('figure'),img=el('img');img.src=`/api/research/jobs/${j.id}/artifacts/coefficients.svg`;img.alt='本次执行的系数与95%置信区间图';figure.append(img,el('figcaption','muted',j.execution_location==='cloud_native'?'系数与区间来自云端原生执行；来源与识别条件仍需核对。':'系数及区间由浏览器 webR 提交，服务器未独立重算。'));evidenceBody.append(figure);
  if(j.plan.method==='did'){
    const f=el('figure'),im=el('img');im.src=`/api/research/jobs/${j.id}/artifacts/group_trends.svg`;im.alt='本次样本的处理组与对照组均值变化';f.append(im,el('figcaption','muted','组均值变化：描述性图，不是事件研究回归或平行趋势证明。'));evidenceBody.append(f);
  }
  box.append(el('h4','','把结果读懂'),el('p','',j.description.meaning));
  const warnings=el('details');warnings.append(el('summary','',`数据处理与方法提醒（${r.warnings.length}）`));for(const w of r.warnings)warnings.append(el('p','',researchWarning(w))); warnings.append(el('p','',`选定变量缺失删除 ${r.audit.missing_removed_csv_lines.length} 行；模型另排除 ${r.audit.model_removed_count||0} 行。缺失与模型排除的原始行号见报告；历史任务可能未记录模型样本索引。`));evidenceBody.append(warnings);
  if(r.warnings.length)box.append(el('p','resource-caution',`${r.warnings.length} 项提醒：${researchWarning(r.warnings[0])} 完整提醒见详细证据。`));
  const trace=el('details');trace.append(el('summary','','查看软件执行记录'));for(const t of j.tool_trace)trace.append(el('p','',`${t.transport} → ${t.tool}`));evidenceBody.append(trace);
  const links=el('div','research-actions');links.append(researchDownload(`/api/research/jobs/${j.id}/report`,'下载分析报告.md'),researchDownload(`/api/research/jobs/${j.id}/report.pdf`,'下载分析报告.pdf'),researchDownload(`/api/research/jobs/${j.id}/package`,'下载完整复现包.zip'));box.append(links);
  box.append(el('p','workspace-note',j.reflections?.length?'解释已提交，仍可继续修订。':'解释练习待完成；可立即下载分析报告，稍后继续学习。'),evidence);
  explanation.replaceChildren(el('h3','',`${j.description.label} · 解释结果`),el('p','ea-result-summary',`实际估计 ${r.n_used} 行 · ${j.execution_location==='cloud_native'?'云端原生执行':'浏览器 webR 执行'} · 来源与因果条件未自动核实`));
  const explanationFocus=focus.cloneNode(true),explanationSelector=selector.cloneNode(true);explanationSelector.value=selector.value;explanationSelector.setAttribute('aria-label','选择解释练习中的系数');explanationSelector.onchange=()=>{selector.value=explanationSelector.value;selector.onchange();};explanation.append(explanationSelector,explanationFocus);
  const reflection=el('section','research-reflection');reflection.append(el('span','section-kicker','用自己的话解释'),el('h4','',j.description.quiz));
  const attempts=j.reflections?.length?j.reflections:(j.reflection?[j.reflection]:[]);
  const history=el('div','reflection-history');
  const lastAttempt=attempts.at(-1);
  if(lastAttempt){const preview=el('section','ea-feedback-preview');preview.append(el('h4','','最新反馈预览'),el('p','workspace-note',`第 ${lastAttempt.answer_version||attempts.length} 次解释 · ${lastAttempt.mode==='ai_advice'?'AI 建议':'规则自查'} · ${lastAttempt.model||'规则提示'} · ${lastAttempt.prompt_version||'提示词版本未记录'} · 关联任务 ${j.id}`),el('p','',Array.from(String(lastAttempt.feedback||'')).slice(0,240).join('')+(Array.from(String(lastAttempt.feedback||'')).length>240?'…':'')));const full=el('details');full.append(el('summary','','展开完整反馈与引用说明'));const body=el('div','prose');markdown(body,lastAttempt.feedback||'');full.append(body,el('p','workspace-note',lastAttempt.interaction_id?`完整提示词与引用材料编号见“记录与报告”的交互 ${lastAttempt.interaction_id}。`:'本次未记录模型交互编号；不补造引用材料。'));preview.append(full);reflection.append(preview);}
  attempts.forEach((attempt,i)=>{const item=el('details');item.append(el('summary','',`第 ${i+1} 次解释 · ${attempt.mode==='ai_advice'?'AI 建议':'自查清单'}`),el('p','',attempt.answer));const body=el('div','prose');markdown(body,attempt.feedback);item.append(body);history.append(item);});
  const draftKey=`reflection:${j.id}`,draft=eaDraftEntry(draftKey);if(!draft.version&&latestState?.research_drafts?.[draftKey])Object.assign(draft,latestState.research_drafts[draftKey]);
  const input=el('textarea');input.id='researchReflection';input.setAttribute('aria-label','你的系数解释与局限');input.rows=5;input.maxLength=2000;input.placeholder='系数对应什么变化？单位是什么？哪些条件尚未验证？';input.value=draft.value.answer??attempts.at(-1)?.answer??'';
  const draftNote=el('p','ea-draft-status');draftNote.setAttribute('role','status');eaDraftMessage(draft,draftNote);draft.node=draftNote;
  input.oninput=()=>eaQueueDraft(draftKey,{answer:input.value,based_on_answer_version:attempts.length},draftNote);
  const feedback=el('div','prose');
  const submit=button(attempts.length?'提交修订解释':'提交首次解释','btn-primary',async()=>{
    if(submit.disabled)return;if(!input.value.trim()){feedback.textContent='请先写下系数、单位及一个尚未验证的条件。';input.focus();return;}const context=researchContext(),submitted=input.value;submit.disabled=true;$('eaNextAction').disabled=true;feedback.textContent='正在保存解释并获取反馈；可继续编辑下一版草稿。';
    try{if(!await eaFlushDraft(draftKey,context.session))throw Error('解释草稿尚未保存，请先处理保存错误或版本冲突。');await api(`/api/research/jobs/${j.id}/reflection`,{method:'POST',body:{answer:submitted,answer_version:attempts.length,session_id:context.session}});if(context.session!==sessionId)return;if(input.value===submitted)eaQueueDraft(draftKey,{answer:submitted,based_on_answer_version:attempts.length+1,submitted:true},draftNote,context.session);await eaFlushDraft(draftKey,context.session);if(researchJob?.id===j.id)await researchWatch(j.id);if(typeof eaRefreshModelEvidence==='function')await eaRefreshModelEvidence();toast('解释已提交，报告已更新；等待期间的新文字保留为草稿。');}
    catch(e){if(context.session===sessionId)feedback.textContent=e.message;}finally{submit.disabled=false;if(context.session===sessionId)eaUpdateStepAction();}
  });submit.id='researchReflectionSubmit';reflection.append(input,draftNote,el('p','muted','AI 反馈只接收你的回答与汇总结果，不上传逐行数据；无模型时提供明确标注的自查清单。'),submit,feedback);explanation.append(reflection,el('p','workspace-note',attempts.length?'已提交，可选修订。':'解释练习待完成；草稿不作为已完成成果。'),links.cloneNode(true));
  if(attempts.length){const past=el('details','ea-reflection-history');past.append(el('summary','',`查看首次解释与修订历史（${attempts.length} 次）`),history);reflection.append(past);}
  if(typeof eaUpdateStepAction==='function')eaUpdateStepAction();
}
async function researchWatch(id){
  clearTimeout(researchPoll);const epoch=++researchEpoch,context=researchContext();
  async function poll(){
    try{
      const j=await api(`/api/research/jobs/${id}`);if(epoch!==researchEpoch||context.session!==sessionId||context.account!==(window.EA_ACCOUNT?.id||'')||j.session_id&&j.session_id!==sessionId)return;researchDrawJob(j);
      if(['queued','running','preparing','estimating','saving'].includes(j.status))researchPoll=setTimeout(poll,1200);
      else {if($('researchNotice').textContent.startsWith('独立重跑任务已创建'))researchNotice(j.status==='succeeded'?'独立重跑已完成，结果已保存。':'独立重跑未完成，请查看任务状态。',j.status!=='succeeded');researchRefreshHistory();}
    }catch(e){if(epoch===researchEpoch)researchNotice(e.message,true);}
  }
  await poll();
}
async function researchRefreshHistory(){
  if(!sessionId)return;
  const id=sessionId;try{const r=await api(`/api/sessions/${id}/research/jobs`);if(id===sessionId)researchHistory(r.jobs);}catch(e){if(id===sessionId)researchNotice(e.message,true);}
}
function researchHistory(jobs){
  const box=$('researchHistory');box.replaceChildren(el('h4','','当前练习的分析记录'));
  if(!jobs.length)box.append(el('p','muted','尚无分析记录。'));
  const states={queued:'排队中',running:'正在执行',preparing:'准备数据',estimating:'正在估计',saving:'正在保存',succeeded:'分析完成',failed:'执行失败',cancelled:'已取消',interrupted:'已中断'};
  for(const j of jobs)box.append(button(`${researchNames[j.plan.method]} · ${new Date(j.created*1000).toLocaleString()} · ${states[j.status]||j.status}`,'research-history-item',()=>{eaSetTask('research');eaResearchStep('execute');window.eaAnalysisEngine=j.engine_id||'statspai_cloud';window.eaSelectedTask={id:j.id,session_id:sessionId,engine_id:j.engine_id||'browser_webr'};window.dispatchEvent(new CustomEvent('ea-local-tasks',{detail:{tasks:latestState?.local_stata_tasks||[],session:sessionId}}));researchWatch(j.id);window.eaWorkspaceOpen?.('execute','分析结果');}));
}
function renderResearch(data){
  if(researchPlan && researchPlan.confirmation?.research_revision !== data.research_revision)researchInvalidate();
  if(researchSession!==data.session_id){
    if(typeof eaDraftRestoreEpoch!=='undefined'){eaDraftRestoreEpoch++;eaInputHash='';$('eaDictionaryEditor')?.replaceChildren();}
    researchSession=data.session_id;researchInputEpoch++;researchOperationEpoch++;researchInputBusy=false;researchRunning=false;researchPendingSubmission=null;window.eaSelectedTask=null;window.eaImportDictionary=null;window.eaCorrespondingQuestionContext=null;researchData=null;researchProfileCache=null;researchPlan=null;researchJob=null;clearTimeout(researchPoll);researchEpoch++;
    $('researchResult').replaceChildren();$('researchProfile').replaceChildren();$('researchDictionary').replaceChildren();researchInvalidate();
    const recent=data.research_jobs?.[0];if(recent)researchWatch(recent.id);
  }
  researchHistory(data.research_jobs||[]);
  researchRenderLesson(data);researchOfferPreparation();
}
function setupResearch(){
  const tab=button('分析操作','',()=>{selectTab('research');setView(true);});tab.id='tab-research';tab.dataset.tab='research';tab.setAttribute('role','tab');tab.setAttribute('aria-controls','pane-research');tab.setAttribute('aria-selected','false');tab.tabIndex=-1;document.querySelector('.workspace-tabs').append(tab);
  const header=button('进入实操','btn-secondary',()=>{setWorkspace(true);selectTab('research');setView(true);});header.id='openResearch';document.querySelector('.header-actions').prepend(header);
  const pane=el('section','research-workbench');pane.id='pane-research';pane.hidden=true;pane.setAttribute('role','tabpanel');pane.setAttribute('aria-labelledby','tab-research');
  pane.append(el('span','section-kicker','从学到做'),el('h2','','核对方案，再交给计算软件'),el('p','research-lead','选择数据 → 核对方法、软件与执行位置 → 查看真实结果 → 自己解释并复算。'));
  pane.append(el('p','workspace-note','匿名浏览器记录和上传文件保存在服务器，最近活动 7 天后拒绝访问，物理清理接口已实现，云端定时调度待恢复；到期后一小时内删除尚未验收。请避免上传个人敏感数据；可在历史练习中手动删除，并提前导出。'));
  const runtime=el('details','research-runtime');runtime.open=false;runtime.id='researchRuntime';runtime.append(el('summary','','正在检测执行环境…'));pane.append(runtime);
  const cases=el('div','research-cases');for(const [id,label] of Object.entries(researchNames))cases.append(button(`体验案例 · ${label}`,'research-case',()=>researchSample(id)));pane.append(cases);
  const lesson=el('section','research-method-lesson');lesson.id='researchLesson';pane.append(lesson);
  const grid=el('div','research-grid'),form=el('section','research-input'),output=el('section','research-output');
  form.append(el('span','section-kicker','01 准备数据'),el('h3','','数据与研究问题'));
  const label=el('label','research-field','上传 CSV / TSV / DTA（最多2MB、20000行）'),file=el('input');file.type='file';file.accept='.csv,.tsv,.dta';file.id='researchFile';label.append(file);form.append(label);
  let uploadRequest=null;
  file.onchange=async()=>{const f=file.files[0];if(!f)return;if(f.size>2000000){researchNotice('文件超过2MB。',true);return;}if(!sessionId||researchRunning){researchNotice('请等待当前操作完成。',true);return;}
    if(!confirm('文件将上传服务器用于检查、保存和计算，练习最后活动七天后到期。模型仅接收摘要。请确认有权上传。'))return;
    const context=researchBeginInput(),signature=JSON.stringify([context.session,f.name,f.size,f.lastModified,window.eaImportDictionary||{}]);
    if(uploadRequest?.signature!==signature)uploadRequest={signature,id:crypto.randomUUID()};
    try{const form=new FormData();form.append('file',f);form.append('request_id',uploadRequest.id);form.append('state_version',latestState.state_version);form.append('dictionary',JSON.stringify(window.eaImportDictionary||{}));
      const response=await fetch(`/api/sessions/${context.session}/research/data`,{method:'POST',body:form,credentials:'same-origin',signal:AbortSignal.timeout(20000)}),material=await response.json();
      if(!response.ok)throw Error(material.detail||'数据上传失败，请重试');if(!researchContextCurrent(context,false))return;
      const data={...material,filename:material.format==='dta'?'normalized.csv':material.filename,source_filename:material.filename,simulated:material.metadata.simulated,dictionary:material.metadata.dictionary,source:material.metadata.source};
      if(await researchCommitInput(data,material.profile,{},context))researchNotice('已载入字段及有出处的标签／字典。请选择变量，未知单位可以后补。');
    }catch(e){if(researchContextCurrent(context,false))researchNotice(e.name==='TimeoutError'?'上传结果待确认；请重选同一文件重试，不会重复建立材料。':e.message,true);}
    finally{if(researchContextCurrent(context,false)){researchInputBusy=false;if(typeof eaUpdateStepAction==='function')eaUpdateStepAction();}}
  };
  const download=button('下载当前案例或数据','text-btn',()=>{if(!researchData)return;const a=el('a');const url=URL.createObjectURL(new Blob([researchData.text],{type:'text/csv;charset=utf-8'}));a.href=url;a.download=researchData.filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});form.append(download);
  const profile=el('div','research-profile');profile.id='researchProfile';form.append(profile);const dictionary=el('details','research-dictionary');dictionary.id='researchDictionary';form.append(dictionary);
  const instruction=researchField('researchInstruction','用自然语言描述你想研究什么','textarea');instruction.querySelector('textarea').rows=3;instruction.querySelector('textarea').maxLength=2000;form.append(instruction);
  const source=researchField('researchSource','数据来源与变量单位','textarea');source.querySelector('textarea').rows=2;source.querySelector('textarea').maxLength=1000;form.append(source);
  form.append(el('p','muted','提出方案时，仅向模型发送研究问题、列名、类型、缺失数和总行数；逐行数据只交给本应用和受控计算服务。'));
  const aiCandidate=button('AI 提出候选方案（需核对）','btn-secondary',researchAskModel);aiCandidate.id='researchAiCandidate';aiCandidate.hidden=true;
  const aiNote=el('div','workspace-note');aiNote.id='researchAiNote';form.append(aiCandidate,aiNote);
  const transfer=el('div','research-prep-transfer');transfer.id='researchPrepTransfer';form.append(transfer);
  const params=el('details','research-parameters');params.open=true;params.append(el('summary','','方法与变量'));
  const engine=researchField('researchEngine','软件与执行位置');engine.querySelector('select').replaceChildren(new Option('云端计算（无需安装）','statspai_cloud'),new Option('请先选择执行方式',''),new Option('浏览器 R / fixest（无需云端节点）','browser_webr'),new Option('云端原生 R（检测配置后开放）','r_native'),new Option('云端 Stata（授权及环境待验收）','stata_native'));params.append(engine,el('p','workspace-note','默认云端计算，无需安装软件；数据会上传服务器，练习最后活动七天后到期。浏览器 R 可主动选择作为备用。切换方式须重新确认。'));
  const method=researchField('researchMethod','计量方法');method.querySelector('select').replaceChildren(...Object.entries(researchNames).map(([v,t])=>new Option(t,v)));params.append(method,researchField('researchOutcome','结果变量 Y'));
  const predictors=el('fieldset');predictors.append(el('legend','','解释变量 / DID 控制变量'));const checks=el('div','research-predictors');checks.id='researchPredictors';predictors.append(checks);params.append(predictors);
  const panel=el('div');panel.id='researchPanelFields';panel.hidden=true;panel.append(researchField('researchUnit','个体编号'),researchField('researchTime','年份'));params.append(panel);
  const did=el('div');did.id='researchDidFields';did.hidden=true;did.append(researchField('researchTreated','固定处理组（0/1，身份不能随年份变化）'),researchField('researchYear','政策实施年份','input'));did.querySelector('input').type='number';
  const same=el('label','research-check'),sameCheck=el('input');sameCheck.id='researchSameBatch';sameCheck.type='checkbox';same.append(sameCheck,document.createTextNode('我已核实：同批实施，对照组研究期内未受此政策。'));did.append(same);params.append(did);
  const vcov=researchField('researchVcov','标准误设置');vcov.querySelector('select').replaceChildren(new Option('异方差稳健','hetero'),new Option('聚类稳健','cluster'),new Option('同方差（需依据）','iid'));params.append(vcov);
  const cluster=researchField('researchCluster','聚类列');cluster.id='researchClusterWrap';cluster.hidden=true;params.append(cluster);
  const missing=researchField('researchMissing','选定变量缺失时');missing.querySelector('select').replaceChildren(new Option('停止，先核查数据','block'),new Option('明确允许删除不完整行并记录','drop'));params.append(missing);
  params.onchange=(event)=>{researchMethodChange(true,event.target.id==='researchMethod');};form.append(params);
  instruction.oninput=researchInvalidate;source.oninput=researchInvalidate;
  const make=button('整理方案（先不执行）','btn-primary',researchMakePlan);make.id='researchMakePlan';form.append(make);
  const notice=el('p','research-notice');notice.id='researchNotice';notice.setAttribute('role','status');notice.setAttribute('aria-live','polite');form.append(notice);
  const plan=el('div','research-plan');plan.id='researchPlanCard';output.append(plan);
  const confirm=el('label','research-check'),check=el('input');check.type='checkbox';check.id='researchConfirm';check.onchange=()=>eaUpdateStepAction();confirm.append(check,document.createTextNode('我已核对方案与数据处理，理解尚未验证的条件，同意执行本次分析。'));output.append(confirm);
  const run=button('按确认的软件执行','btn-primary',researchRun);run.id='researchRun';run.disabled=true;output.append(run);
  const result=el('div','research-result');result.id='researchResult';output.append(result);const history=el('div','research-history');history.id='researchHistory';output.append(history);
  const explanation=el('section','ea-explanation');explanation.id='researchExplanation';explanation.dataset.researchStage='explain';explanation.append(el('h3','','结果解释'),el('p','workspace-note','完成分析后，在这里练习解释系数、单位与局限。可先查看其他步骤。'));output.append(explanation);
  grid.append(form,output);pane.append(grid);document.querySelector('.workspace-body').append(pane);
  api('/api/research/status').then(s=>{
    researchRuntime=s;runtime.replaceChildren(el('summary','','更多执行方式'),el('strong','',s.engines.statspai_cloud?.ready?'云端计算已就绪':'云端计算尚未就绪；可主动选择浏览器 R 备用'));
    const engineSelect=$('researchEngine');if(!engineSelect.value)engineSelect.value=s.default_engine||'statspai_cloud';
    for(const option of engineSelect.options){if(['statspai_cloud','r_native','stata_native'].includes(option.value)){const capability=s.engines[option.value];option.disabled=!capability?.ready;option.textContent=`${option.value==='statspai_cloud'?'云端计算':option.value==='r_native'?'云端原生 R':'云端 Stata'}（${capability?.status||'未配置'}）`;}}
    runtime.append(el('p','workspace-note','默认云端计算，无需安装软件；先载入数据，再核对并确认方案。不会在云端失败后自动改用其他软件。'));
    const browserChoice=button('使用浏览器 R / fixest','btn-primary',()=>{if(researchRunning){researchNotice('请等待或中断当前任务后切换执行方式。',true);return;}engineSelect.value='browser_webr';researchInvalidate();researchNotice('已选择浏览器 R / fixest。请载入数据、整理方案并重新确认；这不是云端执行。');});runtime.append(browserChoice);
    const state=el('p','workspace-note');state.id='eaRuntimeStatus';state.setAttribute('role','status');
    const initialize=button('检查并初始化浏览器 R','btn-secondary',async()=>{if(researchRunning)return;initialize.disabled=true;state.textContent='正在下载或初始化浏览器 R 与 fixest…';try{const r=await eaInitWebR();const version=await r.evalRString("paste('R',getRversion(),'· fixest',as.character(packageVersion('fixest')))");state.textContent=`浏览器执行环境已就绪：${version}。仍须选择执行方式并确认方案。`;if(typeof eaRefreshEnvironment==='function')eaRefreshEnvironment();}catch(e){runtime.open=true;state.textContent=`初始化失败：${e.message}。请检查下载网络后重试。`;}finally{initialize.disabled=false;}});runtime.append(initialize,state);
    const detail=el('details');detail.append(el('summary','','查看各软件与模型状态'),el('p','',s.engines.r_native.reason));
    for(const software of s.software)detail.append(el('span','research-chip',`${software.label}：${software.status}`));
    detail.append(el('p','muted',s.planner_mode==='online'?'候选方案模型已配置，真实接口待实测；学生确认后才执行。':'未连接在线模型，可使用课程、手动方案和自查清单。'));runtime.append(detail);aiCandidate.hidden=s.planner_mode!=='online';
  }).catch(e=>runtime.textContent=e.message);
  researchRenderLesson();
}
setupResearch();
