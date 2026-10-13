# 实证学徒 · 测试验证报告

日期：2026-10-13。

## 验收结论

已通过本地认证、课程连续作答、导航、异步竞态、草稿、任务条件迁移、配对协议与报告接口回归。真实浏览器通道超时，不能将DOM测试视为设备或真实webR数值验收。当前结论为“核心交互修复已实现并通过所列测试”，尚不作“所有功能已完成全流程真实验收”的声明。

## 复现、修改和结果

具体缺陷原因和修改见 [优化内容说明](INTERACTION_OPTIMIZATION.md)。以下测试针对这些可复现故障，均使用隔离数据，不修改真实学生记录。

| 测试链路 | 复现／验证内容 | 结果及证据 |
|---|---|---|
| 认证 | 真实bcrypt成本12；注册确认、重复用户名、错误密码、登录／退出／过期、两账号隔离、并发旧记录认领 | 通过：`scripts/auth-module-smoke.mjs`、`auth-form-dom-smoke.mjs` |
| 首页 | 首页DOM只有两个整卡入口，无额外按钮和导航 | 本地通过：`module-dom-smoke.mjs`；公网待发布后核对 |
| 导学首次进入 | 8张目录卡；预览未来阶段→返回→开始第一阶段→出现真实题目 | 通过：`interaction-dom-regression.mjs` |
| 课程连续完成 | 八阶段选择题、计算题、自由回答、阶段检查点、完成去向；预览／回顾不能作答推进 | Worker及实际DOM按钮通过：`interaction-regression.mjs`、`interaction-dom-regression.mjs` |
| 分析后进入导学 | 预置准备、分析结果和确认快照，完成课程后逐项相同；研究stage不变 | 通过：`interaction-regression.mjs` |
| 手算 | 六步逐项作答、保存位置；课程和研究上下文保留 | 接口通过：`interaction-regression.mjs`；真实页面触摸操作待复测 |
| 导航 | 学习→手算→准备→实操→报告→返回任务，不被旧标签覆盖 | DOM通过：`interaction-dom-regression.mjs` |
| 异步聊天 | 人为延迟回复，期间继续输入／新建练习；原回复不能清空或污染新练习 | DOM＋实际Worker通过：`interaction-dom-regression.mjs` |
| 数据与方案 | 乱序案例响应只采用最后选择；参数改变后迟到方案不可恢复；修改片段使预览失效 | DOM通过：`interaction-dom-regression.mjs`；大文件真实设备耗时待验收 |
| 草稿 | 三个同页保存共用队列；真实数据库版本冲突保留双方内容；草稿不等于提交成果 | 通过：`interaction-dom-regression.mjs`、`drafts-smoke.mjs` |
| 会话版本 | 两个旧快照并发写；旧版本／缺版本请求409；GET及活动触碰不重写旧body；410不删除账号 | 实际SQLite条件写入通过：`interaction-regression.mjs` |
| 任务幂等 | 同编号并发提交返回同一个任务；编号相同内容不同409 | 实际数据库唯一约束通过：`interaction-regression.mjs` |
| 中断竞态 | 暂停心跳写入→中断成功→释放心跳，终态保持interrupted | 实际数据库竞态通过：`interaction-regression.mjs` |
| webR生命周期 | 初始化180秒／估计120秒控制分支；取消初始化不能进入估计；拒绝离开／确认离开；断网待同步；新运行时重试 | 模拟运行时、加速时钟通过：`webr-lifecycle-regression.mjs`；不等于真实下载或数值计算 |
| 本机Stata | 配对归属、错误令牌、无批准不能上传、取消竞态、撤销、报告归属 | 实际HTTP协议通过：`local-pairing-smoke.mjs`；本轮未重复真实MCP执行 |
| Stata编辑保留 | 模拟轮询更新任务／历史，解释框节点、文字、焦点保留 | DOM通过：`interaction-dom-regression.mjs` |
| 模型失败 | 无模型候选失败与问答自查持久记录；受约束候选、错误接口回退 | 通过：`model-evidence-smoke.mjs`、`model-unit.mjs`；公网DeepSeek待发布后核对 |
| 解释与报告 | API测试结果摘要完成→解释提交→MD／JSON／ZIP读取修订；学习报告读取八阶段、准备与中断状态 | 接口通过：`drafts-smoke.mjs`、`interaction-regression.mjs`；结果夹具明确不作为数值验收 |
| 退出失败 | 模拟503撤销失败，停留模块，账号会话仍有效 | DOM通过：`interaction-dom-regression.mjs` |

## 响应与性能

`scripts/interaction-performance.mjs` 对修复前基线和修复后Worker各执行20次隔离SQLite读取，未连接模型和计算引擎。

| 指标 | 修复前 | 修复后 |
|---|---:|---:|
| 会话内容写入次数 | 20 | 0 |
| 只触碰活动时间次数 | 0 | 20 |
| p50读取毫秒 | 0.91 | 0.96 |
| p95读取毫秒 | 1.43 | 1.43 |
| 返回字节 | 15858 | 18162 |

读取耗时基本持平，新增课程元数据使响应略增。改进证据是消除读取覆盖内容的风险、取消重复写入和提供明确截止时间，不能据此宣称公网或模型响应加快。前端可用 `window.eaRequestMetrics`、`eaRenderMetrics` 核对实际请求和渲染；不采集输入正文或凭据。

## 验收限制与待办

- 浏览器控制能够列出站点标签，但绑定导学标签在约41秒后超时、内核重置。没有取得本轮真实截图；修复前源码及故障复现、修复后DOM记录已保存。
- 390／768／1366px、200%文字放大、键盘焦点、减少动画的真实浏览器视觉回归待补；HTML／DOM与响应式CSS检查不替代该验收。
- 用户此前手机基础验收通过。本次改动后的手机“开始课程→作答→报告往返”和分析软键盘／长表格需重新实测。
- 三方法真实浏览器webR执行、初始化断网、完整中文PDF分页和图表实际下载待补。保留历史执行证据，本轮没有伪造或以测试夹具更新数值验收状态。
- 本机助手实际批准、执行、上传及断网恢复仍按原独立台账；本轮验证协议及编辑保留。云端R未配置，云端Stata授权／环境待验收，EViews未接入。
- 来源教材授权、教学效果试用、长期清理、公网数据库恢复、JoyCode部署仍单独验收。

## 发布记录

2026-10-13 已发布 V24，Sites 源码提交 `6221a99c1c921440059d352451e19205a6198e29`，部署状态 succeeded。公开地址：https://empirical-apprentice-webr-trial.liskyler9.chatgpt.site/

实际公网 HTTP 验收通过 26 项：注册、首页双入口 HTML、八阶段目录、未来阶段预览、第一阶段开始、全部八阶段作答、无版本写入409、MD／JSON学习报告、退出撤销、重新登录和课程恢复。测试练习已删除。脚本：`scripts/public-interaction-acceptance.ps1`；本地证据：`outputs/public-interaction-acceptance.json`。该证据不代替浏览器点击、真实设备或数值执行验收。

首次 Node HTTP 通道返回403；可用 PowerShell 通道返回应用401并完成验收。首个 PowerShell 脚本误将目录直返字段读取为嵌套字段，修正测试脚本后通过；该次未完成验收的临时账号与练习沿用原留存规则，未作为有效测试结果。

GitHub 同步包括本节及公网验收脚本；它们是发布后的证据补充，V24 运行代码未改变。
