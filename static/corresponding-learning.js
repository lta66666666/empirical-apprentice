/* Read-only teaching is bound to a persisted plan or task, never client code. */
(()=>{
 let sequence=0;
 window.eaCorrespondingCard=(preview,scope)=>{
  const session=sessionId,card=el('section','ea-corresponding-code'),status=el('p','muted');
  card.append(el('h4','','Stata 对应代码'),el('p','muted','点击命令或语法查看说明。阅读不会执行代码。'));
  const core=preview.commands?.find(c=>c.id===preview.core_command_id)||preview.commands?.find(c=>c.topic==='estimate');
  async function explain(command,part='command',focus='command',term=null){
   const request=++sequence,fingerprint=window.eaTeachingFingerprint?.(),reference={...scope,preview_hash:preview.sha256,command_id:command.id,part,focus,...(term?{term}:{})};delete reference.result;
   status.textContent='正在读取讲解…';
   try{const params=new URLSearchParams(Object.entries(reference).filter(([,v])=>v!=null));const reply=await api(`/api/sessions/${session}/research/teaching?${params}`);
    if(request!==sequence||session!==sessionId||fingerprint!==window.eaTeachingFingerprint?.())return;
    window.eaCorrespondingQuestionContext={session_id:session,fingerprint,reference:reply.reference};window.eaShowStataLesson?.(reply.card,{reveal:false});eaQueueDraft('corresponding-reading',{...reply.reference,view_only:true},status);status.textContent=reply.card.summary; const prior=card.querySelector('.ea-inline-lesson');if(prior)prior.remove();const lesson=el('details','ea-inline-lesson');lesson.append(el('summary','','详细讲解'));const body=el('div','prose');markdown(body,reply.card.content);lesson.append(body);card.append(lesson);
   }catch(error){if(request===sequence&&session===sessionId)status.textContent=error.message+'；请重新核对方案或再次点击。';}
  }
  const reading=latestState?.research_drafts?.['corresponding-reading']?.value;if(reading?.preview_hash===preview.sha256&&(reading.task_id||null)===(scope.task_id||null)&&(reading.confirmation_token||null)===(scope.confirmation_token||null)){const saved=preview.commands?.find(c=>c.id===reading.command_id);if(saved)queueMicrotask(()=>explain(saved,reading.part,reading.focus,reading.term));}
  const row=c=>{const line=el('div','stata-command-row');line.append(button(c.text,'stata-command',()=>explain(c)));return line;};
  for(const c of (preview.commands||[]).filter(c=>c===core||['xtset','interaction'].includes(c.topic)).slice(-3))card.append(row(c));
  if(core){const syntax=el('div','stata-syntax');for(const [key,label]of [['variables','变量顺序'],['comma','逗号'],['vce','标准误'],...(core.text.startsWith('regress ')?[]:[['fe','fe'],['year','i.年份']])])syntax.append(button(label,'text-btn',()=>explain(core,key)));card.append(syntax);
   if(scope.result){card.append(button('样本量含义','text-btn',()=>explain(core,'command','sample')));for(const c of scope.result.coefficients||[]) {const line=el('div');line.append(el('span','',c.term+'：'));for(const [key,label]of [['estimate','系数'],['std_error','标准误'],['interval','区间']])line.append(button(label,'text-btn',()=>explain(core,'command',key,c.term)));card.append(line);}}
  }
  const details=el('details');details.append(el('summary','','完整代码与字段映射'));const pre=el('pre');pre.textContent=preview.code;details.append(pre);
  for(const m of preview.mapping||[])details.append(el('p','muted',m.alias+' = '+m.name));for(const note of preview.differences||[])details.append(el('p','muted',note));
  const copy=button('复制代码','text-btn',async()=>{try{await navigator.clipboard.writeText(preview.code);status.textContent='代码已复制。';}catch{status.textContent='复制失败，请在完整代码中选择后复制。';}});details.append(copy);card.append(details,status);return card;
 };
})();
