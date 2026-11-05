import {digest} from './executor.js';
const fail=(text,status=409)=>Object.assign(Error(text),{status});
export async function correspondingReference(env,owner,state,ref){
 let preview,plan,result=null,task=null;
 if(ref.task_id){const row=await env.DB.prepare('SELECT body FROM jobs WHERE id=? AND session_id=? AND owner=?').bind(ref.task_id,state.session_id,owner).first();if(!row)throw fail('教学任务不可读取。',404);task=JSON.parse(row.body);preview=task.corresponding_code;plan=task.plan;result=task.status==='succeeded'?task.result:null;}
 else{const p=state.pending_confirmation;if(!p||p.token!==ref.confirmation_token||p.research_revision!==state.research_revision)throw fail('方案预览已变化，请重新核对。');preview=p.corresponding_code;plan=p.plan;}
 if(!preview||preview.executed!==false||preview.sha256!==ref.preview_hash||await digest(preview.code)!==preview.sha256)throw fail('对应代码引用无效或已变化。');
 const command=preview.commands.find(c=>c.id===ref.command_id);if(!command)throw fail('教学命令无效。',422);
 const part=ref.part||'command',focus=ref.focus||'command';
 if(!['command','variables','comma','year','fe','vce'].includes(part)||!['command','sample','estimate','std_error','interval'].includes(focus))throw fail('讲解目标无效。',422);
 if(part!=='command'&&command.topic!=='estimate')throw fail('语法片段与命令不对应。',422);
 const c=result?.coefficients?.find(c=>c.term===ref.term);
 if(focus!=='command'&&(!result||focus!=='sample'&&!c))throw fail('尚无对应的完成结果。');
 const mapping=preview.mapping.map(m=>m.alias+' = '+m.name).join('；'),definitions={
  variables:'估计命令的第一个变量是结果变量，其后是解释变量。请对照本研究的字段映射阅读。',comma:'逗号前描述模型，逗号后设置估计和标准误。',
  year:'i.年份将年份视作分类变量，控制共同年份冲击；不是连续年份的斜率。',fe:'fe控制个体不随时间变化的差异；它不能消除所有随时间变化的混杂。',
  vce:plan.vcov==='cluster'?'本方案采用单向聚类标准误，聚类字段为 '+plan.cluster+'。':plan.vcov==='hetero'?'此OLS的vce(robust)是异方差稳健标准误。':'本方案采用常规方差估计。',
  command:command.topic==='estimate'?'这条命令对应当前已核对的模型结构；它不会因阅读而执行。':({import:'读取复现包中的规范化CSV。',numeric:'把选定数值字段转换成数值；异常字符会报错，不会猜作零。',missing:'按方案处理选定变量的缺失；无关字段不影响样本。',sample:'检查可用样本数量。',xtset:'声明个体和年度结构，不会自动估计模型。',post:'按已确认年份定义政策后时期。',interaction:'生成处理组与政策后的交互项。',cluster:'生成数值聚类编号，不改变原组别含义。',panel:'生成数值个体编号，原编号含义不变。'}[command.topic]||'本条属于对应代码的数据准备步骤。')};
 const dictionary=task?.dictionary||state.variable_dictionary||{};
 const engine=task?.engine_id||plan.engine_id;const software=engine==='browser_webr'?'浏览器 R / fixest':engine==='statspai_cloud'?'Python / StatsPAI':task?.software||plan.software||'软件未记录';
 const execution=task?(task.status==='succeeded'?'本次由 '+software+' 完成计算。':task.status==='failed'?'本次 '+software+' 计算未完成。':'本次任务使用 '+software+'，尚无完成结果。'):'本方案拟使用 '+software+'，尚未执行。';
 let summary=definitions[part];
 if(focus==='sample')summary='本次估计使用 '+result.n_used+' 行。输入行数与估计样本可能不同，删除原因见样本记录。';
 if(c&&focus==='estimate')summary=c.term+' 的系数为 '+c.estimate+'；结果变量说明：'+(dictionary[plan.outcome]||'单位与含义未提供，不能擅自换算')+'。不自动代表因果。';
 if(c&&focus==='std_error')summary=c.term+' 的标准误为 '+c.std_error+'，反映当前推断设置下的估计不确定性。';
 if(c&&focus==='interval')summary=c.term+' 的95%区间为 ['+c.ci_low+', '+c.ci_high+']；区间不能单独证明因果。';
 const card={id:'corresponding-'+command.id,title:focus==='command'?'Stata 对应代码 · '+(part==='command'?'命令':part):'本次分析结果 · '+focus,summary,
  example:command.text,reminder:execution+' Stata对应代码为只读教学产物。',content:summary+'\n\n```stata\n'+command.text+'\n```\n\n字段映射：'+mapping+'\n\n'+preview.differences.join('\n'),
  source:'https://www.stata.com/manuals/'+(command.topic==='xtset'?'xtxtset':plan.method!=='ols'&&['estimate','panel'].includes(command.topic)?'xtxtreg':command.topic==='import'?'dimportdelimited':command.topic==='numeric'?'ddestring':command.topic==='missing'?'u12':'rregress')+'.pdf',source_version:'官方在线手册，2026-10-29核对；模板适用Stata18',version:preview.template_version,review_status:'受控模板的固定讲解；阅读不代表掌握或已运行'};
 return {preview,plan,result,task,command,card,reference:{intent:'stata_corresponding',task_id:task?.id||null,confirmation_token:task?null:ref.confirmation_token,preview_hash:preview.sha256,command_id:command.id,part,focus,term:ref.term||null}};
}
