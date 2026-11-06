// Course copy has one source: worker/content.js. Only allowlisted teaching assets are packaged.
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {deflateRawSync} from 'node:zlib';
import {curriculum} from '../worker/content.js';

const root=resolve(import.meta.dirname,'..'),folder=resolve(root,'static/teaching');
const e=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const prose=value=>`<div class="prose markdown-source">${e(value)}</div>`;
const lessons=curriculum.lessons,experiment=lessons.find(x=>x.visual==='pipeline'),contrast=lessons.find(x=>x.case_id==='contrast'),illustration=lessons.find(x=>x.visual==='event');
if(lessons.length!==8||!experiment||!contrast||!illustration)throw Error('Expected the existing eight-stage course and its independent teaching materials.');
const guidePath='/analysis?stata_guide=do-files';
const style=`body{display:block;height:auto;overflow:auto;background:#f6f8f4;font-size:16px}
.handbook{max-width:900px;margin:auto;padding:36px 28px}.cover{padding:42px 0;border-bottom:2px solid #087e75;margin-bottom:26px}.cover h1{font-size:36px;line-height:1.45;margin:14px 0}.cover p{color:#54665c;max-width:650px;line-height:1.9}.cover .badge{font-size:14px}.handbook-nav{display:grid;grid-template-columns:1fr 1fr;gap:8px 20px;margin:25px 0}.handbook-nav a{font-size:14px}.handbook-lesson{background:white;padding:30px;margin:28px 0;border:1px solid #dce7e0;border-radius:12px}.handbook-lesson h2{font-size:24px;margin:9px 0 20px}.handbook-lesson h3{margin:22px 0 10px}.handbook-lesson .prose{font-size:16px}.handbook-lesson details{font-size:16px}.handbook-lesson .answer{padding:12px 15px;background:#edf5f0}.worksheet-print{padding:14px 0;border-bottom:1px dashed #bdcfc3;min-height:85px}.worksheet-print p{font-size:14px;color:#66736f;margin:6px 0}.sources{font-size:14px;line-height:1.9;overflow-wrap:anywhere}.print-btn{margin-top:20px;min-height:44px}.case-label{font-size:14px;color:#506971}.stata-reading{padding:16px;border-left:3px solid #087e75;background:#edf5f0}.stata-reading a{display:inline-block;min-height:44px;line-height:44px}
@media(max-width:600px){.handbook{padding:20px 14px}.cover{padding:20px 0}.cover h1{font-size:28px}.handbook-lesson{padding:18px}.handbook-nav{grid-template-columns:1fr}.handbook-lesson h2{font-size:21px}}
@media print{body{background:white}.handbook{max-width:none;padding:0}.handbook-lesson{break-before:page;border:0;padding:0;margin:0}.handbook-nav,.print-btn,.slider-controls,.lab-controls{display:none}.teaching-figure{break-inside:avoid}.worksheet-print{min-height:90px}details{display:block}details>*{display:block!important}a{color:inherit}.cover{break-after:page}.handbook-lesson h3{break-after:avoid}}`;
const stageHtml=item=>{
 const questions=item.steps.map((step,i)=>`<h3>练习 ${i+1}</h3>${prose(step.prompt)}${step.options?'<ul>'+step.options.map(o=>`<li>${e(o.key)}. ${e(o.text)}</li>`).join('')+'</ul>':step.type==='free'?'<p>先独立写下答案，再展开示范。</p>':''}<details><summary>完成后再核对示范</summary><div class="answer">${prose(step.reveal||'请对照当前阶段的目标核对，并记录仍需帮助的地方。')}</div></details>`).join('');
 const worksheet=item.worksheet?`<h3>${e(item.worksheet.title)}</h3><p>这里供打印后填写。网页应用中可保存与导出；手册本身不保存输入。</p>${item.worksheet.fields.map(field=>`<div class="worksheet-print"><strong>${e(field.label)}</strong><p>${e(field.placeholder)}</p></div>`).join('')}`:'';
 const stata=item.id===experiment.id?`<aside class="stata-reading"><h3>用 Stata 看懂同一条复现链路</h3><p>本阶段原有 Python 小实验继续保留。想理解 Stata 的 do-file、运行与日志，可以进入只读操作指南，再对照本次分析的实际代码与结果。</p><a href="${guidePath}">打开 Stata 操作指南：do-file 与运行记录</a><p>网页可能要求先登录。阅读指南不会执行代码，也不代表已掌握；真实 Stata 计算仍需要有效安装及本机两次批准。离线时可继续阅读本手册和 Python 实验，在线指南需联网。</p></aside>`:'';
 return `<section class="handbook-lesson" id="lesson-${item.id}" data-curriculum="${e(curriculum.curriculum_id)}"><span class="eyebrow">阶段 ${String(item.id).padStart(2,'0')} · ${e(item.duration)}</span><h2>${e(item.title)}</h2><p class="case-label">${e(item.case_label)}</p><div class="lesson-goal">${e(item.goal)}<p class="lesson-goal-meta">成果：${e(item.output)}</p></div>${prose(item.intro)}<div class="offline-visual" data-visual="${e(item.visual)}"></div>${item.visual_extra?`<div class="offline-visual" data-visual="${e(item.visual_extra)}"></div>`:''}<h3>一步一步怎么做</h3>${prose(item.guide)}<h3>跟着示范理解</h3>${prose(item.example)}<h3>容易踩的坑</h3>${prose(item.pitfalls.map(p=>'- '+p).join('\n'))}${stata}${questions}${worksheet}</section>`;
};
const handbook=`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>实证学徒 · 从零开始的图文学习手册</title><link rel="stylesheet" href="../style.css"><link rel="stylesheet" href="../teaching.css"><style>${style}</style></head><body><main class="handbook" data-curriculum="${e(curriculum.curriculum_id)}"><header class="cover"><span class="badge">${lessons.length} 阶段 · 图解 + 示范 + 练习 + 成果</span><h1>从“不知道怎么开始”<br>到第一份研究备忘录</h1><p>实证学徒 · 新手图文学习手册。先提出问题，再找证据；先读懂数据，再解释结果。八阶段可以分多次完成，每阶段先看图、再做题、最后保存成果。按自己的速度学习。</p>${prose(curriculum.case_intro)}<p>${e(curriculum.case_banner)} 主线同批小实验、独立分批辨别卡和第${illustration.id}阶段人为统计示意图分别标识，不能混用。手册可离线阅读，外部资料和在线Stata指南需要联网。</p><button class="btn-primary print-btn" onclick="window.print()">打印 / 保存为 PDF</button></header><nav class="handbook-nav" aria-label="手册目录">${lessons.map(item=>`<a href="#lesson-${item.id}">${String(item.id).padStart(2,'0')} ${e(item.title)}</a>`).join('')}</nav>${lessons.map(stageHtml).join('\n')}<section class="handbook-lesson sources"><h2>来源与使用边界</h2><p>真实政策原文：<a href="https://www.ndrc.gov.cn/xxgk/zcfb/tz/201709/t20170905_962552.html">国家发展改革委、国家能源局：发改办能源〔2017〕1453号</a>。用于区分文件发布与实际实施，未据此验证地方启动时间。</p><p>统计解释依据：<a href="https://www.amstat.org/asa/files/pdfs/P-ValueStatement.pdf">American Statistical Association（2016），Statement on Statistical Significance and P-Values 新闻说明</a>。用于解释不应只按阈值判断结论。</p><p>进阶方法阅读：<a href="https://arxiv.org/abs/1803.09015">Callaway &amp; Sant’Anna，Difference-in-Differences with Multiple Time Periods</a>。用于提示多期分批设计与组别—时间效应；本课没有实现该估计器。</p><p>上述来源既有核对日期：2026-09-28。所有示意图和教学数值为本项目自制，不能作为真实政策效果引用。</p><p>数据实验：<a href="empirical_lab.zip" download>完整 Python 实验包</a>。不需要第三方 Python 包，详细运行步骤见第${experiment.id}阶段《${e(experiment.title)}》。</p><p>更多教材与命令来源见<a href="source-index.html">教学材料与来源索引</a>。本手册与网页课程同源；完成课程不等于独立掌握或真实研究通过审核。</p></section></main><script src="../vendor/marked.umd.js"></script><script src="../vendor/lucide.min.js"></script><script>
function el(tag,cls,text){const n=document.createElement(tag);if(cls)n.className=cls;if(text!=null)n.textContent=text;return n;}
function icon(name){const n=el('i');n.dataset.lucide=name;return n;}
function button(text,cls,action){const b=el('button',cls,text);b.type='button';b.onclick=action;return b;}
function markdown(target,text){target.innerHTML=marked.parse(text||'');}
</script><script src="../teaching.js"></script><script>
document.querySelectorAll('.markdown-source').forEach(n=>markdown(n,n.textContent));
document.querySelectorAll('[data-visual]').forEach(n=>n.append(Teaching.visualize(n.dataset.visual)));
document.querySelectorAll('a[href^="/static/teaching/"]').forEach(a=>a.setAttribute('href',a.getAttribute('href').replace('/static/teaching/','')));
window.lucide?.createIcons();
const openStates=new Map();window.addEventListener('beforeprint',()=>{document.querySelectorAll('details').forEach(d=>{openStates.set(d,d.open);d.open=true;});});window.addEventListener('afterprint',()=>{openStates.forEach((v,d)=>d.open=v);openStates.clear();});
</script></body></html>\n`;

