/* Independent, read-only guide. Its cursor is a draft, never a research change. */
(()=>{
 if(!['analysis','learn'].includes(window.EA_MODULE))return;
 const dialog=el('dialog','coach-reading stata-guide'),title=el('h2','','Stata 入门指南'),status=el('p','muted'),chapters=el('select'),steps=el('nav','stata-guide-steps'),body=el('div','prose');
 chapters.setAttribute('aria-label','指南章节');steps.setAttribute('aria-label','本章步骤');status.setAttribute('role','status');
 dialog.append(title,button('关闭','text-btn',()=>dialog.close()),el('p','muted','Windows / Stata18 · 只读指南示例；无需安装或配对，不会执行代码。'),chapters,steps,status,body);document.body.append(dialog);
 let epoch=0,selected=null;
 async function open(lesson,step){
  if(!dialog.open)dialog.showModal();const seq=++epoch,account=window.EA_ACCOUNT?.id,session=typeof sessionId==='undefined'?null:sessionId;status.textContent='正在读取操作指南…';
  try{const r=await api('/api/knowledge?'+new URLSearchParams({guide:'stata18',...(lesson?{lesson_id:lesson}:{}),...(step?{step_id:step}:{})}));if(seq!==epoch||account!==window.EA_ACCOUNT?.id||session!==(typeof sessionId==='undefined'?null:sessionId))return;
   selected=r.guide;chapters.replaceChildren();for(const c of selected.outline){const o=el('option','',c.title);o.value=c.id;o.selected=c.id===selected.lesson.id;chapters.append(o);}steps.replaceChildren();for(const s of selected.lesson.steps){const b=button(s.title,'text-btn',()=>open(selected.lesson.id,s.id));b.setAttribute('aria-current',s.id===selected.step.id?'step':'false');steps.append(b);}
   const s=selected.step;body.replaceChildren(el('h3','',s.title));for(const [label,key]of [['做什么','action'],['在哪里看','where'],['预期现象','expected'],['一个提醒','reminder']])body.append(el('h4','',label),el('p','',s[key]));if(s.content)body.append(el('p','',s.content));
   if(s.code){body.append(el('p','muted','指南示例 · 不是当前任务代码 · 未执行'));const pre=el('pre'),code=el('code','',s.code);pre.append(code);body.append(pre,button('复制示例','text-btn',async()=>{try{await navigator.clipboard.writeText(s.code);status.textContent='示例已复制；复制不会执行。';}catch{status.textContent='复制失败，可选择示例文本复制。';}}));}
   if(s.figure&&/^\/static\/teaching\/[a-z-]+\.svg$/.test(s.figure)){const img=el('img');img.src=s.figure;img.alt='Stata 操作示意图，非真实软件截图';body.append(el('p','muted','原创示意图 · 非真实截图'),img);}
   const source=el('details');source.append(el('summary','','来源与版本'),el('p','',selected.version));if(s.source){const a=el('a','','查看来源');a.href=s.source;a.target='_blank';a.rel='noopener noreferrer';source.append(a);}body.append(source);
   if(window.eaConversation)body.append(button('请讲解这一步','btn-secondary',async()=>{const ref={intent:'stata_guide',lesson_id:selected.lesson.id,step_id:s.id,guide_version:selected.version,message:'请简短解释“'+s.title+'”，并提醒我最容易混淆的一点。'};dialog.close();await eaConversation.send(ref);}));
   eaQueueDraft('stata-guide',{lesson_id:selected.lesson.id,step_id:s.id,guide_version:selected.version,view_only:true},status);status.textContent='只记录阅读位置，不计成绩或掌握程度。';
  }catch(e){if(seq===epoch){status.textContent='指南读取失败：'+e.message+'。请重试。';body.replaceChildren(button('重试','btn-secondary',()=>open(lesson,step)));}}
 }
 window.eaOpenStataGuide=(lesson,step)=>{const saved=eaDraftEntry('stata-guide').value||{};return open(lesson||saved.lesson_id,step||(lesson?undefined:saved.step_id));};
 chapters.addEventListener('change',()=>open(chapters.value));dialog.addEventListener('close',()=>epoch++);
 (document.querySelector('.coach-menu'))?.append(button('Stata 入门指南','text-btn',()=>eaOpenStataGuide()));
 const requested=new URLSearchParams(location.search).get('stata_guide');if(requested)eaOpenStataGuide(requested);
 if(window.EA_MODULE==='learn'){
  const render=window.eaRenderCourse;window.eaRenderCourse=function(state){render?.(state);document.getElementById('stage-six-stata-guide')?.remove();const c=state?.learning_context;if((c?.view_lesson_id||c?.lesson_id)!==6)return;const box=el('section','resource-section');box.id='stage-six-stata-guide';box.append(el('h3','','软件操作阅读'),el('p','','原实验包为独立复算材料；Stata 指南是独立的只读操作说明，不替换原实验或自动运行。'),button('阅读 Stata 操作指南','btn-secondary',()=>eaOpenStataGuide('do-files')));const preview=document.getElementById('eaCoursePreview');(preview&&!preview.hidden?preview:document.getElementById('teachingDetails'))?.append(box);};window.eaRenderCourse(window.latestState||typeof latestState!=='undefined'&&latestState);
 }
 // Offer an intro once when Stata is explicitly selected; no extra permanent toolbar.
 function offer(){if(eaDraftEntry('stata-guide-intro').value.dismissed)return;const host=document.querySelector('#pcLocalStata');if(!host||host.querySelector('.stata-guide-intro'))return;const note=el('p','stata-guide-intro');note.append(el('span','','第一次使用？可先看界面与批准流程。'),button('阅读指南','text-btn',()=>eaOpenStataGuide('interface')),button('知道了','text-btn',()=>{eaQueueDraft('stata-guide-intro',{dismissed:true});note.remove();}));host.prepend(note);}
 document.addEventListener('change',e=>{if(e.target?.tagName==='SELECT'&&String(e.target.value).includes('stata'))offer();});window.addEventListener('ea-stata-guide-offer',offer);
})();
