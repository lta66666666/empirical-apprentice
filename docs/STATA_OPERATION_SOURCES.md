# Stata 操作教学来源索引

核对日期：2026-10-19。指南版本：`ea-stata-guide-20261019-1`；适用 Windows / Stata18。

## 自编指南与官方帮助

七章22步由 `worker/stata-guide.js` 生成目录和短卡，网页不另行维护副本。两张 SVG 为原创示意图，不是真实截图。

| 内容 | 主要依据 |
|---|---|
| 界面、编辑器、选中运行与全文运行 | [Stata18 Windows 入门](https://www.stata.com/manuals18/gsw.pdf)、[doedit](https://www.stata.com/manuals18/rdoedit.pdf)、[do](https://www.stata.com/manuals18/rdo.pdf) |
| 相对路径、导入 | [cd / pwd](https://www.stata.com/manuals18/dcd.pdf)、[import delimited](https://www.stata.com/manuals18/dimportdelimited.pdf) |
| 字段、取值、浏览、摘要 | [describe](https://www.stata.com/manuals18/ddescribe.pdf)、[codebook](https://www.stata.com/manuals18/dcodebook.pdf)、[browse](https://www.stata.com/manuals18/dbrowse.pdf)、[summarize](https://www.stata.com/manuals18/rsummarize.pdf) |
| OLS、标准误、区间 | [regress](https://www.stata.com/manuals18/rregress.pdf) |
| 面板声明、固定效应与年份项 | [xtset](https://www.stata.com/manuals18/xtxtset.pdf)、[xtreg](https://www.stata.com/manuals18/xtxtreg.pdf) |
| 日志 | [log](https://www.stata.com/manuals18/rlog.pdf) |

本轮核对了已安装 Stata18 的相应帮助与真实模板；内容仍不等于教师审校或教学效果验证。`regress, vce(robust)` 与 `xtreg, fe vce(robust)` 的推断口径分别说明。DID 仅指产品现有的同批、多时期个体与年份固定效应模型。

配对、批准、数据限制及复现包部分以本产品实际协议和助手实现为依据，不归因于 Stata 官方。指南不新增输入格式、不执行命令、不伪造任务哈希。教材书目及已核对页码沿用 [教学材料索引](TEACHING_SOURCE_INDEX.md)，不复制原书。

## 研究核验参考与许可边界

参考 [Barrios Skills 固定提交 680c983](https://github.com/Barrios88/barrios-skills/tree/680c98370381593141bf1d39da4353354958e2f0) 的工作规范与证据分层思路。[外部 MCP 说明](https://github.com/Barrios88/barrios-skills/blob/680c98370381593141bf1d39da4353354958e2f0/install/external-mcps.md) 不提供新的 Stata 执行器。

上游采用 [MIT 许可](https://github.com/Barrios88/barrios-skills/blob/680c98370381593141bf1d39da4353354958e2f0/LICENSE)。本轮指南及图文为自编，没有复制上游 Skill 正文或清洗代码；本产品整体许可证不变。后续实质改编应随对应内容保留上游版权及 MIT 许可文本。

不采用上游清洗示例中的默认截尾、负数缺失码、币种或对数变换。未生成 `_dup` 便引用它的例子不能照搬；本轮未引入该例子或修改计算模板。

样本展示读取已保存结果：输入行数、实际估计行数和分项排除记录。每列缺失数不求和；未知原因不归为缺失；省略项不等于排除观测。执行、数值对照、来源和识别条件分别展示。
