// Original, read-only Windows/Stata18 learning material. No execution capability.
export const stataGuideVersion='ea-stata-guide-20261019-1';
const manual=name=>'https://www.stata.com/manuals18/'+name+'.pdf';
const allMethods=['ols','panel_fe','did'];
const scope='以下为 Windows / Stata18 的只读教学示意，不是当前任务脚本或实际执行结果；阅读无需安装或配对。';
const review='自编操作说明；已核对本机 Stata18 官方帮助，界面图为原创示意，教学表述待审校';
const step=(id,title,action,where,expected,reminder,extra={})=>({id,title,action,where,expected,reminder,...extra,version:stataGuideVersion});

export const stataGuideLessons=[
 {id:'interface',title:'认识 Stata 界面',summary:'分清写命令、看输出和查变量的位置。',methods:[],task_stages:['prepare','data'],steps:[
  step('locate','命令、输出与变量在哪里','先在示意图中认出 Command、Results 和 Variables。','Stata 主窗口；实际窗口可移动，排列可能与示意不同。','Command 用于输入命令；Results 显示命令与输出；Variables 列出当前内存数据的变量。','Variables 显示的是当前已读入数据的字段，不代表来源已核实。',{figure:'/static/teaching/stata-interface.svg',source:manual('gsw'),content:'Review/History 区可回看已输入的命令；Properties 显示选中变量的属性。网页左侧是知识卡，不是本机 Stata 的命令窗口。'}),
  step('help','遇到命令先查帮助','在 Viewer 帮助窗口阅读命令格式及选项。','Command 输入 help 命令后会打开帮助；也可用 Stata 的 Help 菜单。','帮助显示 Syntax、选项和示例，可对照本次真实代码中的语法。','帮助中的例子不是你的数据或结果；不要直接运行不理解的内容。',{code:'* 只读语法示意，不是本次任务命令\nhelp regress',source:manual('rhelp'),content:'查看帮助不会估计回归。先找第一个结果变量、后续解释变量以及逗号后的选项；软件与帮助版本以 Stata18 为准。'})
 ]},
 {id:'do-files',title:'看懂 do-file 与路径',summary:'把脚本当作可检查的步骤清单，先阅读再批准。',methods:[],task_stages:['data','plan','execute'],steps:[
  step('open','打开脚本，不等于执行','在 Do-file Editor 中只读查看本机助手生成的 estimate.do。','Window > Do-file Editor，或用 doedit 打开指定文件。','编辑器显示多行 Stata 命令；仅打开文件不会执行。','网页核心片段不是完整 do-file；最终批准以本机冻结包中的完整代码为准。',{code:'* 只读打开文件的示意；相对路径须先核对\ndoedit "estimate.do"',source:manual('rdoedit'),content:'Command 适合单条交互命令；Do-file Editor 用于阅读、保存成组命令。当前产品的教学代码只读，不提供任意代码编辑运行。'}),
  step('scope','分清打开、选中运行和全文运行','阅读编辑器的执行范围，知道“打开”与“运行”是两件事。','Do-file Editor；执行选中内容与执行整个文件的范围不同。','能指出本次准备运行的是完整冻结脚本，而不是随意选中的几行。','部分运行可能漏掉导入、变量生成或日志步骤；本产品继续通过助手批准完整脚本，不在指南中运行。',{source:manual('gsw'),content:'在 Stata 中，do 会执行文件并回显命令；run 不回显命令。遇到错误 do 通常停止。不要为绕过报错而随意加 nostop；先检查错误原因。'}),
  step('directory','相对路径从哪里找文件','核对本机助手显示的工作目录与输入文件。','本机助手“执行前核对”；Stata 的 pwd 用于查看当前工作目录。','知道 normalized.csv、estimate.do 和 execution.log 属于当前任务目录。','你的 Stata 交互窗口与助手独立会话可能使用不同目录；含空格的路径需引号。',{code:'* 只读路径查询示意，不改变数据\npwd',source:manual('dcd'),content:'相对文件名相对于工作目录解析。网页不接收或展示原始本机路径；工作目录用于整理文件，不是文件权限沙箱。'})
 ]},
 {id:'data',title:'导入与核对数据',summary:'先看清字段、类型、缺失和面板键，再看模型。',methods:allMethods,task_stages:['data','health'],steps:[
  step('import','分清助手读取与 Stata 导入','在助手选择 CSV/TSV；网页只接收字段摘要和已允许的说明。','本机助手“CSV/TSV路径 → 读取字段摘要”；真实模板在独立会话中导入 normalized.csv。','网页出现输入行数、列名、类型和缺失摘要；真实代码卡可核对导入命令。','现有执行范围是 CSV/TSV，指南不新增 Excel 或 dta 自动接入；原始观测默认留本机。',{code:'* 只读导入语法示意；不是当前冻结命令\nimport delimited using "data.csv", varnames(1)',source:manual('dimportdelimited'),content:'本产品实际脚本还会使用归一化列名与类型处理。import 的 clear 选项会替换内存数据，不能在未保存的个人数据上照抄；助手隔离会话里的处理不能直接当作个人交互操作。'}),
  step('inspect','认识字段、类型与描述统计','先核对结果列和解释列的角色，再理解字段体检。','网页字段摘要；Stata 中 describe 查看变量结构，codebook 查看取值与标签，summarize 查看数值摘要，browse 只读浏览记录。','区分“列名是什么”“是不是数值”“有多少缺失”和“实际估计用了多少行”。','列名不能证明真实含义或单位；未知单位允许先计算，但限制实质解释。',{code:'* 只读数据检查语法示意；y、x 是示意列名\ndescribe\ncodebook y x\nsummarize y x\nbrowse y x',source:manual('ddescribe'),content:'describe 不估计模型；summarize 的观测数随选定变量及缺失而变化。需要看原始记录时可在本机使用只读浏览方式，不把观测自动发送给模型。'}),
  step('missing','不要把每列缺失数相加','区分字段体检与实际样本记录。','网页数据摘要、执行确认中的缺失策略、结果的样本变化说明。','知道同一行可在多列同时缺失；实际删除须看任务记录。','不能把各列缺失数求和当作删行数，也不能把缺失值改成零来让模型运行。',{source:manual('u'),content:'当前策略是有缺失则停止，或由用户明确允许删除选定变量不完整的行。输入行数与实际估计样本可能不同；没有分项记录时，排除原因应写“未记录”，不能自行归咎于缺失。'}),
  step('panel-key','面板的“谁”和“何时”','核对个体字段与年份字段，检查同一个体同一年是否重复。','网页面板方案；Stata 的 xtset 和重复键检查。','能够把物理单位与面板个体编号区分开；重复键会先要求核查。','城市编号是面板标识，不是吨、元等计量单位；不能为通过检查随意删除重复记录。',{source:manual('xtxtset'),content:'现有三方法中的固定效应和 DID 要求可识别的个体与整数年份。xtset 声明结构，不会自动控制年份效应，也不会确认数据来源。'})
 ]},
 {id:'models',title:'读懂三种模型命令',summary:'用方法、字段映射和推断设置共同阅读真实代码。',methods:allMethods,task_stages:['plan','execute','explain'],steps:[
  step('ols','OLS：先结果变量，再解释变量','找到 regress 后的第一个变量和后续解释变量。','本次 Stata 代码卡；示意中 y 为结果、x1/x2 为解释变量。','知道逗号前描述模型，逗号后控制选项。','示意变量名不是你的真实字段；v0/v1 等别名必须对照本次任务映射。',{code:'* 只读 OLS 语法示意，不是当前任务代码\nregress y x1 x2, vce(robust)',source:manual('rregress'),methods:['ols'],content:'此 regress 的 vce(robust) 是异方差稳健标准误。它不会消除遗漏变量、反向因果或自动核实研究设计；实际选项以本次完整批准代码为准。'}),
  step('fixed-effects','固定效应：声明面板与控制年份不同','分别认出 xtset、xtreg 的 fe 和 i.年份。','本次面板固定效应代码；先声明个体与年份，再估计。','理解 fe 指定个体固定效应，i.year 加入年份虚拟变量。','xtset 本身不估计回归；时间不变变量可能无法单独识别，省略项不是零效应。',{code:'* 只读语法示意；city_id/year/y/x 均为示意字段\nxtset city_id year\nxtreg y x i.year, fe vce(robust)',source:manual('xtxtreg'),methods:['panel_fe','did'],content:'Stata18 的 xtreg, fe 中 vce(robust) 等同于按面板个体聚类；不要与 regress 的异方差稳健选项混为一谈。用户指定其他聚类列时，应阅读实际 vce(cluster ...) 设置。'}),
  step('did','同批 DID：处理组乘政策后','把组别、政策后和交互项逐行对应到研究设计。','本次 DID 代码卡及字段/衍生变量映射。','理解 treated 是组别，post 是时期；控制组同样会进入政策后年份。','2015 仅为语法示例，不能当作真实政策年；本产品不自动处理分批实施 DID。',{code:'* 只读示意；2015 不是本次研究的真实实施年\ngenerate byte post = year >= 2015\ngenerate byte effect = treated * post\nxtreg y effect x i.year, fe vce(robust)',source:manual('xtxtreg'),methods:['did'],content:'当前方法是同批多时期的个体与年份固定效应模型；实际命令中的变量名、政策年份和标准误设置来自已确认方案。交互项显著不自动证明因果，仍需讨论平行趋势、共同冲击与外溢等条件。'})
 ]},
 {id:'approval',title:'核对、配对与两次批准',summary:'网页准备方案，本机决定执行与上传；两个批准相互独立。',methods:allMethods,task_stages:['data','plan','execute'],steps:[
  step('connect','了解本机连接需要什么','先确认有效的 Stata18 安装，再阅读助手启动说明。','模块内“提交材料 → 使用本机 Stata / Python（试验）”；本机助手页面。','知道旧 MCP 需要本机扩展在线；不同桥接器状态不等于运行验收已通过。','阅读本指南无需配对；网页服务器的 localhost 不能直接访问你的电脑。',{figure:'/static/teaching/stata-workflow.svg',source:'/api/knowledge?guide=stata18&lesson_id=approval',content:'助手由使用者主动启动并通过 HTTPS 领取自己的练习任务。端口只供本机使用；需有效 Stata 安装和许可。StatsPAI 是 Python 计算，不是控制 Stata。'}),
  step('pair','把助手配到当前练习','助手生成五分钟六位码，在网页当前练习输入并配对。','本机助手与网页本机计算入口。','网页明确显示设备在线、所选引擎可用、数据摘要属于本次输入。','配对不是批准代码；不要分享配对凭据或把本机端口开放公网。',{source:'/api/knowledge?guide=stata18&lesson_id=approval',content:'选择文件后先核对行数与字段；输入、数据或引擎改变后，原方案确认不能继续用于新任务。离线只说明无法联系设备，不能直接断言计算已经停止。'}),
  step('run-approval','批准的是完整冻结代码','先在网页核对方案，再在本机查看完整代码、输入、目录与实际软件。','网页确认卡与本机助手“执行前核对”。','本机明确批准前不会运行；代码卡的点击、复制和回答选项都不会批准计算。','代码按本机账号权限执行；工作目录不是权限沙箱。不了解的内容先问，拒绝则不执行。',{source:'/api/knowledge?guide=stata18&lesson_id=approval',content:'网页只展示真实脚本的核心片段。最终批准覆盖完整冻结包；修改输入、代码、参数或引擎都需要重新核对和批准。'}),
  step('upload-approval','运行后另行批准上传','先在本机查看拟上传摘要，确认后才上传。','本机助手“拟上传内容预览”。','网站只在批准上传后显示真实统计摘要；原始输入和完整日志默认仍在本机。','“计算完成，待同步”不是失败重跑指令；恢复连接后仍需另行批准上传，不自动重跑或上传。',{source:'/api/knowledge?guide=stata18&lesson_id=approval',content:'网页等待上传时不提前显示统计结论。结果摘要可能包含研究信息，须逐项检查；网络断开不代表本地计算停止。'})
 ]},
 {id:'results',title:'读懂实际结果',summary:'先核对样本和估计项，再解释系数与不确定性。',methods:allMethods,task_stages:['explain'],steps:[
  step('sample','从输入行数看到实际样本','核对输入行数、实际估计样本和未进入估计总数。','实际 Stata 结果整理视图；点击“实际样本”。','知道实际样本来自本次估计的 e(sample)，不把输入行数直接当作估计样本。','没有分项采集时，不能把所有未进入估计的行归因于缺失；列缺失统计不能相加。',{source:manual('rregress'),content:'历史记录若没有样本索引或分项原因，应显示“未记录”，不能写成零。省略估计项属于变量/参数，不等于删除了相同数量的观测。'}),
  step('coefficient','按变量与模型解释系数','先找到估计项，再对照变量定义、单位和已确认模型。','实际结果表与本次真实命令；示意图不含执行数值。','能区分系数方向、数值尺度和实质解释。','单位未知时不编造“元”“吨”或百分比；不能把省略项当成零效应。',{source:manual('rregress'),content:'OLS 系数描述给定控制条件下的关系；固定效应和 DID 需结合各自估计对象解释。统计显著不等于因果成立。网页整理视图只显示已批准上传的摘要，完整原生日志留在本机。'}),
  step('uncertainty','同时读标准误、区间与 p 值','把系数与标准误、95%区间及推断设置一起看。','结果表及点击讲解；完整 p 值以实际任务结果/报告为准。','区间表达估计不确定性；p 值不是效应大小或“假设为真的概率”。','区间跨零不等于证明没有效应；不要为获得显著性随意改变样本或标准误。',{source:manual('rregress'),content:'比较结果前先对齐估计样本、估计项、聚类和自由度。xtreg 的稳健标准误语义需结合估计器阅读；Python 对照不应标成实际 Stata 运行。'})
 ]},
 {id:'files',title:'日志、报错与导出',summary:'知道结果从哪里来、出错从哪里查，以及下载包含什么。',methods:allMethods,task_stages:['execute','explain','reports'],steps:[
  step('log','日志是命令与输出的轨迹','在本机任务目录找到 execution.log，先读估计命令附近的内容。','本机助手显示的工作目录；文本日志可用本机文本查看器阅读。','能把日志里的命令与网页真实代码卡对上；区分日志和结果摘要。','日志可能含研究信息或观测，不自动上传全文。replace 会覆盖同名日志，不能照抄到个人已有文件。',{code:'* 只读日志语法示意；不会在网页运行\nlog using "new-session.log", text\n* 此处为经核对的命令\nlog close',source:manual('rlog'),content:'助手实际模板会在独立任务目录记录日志；示意省略 replace，避免把覆盖写入当作默认动作。仅打开日志不会运行脚本。'}),
  step('error','从第一条错误排查','先记录最早报错、相关命令与当前步骤，再检查字段或路径。','本机 execution.log 与网页任务状态。','找不到文件先核对路径；变量不存在先核对映射；重复面板键先核对来源。','不要把错误当作统计结果，也不要为继续运行而任意删行、改零或跳过错误。',{source:manual('rdo'),content:'do-file 通常在遇错时停止。必要时手动提供脱敏错误片段供咨询；日志读取与问题咨询不触发计算、不提交解释成果。代码或数据修改后须重新生成、核对、批准。'}),
  step('exports','分清网站报告与本机复现包','按需要下载网站报告，或到本机助手下载完整复现包。','网站记录/报告入口；本机助手的“下载本机完整复现包”。','知道网站下载包含已批准摘要与记录，本机复现包可能包含输入、完整脚本和日志。','不要把包含原始输入的本机 ZIP 当作可直接公开的材料；核对任务、版本和哈希后再分享。',{source:'/api/knowledge?guide=stata18&lesson_id=files',content:'报告中的解释必须对应当前选定任务与保存版本。完整复现仍需要有效 Stata 和对应环境；网页下载成功不代表在其他电脑已复算通过。'})
 ]}
];

