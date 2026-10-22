import {isComputeRequest} from './coach-response.js';
import {knowledgeChunks,knowledgeVersion} from './knowledge.js';

const labels={goal:'研究目标',policy:'政策名称',object:'研究对象',period:'观察时期',outcome:'结果指标',unit:'指标单位',predictor:'解释变量',data_source:'数据来源',access:'使用条件',policy_doc:'政策原文',effective_date:'实际实施时间',adoption_mode:'实施批次',treated_list:'政策对象',comparison:'比较对象'};
const cardFields={question:'goal',policy_name:'policy',sample:'object',outcome:'outcome',predictor:'predictor',data_source:'data_source',access:'access',policy_doc:'policy_doc',effective_date:'effective_date',treated_list:'treated_list',comparison:'comparison'};
export function isResearchHelpQuestion(text){return /是什么|为啥|为什么|有什么区别|怎么做|怎么办|能举例|可以吗|有哪些|有什么(?:指标|选择|区别)|还有(?:别的|其他)|怎么(?:选|选择|衡量|理解|确定)|如何(?:选|衡量|理解|确定)|什么意思|能举例|举个例|推荐.*(?:指标|变量)|(?:具体指标|指标).*是什么|什么是/.test(String(text||''));}
const unknown=/未知|等[^，。；;]*确认|需[^，。；;]*确认|不知道|不清楚|不确定|不了解|还没|尚未|待查|待明确|待确认|待核实|未提供|没有数据|什么(?:意思|单位)/;
const allPeriod=/全部(?:的)?(?:时期|时间|年份|年度)|所有(?:的)?(?:时期|年份)|全(?:部)?(?:样本|期间)|数据覆盖/;
const invalid=k=>['goal','policy','object','period','outcome','unit','predictor','data_source','access','policy_doc','effective_date','adoption_mode','treated_list','comparison'].includes(k);
function blank(field){return {label:labels[field],value:'',status:'unknown',source:null,history:[]};}
function clean(value){return String(value||'').trim().slice(0,1500);}
function known(item){return item?.status==='provided'&&!!item.value&&!unknown.test(item.value);}
function source(message,text,kind='user'){return {message_id:message||null,text:clean(text),kind};}
function setField(u,key,value,status,origin){
 if(!invalid(key))return false;
 const old=u.fields[key]||blank(key),next={...old,label:labels[key],value:clean(value),status,source:origin};
 if(old.value===next.value&&old.status===next.status){if((!old.source||origin?.kind==='choice')&&origin)u.fields[key]=next;return false;}
 next.history=[...(old.history||[]),...(old.source?[{value:old.value,status:old.status,source:old.source}]:[])].slice(-10);u.fields[key]=next;return true;
}
function explicitFacts(u,text,message,field){
 if(isResearchHelpQuestion(text)){
   let changed=false;
   for(const span of text.split(/[，,。；;？！?\n]/).map(s=>s.trim()).filter(Boolean)){
     if(!isResearchHelpQuestion(span)&&!/^例如|^比如/.test(span)&&/(?:是|为|改成|改为|研究|选择|单位|年份)/.test(span))changed=explicitFacts(u,span,message,null)||changed;
   }
   return changed;
 }
 const origin=source(message,text);let changed=false;
 if(/^\s*(?:请)?(?:讲解|解释)|^\s*什么是|^\s*我已(?:提交|选择)/.test(text))return false;
 const put=(k,v,status='provided')=>{if(k==='outcome'&&u.fields.outcome.value&&u.fields.outcome.value!==v&&known(u.fields.unit)&&u.fields.unit.source?.message_id!==message)changed=setField(u,'unit','','unknown',origin)||changed;changed=setField(u,k,v,status,origin)||changed;};
 const noAnswer=unknown.test(text),correction=/改成|改为|更正|修正|不是.*而是|实际上|单位(?:是|为)|时期(?:是|为)/.test(text);
 const value=text.replace(/^\s*(?:改成|改为|更正(?:为)?|实际上|应该是)\s*[:：]?/,'').trim();
 const object=value.match(/(?:研究对象|观察对象|对象)(?:是|为|[:：])\s*([^，。；;\n]{1,100})/);
 if(object&&!unknown.test(object[1]))put('object',object[1]);
 for(const [key,pattern]of [['outcome',/(?:结果指标|结果变量|指标)(?:是|为|改成|改为|[:：])\s*([^，。；;\n]{1,100})/],['predictor',/(?:解释变量|控制变量)(?:是|为|[:：])\s*([^，。；;\n]{1,100})/],['data_source',/(?:数据来源)(?:是|为|[:：])\s*([^，。；;\n]{1,200})/]]){const match=value.match(pattern);if(match&&!unknown.test(match[1]))put(key,match[1]);}
 if(allPeriod.test(value))put('period','希望使用数据覆盖的全部年份（范围待确认）','awaiting_data');
 const years=value.match(/((?:18|19|20|21)\d{2})\s*(?:年)?\s*(?:[-—–~～至到])\s*((?:18|19|20|21)\d{2})/);
 if(years)put('period',years[1]+'–'+years[2]+'年');
 const namedUnit=value.match(/单位(?:是|为|改为|改成)?\s*[:：]?\s*([^，。；;\n]{1,80})/)||value.match(/以\s*([^，。；;\n]{1,40})\s*为单位/);
 if(namedUnit&&!unknown.test(namedUnit[1])&&!/什么|不知|不清楚/.test(namedUnit[1]))put('unit',namedUnit[1].replace(/计量|衡量|表示$/,'').trim());
 const namedPolicy=value.match(/(?:政策(?:名称)?(?:是|为|叫)|评估)\s*[:：]?\s*([^，。；;\n]{2,100}?政策)(?=[的对，。；;]|$)/)||value.match(/(低碳城市(?:试点)?政策)/);
 if(namedPolicy&&!/^(?:一项|某项|这项|一个|某个|有关)/.test(namedPolicy[1]))put('policy',namedPolicy[1]);
 const measured=value.match(/(月工资|年度劳动收入|小时工资|就业人数|就业率)/)||value.match(/((?:城市|企业|居民|家庭|个人)?(?:年度|年)?(?:碳排放|收入|工资|就业|产出|生产率|消费|污染)(?:人数|量|总量|强度|水平|率)?)/);
 const policyOnly=!!namedPolicy&&/政策(?:名称)?(?:是|为|叫)/.test(value)&&!/结果|指标|观察|对.*(?:影响|作用)/.test(value)||field==='policy'&&!/结果|指标|观察|对.*(?:影响|作用)/.test(value);
 if(measured&&!policyOnly&&!/例如|比如|什么是|是什么/.test(value)){put('outcome',measured[1]);if(/^城市/.test(measured[1])&&!known(u.fields.object))put('object','城市');}
 const goal=/研究|分析|评估|考察/.test(value)&&!/^讲解|^解释|^我已提交|^我已选择/.test(value);
 if(goal&&!/^(?:我(?:想|要|需要)|帮我|请)?(?:做(?:一(?:个|项))?)?(?:实证|时政|政策)?(?:分析|研究)[。！!]?$/u.test(value)&&!noAnswer){put('goal',value);}
 if(/分批|陆续实施|不同年份/.test(value)&&!/不是分批|非分批|没有分批/.test(value))put('adoption_mode','staggered');
 else if(/同批|同一年|同一时间|同一天/.test(value)&&!/不是同批|不确定|尚未/.test(value))put('adoption_mode','single_batch');
 const date=value.match(/(?:实施(?:时间|日期)?(?:是|为|从)?|自)\s*[:：]?\s*((?:18|19|20|21)\d{2}(?:年|[-/]\d{1,2})?(?:\d{1,2}月|[-/]\d{1,2})?(?:\d{1,2}日)?)/)||value.match(/((?:18|19|20|21)\d{2}年)(?:开始|同批|正式)?实施/);
 if(date)put('effective_date',date[1]);
 if(/单位/.test(value)&&noAnswer)put('unit','待数据说明确认','awaiting_data');
 if(field==='unit'&&noAnswer)put('unit','待数据说明确认','awaiting_data');
 else if(field==='outcome'&&noAnswer&&!measured&&!/单位/.test(value))put('outcome','','unknown');
 else if(field==='period'&&noAnswer&&!allPeriod.test(value))put('period','','unknown');
 else if(field==='policy'&&noAnswer)put('policy','','unknown');
 else if(field==='object'&&noAnswer&&!measured)put('object','','unknown');
 else if(field==='unit'&&!namedUnit&&!noAnswer&&!measured&&!/查看|说明|数据后|上传/.test(value)&&value.length<=80)put('unit',value);
 else if(field==='outcome'&&!noAnswer&&!measured&&!goal&&value.length<=200)put('outcome',value);
 else if(field==='object'&&!noAnswer&&!goal){const object=value.split(/[，,。]/)[0].replace(/碳排放.*$/,'').trim();if(object)put('object',object);}
 else if(field==='policy'&&!noAnswer&&!namedPolicy&&!goal&&value.length<=120)put('policy',value);
 else if(field==='period'&&!noAnswer&&!allPeriod.test(value)&&!years&&!goal&&value.length<=200)put('period',value);
 else if(field==='effective_date'&&!noAnswer&&!date&&/\d/.test(value)&&value.length<=100)put('effective_date',value);
 else if(['predictor','data_source','access','policy_doc','treated_list','comparison'].includes(field)&&!noAnswer&&!goal)put(field,value);
 if(/不知道.*单位|不清楚.*单位|单位.*(?:不知道|不清楚|待查|待确认|等.*确认|需.*确认|未知)/.test(value))put('unit','待数据说明确认','awaiting_data');
 if(/拿到数据后|等数据后|数据说明后|数据到手后/.test(value)&&(/单位/.test(value)||field==='unit'))put('unit','待数据说明确认','awaiting_data');
 if(correction&&!field&&measured)put('outcome',measured[1]);
 return changed;
}