const readme=`# 实证学徒 · 可复现教学小实验

课程版本：${curriculum.curriculum_id}；共${lessons.length}阶段。本包对应第${experiment.id}阶段《${experiment.title}》。

全部城市、政策和数值均为教学虚构。主线同批手算小实验与第${contrast.id}阶段的独立分批辨别卡、
第${illustration.id}阶段的人为统计示意图分别使用，不能混用。

## 对照网页八阶段

${lessons.map(item=>`${item.id}. ${item.title}`).join('\n')}

## 从零运行 Python 实验

1. 安装 Python 3.10 或更新版本。无需第三方包、API 密钥或联网数据服务。
2. 将完整实验包解压到一个普通文件夹，确保 \`run_demo.py\` 与两个 CSV 同级。
3. 在此文件夹打开终端。Windows：\`py run_demo.py\`；macOS/Linux：\`python3 run_demo.py\`。
4. 查看终端摘要与 \`outputs\` 文件夹。重复运行覆盖本实验 outputs，不修改原始 CSV。

如果无法识别命令，检查解释器是否安装并加入 PATH；若系统用 \`python\` 命令，
确认它是 Python 3.10+ 后也可用 \`python run_demo.py\`。
找不到输入文件时检查是否完整解压，不能只下载脚本。
报键冲突或缺失无依据时，应核对数据，不要删除检查语句。

## 看懂 Stata 操作与结果

本包继续保留原有 Python 实验，不包含可执行 Stata 脚本或 Stata 安装程序。
在实证学徒站内打开 \`${guidePath}\`，阅读 do-file、运行与日志指南；可能需要先登录。
随后对照分析任务中的真实 Stata 代码及已批准上传的实际结果。网页阅读不执行代码，
真实计算仍须有效 Stata 安装、本机执行批准和结果上传批准；指南不能离线打开。

## 每个文件做什么

| 文件 | 用途 |
|---|---|
| panel_raw.csv | 17 行原始教学数据：1 行完全重复、1 个能源值缺失 |
| correction.csv | 模拟补充依据，B 市 2014 年 energy=102 |
| run_demo.py | 读取、审计、清洗、分组描述统计和二期 DID |
| data_dictionary.md | 字段定义、单位与样本设定 |
| expected_result.json | 预期核对值，不是一次真实政策分析的发现 |

## 预期看到什么

- 清洗后 16 行；完全重复删除 1 行；缺失恢复 1 个。
- 试点均值（2013→2016）：103、101、81、79。
- 对照均值（2013→2016）：101、99、94、92。
- 2014–2015 年 DID：(81−101)−(94−99)=−15 万吨标准煤。
- 每组每年 n=2，样本标准差均为 √2，表中显示具体数值。

## 如何读代码

先读 \`clean_rows\` 看如何处理重复与缺失；再读 \`summarize\` 看如何从两座城市
得到组均值；最后读 \`calculate_did\` 对照手算。\`main\` 负责把步骤连起来并写输出。
脚本不回归、不估计标准误、不报告显著性。四座人为设置的城市不适合支持真实推断。

## 自己动手做第二遍

复制整个文件夹再练习，以保留原始版。把计算窗口改成 2013 与 2016，
先手算 (79−103)−(92−101)=−15，再修改 \`calculate_did\` 的调用参数并重跑。
两个窗口碰巧同值是教学数字的构造结果，不是稳健性成立的证明。

增加一个与已有键数值冲突的行，观察脚本停止并要求核对来源。
想一想：为什么遇到冲突时“继续生成一个结果”反而是不可靠的？
`;

