export function compareLocalResults(a,b){
  const tolerance={absolute:1e-8,relative:1e-6,p_absolute:1e-6},reasons=[];
  if(!a||!b)return {status:'unable_to_compare',reasons:['一个引擎没有成功结果'],tolerance};
  if(!Number.isFinite(a.inference?.df)||!Number.isFinite(b.inference?.df)||a.inference.df<=0||b.inference.df<=0)reasons.push('实际推断自由度缺失或无效');
  for(const k of ['input_sha256','plan_sha256','n_used'])if(!a[k]||a[k]!==b[k])reasons.push(`${k}不一致或缺失`);
  if(JSON.stringify([...a.used_indices].sort((x,y)=>x-y))!==JSON.stringify([...b.used_indices].sort((x,y)=>x-y)))reasons.push('实际估计样本不一致');
  for(const k of ['vcov','cluster','df','confidence','correction'])if(a.inference[k]!==b.inference[k])reasons.push(`推断设置 ${k} 不一致`);
  const left=new Map(a.coefficients.map(x=>[x.term,x])),right=new Map(b.coefficients.map(x=>[x.term,x]));
  if(left.size!==right.size||[...left.keys()].some(k=>!right.has(k)))reasons.push('估计项不一致');
  if(reasons.length)return {status:'unable_to_compare',reasons,tolerance};
  const differences=[];
  for(const [term,x] of left)for(const field of ['estimate','std_error','p_value','ci_low','ci_high']){
    const y=right.get(term),difference=Math.abs(x[field]-y[field]),allowed=field==='p_value'?1e-6:1e-8+1e-6*Math.max(Math.abs(x[field]),Math.abs(y[field]));
    if(difference>allowed)differences.push({term,field,absolute_difference:difference});
  }
  return {status:differences.length?'different':'passed',differences,tolerance,meaning:'仅核对当前配置的数值，不证明因果识别成立'};
}
