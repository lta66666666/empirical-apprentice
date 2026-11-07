/* Wide, readable report viewer shared by learning reports and analysis reports. Display only. */
(()=>{
  if(!document.getElementById('viewLearningReport'))return;
  const dialog=el('dialog','ea-report-view');dialog.id='eaReportView';
  const head=el('div','ea-report-head'),title=el('h2','','学习报告'),toolbar=el('div','ea-report-toolbar'),meta=el('p','ea-report-meta'),body=el('div','ea-report-body prose');
  const close=button('关闭','text-btn',()=>dialog.close());close.setAttribute('aria-label','关闭报告');
  const print=button('打印报告','btn-secondary',()=>{document.body.classList.add('ea-printing-report');requestAnimationFrame(()=>window.print());});
  const md=el('a','btn-secondary','下载 Markdown'),pdf=el('a','btn-secondary','下载 PDF');
  toolbar.append(print,md,pdf,close);head.append(title,toolbar);dialog.append(head,meta,body);document.body.append(dialog);
  window.addEventListener('afterprint',()=>document.body.classList.remove('ea-printing-report'));
  window.eaOpenReport=async function(url,label='学习报告'){
    const pdfUrl=url.endsWith('/learning-report/md')?url.replace(/\/md$/,'/pdf'):url.endsWith('/report')?url+'.pdf':url;
    title.textContent=label;md.href=url;pdf.href=pdfUrl;body.replaceChildren(el('p','workspace-note','正在读取报告…'));dialog.showModal();
    try{const response=await fetch(url,{credentials:'same-origin'});if(!response.ok)throw Error('报告读取失败：HTTP '+response.status);const text=await response.text();const sections=(text.match(/^## /gm)||[]).length;
      meta.textContent=`${new Date().toLocaleString('zh-CN')} · ${text.split('\n').length} 行 · ${sections} 个章节 · 与下载文件内容一致`;markdown(body,text);
    }catch(error){meta.textContent='';body.replaceChildren(el('p','resource-caution',error.message));}
  };
  document.getElementById('viewLearningReport').onclick=()=>window.eaOpenReport('/api/sessions/'+sessionId+'/learning-report/md','学生学习报告');
})();