// Minimal deterministic ZIP writer using Node's built-in deflate; no runtime dependency.
function crc32(bytes){let crc=0xffffffff;for(const b of bytes){crc^=b;for(let i=0;i<8;i++)crc=(crc>>>1)^(0xedb88320&-(crc&1));}return (crc^0xffffffff)>>>0;}
function archive(entries){let offset=0;const locals=[],central=[];for(const [name,data] of entries){const filename=Buffer.from('empirical_lab/'+name),packed=deflateRawSync(data),crc=crc32(data),header=Buffer.alloc(30),directory=Buffer.alloc(46);header.writeUInt32LE(0x04034b50);header.writeUInt16LE(20,4);header.writeUInt16LE(0x800,6);header.writeUInt16LE(8,8);header.writeUInt16LE(0x5d53,12);header.writeUInt32LE(crc,14);header.writeUInt32LE(packed.length,18);header.writeUInt32LE(data.length,22);header.writeUInt16LE(filename.length,26);locals.push(header,filename,packed);directory.writeUInt32LE(0x02014b50);directory.writeUInt16LE(20,4);directory.writeUInt16LE(20,6);directory.writeUInt16LE(0x800,8);directory.writeUInt16LE(8,10);directory.writeUInt16LE(0x5d53,14);directory.writeUInt32LE(crc,16);directory.writeUInt32LE(packed.length,20);directory.writeUInt32LE(data.length,24);directory.writeUInt16LE(filename.length,28);directory.writeUInt32LE(offset,42);central.push(directory,filename);offset+=header.length+filename.length+packed.length;}const index=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(entries.length,8);end.writeUInt16LE(entries.length,10);end.writeUInt32LE(index.length,12);end.writeUInt32LE(offset,16);return Buffer.concat([...locals,index,end]);}
const files=['README.md','correction.csv','data_dictionary.md','expected_result.json','panel_raw.csv','run_demo.py'];
const entries=await Promise.all(files.map(async name=>[name,name==='README.md'?Buffer.from(readme):await readFile(resolve(folder,name))]));
await writeFile(resolve(folder,'handbook.html'),handbook);
await writeFile(resolve(folder,'README.md'),readme);
await writeFile(resolve(folder,'empirical_lab.zip'),archive(entries));
console.log(`Generated ${lessons.length} course stages, ${lessons.length} offline visuals, ${lessons.reduce((n,x)=>n+x.steps.length,0)} exercises and ${entries.length} allowlisted experiment files from ${curriculum.curriculum_id}.`);
