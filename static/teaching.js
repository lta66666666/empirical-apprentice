"use strict";
// First-party teaching content is rendered with text nodes and native SVG only.
window.Teaching = (() => {
  let currentKey = "", pane = "learn";
  const teal = "#087e75", blue = "#5874a3", amber = "#aa6b16";
  let caseConfig=null;
  fetch('/static/teaching/case_config.json').then(r=>{if(!r.ok)throw new Error('案例配置不可用');return r.json();}).then(data=>{
    caseConfig=data;
    if(typeof latestState!=='undefined'&&latestState?.lesson_ui)Teaching.render(latestState.lesson_ui,latestState);
  }).catch(()=>{});
  const eventData = [
    [-3,-.02,-.07,.03],[-2,-.05,-.11,.01],[-1,-.08,-.16,0],
    [0,-.15,-.23,-.07],[1,-.22,-.32,-.12]
  ];
  function svg(tag, attrs={}, text) {
    const n=document.createElementNS("http://www.w3.org/2000/svg",tag);
    for(const [k,v] of Object.entries(attrs)) n.setAttribute(k,String(v));
    if(text!==undefined) n.textContent=text;
    return n;
  }
  function table(headers, rows, caption) {
    const wrap=el("div","table-scroll"), t=el("table","teaching-table");
    if(caption)t.append(el("caption","",caption));
    const head=el("thead"), hr=el("tr");
    for(const h of headers){const th=el("th","",h);th.scope="col";hr.append(th);}head.append(hr);t.append(head);
    const body=el("tbody");
    for(const values of rows){const row=el("tr");for(const value of values)row.append(el("td","",String(value)));body.append(row);}
    t.append(body);wrap.append(t);return wrap;
  }
  function figure(title, caption) {
    const box=el("figure","teaching-figure");box.append(el("h3","",title));
    if(caption)box.append(el("p","figure-note",caption));return box;
  }
  function cards(items, cls="concept-grid") {
    const wrap=el("div",cls);
    for(const [symbol,title,text] of items){const card=el("div","concept-card");card.append(icon(symbol),el("strong","",title),el("p","",text));wrap.append(card);}return wrap;
  }
  function downloadable(label,file) {
    const a=el("a","resource-download",label+" ↓");a.href="/static/teaching/"+file;a.download=file;return a;
  }
  function plotLines(series, labels, min, max, description, policyX=null) {
    const chart=svg("svg",{viewBox:"0 0 560 300",role:"img","aria-label":description});
    chart.append(svg("title",{},description));
    const x=i=>62+i*446/(labels.length-1), y=v=>239-(v-min)*190/(max-min);
    for(let i=0;i<=4;i++){
      const v=min+(max-min)*i/4, yy=y(v);
      chart.append(svg("line",{x1:62,x2:516,y1:yy,y2:yy,stroke:"#dce5e0"}),svg("text",{x:51,y:yy+4,"text-anchor":"end","font-size":12,fill:"#52665e"},Number(v.toFixed(2))));
    }
    if(policyX!==null){const px=x(policyX);chart.append(svg("line",{x1:px,x2:px,y1:35,y2:247,stroke:amber,"stroke-dasharray":"4 5"}),svg("text",{x:px+5,y:28,fill:amber,"font-size":12},"政策开始"));}
    labels.forEach((label,i)=>chart.append(svg("text",{x:x(i),y:263,"text-anchor":"middle","font-size":12,fill:"#52665e"},label)));
    series.forEach(s=>{
      chart.append(svg("polyline",{points:s.values.map((v,i)=>`${x(i)},${y(v)}`).join(" "),fill:"none",stroke:s.color,"stroke-width":3,...(s.dash?{"stroke-dasharray":"6 4"}:{})}));
      s.values.forEach((v,i)=>chart.append(svg("circle",{cx:x(i),cy:y(v),r:4,fill:s.color})));
    });
    const wrap=el("div","plot-wrap");wrap.append(chart);
    const legend=el("div","plot-legend");
    series.forEach(s=>{const label=el("span","",s.name);label.style.setProperty("--series-color",s.color);legend.append(label);});wrap.append(legend);return wrap;
  }
  function visualize(kind) {
    let box;
    if(['timeline','panel','trends','did'].includes(kind)&&!caseConfig){
      return figure('正在读取课程案例配置','若持续不显示，请刷新页面并检查课程资源。');
    }
    if(kind==="research"){
      box=figure("同一个现象，可以问四类问题","先确认想知道什么，再选择数据和方法。");
      box.append(cards([["list","描述 · 发生了什么","哪些城市用能下降？下降了多少？"],["git-compare-arrows","相关 · 一起变化吗","补贴多的城市，用能是否更少？"],["calendar-clock","预测 · 将来会怎样","明年能源需求可能是多少？"],["split","因果 · 如果没政策呢","没有试点时，这些城市还会下降吗？"]]));
    }else if(kind==="timeline"){
      const c=caseConfig.contrast,first=c.first_batch.join('、'),second=c.second_batch.join('、');
      box=figure("一份通知，三个不同时间",`${c.label} · 模拟；不能当作主线同批小实验的政策设定。`);
      box.append(cards([["file-text",c.publication_date+" · 发布","发布通知，不等于全部城市已经实施。"],["flag",c.first_effective_date+" · 第一批",`${first} 开始实施；${second} 尚未正式加入。`],["flag",c.second_effective_date+" · 第二批",`${second} 加入。每个城市都有自己的进入时点。`]],"timeline-cards"));
      box.append(table(["城市组","发布时","第一批后","第二批后"],[[first,"未实施","已实施","已实施"],[second,"未实施","未实施","已实施"]],"按这张独立卡片的实施状态；主线小实验不采用分批设计"));
    }else if(kind==="question"){
      box=figure("把一句话拆成四块","点击下方成果卡，把你自己的研究问题拼完整。");
      box.append(cards([["landmark","政策","节能试点"],["building-2","对象","试点城市"],["gauge","结果","年度能源使用量"],["circle-help","关系","是否降低？"]]));
      box.append(el("p","formula-strip","节能试点  →  是否降低  →  试点城市的年度能源使用量？"));
    }else if(kind==="literature"){
      box=figure("读论文时，留下可回查的证据","下面是虚构练习示意，不是可引用的真实论文。");
      box.append(cards([["search","先筛选","题名与摘要：是否回答相近问题？"],["scan-text","再定位","数据、方法、表号：结论来自哪里？"],["notebook-pen","最后比较","能借鉴什么？哪些条件与你不同？"]],"timeline-cards"));
      box.append(table(["矩阵字段","虚构示范"],[["问题与样本","政策与城市用能；A–D，2013–2016"],["方法与依据","两组前后比较；需要可比的反事实变化"],["结果与出处","模拟 DID = −15；示范表 1"],["局限与帮助","仅 4 城市，不能真实推断；可学习数据组织"]]));
    }else if(kind==="panel"){
      const c=caseConfig.main;
      box=figure("一行 = 一座城市 × 一年",`${c.label} · ${c.treated.join('、')} 从 ${c.implementation_date} 实施，${c.control.join('、')} 不实施。`);
      box.append(table(["城市","年份","能源量","treated","post","did"],[["A",2014,100,1,0,0],["A",2015,80,1,1,1],["C",2014,98,0,0,0],["C",2015,93,0,1,0]],`能源量单位：${c.outcome_unit}（模拟）；节选 4 行`));
      box.append(cards([["columns-3","列告诉你测什么","energy 是结果，treated 是组别，post 是时期。"],["key-round","联合键告诉你是谁","city + year 应唯一；名称相似不一定是同一单位。"]]));
      box.append(downloadable("原始数据 CSV","panel_raw.csv"),downloadable("变量字典","data_dictionary.md"));
    }else if(kind==="cleaning"){
      box=figure("数据体检：先看异常，再看处理依据","操作演示只切换教学视图，不修改下载的原始文件。");
      const view=el("div"), controls=el("div","lab-controls");
      const modes=["原始节选","标出问题","按证据处理"];
      const render=index=>{
        controls.querySelectorAll("button").forEach((b,i)=>b.setAttribute("aria-pressed",String(i===index)));
        const rows=index===2?[["A",2014,100,"保留唯一观测"],["B",2014,102,"按模拟补充表恢复"]]:[["A",2014,100,index?"与第 3 行完全重复":"待检查"],["B",2014,"缺失",index?"查补充依据，不能填 0":"待检查"],["A",2014,100,index?"完全相同的副本":"待检查"]];
        view.replaceChildren(table(["城市","年份","能源量","说明"],rows));
        view.append(el("p","lab-explanation",index===2?"全量记录：17 → 16 行；删除 1 行完全重复；补回 1 个缺失单元格。":"先检查联合键和缺失。节选只有 3 行，全量原始文件有 17 行。"));
      };
      modes.forEach((text,i)=>controls.append(button(text,"btn-secondary",()=>render(i))));
      view.setAttribute("aria-live","polite");box.append(controls,view);render(0);
    }else if(kind==="trends"){
      const c=caseConfig.main,groupMeans=c.group_means,values=[...groupMeans.treated,...groupMeans.control];
      box=figure("先看原始趋势，不急着归因",`纵轴：${c.outcome_unit}（模拟）；每组每年 ${c.treated.length} 个城市，城市等权。`);
      box.append(plotLines([{name:`试点组 ${c.treated.join('、')}`,values:groupMeans.treated,color:teal},{name:`对照组 ${c.control.join('、')}`,values:groupMeans.control,color:blue}], c.years,Math.min(...values)-10,Math.max(...values)+10,`试点组均值 ${groupMeans.treated.join('、')}；对照组 ${groupMeans.control.join('、')}。`,1.5));
      box.append(table(["年份","试点均值","对照均值","差距"],c.years.map((year,i)=>[year,groupMeans.treated[i],groupMeans.control[i],groupMeans.treated[i]-groupMeans.control[i]])));
    }else if(kind==="did"){
      const main=caseConfig.main,preT=main.group_means.treated[1],preC=main.group_means.control[1];
      const commonStart=main.group_means.control[2]-preC,extraStart=(main.group_means.treated[2]-preT)-commonStart;
      box=figure("拖一拖：共同变化与额外变化","互动值人为设定；重置后对应 2014–2015 年小实验。交互不影响题目中的固定数值。");
      const plot=el("div"), metrics=el("div","did-metrics"), controls=el("div","slider-controls");
      function slider(id,label,min,max,value){
        const wrap=el("div"), l=el("label","",label), input=el("input"), out=el("output");
        input.type="range";input.min=min;input.max=max;input.step=1;input.value=value;input.id=id;
        l.htmlFor=id;out.htmlFor=id;wrap.append(l,out,input);controls.append(wrap);return {input,out};
      }
      // Unique IDs also support diagrams opened in a review dialog.
      const suffix=String(++visualSerial);
      const common=slider("common-"+suffix,"两组共同变化",-20,10,commonStart), extra=slider("extra-"+suffix,"试点组额外变化",-25,10,extraStart);
      function update(){
        const c=Number(common.input.value), e=Number(extra.input.value);
        common.out.textContent=c;extra.out.textContent=e;
        plot.replaceChildren(plotLines([{name:"试点组",values:[preT,preT+c+e],color:teal},{name:"对照组",values:[preC,preC+c],color:blue},{name:"试点反事实（人为假定）",values:[preT,preT+c],color:amber,dash:true}], ["政策前","政策后"],40,130,`试点变化${c+e}，对照变化${c}，DID${e}。虚线是假定的试点反事实。`));
        metrics.replaceChildren();
        [["试点变化",c+e],["对照变化",c],["DID",e]].forEach(([l,v])=>{const card=el("div");card.append(el("small","",l),el("strong","",String(v)));metrics.append(card);});
        caption.textContent=`(${preT+c+e} − ${preT}) − (${preC+c} − ${preC}) = ${e} ${main.outcome_unit}。额外变化是人为输入；真实研究不能直接观察反事实。`;
      }
      const caption=el("p","lab-explanation");caption.setAttribute("aria-live","polite");
      common.input.oninput=extra.input.oninput=update;
      box.append(plot,controls,metrics,caption,button("重置为课程数据","btn-secondary",()=>{common.input.value=commonStart;extra.input.value=extraStart;update();}));
      const g=main.group_means,preT2=g.treated[1],postT2=g.treated[2],preC2=g.control[1],postC2=g.control[2],did=(postT2-preT2)-(postC2-preC2);
      box.append(table(["组别","2014（政策前）","2015（政策后）","变化（后 − 前）"],
        [[`试点组 ${main.treated.join('、')}`,preT2,postT2,postT2-preT2],
         [`对照组 ${main.control.join('、')}`,preC2,postC2,postC2-preC2],
         ["DID（试点变化 − 对照变化）","","",did]],
        "课程固定数值；拖动滑块只改变上方示意图，不改变此表。"));
      update();
    }else if(kind==="uncertainty"){
      box=figure("同为“不显著”，信息量可以很不同","独立人为区间示意，不是 4 城市实验的估计。点是估计，横线是 95% 区间。");
      const chart=svg("svg",{viewBox:"0 0 560 210",role:"img","aria-label":"示意一：估计负2，区间负8到4；示意二：估计0，区间负0.3到0.3。"});
      const x=v=>160+(v+9)*26;
      chart.append(svg("line",{x1:x(0),x2:x(0),y1:20,y2:150,stroke:amber,"stroke-dasharray":"4 4"}));
      [["区间较宽",-2,-8,4],["接近零且较窄",0,-.3,.3]].forEach(([label,est,lo,hi],i)=>{const y=52+i*65;chart.append(svg("text",{x:12,y:y+5,"font-size":14},label),svg("line",{x1:x(lo),x2:x(hi),y1:y,y2:y,stroke:teal,"stroke-width":5}),svg("circle",{cx:x(est),cy:y,r:6,fill:teal}));});
      [-8,-4,0,4].forEach(v=>chart.append(svg("text",{x:x(v),y:178,"text-anchor":"middle","font-size":13},v)));
      box.append(chart,table(["情形","估计与区间","能告诉你什么"],[["较宽","−2；[−8,4]","多种方向与幅度仍相容"],["较窄","0；[−0.3,0.3]","更接近很小效应；实际意义仍需定义"]]));
    }else if(kind==="pipeline"){
      box=figure("从原始数据到一份可核对的结果","每一步留下文件；发生问题时沿路径往回查。");
      box.append(cards([["file-spreadsheet","01 输入","原始 CSV + 模拟补充表"],["list-checks","02 清洗","键唯一、缺失依据、行数日志"],["chart-no-axes-combined","03 汇总","分组均值、样本数、标准差"],["notebook-pen","04 输出","DID 与带局限的备忘录"]]));
      box.append(downloadable("完整小实验包","empirical_lab.zip"));
      const code=el("pre","code-demo");code.append(el("code","","# Windows\npy run_demo.py\n\n# macOS / Linux\npython3 run_demo.py"));box.append(code);
    }else if(kind==="event"){
      box=figure("事件研究：先看政策前，再看政策后","独立人为示意；基准期 t=−4；纵轴为对数系数，不是原始能源量。");
      const chart=svg("svg",{viewBox:"0 0 560 300",role:"img","aria-label":"政策前估计负0.02、负0.05、负0.08，政策后负0.15、负0.22；区间见下方表。"});
      const x=t=>70+(t+3)*107,y=v=>235-(v+.35)*500;
      [-.3,-.2,-.1,0,.05].forEach(v=>chart.append(svg("line",{x1:60,x2:515,y1:y(v),y2:y(v),stroke:v===0?amber:"#dce5e0","stroke-dasharray":v===0?"4 4":"none"}),svg("text",{x:51,y:y(v)+4,"text-anchor":"end","font-size":12},v)));
      chart.append(svg("line",{x1:x(-.5),x2:x(-.5),y1:28,y2:240,stroke:amber,"stroke-dasharray":"4 5"}),svg("text",{x:x(-.5)+5,y:21,"font-size":12,fill:amber},"政策开始"));
      eventData.forEach(([t,b,lo,hi])=>{chart.append(svg("line",{x1:x(t),x2:x(t),y1:y(lo),y2:y(hi),stroke:teal,"stroke-width":2}),svg("circle",{cx:x(t),cy:y(b),r:5,fill:teal}),svg("text",{x:x(t),y:268,"text-anchor":"middle","font-size":13},`t=${t}`));for(const bound of [lo,hi])chart.append(svg("line",{x1:x(t)-5,x2:x(t)+5,y1:y(bound),y2:y(bound),stroke:teal}));});
      box.append(chart,table(["相对时期","系数","95% 区间"],eventData.map(([t,b,lo,hi])=>[t,b,`[${lo.toFixed(2)}, ${hi.toFixed(2)}]`])));
    }else if(kind==="memo"){
      box=figure("让每一句结论都有来处","成果卡支持导出；有空项就把它转成明确待办。");
      box.append(cards([["circle-help","我要回答什么","问题、对象、变量与时间"],["files","证据来自哪里","政策原文、文献定位、数据字典"],["calculator","我是怎样得到结果的","清洗日志、计算窗口、脚本输出"],["clipboard-check","还能说到什么程度","不确定性、替代解释、下一步"]]));
    }
    return box || el("div");
  }
  let visualSerial=0;
  function visuals(item){const nodes=[visualize(item.visual)];if(item.visual_extra)nodes.push(visualize(item.visual_extra));return nodes;}
  function details(ui){
    const wrap=el("div","teaching-details");
    for(const [title,text,open] of [["一步一步怎么做",ui.guide,true],["跟着示范理解",ui.example,false],["容易踩的坑",(ui.pitfalls||[]).map(x=>"- "+x).join("\n"),false]]){
      const d=el("details"), body=el("div","prose");d.open=open;d.append(el("summary","",title));markdown(body,text);d.append(body);wrap.append(d);
    }
    return wrap;
  }
  function draftKey(id){return `ea_draft:${sessionId}:${id}`;}
  function readDraft(id){try{return JSON.parse(storageGet(draftKey(id))||"null");}catch{return null;}}
  function workbook(ui,state){
    const config=ui.worksheet, wrap=el("div","workbook");if(!config)return wrap;
    wrap.append(el("span","eyebrow","阶段成果 · 学生草稿"),el("h3","",config.title),el("p","workspace-note","按你的理解填写，不会的地方写“待核实”。保存不等于通过学术审核；内容不会自动写入个人研究蓝图。每项最多 1500 字。"));
    const id=ui.lesson_id||ui.id, saved=state.learning_artifacts?.[String(id)]||{}, draft=readDraft(id), values=draft||saved;
    const form=el("form"), inputs={};
    const status=el("p","draft-status",draft?"有本机草稿尚未保存到本次学习记录。":Object.keys(saved).length?"已保存成果草稿，可继续修改。":"尚未保存。本机暂存仅用于恢复输入，请及时保存并导出。");status.setAttribute("role","status");
    config.fields.forEach(field=>{
      const group=el("div","workbook-field"), label=el("label","",field.label), input=el("textarea");
      input.id=`artifact-${id}-${field.key}-${++visualSerial}`;input.maxLength=1500;input.rows=3;input.placeholder=field.placeholder;input.value=values[field.key]||"";label.htmlFor=input.id;inputs[field.key]=input;
      input.oninput=()=>{storageSet(draftKey(id),JSON.stringify(Object.fromEntries(Object.entries(inputs).map(([k,n])=>[k,n.value]))));status.textContent="尚未保存到学习记录；已尝试在本机暂存。";};group.append(label,input);form.append(group);
    });
    const save=button("保存成果草稿","btn-primary artifact-save",null);save.type="submit";
    form.onsubmit=async e=>{
      e.preventDefault();const fields=Object.fromEntries(Object.entries(inputs).map(([k,n])=>[k,n.value]));
      // mutate re-renders the page. Clear only on confirmed success, retaining drafts on failure.
      if(await mutate(`artifacts/${id}`,{fields},{method:"PUT"})){
        try{storageRemove(draftKey(id));}catch{/* unavailable */}
        status.textContent="已保存成果草稿。";
        document.querySelectorAll(".draft-status").forEach(n=>n.textContent="已保存成果草稿，可继续修改。");
        toast("成果草稿已保存，导出记录会包含它");
      }
    };
    form.append(save,status);wrap.append(form);return wrap;
  }
  function selectPane(value,persist=false){
    pane=value;if(persist)window.eaSaveCourseCursor?.({pane:value});
    for(const name of ["learn","practice","workbook"]){$(name+"Pane").hidden=name!==pane;document.querySelector(`[data-learn-pane="${name}"]`).setAttribute("aria-pressed",String(name===pane));}
    const ui=latestState?.course?.lesson_ui||latestState?.lesson_ui;
    if(latestState?.stage==='lesson'||window.EA_MODULE==='learn'&&latestState?.learning_context?.status==='active')$("composerWrap").hidden=showHistory||pane!=="practice"||["choice","calc","checkpoint"].includes(ui?.step_type);
  }
  function render(ui,state){
    const key=`${state.session_id}:${ui.lesson_id}`;
    if(key!==currentKey){currentKey=key;pane=['learn','practice','workbook'].includes(state.learning_context?.pane)?state.learning_context.pane:'learn';}
    $("lessonGoal").replaceChildren(el("p","",ui.goal),el("div","lesson-goal-meta",`${ui.case_label} · 建议 ${ui.duration} · 本阶段产出：${ui.output}`));
    $("teachingVisual").replaceChildren(...visuals(ui));$("teachingDetails").replaceChildren(details(ui));
    $("lessonWorkbook").replaceChildren(workbook(ui,state));
    if(ui.step_type==="checkpoint")$("lessonWorkbook").append(button("返回阶段检查点，继续学习","btn-secondary",()=>selectPane("practice")));
    document.querySelectorAll("[data-learn-pane]").forEach(b=>b.onclick=()=>{selectPane(b.dataset.learnPane,true);$("learningScroll").scrollTop=0;});
    $("goPractice").onclick=()=>{selectPane("practice",true);$("learningScroll").scrollTop=0;};$("backToLesson").onclick=()=>selectPane("learn",true);
    selectPane(pane);
  }
  function review(item){
    const body=el("div","lesson-review"), intro=el("div","prose");markdown(intro,item.intro);
    body.append(el("p","lesson-goal-meta",item.goal),intro,...visuals(item),details(item),workbook(item,latestState));
    return body;
  }
  return {render,review,selectPane,syncPane:()=>selectPane(pane),visualize,visuals,details,workbook,table};
})();
