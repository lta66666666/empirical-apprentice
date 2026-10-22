/* Canvas renders Chinese with the visitor's fonts; the resulting pages are embedded in a PDF. */
const eaPdfEncoder = new TextEncoder();

function eaPdfLines(markdown) {
  return markdown.replace(/\r\n/g, '\n').split('\n').map((raw) => {
    const level = /^#{1,3} /.exec(raw)?.[0].trim().length || 0;
    const text = raw.replace(/^#{1,3} /, '').replace(/^>\s?/, '').replace(/\*\*/g, '').replace(/`/g, '');
    return { text: text || ' ', level, muted: raw.startsWith('>'), table: raw.startsWith('|') };
  });
}

function eaWrapText(context, text, maxWidth) {
  const out = [];
  let line = '';
  for (const char of text) {
    if (context.measureText(line + char).width > maxWidth && line) { out.push(line); line = ''; }
    line += char;
  }
  out.push(line || ' ');
  return out;
}

function eaRenderPdfPages(markdown) {
  const width = 794, height = 1123, margin = 58;
  const pages = [];
  let canvas, context, cursor;
  function newPage() {
    canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
    context = canvas.getContext('2d'); context.fillStyle = '#fff'; context.fillRect(0, 0, width, height);
    context.fillStyle = '#6b7a76'; context.font = '13px system-ui, sans-serif';
    context.fillText('实证学徒 · 浏览器导出', margin, 34);
    cursor = 70; pages.push(canvas);
  }
  newPage();
  let tableHeader=null;
  function drawTableRow(cells,header=false){
    const total=width-margin*2,ratios=cells.length===5?[.22,.17,.17,.14,.3]:cells.map(()=>1/cells.length),sizes=ratios.map(x=>x*total);
    context.font=`${header?'600 ':''}12px "Microsoft YaHei",sans-serif`;
    const wrapped=cells.map((cell,i)=>eaWrapText(context,header||i===0?cell:cell.replace(/-?\d+\.\d+(?:e[+-]?\d+)?/gi,value=>Number(value).toPrecision(6)),sizes[i]-16));
    const rowHeight=Math.max(32,...wrapped.map(lines=>lines.length*19+12));
    if(cursor+rowHeight>height-58){newPage();if(!header&&tableHeader)drawTableRow(tableHeader,true);context.font=`${header?'600 ':''}12px "Microsoft YaHei",sans-serif`;}
    context.fillStyle=header?'#e5f1ef':'#fff';context.fillRect(margin,cursor,total,rowHeight);context.fillStyle='#17333d';
    let left=margin;wrapped.forEach((lines,i)=>{lines.forEach((line,j)=>context.fillText(line,left+8,cursor+20+j*19));left+=sizes[i];});
    context.strokeStyle='#d8e4e2';context.beginPath();context.moveTo(margin,cursor+rowHeight);context.lineTo(width-margin,cursor+rowHeight);context.stroke();cursor+=rowHeight;
  }
  for (const item of eaPdfLines(markdown)) {
    // Blank separators may consume space, but must never create an empty page.
    if(!item.text.trim()){cursor=Math.min(height-58,cursor+21);continue;}
    if(item.table){const cells=item.text.split('|').slice(1,-1).map(x=>x.trim());if(cells.every(x=>/^[:\- ]+$/.test(x)))continue;const header=!tableHeader;if(header)tableHeader=cells;drawTableRow(cells,header);continue;}
    tableHeader=null;
    if(item.level&&cursor>70)cursor+=12;
    const fontSize = item.level === 1 ? 25 : item.level === 2 ? 19 : item.level === 3 ? 16 : 13;
    const lineHeight = Math.round(fontSize * 1.6);
    context.font = `${item.level ? '600 ' : ''}${fontSize}px "Noto Sans SC", "Microsoft YaHei", "PingFang SC", sans-serif`;
    const lines = eaWrapText(context, item.text, width - margin * 2);
    for (const line of lines) {
      if (cursor + lineHeight > height - 58) { newPage(); context.font = `${item.level ? '600 ' : ''}${fontSize}px "Noto Sans SC", "Microsoft YaHei", "PingFang SC", sans-serif`; }
      context.fillStyle = item.muted ? '#5b6a66' : item.level ? '#113b37' : '#202d2b';
      context.fillText(line, margin, cursor);
      cursor += lineHeight;
    }
    if (item.level) cursor += 8;
  }
  pages.forEach((page, index) => {
    const ctx = page.getContext('2d'); ctx.font = '12px system-ui, sans-serif'; ctx.fillStyle = '#6b7a76';
    ctx.fillText(`${index + 1} / ${pages.length}`, width - margin - 40, height - 25);
  });
  return pages;
}

function eaConcat(parts) {
  const bytes = new Uint8Array(parts.reduce((count, part) => count + part.length, 0));
  let offset = 0;
  for (const part of parts) { bytes.set(part, offset); offset += part.length; }
  return bytes;
}

function eaPdfFromCanvases(canvases) {
  const objects = [];
  const pageIds = canvases.map((_, index) => 3 + index * 3);
  objects[1] = eaPdfEncoder.encode('<< /Type /Catalog /Pages 2 0 R >>');
  objects[2] = eaPdfEncoder.encode(`<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`);
  canvases.forEach((canvas, index) => {
    const page = pageIds[index], content = page + 1, image = page + 2;
    const jpeg = Uint8Array.from(atob(canvas.toDataURL('image/jpeg', .9).split(',')[1]), (char) => char.charCodeAt(0));
    const contentText = `q 595 0 0 842 0 0 cm /Im${index} Do Q\n`;
    const contentBytes = eaPdfEncoder.encode(contentText);
    objects[page] = eaPdfEncoder.encode(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /XObject << /Im${index} ${image} 0 R >> >> /Contents ${content} 0 R >>`);
    objects[content] = eaConcat([eaPdfEncoder.encode(`<< /Length ${contentBytes.length} >>\nstream\n`), contentBytes, eaPdfEncoder.encode('endstream')]);
    objects[image] = eaConcat([eaPdfEncoder.encode(`<< /Type /XObject /Subtype /Image /Width ${canvas.width} /Height ${canvas.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`), jpeg, eaPdfEncoder.encode('\nendstream')]);
  });
  const parts = [eaPdfEncoder.encode('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n')];
  const offsets = [0];
  let size = parts[0].length;
  for (let id = 1; id < objects.length; id++) {
    offsets[id] = size;
    const part = eaConcat([eaPdfEncoder.encode(`${id} 0 obj\n`), objects[id], eaPdfEncoder.encode('\nendobj\n')]);
    parts.push(part); size += part.length;
  }
  const xrefOffset = size;
  let xref = `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let id = 1; id < objects.length; id++) xref += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`;
  xref += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  parts.push(eaPdfEncoder.encode(xref));
  return eaConcat(parts);
}

async function eaDownloadPdf(markdownUrl, filename, sourceTarget=null) {
  const response = await fetch(markdownUrl, { credentials: 'same-origin' });
  if (!response.ok) throw new Error(`报告读取失败：HTTP ${response.status}`);
  const reportText=await response.text(),pages=eaRenderPdfPages(reportText);
  const match=/^\/api\/research\/jobs\/([0-9a-f-]{36})\/report$/.exec(markdownUrl);
  if(match){
    const jobResponse=await fetch(`/api/research/jobs/${match[1]}`,{credentials:'same-origin'});
    if(!jobResponse.ok)throw new Error('读取图表所属任务失败，请重新导出。');
    const job=await jobResponse.json();
    const exportVersion=/导出版本：([0-9]+)/.exec(reportText)?.[1];
    if(exportVersion&&Number(exportVersion)!==(job.record_version||1))throw new Error('报告在导出期间已更新，请重新导出最新版本。');
    const names=job.plan.method==='did'?['coefficients.svg','group_trends.svg']:['coefficients.svg'];
    for(const name of names){
      const image=new Image();const blobResponse=await fetch(`/api/research/jobs/${match[1]}/artifacts/${name}`,{credentials:'same-origin'});
      if(!blobResponse.ok)throw new Error('图表读取失败，PDF 未导出，请重试。');
      const imageUrl=URL.createObjectURL(await blobResponse.blob());
      try{await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(new Error('图表渲染失败'));image.src=imageUrl;});
        const canvas=document.createElement('canvas');canvas.width=794;canvas.height=1123;const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,794,1123);ctx.fillStyle='#17333d';ctx.font='20px "Microsoft YaHei",sans-serif';ctx.fillText(name==='coefficients.svg'?'系数与95%置信区间':'处理组与对照组描述性均值',58,90);
        const width=678,height=Math.min(850,width*image.height/image.width);ctx.drawImage(image,58,120,width,height);ctx.font='14px "Microsoft YaHei",sans-serif';ctx.fillText(`${job.execution_location==='cloud_native'?'云端原生 '+(job.software==='stata'?'Stata':job.software==='python'?'StatsPAI / Python':'R'):'浏览器 webR 提交'} · 导出版本 ${job.record_version||1} · 报告未另行复算`,58,1040);pages.push(canvas);
      }finally{URL.revokeObjectURL(imageUrl);}
    }
    const finalCheck=await fetch(`/api/research/jobs/${match[1]}?record_version=${job.record_version||1}`,{credentials:'same-origin'});if(!finalCheck.ok)throw new Error('报告在生成图表期间更新，未导出混合版本，请重试。');
    pages.forEach((page,index)=>{const ctx=page.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(650,1085,90,24);ctx.fillStyle='#6b7a76';ctx.font='12px sans-serif';ctx.fillText(`${index+1} / ${pages.length}`,696,1098);});
  }
  const bytes = eaPdfFromCanvases(pages);
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
  $('eaGeneratedPdf')?.remove();
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename;anchor.id='eaGeneratedPdf';anchor.className='btn-secondary';anchor.textContent=`下载已生成的 PDF（${pages.length} 页）`;
  const target=sourceTarget||(match?document.querySelector('#researchResult .research-actions'):document.querySelector('.report-actions'));
  (target||document.body).append(anchor);anchor.click();
  $('eaPdfPreview')?.remove();
  const preview=document.createElement('details');preview.id='eaPdfPreview';preview.className='ea-pdf-preview';
  const title=document.createElement('summary');title.textContent='检查 PDF 分页与中文排版';
  const pageSelect=document.createElement('select');pageSelect.setAttribute('aria-label','PDF 预览页码');
  pages.forEach((_,i)=>pageSelect.append(new Option(`第 ${i+1} / ${pages.length} 页`,String(i))));
  const previewImage=new Image();previewImage.style.width='100%';previewImage.style.maxWidth='794px';
  const showPage=()=>{previewImage.src=pages[Number(pageSelect.value)].toDataURL('image/jpeg',.9);previewImage.alt=`PDF 第 ${Number(pageSelect.value)+1} 页预览`;};
  pageSelect.onchange=showPage;showPage();preview.append(title,pageSelect,previewImage);(target?.parentElement||document.body).append(preview);
  if(typeof toast==='function')toast(`PDF 已生成：${pages.length} 页。请在浏览器下载中查看。`);
  setTimeout(() => {URL.revokeObjectURL(url);if(anchor.isConnected)anchor.remove();}, 300000);
}

document.addEventListener('click', (event) => {
  const anchor = event.target.closest?.('a[href]');
  if (!anchor) return;
  const url = new URL(anchor.href, location.href);
  if (url.origin !== location.origin) return;
  let markdownUrl = null;
  if (/\/api\/research\/jobs\/[0-9a-f-]{36}\/report\.pdf$/.test(url.pathname)) markdownUrl = url.pathname.slice(0, -4);
  if (/\/api\/sessions\/[a-z0-9]{12}\/learning-report\/pdf$/.test(url.pathname)) markdownUrl = url.pathname.replace(/\/pdf$/, '/md');
  if (!markdownUrl) return;
  event.preventDefault();
  if(anchor.dataset.generating==='1')return;
  anchor.dataset.generating='1';anchor.setAttribute('aria-busy','true');const label=anchor.textContent;anchor.textContent='正在生成 PDF…';
  eaDownloadPdf(markdownUrl, anchor.download || 'report.pdf',anchor.closest('.research-actions,.report-actions')).catch((error) => {
    if (typeof toast === 'function') toast(error.message);
    else alert(error.message);
  }).finally(()=>{anchor.dataset.generating='0';anchor.removeAttribute('aria-busy');anchor.textContent=label;});
});
