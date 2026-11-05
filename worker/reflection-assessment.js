const aspects=new Set(['coefficient','unit','sample','uncertainty','model','causality']);
export function checkedAssessment(raw,context){
 const unknown=(validation_reason='invalid_contract')=>({version:1,validation_reason,status:'not_confirmed',correct_points:[],required_corrections:[],optional_improvements:[]});
 const a=raw?.assessment;if(!a||!['consistent','needs_correction','not_confirmed'].includes(a.status)||!Array.isArray(a.correct_points)||!Array.isArray(a.required_corrections)||!Array.isArray(a.optional_improvements))return unknown();
 const short=x=>typeof x==='string'&&x.trim()&&x.length<=700;
 if(a.correct_points.length>8||a.required_corrections.length>8||a.optional_improvements.length>6||!a.correct_points.every(p=>aspects.has(p.aspect)&&short(p.text))||!a.optional_improvements.every(short))return unknown();
 const materials=Object.fromEntries((context.materials||[]).filter(m=>['executed_result','confirmed_plan','local_stata_result','local_stata_plan'].includes(m.id)).map(m=>[m.id,m.content]));
 const verified=[],optional=[...a.optional_improvements];
 for(const c of a.required_corrections){
   if(!aspects.has(c.aspect)||!short(c.answer_quote)||!context.answer.includes(c.answer_quote)||!short(c.reason)||typeof c.evidence_ref!=='string'||c.evidence_ref.length>180)return unknown('quote_or_aspect_conflict');
   const keys=c.evidence_ref.split('.');let evidence=materials;
   for(const key of keys){if(['__proto__','constructor','prototype'].includes(key)||!evidence||typeof evidence!=='object'||!Object.hasOwn(evidence,key))return unknown('invalid_evidence_path');evidence=evidence[key];}
   if(evidence===undefined||evidence===null||evidence==='')return unknown();
   if(c.aspect==='unit'&&!keys.some(k=>k==='dictionary'))return unknown();
   if(['coefficient','sample','uncertainty'].includes(c.aspect)){
     if(typeof evidence!=='number'||typeof c.claimed_value!=='number'||!Number.isFinite(c.claimed_value)||c.expected_value!==evidence)return unknown('numeric_evidence_mismatch');
     const numbers=[...c.answer_quote.matchAll(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi)].filter(m=>Number(m[0])===c.claimed_value);if(!numbers.length)return unknown('claimed_number_missing');
     const precision=Math.max(...numbers.map(m=>m[0].includes('.')?.5*10**(-m[0].split('.')[1].split(/e/i)[0].length):0));
     if(Math.abs(c.claimed_value-evidence)<=Math.max(1e-8,precision,Math.abs(evidence)*1e-6)){optional.push('可选：更明确说明对应的实际估计量；当前数值没有矛盾。');continue;}
   }else if(c.aspect==='causality'){
     const sentence=context.answer.split(/[。！？；;\n]/).find(s=>s.includes(c.answer_quote))||c.answer_quote;
     if(/不能|不证明|不代表|不等于|尚未|无法|非因果|未.*(?:验证|证明)/.test(sentence))return unknown('causal_claim_negated');
     if(!/证明.*因果|因果.*(?:成立|确定)|(?:必然|确实|直接)导致/.test(c.answer_quote))return unknown();
   }else if(c.aspect==='unit'){
     const units=['万元','千元','元','万吨','千吨','吨','千克','克','百分比','百分点'];
     const expected=units.find(u=>String(evidence).includes(u)),claimed=units.find(u=>c.answer_quote.includes(u));
     if(!expected||!claimed)return unknown();
     if(expected===claimed){optional.push('可选：补充指标口径；当前计量单位与字典一致。');continue;}
   }else return unknown();
   verified.push(c);
 }
 if((a.status==='consistent'&&a.required_corrections.length)||(a.status==='needs_correction'&&!a.required_corrections.length))return unknown();
 if(a.status==='not_confirmed')return unknown();
 return {version:1,status:verified.length?'needs_correction':'consistent',correct_points:a.correct_points.filter(p=>!verified.some(c=>c.aspect===p.aspect)),required_corrections:verified,optional_improvements:optional.slice(0,6)};
}
export function assessmentText(a){
 if(!a||a.status==='not_confirmed')return '回答已保存，反馈暂未确认。可以对照真实结果自行检查，稍后再主动请求反馈。';
 const lines=[a.status==='consistent'?'本次解释与已执行材料一致；已提交，可选修订。':'已提交；以下具体问题需要核对。'];
 if(a.correct_points.length)lines.push('\n已正确\n'+a.correct_points.map(p=>'• '+p.text).join('\n'));
 if(a.required_corrections.length)lines.push('\n需要核对\n'+a.required_corrections.map(c=>'• “'+c.answer_quote+'”：'+c.reason).join('\n'));
 if(a.optional_improvements.length)lines.push('\n可选改善（不要求返工）\n'+a.optional_improvements.map(t=>'• '+t).join('\n'));
 return lines.join('\n');
}
