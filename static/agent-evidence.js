/* All displayed transcripts come from owner-checked persistent records. */
const eaAgentQuestions=new Map();
const eaAgentViews=new Map();
const eaAgentKind={candidate:'补问与候选方案',tutor:'课程辅助问答',reflection:'结果解释反馈'};
const eaAgentStatus={response_valid:'已收到有效模型响应',needs_information:'信息不足，先补问',blocked:'方法条件受阻',rejected:'候选方案被拒绝',failed:'接口失败，已回退',unconfigured:'模型未配置，使用自查'};
function eaRenderModelEvidence(records=latestState?.model_interactions||[]){
  let root=$('eaAgentEvidence');if(!root){root=el('section','ea-agent-evidence');root.id='eaAgentEvidence';$('pane-records').append(root);}
  root.replaceChildren(el('h3','','Agent 交互证据'),el('p','workspace-note','记录来自本次练习的实际请求；有效响应不等于来源核实或结论正确。失败与固定自查分别保留。最近 200 条可导出；解释是否已提交以修订记录为准。'));
  const stats=el('div','ea-agent-stats');for(const kind of ['candidate','tutor','reflection']){const items=records.filter(x=>x.kind===kind),valid=items.filter(x=>['response_valid','needs_information','blocked'].includes(x.status)).length;stats.append(el('p','',`${eaAgentKind[kind]}：${items.length} 次记录，${valid} 次有效响应`));}root.append(stats);
  const links=el('div','research-actions');links.append(researchDownload(`/api/sessions/${sessionId}/model-evidence/md`,'下载完整交互证据.md'),researchDownload(`/api/sessions/${sessionId}/model-evidence/json`,'下载完整交互证据.json'));root.append(links);
  if(!records.length)root.append(el('p','workspace-note','暂无交互证据。可从研究准备补问、课程问答或执行后的解释反馈开始。'));
  if(!records.length){const actions=el('div','research-actions');actions.append(button('去研究准备补问','btn-secondary',()=>eaSetTask('prepare')),button('去学习并提问','btn-secondary',()=>eaSetTask('learn')));root.append(actions);return;}
  const view=eaAgentViews.get(sessionId)||{kind:'all',page:0};eaAgentViews.set(sessionId,view);
  const filtered=[...records].reverse().filter(r=>view.kind==='all'||r.kind===view.kind),pages=Math.max(1,Math.ceil(filtered.length/10));view.page=Math.min(view.page,pages-1);
  const controls=el('div','ea-evidence-controls'),filter=el('select');filter.setAttribute('aria-label','筛选 Agent 能力');for(const[k,label]of Object.entries({all:'全部能力',...eaAgentKind}))filter.append(new Option(label,k));filter.value=view.kind;filter.onchange=()=>{view.kind=filter.value;view.page=0;eaRenderModelEvidence(records);$('eaAgentEvidence').querySelector('select').focus();};
  const previous=button('上一页','btn-secondary',()=>{view.page--;eaRenderModelEvidence(records);}),next=button('下一页','btn-secondary',()=>{view.page++;eaRenderModelEvidence(records);});previous.disabled=view.page===0;next.disabled=view.page===pages-1;
  const count=el('p','workspace-note',`第 ${view.page+1} / ${pages} 页 · ${filtered.length} 条记录 · 每页最多 10 条`);count.setAttribute('role','status');controls.append(filter,previous,next,count);root.append(controls);
  if(!filtered.length&&records.length)root.append(el('p','workspace-note','该能力暂无交互记录。'));
  for(const record of filtered.slice(view.page*10,view.page*10+10)){
    const card=el('details','ea-agent-record');card.append(el('summary','',`${eaAgentKind[record.kind]||record.kind} · ${eaAgentStatus[record.status]||record.status}`),el('p','workspace-note',`${new Date(record.created_at).toLocaleString()} · ${record.actual_model||record.model||'模型未配置'} · ${record.prompt_version} · ${record.duration_ms} ms · 记录版本 ${record.record_version}`));
    if(record.failure_reason)card.append(el('p','resource-caution',record.failure_reason));
    const output=record.output;card.append(el('p','',record.input_summary.question||record.input_summary.answer||'本次材料见输入摘要'),el('p','',output.reason||output.answer||output.detail||''));
    for(const question of output.questions||[])card.append(el('p','',`需补充：${question}`));
    for(const [title,value]of [['输入摘要',record.input_summary],['实际提示词',record.messages],['结构化输出',record.output]]){const detail=el('details');detail.append(el('summary','',title),el('pre','',JSON.stringify(value,null,2)));card.append(detail);}root.append(card);
  }
}
async function eaRefreshModelEvidence(){if(!sessionId)return;const id=sessionId,account=window.EA_ACCOUNT?.id;try{const result=await api(`/api/sessions/${id}/model-evidence/json`);if(id!==sessionId||account!==window.EA_ACCOUNT?.id)return;latestState.model_interactions=result.records;eaRenderModelEvidence(result.records);}catch(e){toast(e.message);}}
function eaRenderAgentPreparation(data){
  const root=$('preparationContent');if(!root)return;
  const box=el('details','ea-preparation-agent');box.append(el('summary','','让 AI 帮我补研究问题（没有数据也可开始）'));
  const input=el('textarea');input.rows=3;input.maxLength=2000;input.setAttribute('aria-label','研究准备中的问题');input.placeholder='描述当前想研究的问题，或回答上一轮补问';input.value=eaAgentQuestions.get(data.session_id)||data.preparation?.cards.question?.value||'';input.oninput=()=>eaAgentQuestions.set(data.session_id,input.value);
  const notice=el('p','workspace-note');notice.setAttribute('role','status');const answer=el('div');
  const latest=(data.model_interactions||[]).filter(x=>x.kind==='candidate').at(-1);
  function draw(result){answer.replaceChildren(el('p','',result.warning||''),el('p','',result.reason||result.detail||''));for(const q of result.questions||[])answer.append(el('p','',`请补充：${q}`));if(result.candidate)answer.append(el('p','workspace-note',`候选方法：${researchNames[result.candidate.method]||'待确定'}；请取得数据后核对变量映射，不会自动执行。`));}
  if(latest)draw(latest.output);
  const submit=button('提交问题，获得补问与建议','btn-secondary',async()=>{
    if(!input.value.trim()){notice.textContent='请先描述一个问题或当前缺口。';return;}submit.disabled=true;notice.textContent='正在请求模型；不会上传逐行数据…';
    try{const id=sessionId,question=input.value,result=await api('/api/research/candidate',{method:'POST',body:{session_id:id,question}});if(id!==sessionId||question!==input.value)return;draw(result);notice.textContent=result.ready?'候选方案已记录，仍需检查数据与执行确认。':'补问已记录。请填写准备卡，或在这里继续回答。';}
    catch(e){notice.textContent=e.message;}
    finally{submit.disabled=false;await eaRefreshModelEvidence();}
  });
  box.append(el('p','workspace-note',data.model_capabilities?.candidate==='unconfigured'?'模型尚未配置，可继续手工填写准备卡。':'发送研究问题、实施条件和本练习最近三次补问；来源不会自动标为已核对。'),input,submit,notice,answer);root.querySelector('.prep-card')?.after(box);
}
if(latestState){eaRenderModelEvidence();eaRenderAgentPreparation(latestState);}

