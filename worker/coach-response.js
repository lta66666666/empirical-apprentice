// Teaching text is model content; actions and execution authority stay server-owned.
const fields=new Set(['goal','policy','object','outcome','unit','period','predictor','data_source','data','mapping']);
const text=(value,max)=>typeof value==='string'?value.trim().slice(0,max):'';
export const isComputeRequest=value=>/只(?:想|要|需)?(?:先)?(?:跑|做|运行|计算)|直接(?:跑|做|运行)|开始(?:回归|计算)|跑(?:一下|个)?回归/.test(String(value));
export function checkedCoach(raw,allowedSources=[]){
 let c=raw.coaching;
 if(typeof c==='string')c={answer:c};
 if(c==null)c=raw;
 if(typeof c!=='object'||Array.isArray(c))c={};
 const answer=text(c.answer||c.summary||raw.answer||raw.reason,1800);
 if(!answer)return null;
 const references=Array.isArray(c.references)?c.references.filter(x=>typeof x==='string'&&allowedSources.includes(x)).slice(0,6):[];
 let follow_up=null;
 if(c.follow_up!=null&&typeof c.follow_up==='object'&&!Array.isArray(c.follow_up)&&fields.has(c.follow_up.field)&&text(c.follow_up.prompt,240))follow_up={field:c.follow_up.field,prompt:text(c.follow_up.prompt,240)};
 const choices=[];
 for(const option of (Array.isArray(c.choices)?c.choices:[]).slice(0,3)){
  if(!follow_up||typeof option!=='object'||!text(option.label,45)||!text(option.answer,240))continue;
  // An unknown unit cannot be supplied by the model as a claimed data fact.
  if(follow_up.field==='unit'&&!/待|不知道|不清楚|查看|确认/.test(option.answer))continue;
  const answer=text(option.answer,240),kind=['value','unknown','consult'].includes(option.kind)?option.kind:/了解|区别|再决定|是什么|什么意思|举例/.test(answer)?'consult':/待|不知道|不清楚|不确定|先查看/.test(answer)?'unknown':'value';
  choices.push({id:'reply_'+choices.length,label:text(option.label,45),answer,kind,value:kind==='value'?text(option.value||answer,240):''});
 }
 let learning_card=null;
 if(c.learning_card&&typeof c.learning_card==='object'&&!Array.isArray(c.learning_card)&&text(c.learning_card.title,70)){const k=c.learning_card;learning_card={title:text(k.title,70),summary:text(k.summary,240)||text(k.content,240)||text(k.title,240),example:text(k.example,240),reminder:text(k.reminder,180),content:text(k.content,2400),source_ids:references,review_status:'AI结合所给资料整理，待核对'};}
 const facts=c.fact_updates??raw.fact_updates;
 const fact_updates=(Array.isArray(facts)?facts:[]).slice(0,10).filter(f=>f&&fields.has(f.field)&&text(f.value,300)&&text(f.source_span,600)).map(f=>({field:f.field,value:text(f.value,300),source_span:text(f.source_span,600)}));
 return {schema_version:1,answer,follow_up,follow_up_explicit:Object.hasOwn(c,'follow_up'),legacy_question:text(raw.questions?.[0],240),choices,learning_card,references,fact_updates};
}