const plainStep=(lesson,item)=>[
 scope,'操作：'+item.action,'位置：'+item.where,'应看到：'+item.expected,
 '提醒：'+item.reminder,item.content||'',item.code?'只读示例（非当前任务代码）：\n'+item.code:''
].filter(Boolean).join('\n\n');
const topics={data:'data_check',models:'command_syntax',results:'result_reading'};
const chunk=(lesson,item)=>({
 id:'stata_guide_'+lesson.id+'_'+item.id,title:item.title,section:'Stata操作指南 · '+lesson.title,
 summary:item.action,example:item.expected,reminder:item.reminder,content:plainStep(lesson,item),
 source:item.source,version:stataGuideVersion,review_status:review,topic:topics[lesson.id]||'software_operation',engine:'stata',
 methods:item.methods||lesson.methods,task_stages:lesson.task_stages,...(item.figure?{figure:item.figure}:{}),
 guide_reference:{lesson_id:lesson.id,step_id:item.id,guide_version:stataGuideVersion}
});
export const guideKnowledgeChunks=stataGuideLessons.flatMap(lesson=>lesson.steps.map(item=>chunk(lesson,item)));
const invalid=message=>Object.assign(new Error(message),{status:422});
const copy=value=>JSON.parse(JSON.stringify(value));
export function getStataGuide(lessonId,stepId){
 const lesson=lessonId==null?stataGuideLessons[0]:stataGuideLessons.find(item=>item.id===lessonId);
 if(!lesson)throw invalid('Stata指南章节不存在。');
 const current=stepId==null?lesson.steps[0]:lesson.steps.find(item=>item.id===stepId);
 if(!current)throw invalid('Stata指南步骤不存在或不属于当前章节。');
 return copy({version:stataGuideVersion,outline:stataGuideLessons.map(item=>({id:item.id,title:item.title,steps:item.steps.map(part=>({id:part.id,title:part.title}))})),lesson,step:current});
}
export function guideCard(lessonId,stepId){
 const {lesson,step:item}=getStataGuide(lessonId,stepId);
 return {...chunk(lesson,item),summary:scope+'\n'+item.action};
}
