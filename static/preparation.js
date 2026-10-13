"use strict";

const PREP_COMMON = {
  question:'研究问题与目标', sample:'研究对象与观察时期', outcome:'结果变量、单位与口径',
  predictor:'解释变量或处理因素', data_source:'结果数据来源与年份', access:'获取方式、使用条件与缺失字段'
};
const PREP_POLICY = {
  policy_doc:'政策原文、机关、名称与文号', release_date:'发布日期', effective_date:'实施日期',
  expansion_date:'扩围日期或后续批次', treated_list:'处理名单与出处', comparison:'比较对象与选择理由'
};
const PREP_STATUS = {to_find:'待查找',filled:'已填写 · 待核对',verified:'学生已核对'};
const prepDrafts = new Map();

function prepField(label,value,tag='input'){
  const wrap=el('label','prep-field',label),input=el(tag);
  input.value=value||'';
  input.maxLength=tag==='textarea'?1500:500;
  if(tag==='textarea')input.rows=3;
  wrap.append(input);return {wrap,input};
}

function renderPreparation(data){
  const root=$('preparationContent');if(!root)return;
  root.replaceChildren(el('span','section-kicker','从问题到数据'),el('h3','','研究准备清单'),
    el('p','workspace-note','逐项记录证据。AI 建议和已填写内容都不等于来源已核对；来源状态由你自己标记。'));
  const prep=data.preparation||{question_type:'association',cards:{}};
  const type=el('label','prep-field','研究问题类型'),select=el('select');
  select.append(new Option('一般关联研究（OLS／固定效应）','association'),new Option('政策评估（含 DID 条件）','policy_evaluation'));
  select.value=prep.question_type;
  select.onchange=()=>mutate('preparation/type',{question_type:select.value},{method:'PUT'});
  type.append(select);root.append(type);
  const status=el('section','ea-prep-summary');status.append(el('h4','',`资料版本 ${data.research_revision||0} · 当前缺口`),el('p','',data.suitability?.next||'先填写研究问题。'));
  for(const item of data.suitability?.blockers||[])status.append(el('p','resource-caution',item));
  status.append(button('检查资料与适用条件','btn-secondary',()=>mutate('actions',{action:'check_suitability'})));root.append(status);
  if(prep.question_type==='policy_evaluation'){
    const field=el('label','prep-field','实施类型（与当前样本对应）'),mode=el('select');
    for(const [value,label]of [['unknown','尚未确定'],['single_batch','同批实施'],['staggered','分批实施']])mode.append(new Option(label,value));
    mode.value=prep.adoption_mode||'unknown';field.append(mode);
    const note=prepField('样本批次说明：是否包含扩围或不同实施时期',prep.sample_batch_note,'textarea');
    root.append(field,note.wrap,button('保存实施条件','btn-secondary',()=>mutate('preparation/design',{adoption_mode:mode.value,sample_batch_note:note.input.value},{method:'PUT'})));
  }
  const labels=prep.question_type==='policy_evaluation'?{...PREP_COMMON,...PREP_POLICY}:PREP_COMMON;
  for(const [key,label] of Object.entries(labels)){
    const draftKey=`${data.session_id}:${key}`,saved=prep.cards?.[key]||{};
    let draft=prepDrafts.get(draftKey);if(!draft)try{draft=JSON.parse(storageGet('ea_prep_draft:'+draftKey)||'null');if(draft)prepDrafts.set(draftKey,draft);}catch{}
    if(draft&&['value','source_title','source_url','accessed_on','note'].every(k=>(draft[k]||'')===(saved[k]||''))){prepDrafts.delete(draftKey);storageRemove('ea_prep_draft:'+draftKey);draft=null;}
    const card=draft||saved,detail=el('details','prep-card'),summary=el('summary');detail.open=Boolean(draft)||key===Object.keys(labels).find(k=>!prep.cards?.[k]?.value);
    summary.append(el('strong','',label),el('span',`prep-status ${card.status||'to_find'}`,PREP_STATUS[card.status]||PREP_STATUS.to_find));detail.append(summary);
    const value=prepField('内容或当前缺口',card.value,'textarea');
    const title=prepField('来源名称／发布机关／数据说明',card.source_title);
    const url=prepField('原文或数据说明链接（可留空）',card.source_url);
    const date=prepField('查阅日期',card.accessed_on);
    const note=prepField('下一步需要查什么',card.note,'textarea');
    for(const f of [value,title,url,date,note])detail.append(f.wrap);
    const actions=el('div','prep-actions');
    const payload=verify=>({value:value.input.value,source_title:title.input.value,
      source_url:url.input.value,accessed_on:date.input.value,note:note.input.value,verify});
    const draftNotice=el('p','workspace-note',draft?'当前内容含本机未保存草稿，请点击保存。':'');detail.append(draftNotice);
    for(const f of [value,title,url,date,note])f.input.oninput=()=>{prepDrafts.set(draftKey,payload(false));storageSet('ea_prep_draft:'+draftKey,JSON.stringify(payload(false)));draftNotice.textContent='本机未保存草稿，请点击保存。';};
    actions.append(button('保存为已填写','btn-secondary',()=>mutate(`preparation/cards/${key}`,payload(false),{method:'PUT'})),
      button('我已查看来源，标记已核对','btn-primary',()=>mutate(`preparation/cards/${key}`,payload(true),{method:'PUT'})));
    detail.append(actions);root.append(detail);
  }
  const next=el('div','prep-next');next.append(el('p','workspace-note','拿到 CSV／TSV 后，可带入研究问题与来源文字。变量列仅在与你填写的名称完全一致时给出候选，执行前仍需逐项确认。'),
    button('进入 R 实操并核对映射','btn-primary',()=>{setWorkspace(true);setView(true);selectTab('research');if(typeof researchOfferPreparation==='function')researchOfferPreparation();}));
  root.append(next);
  $('learningReportMd').href=`/api/sessions/${data.session_id}/learning-report/md`;
  $('learningReportPdf').href=`/api/sessions/${data.session_id}/learning-report/pdf`;
  if(typeof eaRenderAgentPreparation==='function')eaRenderAgentPreparation(data);
}
