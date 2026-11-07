import { curriculum } from './content.js';
import {textbookCards} from './textbook-cards.js';
import {textbookSources} from './textbook-sources.js';
import {guideKnowledgeChunks} from './stata-guide.js';
import {knowledgeExtra} from './knowledge-extra.js';
export const knowledgeVersion='ea-kb-20261107-books-v2';
export const knowledgeChunks=[
  {id:'data_import_formats',title:'导入 CSV、TSV 或 DTA',topic:'software_operation',task_stages:['data','health'],content:'点击提交材料，选择数据文件。DTA保留数值编码，标签用于说明；日期转换先预览再确认。文件上传后核对字段，未知单位可后补。最多2MB、20,000行、60列。',source:'产品当前导入规范',version:'20261029'},
  ...guideKnowledgeChunks,
  ...textbookCards,
  ...knowledgeExtra,
  ...curriculum.lessons.map(lesson=>({id:`lesson_${lesson.id}`,title:lesson.title,section:`八阶段课程·第${lesson.id}阶段`,source:'/static/teaching/handbook.html',version:curriculum.curriculum_id,review_status:'既有课程，待队友审校',content:[lesson.intro,lesson.goal,lesson.guide,...(lesson.pitfalls||[])].filter(Boolean).join('\n').slice(0,2200)})),
  {id:'textbook_parallel_trends',title:'平行趋势检验（DID 与事件研究）',section:'识别假设 · 事前系数联合检验',source:'陈强《高级计量经济学及Stata应用》第2版、邱嘉平《因果推断实用计量方法》与 Stata 18 帮助；教材页码待逐页核对',version:'自编选编 2026-11-07',review_status:'教材摘要，页码与措辞待教师审校',task_stages:['prepare','plan','execute','explain','reports'],methods:['did','staggered_did','event_study'],topic:'research_concept',accessed_at:'2026-11-07',content:'平行趋势指：没有政策时，处理组与对照组的潜在结果趋势应一致。它是 DID 的识别假设，不是靠回归显著性“证明”的结论。\n\n检验步骤：1) 明确政策实施期，构造相对时间（政策前第 k 期、政策后第 k 期），通常省略政策前一期作为基准。2) 事件研究回归：Y_it = α_i + λ_t + Σ β_k D_i·1(t-E_i=k) + ε；重点观察政策前 β_k 是否接近 0，并同时报告点估计与置信区间。3) 对政策前系数做联合检验（Stata: testparm 或 test），不能只看单个系数。4) 稳健性：改变基准期或窗口、安慰剂政策时点、调整控制组、加入地区趋势。\n\n常见误区：不拒绝原假设不等于平行趋势成立（可能功效不足）；政策前系数显著也不必然否定 DID，但必须解释预期效应、政策前调整与对照组污染。分批或错位实施时，TWFE 事件研究可能把已处理单位当作对照，导致偏误；应使用 never-treated 或 not-yet-treated 对照（如 Callaway–Sant’Anna 的 csdid、Sun–Abraham 方法）。平行趋势是识别条件，报告应写明检验方式、基准期、窗口与结论边界。英文常写 parallel trends assumption 或 pre-trend test。'},
  {id:'fixest_formula',title:'R/fixest 公式与固定效应',section:'feols · fml / vcov',source:'https://lrberge.github.io/fixest/reference/feols.html',version:'fixest 0.14.2',review_status:'官方操作文档摘要，教学措辞待审校',content:'feols 接收公式、数据和方差估计设置。公式 y ~ x1 + x2 表示OLS；竖线后的单位与时间字段指定固定效应，例如 y ~ x | city + year。vcov 可以指定 iid、hetero 或 cluster。控制固定效应不自动完成因果识别；本项目仍核对批次、样本与变量单位。'},
  {id:'fixest_sample',title:'实际样本、剔除与推断口径',section:'feols · fixef.rm / ssc',source:'https://lrberge.github.io/fixest/reference/feols.html',version:'fixest 0.14.2',review_status:'官方操作文档摘要，教学措辞待审校',content:'fixef.rm 控制固定效应估计前的样本排除。默认 perfect_fit 涉及单例等观测排除；应读取真实估计样本，不把输入行数当作实际样本。ssc 设置小样本调整，标准误和区间比较还须核对聚类、自由度和有限样本调整。'},
  {id:'stata_mcp_operation',title:'本机 Stata MCP 操作',section:'连接、会话与执行',source:'https://github.com/hanlulong/stata-mcp',version:'DeepEcon 0.5.3',review_status:'已核对安装源码',content:'本机 MCP Streamable HTTP 地址为 localhost:4000/mcp-streamable。stata_run_selection 执行代码片段，stata_run_file 执行本机do文件，stata_session 管理会话。原始数据默认留在本机；本机助手配对后，最终代码在本机预览批准才能运行。MCP工具以本机账号权限运行，不是文件权限沙箱。'},
].map(c=>({...c,topic:c.topic||(/sample|units|labels|unbalanced/.test(c.id)?'data_check':/dofile|paths/.test(c.id)?'software_operation':/regress|formula|variance/.test(c.id)?'command_syntax':/textbook_interpret|textbook_significance/.test(c.id)?'result_reading':'research_concept'),engine:c.engine||(c.id.startsWith('fixest_')?'r':c.id.startsWith('stata_')?'stata':null),accessed_at:c.accessed_at||(c.id.startsWith('stata_guide_')?'2026-10-19':c.id.startsWith('textbook_')?'2026-11-03':'2026-10-09'),knowledge_version:knowledgeVersion}));
function tokens(text){const value=String(text||'').toLowerCase();return [...new Set([...(value.match(/[a-z_][a-z0-9_]+/g)||[]),...(value.match(/[\u3400-\u9fff]{2,}/g)||[]).flatMap(word=>Array.from({length:Math.max(0,word.length-1)},(_,i)=>word.slice(i,i+2)))])];}
export function knowledgeOptions(value={}){
 const allowed={source_id:textbookSources.map(s=>s.id),engine:['stata','r','python'],method:['ols','panel_fe','did','staggered_did','event_study','iv_2sls'],stage:['prepare','data','health','plan','execute','explain','reports','stata_code'],teaching_software:['stata','r','python','generic'],topic:['software_operation','command_syntax','result_reading','data_check','research_concept']},out={};
 for(const [key,values]of Object.entries(allowed))if(value[key]!=null&&value[key]!==''){if(!values.includes(value[key]))throw Object.assign(Error('教学检索条件无效：'+key),{status:422});out[key]=value[key];}return out;
}
export function retrieveKnowledge(query,limit=3,context={}){
 if(typeof limit==='object'){context=limit;limit=3;}const q=String(query||''),options=knowledgeOptions(context),keys=tokens(q);if(!keys.length&&!Object.keys(options).length)return [];
 const engine=options.teaching_software==='generic'?null:options.teaching_software||(/stata|\bxtreg\b|\bxtset\b|\bregress\b/i.test(q)?'stata':null)||options.engine||(/stata|do-file|do文件|命令窗口|结果窗口|\bregress\b|\bxtreg\b|\bxtset\b|vce\(/i.test(q)?'stata':/fixest|webR|feols/i.test(q)?'r':null);
 const topic=options.topic||(/缺失|排除|剔除|样本|删了|删除.*行|单位|量纲/.test(q)?'data_check':/窗口|界面|文件夹|日志|do.file|do文件|导入|保存|报错|找不到|变量不存在|type mismatch|repeated time/i.test(q)?'software_operation':/命令|语法|regress|xtset|xtreg|vce\(|逗号/i.test(q)?'command_syntax':/系数|标准误|区间|结果.*解释/.test(q)?'result_reading':'research_concept');
 const preparationOnly=options.stage==='prepare'&&!options.method&&!engine;
 const qCompact=q.toLowerCase().replace(/怎么做|怎么用|如何|什么|为什么|请问|一下|方法|检验|测试|步骤|的|了|吗/g,'').trim();
 return knowledgeChunks.filter(c=>(!options.source_id||c.references?.some(r=>r.source_id===options.source_id))&&(!c.engine||c.engine===engine)&&(!options.method||!c.methods?.length||c.methods.includes(options.method))&&(!preparationOnly||c.id.startsWith('lesson_')||c.task_stages?.includes('prepare')||/缺失|样本/.test(q)&&c.id==='textbook_sample'))
 .map(chunk=>{const title=(chunk.title+' '+chunk.section).toLowerCase(),keyText=(chunk.keywords||[]).join(' ').toLowerCase(),text=chunk.content.toLowerCase();let score=keys.reduce((sum,key)=>sum+(title.includes(key)?3:0)+(keyText.includes(key)?2:0)+(text.includes(key)?1:0),0)/Math.sqrt(Math.max(text.length,200));
 if(qCompact){if(title.includes(qCompact))score+=5;if(keyText.includes(qCompact))score+=4;}
 const strong=keys.filter(key=>key.length>=2&&(title.includes(key)||keyText.includes(key))).length;score+=strong*1.1;
 if(chunk.topic===topic)score+=1.5;if(options.stage&&chunk.task_stages?.includes(options.stage))score+=.3;if(options.method&&chunk.methods?.includes(options.method))score+=.25;if(engine&&chunk.engine===engine)score+=.2;
 if(options.source_id&&!keys.length)score+=1;
 if(/导入|上传|dta|csv|tsv/i.test(q)&&chunk.id==='data_import_formats')score+=8;
 if(/单位|量纲/.test(q)&&chunk.id==='textbook_units')score+=3;if(/缺失|排除|剔除|样本|删了|删除.*行/.test(q)&&chunk.id==='textbook_sample')score+=3;
 if(/标签|数值码|编码|label/i.test(q)&&chunk.id==='textbook_labels')score+=5;
 if(/非平衡|不平衡面板/.test(q)&&chunk.id==='textbook_unbalanced')score+=5;
 if(/勘误|教材.*版本|版本.*教材/.test(q)&&chunk.id==='textbook_errata')score+=7;
 if(/显著性水平|置信度|置信水平/.test(q)&&chunk.id==='textbook_significance')score+=5;
 if(/平行趋势|pre.?trend|parallel.?trend|事前趋势|共同趋势|事件研究.*(检验|假设|系数)/i.test(q)&&chunk.id==='textbook_parallel_trends')score+=8;
 const operation= /重复.*(面板|年份|键)|repeated time/i.test(q)?'data_panel-key':/变量不存在|找不到变量|type mismatch|数值类型/i.test(q)?'data_inspect':/文件.*(找不到|不存在)|报错|r\(\d+\)/i.test(q)?'files_error':/日志|log using/i.test(q)?'files_log':/do-file|do文件|doedit/i.test(q)?'do-files_open':/导入|import delimited/i.test(q)?'data_import':/界面|命令窗口|结果窗口/.test(q)?'interface_locate':null;
 if(engine==='stata'&&operation&&chunk.id==='stata_guide_'+operation)score+=5;
 if(keys.length&&!keys.some(key=>title.includes(key)||keyText.includes(key)||text.includes(key))&&!(/删了|删除.*行/.test(q)&&chunk.id==='textbook_sample'))score=0;
 return {...chunk,score};}).filter(c=>c.score>0).sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id)).slice(0,Math.max(1,Math.min(Number(limit)||3,3)));
}
export async function knowledgeContext(query,context={}){return Promise.all(retrieveKnowledge(query,3,context).map(async c=>{const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(c.content)))].map(x=>x.toString(16).padStart(2,'0')).join('');return {...c,content_hash:hash};}));}
