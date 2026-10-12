"use strict";
// Values between endpoints are animation frames, never additional observations.
function didFrame(progress,endpoints={t0:11,t1:8,c0:9,c1:8}){
 const t=Math.max(0,Math.min(1,Number(progress)||0));
 const {t0,t1,c0,c1}=endpoints;
 return {treated:t0+(t1-t0)*t,control:c0+(c1-c0)*t,counterfactual:t0+(c1-c0)*t,progress:t};
}
let didAnimationFrame=null;
function stopLearningAnimation(){if(didAnimationFrame!==null)cancelAnimationFrame(didAnimationFrame);didAnimationFrame=null;}
function learningMotionReduced(){return document.documentElement.classList.contains('motion-reduced')||window.matchMedia('(prefers-reduced-motion: reduce)').matches;}
function createDidExplorer(reveal,endpoints){
 const {t0,t1,c0,c1}=endpoints;const maxBar=Math.max(t0,t1,c0,c1,t0+c1-c0)*1.25;
 const box=el('section','did-explorer');box.setAttribute('aria-label','DID 动画实验：仅政策前后两个真实模拟观测点');
 box.append(el('span','eyebrow','拖动时间，观察两种变化'),el('h4','','两组都下降，政策差异藏在哪里？'));
 const legend=el('div','explorer-legend');legend.append(el('span','treated','● 处理组'),el('span','control','● 对照组'),el('span','counterfactual','▧ 处理组假想路径'));box.append(legend);
 const bars=[];
 for(const [key,label]of [['treated','处理组'],['control','对照组'],['counterfactual','处理组假想路径']]){
  const row=el('div','explorer-row'),track=el('div','explorer-track'),bar=el('div','explorer-bar '+key),value=el('strong');track.append(bar);row.append(el('span','',label),track,value);box.append(row);bars.push({key,bar,value});
 }
 const rangeLabel=el('label','explorer-range-label','政策前 → 政策后'),range=el('input');range.type='range';range.min=0;range.max=100;range.step=1;range.value=0;range.setAttribute('aria-label','动画进度，0是政策前，100是政策后');rangeLabel.append(range);box.append(rangeLabel);
 const status=el('p','explorer-status'),formula=el('p','explorer-formula');box.append(status,formula);
 let playing=false,startTime=0,initial=0;
 const play=button('播放变化','btn-secondary',()=>{
  if(playing){playing=false;stopLearningAnimation();play.textContent='继续播放';return;}
  if(learningMotionReduced()){range.value=100;update();return;}
  initial=Number(range.value);if(initial>=100)initial=0;startTime=performance.now();playing=true;play.textContent='暂停';
  const tick=now=>{if(!box.isConnected||!playing){stopLearningAnimation();return;}range.value=Math.min(100,initial+(now-startTime)/28);update();if(Number(range.value)<100)didAnimationFrame=requestAnimationFrame(tick);else{playing=false;didAnimationFrame=null;play.textContent='重新播放';}};
  didAnimationFrame=requestAnimationFrame(tick);
 });
 function update(){const f=didFrame(Number(range.value)/100,endpoints);for(const b of bars){b.bar.style.width=(f[b.key]/maxBar*100)+'%';b.value.textContent=f[b.key].toFixed(1);}status.textContent=f.progress===0?`政策前：处理组 ${t0}，对照组 ${c0}。`:f.progress===1?`政策后：处理组 ${t1}，对照组 ${c1}；假想路径为 ${t0+c1-c0}。`:'动画过渡帧：不是额外年份，也不是观测数据。';formula.textContent=reveal&&f.progress===1?`DID = (${t1} − ${t0}) − (${c1} − ${c0}) = ${(t1-t0)-(c1-c0)} 个指标单位。`:`假想路径假定处理组也发生对照组同样的 ${c1-c0} 单位变化；这依赖识别假设，不是观测事实。`;range.setAttribute('aria-valuetext',f.progress===0?'政策前':f.progress===1?'政策后':`动画过渡 ${range.value}%`);}
 range.oninput=()=>{playing=false;stopLearningAnimation();play.textContent='播放变化';update();};
 const actions=el('div','explorer-actions');actions.append(play,button('回到政策前','text-btn',()=>{playing=false;stopLearningAnimation();range.value=0;play.textContent='播放变化';update();}));box.append(actions);
 box.append(el('p','explorer-footnote','结果单位：模拟能耗指标。假想路径不能证明平行趋势，DID 也不是百分比。减少动画模式下播放直接切换到终点。'));
 update();return box;
}
if(typeof module!=='undefined')module.exports={didFrame};
