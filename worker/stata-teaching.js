// Only controlled Stata18 templates. No arbitrary local script or log is accepted.
export const stataTemplateVersion='stata18-core-v1';
const sha=async value=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(x=>x.toString(16).padStart(2,'0')).join('');
import {sampleEvidenceText} from './sample-evidence.js';
const topic=line=>[['import delimited ','import'],['destring ','numeric'],['drop if ea_missing','missing'],['assert _N','sample'],['egen long ea_cluster','cluster'],['egen long ea_panel','panel'],['xtset ','xtset'],['generate byte policy_post','post'],['generate byte policy_effect','interaction'],['regress ','estimate'],['xtreg ','estimate']].find(([prefix])=>line.startsWith(prefix))?.[1];
export function expectedStataTeaching(task){
 const aliases=Object.fromEntries(task.profile.columns.map((c,i)=>[c.name,'v'+i])),p={...task.plan};
 for(const k of ['outcome','unit','time','treated','cluster'])p[k]=aliases[p[k]]||'';p.predictors=p.predictors.map(x=>aliases[x]);
 const variables=[...new Set([p.outcome,...p.predictors,p.unit,p.time,p.treated,p.cluster].filter(Boolean))],numeric=[...new Set([p.outcome,...p.predictors,...(p.method!=='ols'?[p.time]:[]),...(p.method==='did'?[p.treated]:[])])];
 const lines=['version 18.0','clear all','set more off','set varabbrev off','set processors 1','capture log close _all','log using execution.log, text replace','assert c(stata_version) >= 18 & c(stata_version) < 19','import delimited using normalized.csv, varnames(1) stringcols(_all) clear','generate long ea_row = _n'];
 for(const v of numeric)lines.push(`replace ${v} = "" if inlist(${v},"NA","N/A","null","NaN")`,`destring ${v}, replace`);
 for(const v of variables)lines.push(`capture confirm string variable ${v}`,`if !_rc replace ${v} = "" if inlist(${v},"NA","N/A","null","NaN")`);
 lines.push('generate byte ea_missing = 0',...variables.map(v=>`replace ea_missing = 1 if missing(${v})`));
 if(p.missing==='block')lines.push('assert ea_missing == 0');
 if(p.method!=='ols')lines.push(`assert !missing(${p.unit}) & !missing(${p.time})`,`assert ${p.time} == floor(${p.time})`,`isid ${p.unit} ${p.time}`);
 lines.push('drop if ea_missing','assert _N >= 8');
 const derived=[];
 if(p.vcov==='cluster'){lines.push(`egen long ea_cluster = group(${p.cluster})`);derived.push({alias:'ea_cluster',role:'cluster',sources:[p.cluster]});}
 if(p.method!=='ols'){lines.push(`egen long ea_panel = group(${p.unit})`,`xtset ea_panel ${p.time}`);derived.push({alias:'ea_panel',role:'panel',sources:[p.unit]});}
 if(p.method==='did'){
  lines.push(`assert inlist(${p.treated},0,1)`,`bysort ea_panel: assert ${p.treated} == ${p.treated}[1]`,`generate byte policy_post = ${p.time} >= ${p.policy_year}`,`generate byte policy_effect = ${p.treated} * policy_post`,'bysort ea_panel: egen byte ea_minpost = min(policy_post)','bysort ea_panel: egen byte ea_maxpost = max(policy_post)','assert ea_minpost == 0 & ea_maxpost == 1');
  for(const g of [0,1])for(const t of [0,1])lines.push(`count if ${p.treated}==${g} & policy_post==${t}`,'assert r(N)>0');
  derived.push({alias:'policy_post',role:'post',sources:[p.time]},{alias:'policy_effect',role:'interaction',sources:[p.treated,'policy_post']});
 }
 const vce={iid:'',hetero:'vce(robust)',cluster:'vce(cluster ea_cluster)'}[p.vcov],rhs=[...(p.method==='did'?['policy_effect']:[]),...p.predictors].join(' ');
 lines.push(p.method==='ols'?`regress ${p.outcome} ${rhs}`+(vce?`, ${vce}`:''):`xtreg ${p.outcome} ${rhs} i.${p.time}, fe ${vce}`);
 return {schema_version:1,template_version:stataTemplateVersion,commands:lines.flatMap((text,i)=>topic(text)?[{id:'line-'+(i+1),line:i+1,text,topic:topic(text)}]:[]),mapping:task.profile.columns.map((c,i)=>({alias:'v'+i,name:c.name})),derived};
}
export async function validateStataPreview(value,task){
 if(task.kind!=='template'||task.engine_id!=='stata_local_mcp')throw Error('仅支持受控真实 Stata 模板的教学预览。');
 const expected=expectedStataTeaching(task),allowed=['schema_version','template_version','commands','mapping','derived','input_sha256','plan_sha256','code_sha256','script_sha256'];
 if(!value||Object.keys(value).some(k=>!allowed.includes(k)))throw Error('教学预览包含未知内容。');
 for(const k of ['schema_version','template_version','commands','mapping','derived'])if(JSON.stringify(value[k])!==JSON.stringify(expected[k]))throw Error('教学命令、字段映射或模板版本不匹配，请更新助手。');
 if(value.input_sha256!==task.input_sha256||value.plan_sha256!==task.plan_sha256||!['code_sha256','script_sha256'].every(k=>/^[a-f0-9]{64}$/.test(value[k]||'')))throw Error('教学预览的输入、方案或代码哈希无效。');
 const preview={...expected,input_sha256:task.input_sha256,plan_sha256:task.plan_sha256,code_sha256:value.code_sha256,script_sha256:value.script_sha256};
 return {...preview,preview_hash:await sha(JSON.stringify(preview))};
}
const descriptions={
 import:['读取本机数据','把助手准备的 normalized.csv 读入独立 Stata 会话。','这是本机归一化副本，原始文件路径不会显示在网页。'],
 numeric:['转换数值类型','将指定字段由文本转换成数值，供模型使用。','转换失败应检查原数据，不能把异常字符随意当作零。'],
 missing:['处理缺失观测','按已确认规则排除选定变量存在缺失的行。','实际估计样本还要读取 e(sample)，不能只用输入行数。'],
 sample:['检查可用样本','检查整理后至少有八行观测，避免空数据进入模型。','达到八行只是运行条件，不代表样本足以支持可靠推断。'],
 panel:['生成个体编号','由已选择的个体字段生成 Stata 使用的面板编号。','编号只是映射，不改变研究对象，也不是新增解释变量。'],
 cluster:['生成聚类编号','由已确认的聚类字段生成聚类组编号。','聚类层级要有研究依据，不能为获得显著性随意调整。'],
 xtset:['声明面板结构','告诉 Stata 哪一列识别个体、哪一列识别年份。','声明面板本身不会估计回归，也不会自动加入年份固定效应。'],
 post:['定义政策后时期','按已确认实施年份生成 0/1 的政策后标记。','本模板仅适用于已核对的同批实施设计。'],
 interaction:['生成 DID 交互项','将处理组标记与政策后标记相乘，生成 policy_effect。','交互项系数不自动证明因果，平行趋势等识别条件仍需判断。'],
 estimate:['执行已确认模型','根据当前结果变量、解释变量和推断设置估计模型。','显著性不是因果证明；标准误设置也不能消除内生性。']
};
export function stataLesson(task,commandId,focus='command',term=null,part='command'){
 const command=task.teaching_preview?.commands.find(c=>c.id===commandId);if(!command)throw Error('命令不存在或预览已更新。');
 const [title,summary,reminder]=descriptions[command.topic],mapping=task.teaching_preview.mapping.map(c=>`${c.alias} = ${c.name}`).join('；');
 const p=task.plan,detail=[];
 const parts={variables:'估计命令后第一个变量是结果变量，其后为解释变量；字段别名需按本任务映射阅读。',comma:'逗号将模型变量与选项分开；逗号后的内容控制估计和推断设置。',year:'i.年份列把年份作为分类变量，加入年份虚拟变量；不能当作连续年份系数解释。',fe:'xtreg 的 fe 指定个体固定效应；单独 xtset 不会自动控制年份效应。',vce:p.vcov==='cluster'?'vce(cluster ea_cluster) 按已确认的聚类列计算标准误。':p.vcov==='hetero'?(p.method==='ols'?'regress 的 vce(robust) 是异方差稳健标准误。':'xtreg, fe 的 vce(robust) 按面板个体聚类，不是单纯的异方差稳健设置。'):'本次采用常规方差估计，没有 vce() 覆盖选项。'};
 if(part!=='command'&&!Object.hasOwn(parts,part))throw Error('语法片段无效。');
 if(part!=='command'&&command.topic!=='estimate')throw Error('语法片段与命令不匹配。');
 if(part!=='command')detail.push(parts[part]);
 if(command.topic==='estimate'){
  detail.push(p.method==='ols'?'regress 后第一个变量是结果变量，其后是解释变量。':'xtreg 的 fe 选项控制个体固定效应；i.年份列额外加入年份虚拟变量。');
  detail.push(p.vcov==='cluster'?`vce(cluster ea_cluster) 按已确认的 ${p.cluster} 聚类。`:p.vcov==='hetero'?(p.method==='ols'?'此 regress 的 vce(robust) 使用异方差稳健标准误。':'此 xtreg, fe 的 vce(robust) 按面板个体聚类，含义不同于 regress 的异方差稳健设置。'):'当前使用常规方差估计，依赖相应模型假设。');
  detail.push('逗号前描述模型，逗号后指定选项；这些选项不会自动验证识别条件。');
 }
 if(focus!=='command'){
  if(task.status!=='succeeded'||!task.result||task.code_sha256!==task.teaching_preview.code_sha256)throw Error('尚无与这份代码对应且已批准上传的真实结果。');
  const c=task.result.coefficients?.find(c=>c.term===term);
  if(focus==='sample')detail.push(sampleEvidenceText(task));
  else if(!c)throw Error('本次结果没有这个估计项。');
  else {
   const metric={estimate:`系数为 ${c.estimate}，表示当前模型和控制条件下的关系，单位取决于结果与解释变量的计量口径。`,std_error:`标准误为 ${c.std_error}，衡量估计不确定性；当前方差设置为 ${p.vcov}。`,interval:`95%区间为 [${c.ci_low}, ${c.ci_high}]，需要与自由度及推断设置一起理解。`}[focus];
   if(!metric)throw Error('讲解目标无效。');detail.push(`${c.term}：${metric}`);
  }
 }
 const dictionary=Object.entries(task.dictionary||{}).map(([k,v])=>`${k}：${typeof v==='string'?v:JSON.stringify(v)}`).join('；');
 return {title:focus==='command'?title:'真实结果 · '+({sample:'实际样本',estimate:'系数',std_error:'标准误',interval:'置信区间'}[focus]||title),summary:focus!=='command'?detail.at(-1):part!=='command'?parts[part]:summary,example:command.text,reminder,content:[summary,...detail,'字段对应：'+mapping,dictionary?'已记录字典（来源与单位仍需核对）：'+dictionary:'尚无已确认单位；不推测真实单位。',reminder].join('\n\n'),source:'https://www.stata.com/manuals18/'+({import:'dimportdelimited',numeric:'ddestring',missing:'ddrop',sample:'dassert',panel:'degen',cluster:'degen',xtset:'xtxtset',post:'dgenerate',interaction:'dgenerate',estimate:p.method==='ols'?'rregress':'xtxtreg'}[command.topic])+'.pdf',version:'Stata18 · '+stataTemplateVersion,review_status:'固定语法说明；结合实际模板，未作学习掌握评定',command_id:command.id,focus};
}
