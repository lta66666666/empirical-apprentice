/* R execution workbench: textContent only for user data, no arbitrary code editor. */
let researchData=null,researchPlan=null,researchSession=null,researchJob=null,researchPoll=null,researchEpoch=0,researchRunning=false,researchProfileCache=null;
const researchNames={ols:'���Իع�',panel_fe:'���̶�ЧӦ',did:'ͬ�� DID'};
let researchRuntime=null;
let researchInputEpoch=0,researchConfigEpoch=0,researchOperationEpoch=0,researchInputBusy=false,researchPendingSubmission=null;
function researchContext(){return {session:sessionId,account:window.EA_ACCOUNT?.id||'',input:researchInputEpoch,config:researchConfigEpoch,revision:latestState?.research_revision};}
function researchContextCurrent(context,config=true){return context.session===sessionId&&context.account===(window.EA_ACCOUNT?.id||'')&&context.input===researchInputEpoch&&(!config||(context.config===researchConfigEpoch&&context.revision===latestState?.research_revision));}
function researchBusyFeedback(text){researchNotice(text);if(typeof eaUpdateStepAction==='function')eaUpdateStepAction();}
function researchBeginInput(){researchInputEpoch++;if(typeof eaDraftRestoreEpoch!=='undefined')eaDraftRestoreEpoch++;researchInvalidate();researchInputBusy=true;researchBusyFeedback('���ڶ�ȡ��������ݣ�ֻ�������һ��ѡ��');return researchContext();}
async function researchCommitInput(data,profile,preset,context){
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(data.text));
  if(!researchContextCurrent(context,false))return false;
  // Input, column summary, dictionary and hash become visible together.
  if(typeof eaInputHash!=='undefined')eaInputHash=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
  researchData={...data,dictionary:{...(data.dictionary||{})}};
  $('eaDictionaryEditor')?.replaceChildren();$('researchInstruction').value=data.question||'';$('researchSource').value=data.source||'';
  researchSetFields(profile,preset||{});$('researchDictionary').replaceChildren();
  if(Object.keys(researchData.dictionary).length){$('researchDictionary').append(el('summary','','�鿴���������뵥λ'));for(const [name,meaning]of Object.entries(researchData.dictionary))$('researchDictionary').append(el('p','',`${name}��${meaning}`));}
  researchRenderImportDetails(data);
  if(typeof eaCaptureInput==='function')await eaCaptureInput();
  if(data.data_id)window.dispatchEvent(new CustomEvent('ea-research-input-ready',{detail:{session:sessionId}}));
  return researchContextCurrent(context,false);
}
function researchRenderImportDetails(data=researchData){$('eaImportDetails')?.remove();if(!data)return;
  if(data.labels){
    const info=el('details');info.id='eaImportDetails';info.append(el('summary','','�ļ���ǩ�����ڣ������ļ���δ������ʵ��'));
    for(const [name,values]of Object.entries(data.labels.value_labels||{}))info.append(el('p','muted',name+'��'+Object.entries(values).map(([code,label])=>code+' = '+label).join('��')+'�����㱣��ԭ���롣'));
    for(const [column,format]of Object.entries(data.labels.date_formats||{})){
      info.append(el('p','muted',column+'��'+format));if(!/^%t[mqd]/.test(format)||!data.data_id)continue;
      const convert=button('Ԥ�� '+column+' ��ȡ���','text-btn',async()=>{
        const captured=researchContext(),message=el('p','muted','��������ת��Ԥ����');info.append(message);convert.disabled=true;
        const request_id=crypto.randomUUID(),url=`/api/sessions/${sessionId}/research/data/${data.data_id}`;
        try{const preview=await api(url,{method:'POST',body:{operation:'preview_year',column}});if(!researchContextCurrent(captured))return;
          message.textContent=`���� ${preview.new_column}����Χ ${preview.min_year}�C${preview.max_year}��${preview.warning}`;
          if(!confirm(message.textContent+'\nȷ����������У�'))return;
          const result=await api(url,{method:'POST',body:{operation:'year',column,request_id,confirmed:true}});if(!researchContextCurrent(captured))return;
          const question=$('researchInstruction').value,preset={...researchCandidate(),time:preview.new_column};
          await eaLoadResearchInput({...result,filename:'normalized.csv',source_filename:result.filename,question,dictionary:result.metadata.dictionary,source:data.source},result.profile,preset);
          researchNotice('����������У�ԭ��������ԭʼ�ļ��Ա����������º˶Է�����');
        }catch(error){if(researchContextCurrent(captured,false))message.textContent=error.message;}finally{convert.disabled=false;}
      });info.append(convert);
    }
    $('researchDictionary').append(info);
  }
}
window.eaLoadResearchInput=async(data,profile,preset={})=>{if(researchRunning){researchNotice('��ȴ���ǰ������ɻ�ȡ�����㣬�ٸ������ݡ�',true);return false;}const context=researchBeginInput();try{return await researchCommitInput(data,profile,preset,context);}finally{if(researchContextCurrent(context,false)){researchInputBusy=false;if(typeof eaUpdateStepAction==='function')eaUpdateStepAction();}}};
function researchField(id,title,type='select'){
  const l=el('label','research-field',title),n=el(type);n.id=id;
  if(type==='select')n.append(new Option('��ѡ��',''));
  l.append(n);return l;
}
function researchNotice(text,error=false){$('researchNotice').textContent=text;$('researchNotice').classList.toggle('is-error',error);$('researchNotice').classList.toggle('ea-restore-note',text.startsWith('�ѻָ�'));}
function researchInvalidate(){researchConfigEpoch++;researchPendingSubmission=null;researchPlan=null;$('researchConfirm').checked=false;$('researchRun').disabled=true;$('researchPlanCard').replaceChildren(el('p','muted','�����������ѱ仯������������������'));if(typeof eaUpdateStepAction==='function')eaUpdateStepAction();}
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
    const n=$(id);n.replaceChildren(new Option('��ѡ��',''));for(const c of profile.columns)n.append(new Option(c.name,c.name));
  }
  const predictors=$('researchPredictors');predictors.replaceChildren();
  for(const c of profile.columns){const label=el('label','research-check'),input=el('input');input.type='checkbox';input.value=c.name;label.append(input,document.createTextNode(c.name));predictors.append(label);}
  for(const [key,id] of Object.entries({engine_id:'researchEngine',method:'researchMethod',outcome:'researchOutcome',unit:'researchUnit',time:'researchTime',treated:'researchTreated',cluster:'researchCluster',vcov:'researchVcov',missing:'researchMissing'}))if(preset[key]!=null)$(id).value=preset[key];
  if(preset.policy_year)$('researchYear').value=preset.policy_year;
  $('researchSameBatch').checked=Boolean(preset.same_batch);
  for(const n of predictors.querySelectorAll('input'))n.checked=(preset.predictors||[]).includes(n.value);
  $('researchProfile').replaceChildren(el('strong','',`${profile.row_count} �� �� ${profile.columns.length} ��`));
  for(const c of profile.columns)$('researchProfile').append(el('span','research-chip',`${c.name} �� ${c.numeric?'��ֵ':'�ı�'} �� ȱʧ ${c.missing}`));
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
    root.append(el('h3','','������ʾ �� ͬ�� DID'),el('p','','�Ⱥ˶�����ʱ�䡢�̶������Ƚ϶�������ͼֻ�������仯������֤��ƽ�����ơ�'));
    return;
  }
  const ols=method==='ols',name=ols?'OLS����Ԫ���Իع�':'��������ݹ̶�ЧӦ';
  root.append(el('span','section-kicker','ִ��ǰ�̿�'),el('h3','',name),
    el('p','',ols?'һ��ͨ����һ���۲���󣻱ȽϽ��ͱ��� X ���� Y ����������������ȷ���ߵĵ�λ��':'һ����ͬһ����λ��ĳ����ݵĹ۲⣻���Ƶ�λ����ʱ��仯�Ĳ���͹�ͬ��ݳ����'));
  const diagram=el('div','method-diagram');
  for(const label of (ols?['���ͱ��� X','���Ʊ���','��� Y']:['ͬһ��λ �� ����','��λ�̶�ЧӦ����ݹ̶�ЧӦ','��� Y']))diagram.append(el('span','',label));
  root.append(diagram,el('p','workspace-note',ols?'�����ѹ۲������������������л��ӣ�����ϵ��������֤�������':'�̶�ЧӦ�����Զ��ų���ʱ��仯���� X ͬʱ��ص����أ�ϵ��Ĭ�ϰ��������͡�'));
  const quiz=el('fieldset','method-quiz');quiz.append(el('legend','',ols?'�жϣ������� OLS ϵ����ֱ��֤�������':'�жϣ�����̶�ЧӦ���Զ��ų�������ʱ��仯�Ļ���������'));
  const options=ols?['A. ���ԣ�ֻҪ p ֵС','B. �����ԣ���Ҫ�˶��о��������©����']:['A. ���ԣ��̶�ЧӦ�ѿ���һ��','B. �����ԣ���ʱ��仯�Ļ��������Կ��ܴ���'];
  options.forEach((label,i)=>{const row=el('label','method-option'),input=el('input');input.type='radio';input.name='methodQuiz';input.value=i?'B':'A';row.append(input,document.createTextNode(label));quiz.append(row);});
  quiz.append(button('�ύ�ж�','btn-secondary',async()=>{
    const choice=quiz.querySelector('input:checked')?.value;if(!choice)return;
    await mutate(`method-learning/${method}`,{choice});
  }));
  const attempts=data?.method_learning?.[method]||[];
  if(attempts.length&&!attempts.at(-1).skipped)quiz.append(el('p',attempts.at(-1).correct?'method-correct':'resource-caution',attempts.at(-1).correct?'�ж���ȷ��ִ�к�Ҫ����ϵ����λ����ޡ�':'�����룺����һ�������ز�����������ʶ��'));
  root.append(quiz);
  root.append(button('��ʱ�����̿Σ���¼δ��֤���գ�','text-btn',()=>mutate(`method-learning/${method}`,{choice:'skip'})));
  if(attempts.at(-1)?.skipped)root.append(el('p','workspace-note','�̿���������ִ��ǰ����˶Է���������'));
}

