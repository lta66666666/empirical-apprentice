/* Native DOM only: uploaded strings are never inserted as HTML. */
let analysisText = '', analysisFilename = '';
let analysisRenderedSession = null, analysisRenderedKey = '';
function setupAnalysis() {
  const tab = button('手算教学', '', () => selectTab('analysis'));
  tab.id='tab-analysis'; tab.dataset.tab='analysis'; tab.setAttribute('role','tab'); tab.setAttribute('aria-controls','pane-analysis');
  tab.setAttribute('aria-selected','false'); tab.tabIndex=-1;
  document.querySelector('.workspace-tabs').append(tab);
  const pane=el('section'); pane.id='pane-analysis'; pane.hidden=true; pane.setAttribute('role','tabpanel'); pane.setAttribute('aria-labelledby','tab-analysis');
  pane.append(el('h3','','两期 DID 手算教学'),el('p','','先审计，再计算。仅支持同批实施、平衡面板的两个年份。数据发送到本站 Worker 做规则审计与描述性计算，不发送给语言模型；结果保存在当前会话。R/fixest 实操另在浏览器中执行。'));
  const sample=button('使用独立的 8 行手算数据','btn-secondary',()=>{
    analysisText='city,year,outcome,treated\nA,2014,10,1\nA,2015,7,1\nB,2014,12,1\nB,2015,9,1\nC,2014,8,0\nC,2015,7,0\nD,2014,10,0\nD,2015,9,0\n'; analysisFilename='synthetic-demo.csv';
    $('analysisYear').value=2015; $('analysisNotice').textContent='已选独立手算数据：4 个个体、2 个年份。预期 DID=-2 个指标单位；与八阶段课程主线的数据和数值不可混用。请先确认设计，再审计。';
    document.querySelectorAll('.analysis-mapping').forEach(s=>s.replaceChildren(new Option('自动识别','')));
  }); pane.append(sample);
  for(const [id,title] of [['researchQuestion','研究问题（可先在蓝图中明确）'],['outcomeDefinition','结果变量定义与单位'],['dataSource','数据来源、获取方式与核实状态']]){const l=el('label','',title),input=el('textarea');input.id=id;input.maxLength=1000;input.rows=2;l.append(input);pane.append(l);}
  const label=el('label','','或选择 UTF-8 CSV / TSV（≤2 MB，≤20000 行）');
  const file=el('input'); file.type='file'; file.accept='.csv,.tsv'; label.append(file); pane.append(label);
  file.onchange=async()=>{const f=file.files[0]; if(!f)return; if(f.size>2000000){$('analysisNotice').textContent='文件超过 2 MB。';return;} analysisText=await f.text();analysisFilename=f.name;$('analysisNotice').textContent='已选：'+f.name+'。先审计以识别字段。';document.querySelectorAll('.analysis-mapping').forEach(s=>s.replaceChildren(new Option('自动识别','')));};
  const yLabel=el('label','','政策实施年份'); const year=el('input'); year.id='analysisYear';year.type='number';year.min=1800;year.max=2200;yLabel.append(year);pane.append(yLabel);
  for(const [key,name] of Object.entries({unit:'个体 / 地区',time:'年份',outcome:'结果变量',treated:'处理组（0/1，身份不随时间变）'})){
    const l=el('label','',name),s=el('select','analysis-mapping');s.id='mapping-'+key;s.append(new Option('自动识别',''));l.append(s);pane.append(l);
  }
  const checkLabel=el('label'),check=el('input');check.type='checkbox';check.id='analysisConfirmed';checkLabel.append(check,document.createTextNode('我已核对：处理组同批实施，对照组研究期内未受此政策；政策年份正确。'));pane.append(checkLabel);
  pane.append(button('审计并计算','btn-primary',async()=>{
    if(!analysisText){$('analysisNotice').textContent='请先选择数据或使用模拟数据。';return;}
    const mapping={};for(const k of ['unit','time','outcome','treated'])mapping[k]=$('mapping-'+k).value;
    $('analysisNotice').textContent='正在审计…';
    const ok=await mutate('analysis/run',{filename:analysisFilename,text:analysisText,mapping,policy_year:year.value?Number(year.value):null,confirmed:check.checked,research_question:$('researchQuestion').value,outcome_definition:$('outcomeDefinition').value,data_source:$('dataSource').value});
    $('analysisNotice').textContent=ok?'本次结果已保存。修改文件或配置后请重新运行。':'未完成，请查看错误提示。';
  }));
  const notice=el('p');notice.id='analysisNotice';notice.setAttribute('role','status');pane.append(notice);
  const result=el('div');result.id='analysisResult';pane.append(result);document.querySelector('.workspace-body').append(pane);
  pane.addEventListener('change',()=>{if(latestState?.analysis?.columns)$('analysisNotice').textContent='输入配置已变化；下方是上次运行结果，请重新审计并计算。';});
}
function renderAnalysis(data){
  const out=$('analysisResult');if(!out)return;out.replaceChildren();
  if(analysisRenderedSession!==data.session_id){analysisText='';analysisFilename='';analysisRenderedKey='';analysisRenderedSession=data.session_id;$('analysisYear').value='';$('analysisConfirmed').checked=false;for(const id of ['researchQuestion','outcomeDefinition','dataSource'])$(id).value='';}
  const a=data.analysis;if(!a?.columns)return;
  if(data.analysis_stale)out.append(el('p','tutorial-feedback','研究蓝图已修改：下方为旧设计结果，不能直接用于当前结论，请重新运行。'));
  const renderKey=JSON.stringify([a.sha256,a.mapping,a.policy_year,a.context]);
  if(renderKey!==analysisRenderedKey){for(const key of ['unit','time','outcome','treated']){const s=$('mapping-'+key);s.replaceChildren(new Option('自动识别',''),...a.columns.map(c=>new Option(c,c)));s.value=a.mapping[key]||'';}$('analysisYear').value=a.policy_year||'';for(const [id,key]of [['researchQuestion','research_question'],['outcomeDefinition','outcome_definition'],['dataSource','data_source']])$(id).value=a.context?.[key]||'';analysisRenderedKey=renderKey;}
  out.append(el('h4','',a.status==='computed'?'计算完成 · 不等于因果证明':'审计未通过 · 请修正后重试'));
  if(a.estimate){
    out.append(el('p','analysis-number','DID = '+a.estimate.did.toFixed(4)));
    const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 360 200');svg.setAttribute('role','img');svg.setAttribute('aria-label','处理组与对照组两期均值趋势图；详细数值见下表');
    const means=a.estimate.means, values=means.map(m=>m.mean),lo=Math.min(...values),span=Math.max(...values)-lo||1;
    const node=(tag,attrs,text)=>{const n=document.createElementNS(svg.namespaceURI,tag);for(const[k,v]of Object.entries(attrs))n.setAttribute(k,v);if(text)n.textContent=text;svg.append(n);};
    for(const g of [0,1]){const points=means.filter(m=>m.group===g);const color=g?'#b45309':'#2563eb';node('polyline',{points:points.map((m,i)=>`${65+i*215},${150-(m.mean-lo)/span*110}`).join(' '),fill:'none',stroke:color,'stroke-width':3});points.forEach((m,i)=>{node('circle',{cx:65+i*215,cy:150-(m.mean-lo)/span*110,r:4,fill:color});node('text',{x:65+i*215,y:140-(m.mean-lo)/span*110,fill:color,'font-size':12},m.mean.toFixed(2));});node('text',{x:30+g*160,y:195,fill:color,'font-size':13},g?'处理组（橙）':'对照组（蓝）');}
    a.audit.years.forEach((y,i)=>node('text',{x:50+i*215,y:175,'font-size':12},String(y)));out.append(svg);
  }
  const report=el('div');markdown(report,a.report_markdown);out.append(report);
  const link=el('a','resource-download','下载本次分析报告');link.href=`/api/sessions/${sessionId}/analysis/report`;link.download='analysis-report.md';out.append(link);
}
setupAnalysis();
