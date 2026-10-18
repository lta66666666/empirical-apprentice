import { curriculum } from './content.js';
import {textbookCards} from './textbook-cards.js';
import {guideKnowledgeChunks} from './stata-guide.js';
export const knowledgeVersion='ea-kb-20261019-operations';
export const knowledgeChunks=[
  ...guideKnowledgeChunks,
  ...textbookCards,
  ...curriculum.lessons.map(lesson=>({id:`lesson_${lesson.id}`,title:lesson.title,section:`八阶段课程·第${lesson.id}阶段`,source:'/static/teaching/handbook.html',version:curriculum.curriculum_id,review_status:'既有课程，待队友审校',content:[lesson.intro,lesson.goal,lesson.guide,...(lesson.pitfalls||[])].filter(Boolean).join('\n').slice(0,2200)})),
  {id:'fixest_formula',title:'R/fixest 公式与固定效应',section:'feols · fml / vcov',source:'https://lrberge.github.io/fixest/reference/feols.html',version:'fixest 0.14.2',review_status:'官方操作文档摘要，教学措辞待审校',content:'feols 接收公式、数据和方差估计设置。公式 y ~ x1 + x2 表示OLS；竖线后的单位与时间字段指定固定效应，例如 y ~ x | city + year。vcov 可以指定 iid、hetero 或 cluster。控制固定效应不自动完成因果识别；本项目仍核对批次、样本与变量单位。'},
  {id:'fixest_sample',title:'实际样本、剔除与推断口径',section:'feols · fixef.rm / ssc',source:'https://lrberge.github.io/fixest/reference/feols.html',version:'fixest 0.14.2',review_status:'官方操作文档摘要，教学措辞待审校',content:'fixef.rm 控制固定效应估计前的样本排除。默认 perfect_fit 涉及单例等观测排除；应读取真实估计样本，不把输入行数当作实际样本。ssc 设置小样本调整，标准误和区间比较还须核对聚类、自由度和有限样本调整。'},
  {id:'stata_mcp_operation',title:'本机 Stata MCP 操作',section:'连接、会话与执行',source:'https://github.com/hanlulong/stata-mcp',version:'DeepEcon 0.5.3',review_status:'已核对安装源码',content:'本机 MCP Streamable HTTP 地址为 localhost:4000/mcp-streamable。stata_run_selection 执行代码片段，stata_run_file 执行本机do文件，stata_session 管理会话。原始数据默认留在本机；本机助手配对后，最终代码在本机预览批准才能运行。MCP工具以本机账号权限运行，不是文件权限沙箱。'},
].map(c=>({...c,topic:c.topic||(/sample|units/.test(c.id)?'data_check':/regress|formula|variance/.test(c.id)?'command_syntax':c.id==='textbook_interpret'?'result_reading':'research_concept'),engine:c.engine||(c.id.startsWith('fixest_')?'r':c.id.startsWith('stata_')?'stata':null),accessed_at:c.id.startsWith('stata_guide_')?'2026-10-19':c.id.startsWith('textbook_')?'2026-10-16':'2026-10-09',knowledge_version:knowledgeVersion}));
function tokens(text){const value=String(text||'').toLowerCase();return [...new Set([...(value.match(/[a-z_][a-z0-9_]+/g)||[]),...(value.match(/[\u3400-\u9fff]{2,}/g)||[]).flatMap(word=>Array.from({length:Math.max(0,word.length-1)},(_,i)=>word.slice(i,i+2)))])];}
export function knowledgeOptions(value={}){
 const allowed={engine:['stata','r','python'],method:['ols','panel_fe','did'],stage:['prepare','data','health','plan','execute','explain','reports','stata_code'],topic:['software_operation','command_syntax','result_reading','data_check','research_concept']},out={};
 for(const [key,values]of Object.entries(allowed))if(value[key]!=null&&value[key]!==''){if(!values.includes(value[key]))throw Object.assign(Error('教学检索条件无效：'+key),{status:422});out[key]=value[key];}return out;
}
export function retrieveKnowledge(query,limit=3,context={}){
 if(typeof limit==='object'){context=limit;limit=3;}const q=String(query||''),options=knowledgeOptions(context),keys=tokens(q);if(!keys.length&&!Object.keys(options).length)return [];
 const engine=options.engine||(/stata|do-file|do文件|命令窗口|结果窗口|\bregress\b|\bxtreg\b|\bxtset\b|vce\(/i.test(q)?'stata':/fixest|webR|feols/i.test(q)?'r':null);
 const topic=options.topic||(/缺失|排除|剔除|样本|单位|量纲/.test(q)?'data_check':/窗口|界面|文件夹|日志|do.file|do文件|导入|保存|报错|找不到|变量不存在|type mismatch|repeated time/i.test(q)?'software_operation':/命令|语法|regress|xtset|xtreg|vce\(|逗号/i.test(q)?'command_syntax':/系数|标准误|区间|结果.*解释/.test(q)?'result_reading':'research_concept');
 const preparationOnly=options.stage==='prepare'&&!options.method&&!engine;
 return knowledgeChunks.filter(c=>(!c.engine||c.engine===engine)&&(!options.method||!c.methods?.length||c.methods.includes(options.method))&&(!preparationOnly||c.id.startsWith('lesson_')||c.task_stages?.includes('prepare')||/缺失|样本/.test(q)&&c.id==='textbook_sample'))
 .map(chunk=>{const title=(chunk.title+' '+chunk.section).toLowerCase(),text=chunk.content.toLowerCase();let score=keys.reduce((sum,key)=>sum+(title.includes(key)?3:0)+(text.includes(key)?1:0),0)/Math.sqrt(Math.max(text.length,200));
 if(chunk.topic===topic)score+=1.5;if(options.stage&&chunk.task_stages?.includes(options.stage))score+=.3;if(options.method&&chunk.methods?.includes(options.method))score+=.25;if(engine&&chunk.engine===engine)score+=.2;
 if(/单位|量纲/.test(q)&&chunk.id==='textbook_units')score+=3;if(/缺失|排除|剔除|样本/.test(q)&&chunk.id==='textbook_sample')score+=3;
 const operation= /重复.*(面板|年份|键)|repeated time/i.test(q)?'data_panel-key':/变量不存在|找不到变量|type mismatch|数值类型/i.test(q)?'data_inspect':/文件.*(找不到|不存在)|报错|r\(\d+\)/i.test(q)?'files_error':/日志|log using/i.test(q)?'files_log':/do-file|do文件|doedit/i.test(q)?'do-files_open':/导入|import delimited/i.test(q)?'data_import':/界面|命令窗口|结果窗口/.test(q)?'interface_locate':null;
 if(engine==='stata'&&operation&&chunk.id==='stata_guide_'+operation)score+=5;
 return {...chunk,score};}).filter(c=>c.score>0).sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id)).slice(0,Math.max(1,Math.min(Number(limit)||3,3)));
}
export async function knowledgeContext(query,context={}){return Promise.all(retrieveKnowledge(query,3,context).map(async c=>{const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(c.content)))].map(x=>x.toString(16).padStart(2,'0')).join('');return {...c,content_hash:hash};}));}