function researchOfferPreparation(){
  const root=$('researchPrepTransfer');if(!root)return;
  root.replaceChildren();
  const prep=latestState?.preparation;
  if(!prep||!Object.keys(prep.cards||{}).length)return;
  root.append(el('h4','','�˶��о�׼���������е�ӳ��'));
  const rows=[['׼����','����д����','�����к�ѡ']];
  for(const [key,label] of [['outcome','�������'],['predictor','���ͱ���']]){
    const value=prep.cards[key]?.value?.trim()||'';
    rows.push([label,value||'��δ��д',researchProfileCache?.columns.some(c=>c.name===value)?value:'δƥ�䣬���ֶ�ѡ��']);
  }
  const table=el('table');for(const row of rows){const tr=el('tr');for(const cell of row)tr.append(el(row===rows[0]?'th':'td','',cell));table.append(tr);}root.append(table);
  root.append(el('p','workspace-note','��Դ״̬��ѧ����д��ϵͳδ��ʵ�������·��˶��о����⡢��Դ��ÿһ�������С�'));
  root.append(button('�˶Ժ������������ȫͬ������','btn-secondary',()=>{
    if(!researchProfileCache){researchNotice('�������� CSV/TSV ��ģ�����ݣ��ٺ˶�ӳ�䡣',true);return;}
    const cards=prep.cards||{},question=cards.question?.value||'',source=cards.data_source?.value||'';
    if(question)$('researchInstruction').value=question;
    if(source)$('researchSource').value=source;
    const outcome=cards.outcome?.value?.trim();if(researchProfileCache.columns.some(c=>c.name===outcome))$('researchOutcome').value=outcome;
    const predictor=cards.predictor?.value?.trim();if(researchProfileCache.columns.some(c=>c.name===predictor)){
      for(const input of $('researchPredictors').querySelectorAll('input'))if(input.value===predictor)input.checked=true;
    }
    researchInvalidate();researchNotice('�Ѵ���ɶ�Ӧ��Ϣ��������˶��С���λ����Դ��������������');
  }));
}
async function researchSample(name){
  if(!sessionId){researchNotice('��ϰ�������ӣ����Ժ��������ݡ�',true);return;}
  if(researchRunning){researchNotice('��ǰ������δ��ɣ���ȴ���ȡ����������ݡ�',true);return;}
  const context=researchBeginInput();
  try{
    const d=await api(`/api/research/examples/${name}`);if(!researchContextCurrent(context,false))return;
    const p=await api(`/api/sessions/${context.session}/research/inspect`,{method:'POST',body:{filename:d.filename,text:d.text}});
    if(await researchCommitInput({...d,fixture_method:name},p,d.plan,context))researchNotice(`�����롰${d.title}��������ģ�����ݣ����Ķ��ֶ��뷽��������������������`);
  }catch(e){if(researchContextCurrent(context,false))researchNotice(e.message,true);}
  finally{if(researchContextCurrent(context,false)){researchInputBusy=false;if(typeof eaUpdateStepAction==='function')eaUpdateStepAction();}}
}
function researchRenderPlan(answer){
  researchPlan=answer;const box=$('researchPlanCard');box.replaceChildren(el('span','section-kicker','02 �˶Է���'),el('h3','',answer.description.label),el('code','research-formula',answer.description.formula),el('p','',answer.description.meaning),el('p','',`���ʵ��${answer.description.checks}`),el('p','muted',answer.note));
  if(answer.confirmation?.corresponding_code&&window.eaCorrespondingCard)box.append(eaCorrespondingCard(answer.confirmation.corresponding_code,{confirmation_token:answer.confirmation.token}));
  const p=answer.plan;box.append(el('p','workspace-note',`ִ��������λ�ã�${p.engine_id==='browser_webr'?'����� webR':p.software==='stata'?'�ƶ�ԭ�� Stata':p.software==='python'?'�ƶ˼���':'�ƶ�ԭ�� R'}���л�����������ȷ�ϡ�`));box.append(el('p','',`��׼��${p.vcov}${p.cluster?'�������У�'+p.cluster:''}��ȱʧ������${p.missing==='drop'?'ɾ��ѡ���������������У�����¼�к�':'��ȱʧ��ֹͣ'}��`));
  box.append(el('p','workspace-note',`�˶����ϰ汾��${answer.confirmation.research_revision}������˵����${JSON.stringify(researchData.dictionary||latestState.variable_dictionary||{})}����Դ��${$('researchSource').value||'δ�ṩ����δ�˶�'}`));
  if(p.method==='did')box.append(el('p','resource-caution','��ͬ��ʵʩ�����ֵͼ�����¼��о���Ҳ�����Զ���֤ƽ�����ơ�'));
  $('researchRun').disabled=!researchRuntime?.engines?.[$('researchEngine').value]?.ready;
  if(!researchRuntime?.engines?.[$('researchEngine').value]?.ready)researchNotice('����������������ѡִ�л��������á�����ȷѡ������� webR ������������ȷ�ϡ�',true);
  else researchNotice('��������������˶Ա����������������ٹ�ѡȷ�ϲ�ִ�С�');
  if(typeof eaUpdateStepAction==='function')eaUpdateStepAction();
  box.scrollIntoView({block:'start',behavior:learningMotionReduced()?'auto':'smooth'});
}
async function researchMakePlan(){
  if(!$('researchEngine').value){researchNotice('���ȵ����ʹ������� R / fixest������ѡ���Ѿ����õ��ƶ����棬������������',true);return;}
  if(researchRunning||researchInputBusy){researchNotice('���ݻ򷽰����ڴ����У���ȴ���ɡ�',true);return;}
  if(!researchData||!sessionId){researchNotice('����ѡ��ģ�ⰸ�����ϴ����ݡ�',true);return;}
  const context=researchContext(),operation=++researchOperationEpoch,snapshot={filename:researchData.filename,text:researchData.text,data_id:researchData.data_id||undefined,instruction:$('researchInstruction').value,candidate:researchCandidate()};
  researchRunning=true;$('researchMakePlan').disabled=true;researchBusyFeedback('����������ǰ���������ǰ����ִ�м��㡣');
  try{
    if(typeof eaFlushDraft==='function'){
      if(!await eaFlushDraft('workbench',context.session)){researchNotice('�ݸ���δ���档�������Ի�˶Գ�ͻ��������������',true);return;}
      if(!researchContextCurrent(context))return;
      const dict=eaDictionaryValues(),submitted=researchData.dictionary||latestState.variable_dictionary||{};
      if(Object.keys(dict).some(k=>(dict[k]||'')!==(submitted[k]||''))){researchNotice('�����ֵ�����δ�ύ�޸ġ�������첽���ύ�ֵ䣬������������',true);eaResearchStep('health');return;}
    }
    const a=await api(`/api/sessions/${context.session}/research/plan`,{method:'POST',body:snapshot});
    if(!researchContextCurrent(context)){if(context.session===sessionId)researchNotice('���������ݻ������Ѿ��仯���ɷ����ظ��Ѷ�����������������');return;}
    researchRenderPlan(a);researchPlan.context=researchContext();
  }catch(e){if(context.session===sessionId)researchNotice(e.message,true);}finally{if(operation===researchOperationEpoch){researchRunning=false;$('researchMakePlan').disabled=false;if(typeof eaUpdateStepAction==='function')eaUpdateStepAction();}}
}
async function researchAskModel(){
  if(!researchData||!sessionId){researchNotice('�����������ݣ�����ģ��ֻ���յ���ժҪ��',true);return;}
  const button=$('researchAiCandidate');if(button.disabled)return;button.disabled=true;
  researchInvalidate();
  const context=researchContext(),snapshot={session_id:context.session,filename:researchData.filename,text:researchData.text,question:$('researchInstruction').value};
  try{
    researchNotice('���ڻ�ȡ��Լ���ĺ�ѡ�������������ݲ��ᷢ�͸�ģ�͡�');
    const result=await api('/api/research/candidate',{method:'POST',body:snapshot});
    if(!researchContextCurrent(context)){if(context.session===sessionId)researchNotice('�����ѱ仯���ɺ�ѡ�ظ�δ�����������˶Ե�ǰ���ݺ��������ʡ�');return;}
    if(result.candidate&&researchProfileCache)researchSetFields(researchProfileCache,result.candidate);else researchInvalidate();
    const box=$('researchAiNote');box.replaceChildren(el('p','',result.warning),el('p','',result.reason||'ģ��δ�������ɡ�'));
    for(const question of result.questions||[])box.append(el('p','',`���˶ԣ�${question}`));
    researchNotice(result.ready?'AI ��ѡ����������������������������ȷ�ϡ�':'���貹����Ϣ��˶Է������������Ȼش��ʡ�');
    if(typeof eaSaveWorkbenchDraft==='function')eaSaveWorkbenchDraft();
  }catch(e){if(context.session===sessionId)researchNotice(e.message,true);}finally{button.disabled=false;if(context.session===sessionId&&typeof eaRefreshModelEvidence==='function')eaRefreshModelEvidence();}
}
async function researchRun(){
  if(researchRunning||researchInputBusy){researchNotice('��ǰ�������ڴ����У���ȴ���ɡ�',true);return;}
  if(!researchPlan||!researchData){researchNotice('��������ԭʼ���ݲ�������ǰ������',true);return;}
  if(researchPlan.context&&!researchContextCurrent(researchPlan.context)){researchInvalidate();researchNotice('���롢���ϻ�����ѱ仯������������������',true);return;}
  if(!researchRuntime?.engines?.[$('researchEngine').value]?.ready){researchNotice('��ǰִ�л��������á���ѡ��������棬������������ȷ�Ϸ�����',true);return;}
  if(!$('researchConfirm').checked){researchNotice('���Ⱥ˶Է�������ѡִ��ȷ�ϡ�',true);return;}
  const context=researchContext(),operation=++researchOperationEpoch;
  const payload={filename:researchData.filename,text:researchData.text,data_id:researchData.data_id||undefined,plan:researchPlan.plan,confirmation_token:researchPlan.confirmation.token,confirmed:true,source:$('researchSource').value,dictionary:researchData.dictionary||latestState.variable_dictionary||{},simulated:Boolean(researchData.simulated),question:$('researchInstruction').value};
  const signature=JSON.stringify([context.session,payload]);if(!researchPendingSubmission||researchPendingSubmission.signature!==signature)researchPendingSubmission={signature,id:crypto.randomUUID()};payload.request_id=researchPendingSubmission.id;
  researchRunning=true;$('researchRun').disabled=true;researchBusyFeedback('���ڱ�����ȷ�ϵ�ִ�����������ظ��ύ��');
  try{
    const j=await api(`/api/sessions/${context.session}/research/jobs`,{method:'POST',body:payload});
    if(!researchContextCurrent(context,false))return;
    researchPendingSubmission=null;
    if(typeof eaResearchStep==='function')eaResearchStep('execute');
    researchWatch(j.id);if(j.execution_location==='browser_webr')await browserRunJob(j);else researchNotice('�������ύ�ƶˣ��ر���ҳ���Լ���ִ�С�');
  }catch(e){if(context.session===sessionId)researchNotice(e.uncertain?'�ύ�����ȷ�ϣ������ѱ����������ύͬһ������˶�ԭ���񣬲����ظ����㡣':e.message,true);}finally{if(operation===researchOperationEpoch){researchRunning=false;$('researchRun').disabled=!researchPlan||!researchRuntime?.engines?.[$('researchEngine').value]?.ready;if(typeof eaUpdateStepAction==='function')eaUpdateStepAction();}}
}
function researchDownload(url,filename){const a=el('a','btn-secondary',filename);a.href=url;a.download=filename;return a;}
function researchWarning(text){
  const messages={
    'The displayed p-values do not establish causality. Model selection must not target statistical significance.':'p ֵ����֤�������ϵ����ҪΪ�˵õ����������������ģ�͡�',
    'The group-mean plot is descriptive, not an event-study regression or proof of parallel trends. Causal claims require design evidence.':'���ֵͼֻ�����仯�������¼��о��ع飬Ҳ����֤��ƽ�����ơ����������Ҫ�о����֤�ݡ�',
    'Fewer than three pre-policy periods: descriptive pretrend information is limited.':'����ǰ���������۲�ʱ�ڣ�������Ϣ���ޡ�',
    'Complete-case deletion may change sample composition; it does not resolve missing-data bias.':'ɾ���������п��ܸı��������ɣ������Զ����ȱʧ������ɵ�ƫ�',
    'Fewer than 30 clusters; conventional cluster-robust inference can be fragile. This threshold is a teaching reminder, not a guarantee.':'���������� 30����������Ƚ��ƶϿ��ܲ��ȶ���30 �ǽ�ѧ������ֵ�����ǿɿ��Եı�֤��'
  };
  return messages[text]||text;
}
function researchDrawJob(j){
  const signature=JSON.stringify([j.id,j.status,j.record_version,j.error,j.sync_error,j.stale,j.verification]);
  researchJob=j;if(!window.eaSelectedTask||window.eaSelectedTask.id===j.id)window.eaSelectedTask={id:j.id,session_id:j.session_id||sessionId,engine_id:j.engine_id||'browser_webr'};const box=$('researchResult');
  if(typeof eaUpdateStepAction==='function')eaUpdateStepAction();
  if(box.dataset.signature===signature)return;
  box.dataset.signature=signature;box.replaceChildren();
  const explanation=$('researchExplanation');explanation.replaceChildren(el('h3','','�������'),el('p','workspace-note','������ɺ󣬿����Լ��Ļ�����ϵ������λ����ޡ�'));
  const statuses={queued:'�Ŷ���',preparing:'׼������',estimating:'���ڹ���',saving:'���ڱ���',cancelled:'��ȡ��',running:'����ִ��',succeeded:'�������',failed:'ִ��ʧ��',interrupted:'ִ�����ж�'};
  box.append(el('span','section-kicker','�������'),el('h3','',`${j.description.label} �� ${statuses[j.status]||j.status}`));
  const steps=el('ol','research-progress');
  const stopped=['failed','interrupted','cancelled'].includes(j.status);
  for(const [label,done]of [['������ȷ��',true],[j.execution_location==='cloud_native'?'�ƶ������Ѽ�¼':'����������Ѵ���',true],[j.status==='succeeded'?'���������':stopped?'����δ���':'�ȴ��������',j.status==='succeeded'],[j.status==='succeeded'?'����ѱ���':stopped?'û�п��ý��':'�ȴ�������',j.status==='succeeded']]){const li=el('li',done?'done':'',label);steps.append(li);}box.append(steps);
  if(['failed','interrupted','cancelled'].includes(j.status))steps.setAttribute('aria-label','ִ��δ��ɣ�δ�����ѱ�����');
  box.append(el('p','',j.simulated?'ģ���ѧ���� �� ������Ϊ��ʵ����֤��':'�û��ṩ���� �� ��Դ��ʶ������δ�Զ���ʵ'),el('p','workspace-note',j.execution_location==='cloud_native'?`�������ƶ�ԭ�� ${j.software==='stata'?'Stata':j.software==='python'?'Python / StatsPAI':'R/fixest'}ִ�С���վ��������֤�ݣ�δ���и��㡣`:'���� R/fixest �������ִ�С����������沢У���ύ��ʽ��û�ж���������ֵ��'),el('code','research-formula',j.description.formula));
  if(j.stale)box.append(el('p','resource-caution','�о���ͼ�Ѹı䣺�·���Ӧ�ɷ�������˶Ժ��������С�'));
  if(['queued','running','preparing','estimating','saving'].includes(j.status))box.append(button('ȡ����ǰ����','btn-secondary',()=> (j.execution_location==='cloud_native'?api(`/api/research/jobs/${j.id}/interrupt`,{method:'POST'}).then(()=>researchWatch(j.id)):browserInterruptJob(j.id)).catch(e=>researchNotice(e.message,true))));
  if(j.sync_error)box.append(el('p','resource-caution',`�ƶ�״̬��δͬ����${j.sync_error}�������¼���������Ժ�ˢ�¡�`));
  if(['failed','interrupted','cancelled'].includes(j.status)){
    box.append(el('p','resource-caution',j.error||'ִ���жϡ�û�в������ûع�����'));
    box.append(button('���ִ�л���','btn-secondary',()=>{eaResearchStep('data');$('researchRuntime').open=true;$('researchRuntime').scrollIntoView({block:'start'});}));
    box.append(button('�����ѱ������룬���º˶Է���','btn-secondary',async()=>{
      if(researchRunning){researchNotice('��ȴ���ǰ������ɡ�',true);return;}const context=researchBeginInput();
      try{
        const material=j.data_id?await api(`/api/sessions/${context.session}/research/data/${j.data_id}`):null;
        const saved=material?{filename:material.format==='dta'?'normalized.csv':material.filename,original_text:material.text}:await api(`/api/research/jobs/${j.id}/input`);
        if(!researchContextCurrent(context,false))return;
        const profile=await api(`/api/sessions/${context.session}/research/inspect`,{method:'POST',body:{filename:saved.filename,text:saved.original_text}});
        if(!await researchCommitInput({...material,data_id:j.data_id||null,filename:saved.filename,text:saved.original_text,source_filename:material?.filename||j.source_filename,simulated:j.simulated,dictionary:j.dictionary,source:j.source||'',question:j.question||''},profile,j.plan,context))return;
        eaResearchStep('plan');
        researchNotice('�ѻָ����롣������������ȷ�Ϸ����������С�');
      }catch(e){if(researchContextCurrent(context,false))researchNotice(e.message,true);}finally{if(researchContextCurrent(context,false)){researchInputBusy=false;if(typeof eaUpdateStepAction==='function')eaUpdateStepAction();}}
    }));return;
  }
  if(j.status!=='succeeded'){box.append(el('p','muted','���񱣴��ڷ�������ˢ�º�ɴӵ�ǰ��ϰ�ķ�����¼�����鿴��'));return;}
  const r=j.result;
  const evidence=el('details','ea-result-evidence'),evidenceBody=el('div');evidence.append(el('summary','','�������顢������ͼ�����'),evidenceBody);
  for(const node of [box.querySelector('.research-progress'),box.querySelector(':scope>.workspace-note'),box.querySelector(':scope>.research-formula')])if(node)evidenceBody.append(node);
  box.append(el('p','ea-result-summary',`�������� ${r.n_used} �� �� ���ϰ汾 ${j.research_revision??'��ʷδ��¼'} �� �����汾 ${j.record_version||1} �� ${j.verification?.status==='consistent'?'ͬ���渴��һ��':j.verification?.status==='inconsistent'?'ͬ���渴���в���':'��δ�����˶�'}`));
  if(j.verification?.differences?.length)evidenceBody.append(el('pre','',JSON.stringify(j.verification.differences,null,2)));
  let rerunRequestId=null;const rerun=button('��ԭʼ����������ܺ˶�','btn-secondary',async()=>{if(researchRunning){researchNotice('��ǰ�������ڴ����У����Ժ����ܡ�',true);return;}const context=researchContext(),operation=++researchOperationEpoch;researchRunning=true;rerun.disabled=true;researchBusyFeedback('���ڴ���������������');rerunRequestId||=crypto.randomUUID();try{const next=await api(`/api/research/jobs/${j.id}/rerun`,{method:'POST',body:{request_id:rerunRequestId}});if(!researchContextCurrent(context,false))return;rerunRequestId=null;eaResearchStep('execute');await researchWatch(next.id);if(next.execution_location!=='cloud_native')await browserRunJob(next,true);}catch(e){if(context.session===sessionId)researchNotice(e.message,true);}finally{if(operation===researchOperationEpoch){researchRunning=false;rerun.disabled=false;if(typeof eaUpdateStepAction==='function')eaUpdateStepAction();}}});evidenceBody.append(rerun);
  evidenceBody.append(el('p','',`${r.software_version||r.r_version} �� ${JSON.stringify(r.package_versions)} �� ʵ�ʹ��� ${r.n_used} ��${r.clusters?' �� '+r.clusters+' ������':''}`));
  const wrap=el('div','table-scroll'),table=el('table','research-table'),head=el('tr');
  for(const label of ['����','ϵ��','��׼��','p ֵ','95% ����'])head.append(el('th','',label));table.append(head);
  const focus=el('section','ea-coefficient-focus');focus.setAttribute('aria-live','polite');
  function selectCoefficient(c,row){
    for(const tr of table.querySelectorAll('tr'))tr.classList.remove('ea-selected-coefficient');row.classList.add('ea-selected-coefficient');
    focus.replaceChildren(el('h4','',`${c.term==='(Intercept)'?'�ؾ�':c.term}��ϵ��������`),el('p','',`���� ${c.estimate.toPrecision(6)}��95% ���� [${c.ci_low.toPrecision(6)}, ${c.ci_high.toPrecision(6)}]`),el('p','workspace-note',`���������${j.dictionary?.[j.plan.outcome]||'�����뵥λδ�ṩ����˶�'}�����ͱ�����${j.dictionary?.[c.term]||(c.term==='DID effect'?'���ߺ�Ĵ��������仯':c.term==='(Intercept)'?'�ؾࣨ��������������㣩':'�����뵥λδ�ṩ����˶�')}`));
    const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 440 64');svg.setAttribute('role','img');svg.setAttribute('aria-label',`${c.term} ��ʵ�ʹ��Ƽ�95%����`);
    const lo=Math.min(0,c.ci_low),hi=Math.max(0,c.ci_high),x=v=>24+(v-lo)/(hi-lo||1)*392;
    for(const [tag,attrs]of [['line',{x1:x(0),x2:x(0),y1:8,y2:56,stroke:'#9aacae','stroke-dasharray':'3 3'}],['line',{x1:x(c.ci_low),x2:x(c.ci_high),y1:32,y2:32,stroke:'#087e75','stroke-width':4}],['circle',{cx:x(c.estimate),cy:32,r:6,fill:'#087e75'}]]){const mark=document.createElementNS(svg.namespaceURI,tag);for(const[k,v]of Object.entries(attrs))mark.setAttribute(k,v);svg.append(mark);}focus.append(svg,el('p','workspace-note','Բ�㣺���ƣ����ߣ�95% ���䣻���ߣ��㡣�����������Բ��ܵ���֤�������'));
    window.dispatchEvent(new CustomEvent('ea-teaching-context',{detail:{kind:'result',task:j,term:c.term}}));
    const mirror=$('researchExplanation')?.querySelector('.ea-coefficient-focus');if(mirror)mirror.replaceChildren(...[...focus.childNodes].map(n=>n.cloneNode(true)));
    if(!document.hidden&&!learningMotionReduced())focus.animate([{opacity:.65,transform:'translateY(3px)'},{opacity:1,transform:'translateY(0)'}],{duration:180});
  }
  for(const c of r.coefficients){const row=el('tr');row.tabIndex=0;row.setAttribute('aria-label',`ѡ�� ${c.term} �鿴�����뵥λ`);row.onclick=()=>selectCoefficient(c,row);row.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();selectCoefficient(c,row);}};for(const value of [c.term,c.estimate.toPrecision(5),c.std_error.toPrecision(4),c.p_value.toPrecision(4),`[${c.ci_low.toPrecision(4)}, ${c.ci_high.toPrecision(4)}]`])row.append(el('td','',value));table.append(row);}
  wrap.append(table);evidenceBody.append(wrap);
  box.append(focus);selectCoefficient(r.coefficients.find(c=>c.term!=='(Intercept)')||r.coefficients[0],table.querySelectorAll('tr')[r.coefficients.findIndex(c=>c.term!=='(Intercept)')+1]||table.querySelectorAll('tr')[1]);
  if(j.engine_id==='statspai_cloud'){
    const teaching=el('details','ea-corresponding-code'),body=el('div');teaching.append(el('summary','','Stata ��Ӧ����'),body);
    let loaded=false;teaching.addEventListener('toggle',async()=>{if(!teaching.open||loaded)return;body.textContent='���ڶ�ȡ��Ӧ���롭';
      try{const context=researchContext(),code=await api(`/api/research/jobs/${j.id}/stata-code`);if(!researchContextCurrent(context,false)||researchJob?.id!==j.id)return;
        if(window.eaCorrespondingCard){body.replaceChildren(eaCorrespondingCard(code,{task_id:j.id,result:j.result}));loaded=true;return;}
        const pre=el('pre');pre.textContent=code.code;body.replaceChildren(el('p','muted','��ѧ���룬�ɸ��Ƶ� Stata �Ķ������У����μ����� StatsPAI ��ɡ�'),pre);
        for(const note of code.differences||[])body.append(el('p','muted',note));
        const copy=button('���ƴ���','btn-secondary',async()=>{try{await navigator.clipboard.writeText(code.code);copy.textContent='�Ѹ���';}catch{copy.textContent='����ʧ�ܣ���ѡ��������';}});body.append(copy);loaded=true;
      }catch(e){body.textContent='��ȡʧ�ܣ�'+e.message+'���رպ�����չ�������ԡ�';}});box.append(teaching);
  }
  const selector=el('select');selector.setAttribute('aria-label','ѡ��Ҫ���͵�ϵ��');for(const c of r.coefficients)selector.append(new Option(c.term,c.term));selector.value=(r.coefficients.find(c=>c.term!=='(Intercept)')||r.coefficients[0]).term;
  for(const option of selector.options)option.textContent=option.value==='(Intercept)'?'�ؾࣨ�鿴��㺬�壩':`${option.value} �� �鿴ϵ���������뵥λ`;
  selector.className='ea-coefficient-selector';selector.onchange=()=>{const index=r.coefficients.findIndex(c=>c.term===selector.value);selectCoefficient(r.coefficients[index],table.querySelectorAll('tr')[index+1]);const other=$('researchExplanation')?.querySelector('.ea-coefficient-selector');if(other)other.value=selector.value;};box.insertBefore(selector,focus);
  const figure=el('figure'),img=el('img');img.src=`/api/research/jobs/${j.id}/artifacts/coefficients.svg`;img.alt='����ִ�е�ϵ����95%��������ͼ';figure.append(img,el('figcaption','muted',j.execution_location==='cloud_native'?'ϵ�������������ƶ�ԭ��ִ�У���Դ��ʶ����������˶ԡ�':'ϵ��������������� webR �ύ��������δ�������㡣'));evidenceBody.append(figure);
  if(j.plan.method==='did'){
    const f=el('figure'),im=el('img');im.src=`/api/research/jobs/${j.id}/artifacts/group_trends.svg`;im.alt='���������Ĵ�������������ֵ�仯';f.append(im,el('figcaption','muted','���ֵ�仯��������ͼ�������¼��о��ع��ƽ������֤����'));evidenceBody.append(f);
  }
  box.append(el('h4','','�ѽ������'),el('p','',j.description.meaning));
  const first=r.coefficients.find(c=>c.term==='DID effect')||r.coefficients.find(c=>c.term!=='(Intercept)');
  if(first){const meaning=j.plan.method==='did'?'�����������ߺ�Ķ���仯����λ��������һ��':'�ý��ͱ�������һ����λ�����������������仯��أ���λ��Ҫ��ϱ���˵��';box.append(el('p','',`${first.term} �Ĺ���ϵ��Ϊ ${first.estimate.toPrecision(5)}��${meaning}����ͬʱ�Ķ����䣬������ p ֵ��`));}
  const warnings=el('details');warnings.append(el('summary','',`���ݴ����뷽�����ѣ�${r.warnings.length}��`));for(const w of r.warnings)warnings.append(el('p','',researchWarning(w))); warnings.append(el('p','',`ѡ������ȱʧɾ�� ${r.audit.missing_removed_csv_lines.length} �У�ģ�����ų� ${r.audit.model_removed_count||0} �С�ȱʧ��ģ���ų���ԭʼ�кż����棻��ʷ�������δ��¼ģ������������`));evidenceBody.append(warnings);
  if(r.warnings.length)box.append(el('p','resource-caution',`${r.warnings.length} �����ѣ�${researchWarning(r.warnings[0])} �������Ѽ���ϸ֤�ݡ�`));
  const trace=el('details');trace.append(el('summary','','�鿴����ִ�м�¼'));for(const t of j.tool_trace)trace.append(el('p','',`${t.transport} �� ${t.tool}`));evidenceBody.append(trace);
  const links=el('div','research-actions');links.append(researchDownload(`/api/research/jobs/${j.id}/report`,'���ط�������.md'),researchDownload(`/api/research/jobs/${j.id}/report.pdf`,'���ط�������.pdf'),researchDownload(`/api/research/jobs/${j.id}/package`,'�����������ְ�.zip'));box.append(links);
  box.append(el('p','workspace-note',j.reflections?.length?'�������ύ���Կɼ����޶���':'������ϰ����ɣ����������ط������棬�Ժ����ѧϰ��'),evidence);
  explanation.replaceChildren(el('h3','',`${j.description.label} �� ���ͽ��`),el('p','ea-result-summary',`ʵ�ʹ��� ${r.n_used} �� �� ${j.execution_location==='cloud_native'?'�ƶ�ԭ��ִ��':'����� webR ִ��'} �� ��Դ���������δ�Զ���ʵ`));
  const explanationFocus=focus.cloneNode(true),explanationSelector=selector.cloneNode(true);explanationSelector.value=selector.value;explanationSelector.setAttribute('aria-label','ѡ�������ϰ�е�ϵ��');explanationSelector.onchange=()=>{selector.value=explanationSelector.value;selector.onchange();};explanation.append(explanationSelector,explanationFocus);
  const reflection=el('section','research-reflection');reflection.append(el('span','section-kicker','���Լ��Ļ�����'),el('h4','',j.description.quiz));
  const attempts=j.reflections?.length?j.reflections:(j.reflection?[j.reflection]:[]);
  const history=el('div','reflection-history');
  const lastAttempt=attempts.at(-1);
  if(lastAttempt){const preview=el('section','ea-feedback-preview');preview.append(el('h4','','���·���Ԥ��'),el('p','workspace-note',`�� ${lastAttempt.answer_version||attempts.length} �ν��� �� ${lastAttempt.mode==='ai_advice'?'AI ����':'�����Բ�'} �� ${lastAttempt.model||'������ʾ'} �� ${lastAttempt.prompt_version||'��ʾ�ʰ汾δ��¼'} �� �������� ${j.id}`),el('p','',Array.from(String(lastAttempt.feedback||'')).slice(0,240).join('')+(Array.from(String(lastAttempt.feedback||'')).length>240?'��':'')));const full=el('details');full.append(el('summary','','չ����������������˵��'));const body=el('div','prose');markdown(body,lastAttempt.feedback||'');full.append(body,el('p','workspace-note',lastAttempt.interaction_id?`������ʾ�������ò��ϱ�ż�����¼�뱨�桱�Ľ��� ${lastAttempt.interaction_id}��`:'����δ��¼ģ�ͽ�����ţ����������ò��ϡ�'));preview.append(full);reflection.append(preview);}
  attempts.forEach((attempt,i)=>{const item=el('details');item.append(el('summary','',`�� ${i+1} �ν��� �� ${attempt.mode==='ai_advice'?'AI ����':'�Բ��嵥'}`),el('p','',attempt.answer));const body=el('div','prose');markdown(body,attempt.feedback);item.append(body);history.append(item);});
  const draftKey=`reflection:${j.id}`,draft=eaDraftEntry(draftKey);if(!draft.version&&latestState?.research_drafts?.[draftKey])Object.assign(draft,latestState.research_drafts[draftKey]);
  const input=el('textarea');input.id='researchReflection';input.setAttribute('aria-label','���ϵ�����������');input.rows=5;input.maxLength=2000;input.placeholder='ϵ����Ӧʲô�仯����λ��ʲô����Щ������δ��֤��';input.value=draft.value.answer??attempts.at(-1)?.answer??'';
  const draftNote=el('p','ea-draft-status');draftNote.setAttribute('role','status');eaDraftMessage(draft,draftNote);draft.node=draftNote;
  input.oninput=()=>eaQueueDraft(draftKey,{answer:input.value,based_on_answer_version:attempts.length},draftNote);
  const feedback=el('div','prose');
  const submit=button(attempts.length?'�ύ�޶�����':'�ύ�״ν���','btn-primary',async()=>{
    if(submit.disabled)return;if(!input.value.trim()){feedback.textContent='����д��ϵ������λ��һ����δ��֤��������';input.focus();return;}const context=researchContext(),submitted=input.value;submit.disabled=true;$('eaNextAction').disabled=true;feedback.textContent='���ڱ�����Ͳ���ȡ�������ɼ����༭��һ��ݸ塣';
    try{if(!await eaFlushDraft(draftKey,context.session))throw Error('���Ͳݸ���δ���棬���ȴ�����������汾��ͻ��');await api(`/api/research/jobs/${j.id}/reflection`,{method:'POST',body:{answer:submitted,answer_version:attempts.length,session_id:context.session}});if(context.session!==sessionId)return;if(input.value===submitted)eaQueueDraft(draftKey,{answer:submitted,based_on_answer_version:attempts.length+1,submitted:true},draftNote,context.session);await eaFlushDraft(draftKey,context.session);if(researchJob?.id===j.id)await researchWatch(j.id);if(typeof eaRefreshModelEvidence==='function')await eaRefreshModelEvidence();toast('�������ύ�������Ѹ��£��ȴ��ڼ�������ֱ���Ϊ�ݸ塣');}
    catch(e){if(context.session===sessionId)feedback.textContent=e.message;}finally{submit.disabled=false;if(context.session===sessionId)eaUpdateStepAction();}
  });submit.id='researchReflectionSubmit';reflection.append(input,draftNote,el('p','muted','AI ����ֻ������Ļش�����ܽ�������ϴ��������ݣ���ģ��ʱ�ṩ��ȷ��ע���Բ��嵥��'),submit,feedback);explanation.append(reflection,el('p','workspace-note',attempts.length?'���ύ����ѡ�޶���':'������ϰ����ɣ��ݸ岻��Ϊ����ɳɹ���'),links.cloneNode(true));
  if(attempts.length){const past=el('details','ea-reflection-history');past.append(el('summary','',`�鿴�״ν������޶���ʷ��${attempts.length} �Σ�`),history);reflection.append(past);}
  if(typeof eaUpdateStepAction==='function')eaUpdateStepAction();
}
async function researchWatch(id){
  clearTimeout(researchPoll);const epoch=++researchEpoch,context=researchContext();
  async function poll(){
    try{
      const j=await api(`/api/research/jobs/${id}`);if(epoch!==researchEpoch||context.session!==sessionId||context.account!==(window.EA_ACCOUNT?.id||'')||j.session_id&&j.session_id!==sessionId)return;researchDrawJob(j);
      if(['queued','running','preparing','estimating','saving'].includes(j.status))researchPoll=setTimeout(poll,1200);
      else researchRefreshHistory();
    }catch(e){if(epoch===researchEpoch)researchNotice(e.message,true);}
  }
  await poll();
}
async function researchRefreshHistory(){
  if(!sessionId)return;
  const id=sessionId;try{const r=await api(`/api/sessions/${id}/research/jobs`);if(id===sessionId)researchHistory(r.jobs);}catch(e){if(id===sessionId)researchNotice(e.message,true);}
}
function researchHistory(jobs){
  const box=$('researchHistory');box.replaceChildren(el('h4','','��ǰ��ϰ�ķ�����¼'));
  if(!jobs.length)box.append(el('p','muted','���޷�����¼��'));
  const states={queued:'�Ŷ���',running:'����ִ��',preparing:'׼������',estimating:'���ڹ���',saving:'���ڱ���',succeeded:'�������',failed:'ִ��ʧ��',cancelled:'��ȡ��',interrupted:'���ж�'};
  for(const j of jobs)box.append(button(`${researchNames[j.plan.method]} �� ${new Date(j.created*1000).toLocaleString()} �� ${states[j.status]||j.status}`,'research-history-item',()=>{eaSetTask('research');eaResearchStep('execute');window.eaAnalysisEngine=j.engine_id||'statspai_cloud';window.eaSelectedTask={id:j.id,session_id:sessionId,engine_id:j.engine_id||'browser_webr'};window.dispatchEvent(new CustomEvent('ea-local-tasks',{detail:{tasks:latestState?.local_stata_tasks||[],session:sessionId}}));researchWatch(j.id);}));
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
  const tab=button('��������','',()=>{selectTab('research');setView(true);});tab.id='tab-research';tab.dataset.tab='research';tab.setAttribute('role','tab');tab.setAttribute('aria-controls','pane-research');tab.setAttribute('aria-selected','false');tab.tabIndex=-1;document.querySelector('.workspace-tabs').append(tab);
  const header=button('����ʵ��','btn-secondary',()=>{setWorkspace(true);selectTab('research');setView(true);});header.id='openResearch';document.querySelector('.header-actions').prepend(header);
  const pane=el('section','research-workbench');pane.id='pane-research';pane.hidden=true;pane.setAttribute('role','tabpanel');pane.setAttribute('aria-labelledby','tab-research');
  pane.append(el('span','section-kicker','��ѧ����'),el('h2','','�˶Է������ٽ�����������'),el('p','research-lead','ѡ������ �� �˶Է�����������ִ��λ�� �� �鿴��ʵ��� �� �Լ����Ͳ����㡣'));
  pane.append(el('p','workspace-note','�����������¼���ϴ��ļ������ڷ����������� 7 ���ܾ����ʣ����������ӿ���ʵ�֣��ƶ˶�ʱ���ȴ��ָ������ں�һСʱ��ɾ����δ���ա�������ϴ������������ݣ�������ʷ��ϰ���ֶ�ɾ��������ǰ������'));
  const runtime=el('details','research-runtime');runtime.open=false;runtime.id='researchRuntime';runtime.append(el('summary','','���ڼ��ִ�л�����'));pane.append(runtime);
  const cases=el('div','research-cases');for(const [id,label] of Object.entries(researchNames))cases.append(button(`���鰸�� �� ${label}`,'research-case',()=>researchSample(id)));pane.append(cases);
  const lesson=el('section','research-method-lesson');lesson.id='researchLesson';pane.append(lesson);
  const grid=el('div','research-grid'),form=el('section','research-input'),output=el('section','research-output');
  form.append(el('span','section-kicker','01 ׼������'),el('h3','','�������о�����'));
  const label=el('label','research-field','�ϴ� CSV / TSV / DTA�����2MB��20000�У�'),file=el('input');file.type='file';file.accept='.csv,.tsv,.dta';file.id='researchFile';label.append(file);form.append(label);
  let uploadRequest=null;
  file.onchange=async()=>{const f=file.files[0];if(!f)return;if(f.size>2000000){researchNotice('�ļ�����2MB��',true);return;}if(!sessionId||researchRunning){researchNotice('��ȴ���ǰ������ɡ�',true);return;}
    if(!confirm('�ļ����ϴ����������ڼ�顢����ͼ��㣬��ϰ���������ڡ�ģ�ͽ�����ժҪ����ȷ����Ȩ�ϴ���'))return;
    const context=researchBeginInput(),signature=JSON.stringify([context.session,f.name,f.size,f.lastModified,window.eaImportDictionary||{}]);
    if(uploadRequest?.signature!==signature)uploadRequest={signature,id:crypto.randomUUID()};
    try{const form=new FormData();form.append('file',f);form.append('request_id',uploadRequest.id);form.append('state_version',latestState.state_version);form.append('dictionary',JSON.stringify(window.eaImportDictionary||{}));
      const response=await fetch(`/api/sessions/${context.session}/research/data`,{method:'POST',body:form,credentials:'same-origin',signal:AbortSignal.timeout(20000)}),material=await response.json();
      if(!response.ok)throw Error(material.detail||'�����ϴ�ʧ�ܣ�������');if(!researchContextCurrent(context,false))return;
      const data={...material,filename:material.format==='dta'?'normalized.csv':material.filename,source_filename:material.filename,simulated:material.metadata.simulated,dictionary:material.metadata.dictionary,source:material.metadata.source};
      if(await researchCommitInput(data,material.profile,{},context))researchNotice('�������ֶμ��г����ı�ǩ���ֵ䡣��ѡ�������δ֪��λ���Ժ󲹡�');
    }catch(e){if(researchContextCurrent(context,false))researchNotice(e.name==='TimeoutError'?'�ϴ������ȷ�ϣ�����ѡͬһ�ļ����ԣ������ظ��������ϡ�':e.message,true);}
    finally{if(researchContextCurrent(context,false)){researchInputBusy=false;if(typeof eaUpdateStepAction==='function')eaUpdateStepAction();}}
  };
  const download=button('���ص�ǰ����������','text-btn',()=>{if(!researchData)return;const a=el('a');const url=URL.createObjectURL(new Blob([researchData.text],{type:'text/csv;charset=utf-8'}));a.href=url;a.download=researchData.filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});form.append(download);
  const profile=el('div','research-profile');profile.id='researchProfile';form.append(profile);const dictionary=el('details','research-dictionary');dictionary.id='researchDictionary';form.append(dictionary);
  const instruction=researchField('researchInstruction','����Ȼ�������������о�ʲô','textarea');instruction.querySelector('textarea').rows=3;instruction.querySelector('textarea').maxLength=2000;form.append(instruction);
  const source=researchField('researchSource','������Դ�������λ','textarea');source.querySelector('textarea').rows=2;source.querySelector('textarea').maxLength=1000;form.append(source);
  form.append(el('p','muted','�������ʱ������ģ�ͷ����о����⡢���������͡�ȱʧ��������������������ֻ������Ӧ�ú��ܿؼ������'));
  const aiCandidate=button('AI �����ѡ��������˶ԣ�','btn-secondary',researchAskModel);aiCandidate.id='researchAiCandidate';aiCandidate.hidden=true;
  const aiNote=el('div','workspace-note');aiNote.id='researchAiNote';form.append(aiCandidate,aiNote);
  const transfer=el('div','research-prep-transfer');transfer.id='researchPrepTransfer';form.append(transfer);
  const params=el('details','research-parameters');params.open=true;params.append(el('summary','','���������'));
  const engine=researchField('researchEngine','������ִ��λ��');engine.querySelector('select').replaceChildren(new Option('�ƶ˼��㣨���谲װ��','statspai_cloud'),new Option('����ѡ��ִ�з�ʽ',''),new Option('����� R / fixest�������ƶ˽ڵ㣩','browser_webr'),new Option('�ƶ�ԭ�� R��������ú󿪷ţ�','r_native'),new Option('�ƶ� Stata����Ȩ�����������գ�','stata_native'));params.append(engine,el('p','workspace-note','Ĭ���ƶ˼��㣬���谲װ���������ݻ��ϴ�����������ϰ���������ڡ������ R ������ѡ����Ϊ���á��л���ʽ������ȷ�ϡ�'));
  const method=researchField('researchMethod','��������');method.querySelector('select').replaceChildren(...Object.entries(researchNames).map(([v,t])=>new Option(t,v)));params.append(method,researchField('researchOutcome','������� Y'));
  const predictors=el('fieldset');predictors.append(el('legend','','���ͱ��� / DID ���Ʊ���'));const checks=el('div','research-predictors');checks.id='researchPredictors';predictors.append(checks);params.append(predictors);
  const panel=el('div');panel.id='researchPanelFields';panel.hidden=true;panel.append(researchField('researchUnit','������'),researchField('researchTime','���'));params.append(panel);
  const did=el('div');did.id='researchDidFields';did.hidden=true;did.append(researchField('researchTreated','�̶������飨0/1�����ݲ�������ݱ仯��'),researchField('researchYear','����ʵʩ���','input'));did.querySelector('input').type='number';
  const same=el('label','research-check'),sameCheck=el('input');sameCheck.id='researchSameBatch';sameCheck.type='checkbox';same.append(sameCheck,document.createTextNode('���Ѻ�ʵ��ͬ��ʵʩ���������о�����δ�ܴ����ߡ�'));did.append(same);params.append(did);
  const vcov=researchField('researchVcov','��׼������');vcov.querySelector('select').replaceChildren(new Option('�췽���Ƚ�','hetero'),new Option('�����Ƚ�','cluster'),new Option('ͬ��������ݣ�','iid'));params.append(vcov);
  const cluster=researchField('researchCluster','������');cluster.id='researchClusterWrap';cluster.hidden=true;params.append(cluster);
  const missing=researchField('researchMissing','ѡ������ȱʧʱ');missing.querySelector('select').replaceChildren(new Option('ֹͣ���Ⱥ˲�����','block'),new Option('��ȷ����ɾ���������в���¼','drop'));params.append(missing);
  params.onchange=(event)=>{researchMethodChange(true,event.target.id==='researchMethod');};form.append(params);
  instruction.oninput=researchInvalidate;source.oninput=researchInvalidate;
  const make=button('�����������Ȳ�ִ�У�','btn-primary',researchMakePlan);make.id='researchMakePlan';form.append(make);
  const notice=el('p','research-notice');notice.id='researchNotice';notice.setAttribute('role','status');notice.setAttribute('aria-live','polite');form.append(notice);
  const plan=el('div','research-plan');plan.id='researchPlanCard';output.append(plan);
  const confirm=el('label','research-check'),check=el('input');check.type='checkbox';check.id='researchConfirm';check.onchange=()=>eaUpdateStepAction();confirm.append(check,document.createTextNode('���Ѻ˶Է��������ݴ�����������δ��֤��������ͬ��ִ�б��η�����'));output.append(confirm);
  const run=button('��ȷ�ϵ�����ִ��','btn-primary',researchRun);run.id='researchRun';run.disabled=true;output.append(run);
  const result=el('div','research-result');result.id='researchResult';output.append(result);const history=el('div','research-history');history.id='researchHistory';output.append(history);
  const explanation=el('section','ea-explanation');explanation.id='researchExplanation';explanation.dataset.researchStage='explain';explanation.append(el('h3','','�������'),el('p','workspace-note','��ɷ�������������ϰ����ϵ������λ����ޡ����Ȳ鿴�������衣'));output.append(explanation);
  grid.append(form,output);pane.append(grid);document.querySelector('.workspace-body').append(pane);
  api('/api/research/status').then(s=>{
    researchRuntime=s;runtime.replaceChildren(el('summary','','����ִ�з�ʽ'),el('strong','',s.engines.statspai_cloud?.ready?'�ƶ˼����Ѿ���':'�ƶ˼�����δ������������ѡ������� R ����'));
    const engineSelect=$('researchEngine');if(!engineSelect.value)engineSelect.value=s.default_engine||'statspai_cloud';
    for(const option of engineSelect.options){if(['statspai_cloud','r_native','stata_native'].includes(option.value)){const capability=s.engines[option.value];option.disabled=!capability?.ready;option.textContent=`${option.value==='statspai_cloud'?'�ƶ˼���':option.value==='r_native'?'�ƶ�ԭ�� R':'�ƶ� Stata'}��${capability?.status||'δ����'}��`;}}
    runtime.append(el('p','workspace-note','Ĭ���ƶ˼��㣬���谲װ���������������ݣ��ٺ˶Բ�ȷ�Ϸ������������ƶ�ʧ�ܺ��Զ���������������'));
    const browserChoice=button('ʹ������� R / fixest','btn-primary',()=>{if(researchRunning){researchNotice('��ȴ����жϵ�ǰ������л�ִ�з�ʽ��',true);return;}engineSelect.value='browser_webr';researchInvalidate();researchNotice('��ѡ������� R / fixest�����������ݡ���������������ȷ�ϣ��ⲻ���ƶ�ִ�С�');});runtime.append(browserChoice);
    const state=el('p','workspace-note');state.id='eaRuntimeStatus';state.setAttribute('role','status');
    const initialize=button('��鲢��ʼ������� R','btn-secondary',async()=>{if(researchRunning)return;initialize.disabled=true;state.textContent='�������ػ��ʼ������� R �� fixest��';try{const r=await eaInitWebR();const version=await r.evalRString("paste('R',getRversion(),'�� fixest',as.character(packageVersion('fixest')))");state.textContent=`�����ִ�л����Ѿ�����${version}������ѡ��ִ�з�ʽ��ȷ�Ϸ�����`;if(typeof eaRefreshEnvironment==='function')eaRefreshEnvironment();}catch(e){runtime.open=true;state.textContent=`��ʼ��ʧ�ܣ�${e.message}������������������ԡ�`;}finally{initialize.disabled=false;}});runtime.append(initialize,state);
    const detail=el('details');detail.append(el('summary','','�鿴��������ģ��״̬'),el('p','',s.engines.r_native.reason));
    for(const software of s.software)detail.append(el('span','research-chip',`${software.label}��${software.status}`));
    detail.append(el('p','muted',s.planner_mode==='online'?'��ѡ����ģ�������ã���ʵ�ӿڴ�ʵ�⣻ѧ��ȷ�Ϻ��ִ�С�':'δ��������ģ�ͣ���ʹ�ÿγ̡��ֶ��������Բ��嵥��'));runtime.append(detail);aiCandidate.hidden=s.planner_mode!=='online';
  }).catch(e=>runtime.textContent=e.message);
  researchRenderLesson();
}
setupResearch();