export function understanding(state,messages=[]){
 if(state.research_understanding?.schema_version===1){const copy=JSON.parse(JSON.stringify(state.research_understanding));for(const key of Object.keys(labels)){copy.fields[key]||=blank(key);if(copy.fields[key].source?.kind==='user'&&isResearchHelpQuestion(copy.fields[key].value)){copy.fields[key].status='unknown';copy.fields[key].value='';}}return copy;}
 const u={schema_version:1,revision:0,fields:Object.fromEntries(Object.keys(labels).map(k=>[k,blank(k)])),active_question:null};
 for(const [card,field]of Object.entries(cardFields)){const record=state.preparation?.cards?.[card];if(!record?.value)continue;
  const status=record.status==='suggested'?'suggested':unknown.test(record.value)?'unknown':'provided';
  setField(u,field,status==='unknown'?'':record.value,status,source(null,record.value,'preparation'));
 }
 if(state.preparation?.adoption_mode&&state.preparation.adoption_mode!=='unknown')setField(u,'adoption_mode',state.preparation.adoption_mode,'provided',source(null,state.preparation.adoption_mode,'preparation'));
 for(const message of messages){if(message.role==='user'&&!['knowledge','reflection'].includes(message.intent))explicitFacts(u,message.content,message.id,message.answer_field||null);else if(message.role==='assistant'&&message.intake_field){const field=cardFields[message.intake_field]||message.intake_field;u.active_question={id:message.dialogue?.current_question?.id||message.id+':'+field,field,prompt:message.content};}}
 return u;
}
export function absorbAnswer(state,messages,text,userId,choice=null){
 const u=understanding(state,messages),before=JSON.stringify(u.fields);if(isComputeRequest(text))u.compute_requested=true;const field=choice?.field||u.active_question?.field||null;
 const changed=choice?.kind==='consult'?false:explicitFacts(u,text,userId,field);
 if(choice?.status)setField(u,choice.field,choice.value,choice.status,source(userId,text,'choice'));
 u.active_question=null;u.revision++;u.last_user_message_id=userId;
 return {understanding:u,changed:changed||before!==JSON.stringify(u.fields),answer_field:field};
}
export function isPolicyRequest(state,u){return !!u.fields.policy.value||/政策|时政/.test(u.fields.goal.value)||state.preparation?.question_type==='policy_evaluation';}
export function nextGap(state,u,profile={row_count:0,columns:[]}){
 const fields=u.fields,needs=k=>!known(fields[k])&&fields[k]?.status!=='awaiting_data';
 if(profile.row_count&&u.compute_requested)return {field:'mapping',label:'变量与方案核对',prompt:'已有数据，可以直接核对结果列、解释列和方法；单位等说明可后补。'};
 let field,prompt;
 if(needs('goal')&&!fields.policy.value){field='goal';prompt='你想研究什么现象，或者评估哪项政策的影响？';}
 else if(isPolicyRequest(state,u)&&needs('policy')){field='policy';prompt='你想评估哪项政策？先告诉我政策名称就可以。';}
 else if(needs('object')){field='object';prompt='你想研究城市、企业，还是个人？';}
 else if(needs('outcome')||/^(?:城市|个人)?(?:年度|年)?(?:碳排放(?:量)?|收入|工资|就业|污染)$/.test(fields.outcome.value)){field='outcome';prompt=/碳排放/.test(fields.outcome.value+' '+fields.goal.value)?'你想看年度碳排放总量，还是单位GDP的碳排放强度？':fields.outcome.value?'你希望怎样衡量'+fields.outcome.value+'？可以先说你关心的具体指标。':'你希望观察哪个结果？例如收入、就业或产出。';}
 else if(needs('unit')&&!profile.row_count){field='unit';prompt='数据说明用什么单位记录这个指标？不清楚也可以先留待核对。';}
 else if(needs('period')&&!profile.row_count){field='period';prompt='你想观察哪些年份？也可以先选择数据覆盖的全部年份。';}
 else if(isPolicyRequest(state,u)&&needs('effective_date')){field='effective_date';prompt='政策实际从什么时候实施？可以先查政策原文再确认。';}
 else if(isPolicyRequest(state,u)&&needs('adoption_mode')){field='adoption_mode';prompt='政策是同一批、同一时间实施，还是分批实施？';}
 else if(isPolicyRequest(state,u)&&needs('policy_doc')){field='policy_doc';prompt='请提交政策原文或链接，方便核对实施时间和对象。';}
 else if(!profile.row_count){field='data';prompt='请提交CSV、TSV或DTA数据，我会先检查字段和需要补充的说明。';}
 else {field='mapping';prompt='数据已收到。请核对结果指标对应的列、含义和单位，然后再讨论方法。';}
 return {field,label:labels[field]||{data:'数据材料',mapping:'变量核对'}[field],prompt};
}
export function researchSummary(state,messages=[]){const u=understanding(state,messages),localActive=['stata_local_mcp','statspai_local'].includes(state.research_drafts?.['analysis-context']?.value?.engine_id),work=localActive?null:state.research_drafts?.workbench?.value,local=state._local_input,profile=work?.profile?.row_count?work.profile:local?.profile||state.research_drafts?.['local-workbench']?.value?.profile||{row_count:0,columns:[]};return {schema_version:2,revision:u.revision,fields:u.fields,data:{profile,dictionary:work?.profile?.row_count?work.dictionary||{}:local?.metadata?.dictionary||{},source:work?.profile?.row_count?'browser_input':local?.profile?'local_input':'none'},next_gap:nextGap(state,u,profile)};}
export function intakePreparation(state,u){
 const cards={...state.preparation.cards};
 for(const [card,field]of Object.entries(cardFields)){const item=u.fields[field];if(known(item)||item.status==='suggested'&&item.value)cards[card]={value:item.value,status:'suggested'};}
 const object=u.fields.object,period=u.fields.period;
 if(known(object))cards.sample={value:[object.value,period.value].filter(Boolean).join('；'),status:'suggested'};
 const outcome=u.fields.outcome,unit=u.fields.unit;if(known(outcome))cards.outcome={value:[outcome.value,known(unit)?unit.value:'单位待确认'].join('；'),status:'suggested'};
 return {...state.preparation,cards,question_type:isPolicyRequest(state,u)?'policy_evaluation':state.preparation.question_type,adoption_mode:known(u.fields.adoption_mode)?u.fields.adoption_mode.value:state.preparation.adoption_mode};
}
export function mergeSuggestions(u,output,messageId){
 const next=JSON.parse(JSON.stringify(u));
 for(const [card,value]of Object.entries(output.proposed_cards||{})){const field=cardFields[card],old=next.fields[field];if(!field||typeof value!=='string'||!value.trim()||unknown.test(value)||old?.source?.kind==='user'||old?.source?.kind==='choice'||known(old))continue;
 setField(next,field,value,'suggested',source(messageId,value,'model'));
 }
 return next;
}
export function applyUnderstanding(state,proposal,edits,messageId){
 const u=understanding(state),origin=source(messageId,'用户在完整建议卡核对后应用','confirmation');
 for(const [card,raw]of Object.entries(proposal.cards||{})){const field=cardFields[card],value=clean(edits?.[card]??raw);if(!field)continue;
  if(unknown.test(value)){if(!known(u.fields[field]))setField(u,field,'','unknown',origin);continue;}
  if(field==='object'){const years=value.match(/((?:18|19|20|21)\d{2})\s*[-—–至到]\s*((?:18|19|20|21)\d{2})/);if(years)setField(u,'period',years[1]+'–'+years[2]+'年','provided',origin);}
  setField(u,field,value,'provided',origin);
 }
 u.revision++;u.active_question=null;state.research_understanding=u;
}
export function refreshUnderstandingFromPreparation(state,changedCard=null){
 const u=understanding(state),origin=source(null,'用户手动填写研究资料','preparation');
 for(const [card,field]of Object.entries(cardFields)){if(changedCard&&card!==changedCard)continue;const record=state.preparation?.cards?.[card];if(record?.status==='suggested')continue;
  const value=clean(record?.value);if(!value){if(changedCard)setField(u,field,'','unknown',origin);continue;}if(unknown.test(value)){if(changedCard)setField(u,field,'','unknown',origin);continue;}
  setField(u,field,value,'provided',origin);
  if(field==='object'){
   const years=value.match(/((?:18|19|20|21)\d{2})\s*(?:年)?\s*[-—–至到]\s*((?:18|19|20|21)\d{2})/);if(years)setField(u,'period',years[1]+'–'+years[2]+'年','provided',origin);
  }
  if(field==='outcome'){
   const unit=value.match(/单位\s*(?:是|为)?\s*[:：]?\s*([^，。；;\n]{1,80})/)||value.match(/(?:收入|工资|产出|消费)\s*(?:[（(]\s*)?(千元|万元|元|美元|吨|万吨|人)(?:\s*[）)])?$/);if(unit&&!unknown.test(unit[1]))setField(u,'unit',unit[1],'provided',origin);else if(changedCard)setField(u,'unit','','unknown',origin);
  }
 }
 u.revision++;u.active_question=null;state.research_understanding=u;
}
export function understandingExecutionGap(state,u=understanding(state)){
 for(const field of ['period','outcome','unit']){const item=u.fields[field];if(item?.source&&['unknown','awaiting_data'].includes(item.status))return item.label+'尚待明确，不能作为已确认执行条件。';}
 return '';
}
const choiceDefinitions={
 unit:[{id:'read_unit',label:'我先查看数据说明',answer:'我先查看数据说明，指标单位待确认。',status:'awaiting_data',value:'待数据说明确认'},{id:'wait_unit',label:'拿到数据后确认',answer:'拿到数据后再确认指标单位。',status:'awaiting_data',value:'待数据说明确认'}],
 outcome:[{id:'wage_monthly',label:'月工资',answer:'我选择月工资作为结果指标，单位等数据说明确认。',value:'月工资',status:'provided'},{id:'wage_annual',label:'年度劳动收入',answer:'我选择年度劳动收入作为结果指标，单位等数据说明确认。',value:'年度劳动收入',status:'provided'},{id:'wage_hourly',label:'小时工资',answer:'我选择小时工资作为结果指标，单位等数据说明确认。',value:'小时工资',status:'provided'},{id:'employment_count',label:'就业人数',answer:'我选择就业人数作为结果指标，单位等数据说明确认。',value:'就业人数',status:'provided'},{id:'employment_rate',label:'就业率',answer:'我选择就业率作为结果指标，单位等数据说明确认。',value:'就业率',status:'provided'},{id:'annual_total',label:'城市年度总量',answer:'我关注城市年度碳排放总量，单位待查。'},{id:'gdp_intensity',label:'单位GDP排放强度',answer:'我关注单位GDP碳排放强度，单位待查。'},{id:'read_indicator',label:'先查看数据说明',answer:'我先查看数据说明，再确定结果指标。',status:'awaiting_data',value:'待数据说明明确指标'}],
 period:[{id:'all_period',label:'数据覆盖的全部年份',answer:'希望使用数据覆盖的全部年份，具体范围待确认。',status:'awaiting_data',value:'希望使用数据覆盖的全部年份（范围待确认）'}],
 adoption_mode:[{id:'same_batch',label:'同一批、同一时间',answer:'政策是在同一批对象、同一时间实施。',value:'single_batch',status:'provided'},{id:'staggered',label:'分批实施',answer:'政策是分批实施。',value:'staggered',status:'provided'},{id:'read_batch',label:'还需要核对',answer:'政策实施批次还需要核对。',value:'待政策原文核对',status:'awaiting_data'}],
};
const fieldsForChoice=k=>Object.hasOwn(labels,k)||['data','mapping'].includes(k);
export function validateChoice(state,messages,body){
 if(!body.choice_id&&!body.question_id)return null;
 if(typeof body.choice_id!=='string'||typeof body.question_id!=='string')throw Object.assign(Error('回答选项不完整，请重新读取当前问题。'),{status:422});
 const latest=messages.filter(x=>x.role==='assistant').at(-1),q=latest?.dialogue?.current_question;
 if(!q||q.id!==body.question_id||state.research_understanding?.active_question?.id!==q.id||latest.research_revision!==state.research_revision)throw Object.assign(Error('这个问题已更新，请使用当前一轮的选项。'),{status:409});
 const dynamic=latest.dialogue.schema_version===2&&body.choice_id.startsWith('reply_')?latest.dialogue.choices?.find(c=>c.id===body.choice_id):null;
 if(dynamic){if(!fieldsForChoice(q.field)||typeof dynamic.answer!=='string'||dynamic.answer.length>240)throw Object.assign(Error('回答选项无效。'),{status:422});const kind=dynamic.kind||(/了解|区别|再决定|是什么/.test(dynamic.answer)?'consult':/待|不知道|不确定|查看/.test(dynamic.answer)?'unknown':'value');return {...dynamic,kind,field:q.field,value:kind==='value'?(dynamic.value||dynamic.answer):'',status:kind==='consult'?null:kind==='unknown'||q.field==='unit'?'awaiting_data':'provided'};}
 const publicChoice=latest.dialogue.choices?.find(x=>x.id===body.choice_id),definition=choiceDefinitions[q.field]?.find(x=>x.id===body.choice_id);
 if(!publicChoice||!definition||publicChoice.answer!==definition.answer)throw Object.assign(Error('回答选项无效。'),{status:422});
 return {...definition,field:q.field};
}
function preparationCard(gap,u){
 const field=gap.field,lookup={goal:'textbook_question',policy:'textbook_question',object:'lesson_2',outcome:'textbook_variables',unit:'textbook_units',period:'lesson_2',effective_date:'lesson_2',adoption_mode:'textbook_did',data:'textbook_variables',mapping:'textbook_variables',policy_doc:'lesson_2'},material=knowledgeChunks.find(x=>x.id===(lookup[field]||'textbook_question'))||knowledgeChunks[0];
 const cards={
 goal:['先说清楚想了解什么','研究目标说明你希望回答的问题，可以先从一个现象或一项政策说起。','例如：一项城市政策实施后，碳排放总量发生了怎样的变化？','先明确对象和指标，方法可以稍后讨论。'],
 object:['研究对象是什么','研究对象是每条观测代表谁，例如城市、企业或个人。','一行对应某个城市某一年时，研究对象是城市。','对象和指标需要分别记录。'],
 outcome:['把结果指标说具体','结果指标表示你希望观察什么变化；同一主题可以有不同指标。','碳排放总量与单位GDP排放强度回答不同的问题。','先选你关心的指标，单位仍需核对数据说明。'],
 unit:['指标和单位的区别','指标表示测量什么；单位表示数值的尺度。现在不知道单位也可以先记录为待确认。','若数据说明写“万吨”，数值1就表示1万吨；这个例子不是替你确定真实单位。','请查看变量说明，不能从指标名称猜单位。'],
 period:['先确定希望观察的时期','可以先希望使用全部可获得年份，拿到数据后再确认实际覆盖范围。','“使用数据覆盖的全部年份”与“2010–2020年”是两种不同的时期说明。','范围待确认时不能当成已经选定的研究年份。'],
 effective_date:['实施时间要查原文','政策发布与实际实施可能不是同一天，评估时应记录实际实施时间。','先保留政策链接，再查其中的实施或试点安排。','没有依据时不猜年份。'],
 adoption_mode:['同批和分批有什么不同','同批是对象在同一时间开始受到政策；分批是不同对象在不同时间开始。','不同城市分年度进入试点，就是需要核对分批安排的情况。','当前同批DID不能直接用于分批实施。'],
 data:['提交数据后先看字段','数据检查先确认列代表什么、缺失情况和单位，再讨论可用方法。','城市编号、年份、排放量可能各占一列。','模型只接收字段摘要，原始观测不自动发给模型。'],
 mapping:['列名不等于指标定义','需要把研究指标对应到实际列，并补充该列的含义和单位。','一个缩写列名可能记录总量，也可能记录强度。','最终核对完整方案后才计算。'],
 policy:['政策名称与政策原文','政策名称用于明确讨论对象；原文或链接用于核对时间、名单和适用条件。','先说政策名称，稍后提交发布文件或链接。','名称已记录不代表原文已经核实。'],
 };
 const [title,summary,example,reminder]=cards[field]||cards.goal;
 const contextualExample=field==='outcome'&&!/碳排放/.test(u.fields.outcome.value+' '+u.fields.goal.value)?'例如：就业人数与就业率是不同指标，定义不同，解释也不同。':example;
 return {id:'research_'+field,title,summary,example:contextualExample,reminder,content:[summary,contextualExample,reminder,material.content].join('\n\n'),source:material.source,references:material.references||[],version:material.version,review_status:material.review_status,knowledge_version:knowledgeVersion,material_id:material.id};
}
function humanReply(value){return clean(value).replace(/\s*[（(](?:lesson_\d+|analysis_context|research_preparation)[）)]/g,'').replace(/\b(?:lesson_\d+|analysis_context|research_preparation)\b/g,'').replace(/method\s*(?:为|[:：=])\s*null|row_count\s*(?:为|[:：=])\s*\d+/gi,'').trim();}
function indicatorHelp(u,text){
 if(!isResearchHelpQuestion(text)||!/指标|工资|收入|结果|就业/.test(text))return null;
 const topic=text+' '+u.fields.outcome.value+' '+u.fields.goal.value;
 let ids,explanation;
 if(/工资|收入|薪酬/.test(topic)){ids=['wage_monthly','wage_annual','wage_hourly'];explanation='可以按研究目的选：月工资看日常薪酬，年度劳动收入包含全年劳动报酬，小时工资方便比较工时不同的人。需要区分税前税后、奖金和工时口径；具体单位等数据说明确认。';}
 else if(/就业/.test(topic)){ids=['employment_count','employment_rate'];explanation='就业人数看岗位或就业规模，就业率看指定人口中有工作的比例。两者回答不同的问题，需要核对统计对象与就业率的分母。';}
 else if(/碳排放/.test(topic)){ids=['annual_total','gdp_intensity'];explanation='年度碳排放总量看整体排放变化，单位GDP排放强度看经济产出对应的排放。先按研究问题选指标，不能仅按数据是否显著来选。';}
 else return null;
 return {choices:choiceDefinitions.outcome.filter(x=>ids.includes(x.id)).map(({id,label,answer})=>({id,label,answer})),explanation,prompt:'你更想研究哪一个？也可以说说你的研究目的。'};
}
export function absorbQuotedFacts(state,updates,user){
 const u=understanding(state);let changed=false;
  for(const item of updates||[]){if(!Object.hasOwn(labels,item.field)||!user.content.includes(item.source_span)||!item.source_span.includes(item.value)||unknown.test(item.value)||/[？?]|有哪些|是什么|什么意思|如何|怎么|例如|假如|假设/.test(item.source_span))continue;
  if(item.field==='outcome'&&u.fields.outcome.value!==item.value&&known(u.fields.unit))changed=setField(u,'unit','','unknown',source(user.id,user.content,'user_extract'))||changed;
  const allPeriod=item.field==='period'&&/全部|所有|覆盖|可获得/.test(item.value);
  changed=setField(u,item.field,allPeriod?'希望使用数据覆盖的全部年份（范围待确认）':item.value,allPeriod?'awaiting_data':'provided',source(user.id,item.source_span,'user_extract'))||changed;
 }
 if(changed)u.revision++;return {understanding:u,changed};
}
export function coachingDialogue(state,u,output,context,user,assistantId,intent){
 const modelOk=!output.error_type&&!['manual','rules','checklist'].includes(output.mode);
 if(modelOk&&output.coach?.answer){
  const c=output.coach,compute=u.compute_requested||isComputeRequest(user.content),fallbackGap=nextGap(state,u,context.profile);
  let follow=c.follow_up;if(!c.follow_up_explicit&&c.legacy_question)follow={field:fallbackGap.field,prompt:c.legacy_question};
  if(compute&&context.profile.row_count&&['unit','period'].includes(follow?.field))follow=null;
  // A valid candidate goes to the explicit review action, never back to intake.
  if(output.ready&&output.candidate)follow=null;
  const question=follow?{id:assistantId+':'+follow.field,field:follow.field,prompt:follow.prompt}:null;
  const learning=c.learning_card||preparationCard(follow?{field:follow.field}:fallbackGap,u);
  const refs=(output.retrieval||[]).filter(x=>c.references.includes(x.id));
  if(refs.length){learning.source=refs.map(x=>({url:typeof x.source==='string'?x.source:x.source?.url,title:x.title}));learning.references=refs.flatMap(x=>x.references||[]);learning.version=refs[0].version;learning.review_status=refs[0].review_status;}
  const answer=humanReply(c.answer),body=question&&c.follow_up_explicit?answer.replace(/[^。！？!?\n]*[？?]/g,'').trim():answer;
  return {schema_version:2,summary:body+(question&&!body.includes(question.prompt)?'\n'+question.prompt:''),current_question:question,choices:question?c.choices:[],learning_card:learning,next_gap:question?{field:question.field,label:labels[question.field]||'当前操作',prompt:question.prompt}:fallbackGap,recovery:{can_retry:false},response_origin:'model'};
 }
 const help=indicatorHelp(u,user.content);
 const gap=help?{field:'outcome',label:labels.outcome,prompt:help.prompt}:/不知道.*单位|不清楚.*单位|单位.*(?:不知道|不清楚|待查)/.test(user.content)?{field:'unit',label:labels.unit,prompt:'你可以先查看数据说明，也可以拿到数据后再确认单位。'}:nextGap(state,u,context.profile),failure=!!output.error_type||['manual','rules','checklist'].includes(output.mode),q={id:assistantId+':'+gap.field,field:gap.field,prompt:gap.prompt};
 let choices=(choiceDefinitions[gap.field]||[]).filter(x=>!['wage_monthly','wage_annual','wage_hourly','employment_count','employment_rate'].includes(x.id)).map(({id,label,answer})=>({id,label,answer}));
 if(gap.field==='outcome'&&!/碳排放/.test(u.fields.outcome.value+' '+u.fields.goal.value))choices=[];
 if(gap.field==='unit'&&!unknown.test(user.content))choices=[];
 let content;
 if(intent==='knowledge'||intent==='reflection'){
  const raw=humanReply(output.answer||output.reason),sentence=raw.match(/^[\s\S]{1,330}?[。！？](?:\s|$)/)?.[0]?.trim();content=raw.length>360?(sentence||'我整理了与你当前问题相关的讲解，完整内容可以在知识卡中打开。'):raw||gap.prompt;
 }else if(output.ready){content='我整理了一份候选方案。请核对研究资料、字段和单位，确认后再计算。';choices=[];}
 else if(gap.field==='unit'&&unknown.test(user.content))content='单位是数值使用的尺度，不能从指标名称猜。我们可以先保留“待确认”，等查看数据说明后再补。';
 else if(allPeriod.test(user.content))content='已记下希望使用数据覆盖的全部年份。具体起止年份等数据到手后再确认。\n'+gap.prompt;
 else if(gap.field==='outcome'&&/碳排放/.test(u.fields.outcome.value))content='“碳排放”可以指总量，也可以指强度。\n'+gap.prompt;
 else content=gap.prompt;
 if(failure)content='在线模型暂不可用，你的回答和研究摘要已保留。以下是固定教学帮助。\n'+(intent==='knowledge'?preparationCard(gap,u).summary:content);
 if(help){choices=help.choices;const direct=humanReply(output.answer||'');content=(failure?'在线模型暂不可用，你的回答已保留。以下是固定教学帮助。\n'+help.explanation:direct||help.explanation);if(!/[？?]/.test(content))content+='\n'+help.prompt;}
 const learning_card=preparationCard(gap,u);
 if(intent==='knowledge'&&!failure&&output.answer){learning_card.content=humanReply(output.answer);learning_card.title='当前问题讲解';learning_card.summary=learning_card.content.length<=180?learning_card.content:learning_card.content.match(/^[\s\S]{1,160}?[。！？](?:\s|$)/)?.[0]?.trim()||'这份讲解结合当前研究资料说明概念、例子和需要核对的条件。完整正文可以按需打开。';const relevant=context.focus_method&&output.retrieval?.find?.(x=>!x.id?.startsWith('fixest_'));if(relevant)Object.assign(learning_card,{source:relevant.source,material_id:relevant.id});}
 if(help){learning_card.title='选择与你问题对应的指标';learning_card.summary=help.explanation;learning_card.example='可选指标只是讨论方向，点击后仍需核对数据定义与单位。';}
 return {summary:content,current_question:output.ready||intent==='reflection'?null:q,choices,learning_card,next_gap:gap,recovery:{can_retry:failure&&!['configuration','rate_limit'].includes(output.error_type)&&output.mode!=='rules',retry_of_message_id:failure?user.id:null,error_type:output.error_type||(failure?'unavailable':null),label:failure?'重试在线回复':null}};
}
