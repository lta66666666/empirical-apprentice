(()=>{
 const active=new Set();
 window.eaInterpretationCard=(job,options={})=>{
  const box=el('section','ea-ai-interpretation'),title=el('h4','','AI辅助解读'),content=el('div'),status=el('p','muted'),retry=button('生成AI解读','btn-secondary',()=>generate(true));box.append(title,content,status,retry);
  const session=job.session_id||sessionId,endpoint=options.local?'/api/local-stata/tasks/ai-interpretation?session_id='+encodeURIComponent(session)+'&task_id='+job.id:'/api/research/jobs/'+job.id+'/ai-interpretation';
  const current=()=>session===sessionId&&(options.local||researchJob?.id===job.id);
  function saved(value){job.ai_interpretation=value;job.record_version=value.record_version||job.record_version;options.onSaved?.(value);}
  function draw(value){content.replaceChildren();if(value?.status==='succeeded'){content.append(el('p','',value.summary));for(const p of value.points||[])content.append(el('p','',p));const limits=el('details');limits.append(el('summary','','AI解读的限制'));for(const p of value.limitations||[])limits.append(el('p','',p));content.append(limits);status.textContent='AI辅导 · 不属于学生作答 · 随报告保存';retry.hidden=true;}else{status.textContent=value?.status==='pending'?'AI正在讲解，数字与报告仍可查看。':value?.detail||'尚未生成AI辅助解读。';retry.textContent=value?.status==='failed'?'重试AI讲解':'生成AI解读';}}
  async function recover(){
   for(let i=0;i<30&&current()&&box.isConnected;i++){
    const value=await api(endpoint,{timeoutMs:15000});if(!current())return;
    if(value.status==='succeeded'){saved(value);draw(value);return;}
    if(value.status!=='pending'){draw(value);return;}
    await new Promise(resolve=>setTimeout(resolve,2000));
   }
   if(current())draw({status:'failed',detail:'讲解尚未返回，请稍后重试；计算结果保留。'});
  }
  async function generate(manual=false){if(active.has(job.id))return;active.add(job.id);retry.disabled=true;status.textContent='AI正在讲解，数字先展示…';try{const value=await api(endpoint,{method:'POST',body:{retry:manual},timeoutMs:30000});if(!current())return;if(value.status==='succeeded')saved(value);draw(value);storageSet('ea_auto_ai:'+job.id,'requested');if(value.status==='pending')await recover();}catch(e){if(current()){draw({status:'failed',detail:'讲解未完成：'+e.message+'。计算结果保留。'});storageSet('ea_auto_ai:'+job.id,'requested');}}finally{active.delete(job.id);retry.disabled=false;}}
  draw(job.ai_interpretation);
  if(!job.ai_interpretation&&(job.auto_interpretation||storageGet('ea_auto_ai:'+job.id)==='pending'))queueMicrotask(()=>generate(false));
  return box;
 };
})();
