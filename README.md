## 2026-10-13：对话驱动分析重构

底部当前轮持久行动、预览后应用、上下文教学、请求式引导与正式解释模式。验收范围见 [优化说明](DIALOGUE_OPTIMIZATION.md) 和 [测试报告](DIALOGUE_TEST_REPORT.md)，不将受控模型或结果夹具记为真实数值执行。

## 核心交互修复（2026-10-13）

导学先显示八阶段目录；课程位置与研究独立保存。会话写入携带 state_version，旧页面需要刷新，未提交输入仍保留。新增课程接口和任务幂等编号，普通读取不重写会话。优化范围与验收限制见 [优化说明](INTERACTION_OPTIMIZATION.md) 和 [测试报告](INTERACTION_TEST_REPORT.md)。

## 登录与双模块更新（2026-10-12）

新入口先注册或登录，然后只有“定向导学”和“边分析边学”两个整卡入口。账号长期保留；练习仍按最后活动七天到期。本轮没有密码找回。新代码默认要求真实账号登录。实际公网验收和未完成项见 [LOGIN_REBUILD_ACCEPTANCE.md](LOGIN_REBUILD_ACCEPTANCE.md)。`.openai/hosting.json`属于既有Sites配置，不代表JoyCode部署完成。

# 实证学徒 Sites 试用版

该工程独立于原 `agent1` V9。教学文本、模拟数据和五张进阶案例从 V9 导入；案例事实仍待队友审校。按用户 2026-10-05 的新要求，站点已允许所有人访问，供队友和老师试用。参赛验收闸门记录在相邻的 `SITES_FEASIBILITY_LEDGER.md`，开放试用不代表这些闸门已经通过。

## 执行与数据边界

- OLS、双向固定效应和同批 DID 经学生核对后，在访问者浏览器的 webR 0.6.0／R 4.6.0／fixest 0.14.2 中运行。Worker 只校验归属、输入限制、方案和浏览器提交结果的格式，不在服务器重新估计数值。
- 原始 CSV/TSV 与复现包输入存于 R2；会话、任务与学习记录存于 D1。真实账号与服务端归属映射界定访问范围，旧匿名记录只能凭当前浏览器旧Cookie明确认领。2 MB、20,000 行、60 列、每账号每日30次分析为现有限制。
- 会话与任务按最近活动七天过期；到期立即拒读。受保护的 `/api/retention/cleanup` 删除到期 D1 行和对应 R2 文件，租约有效的运行任务不清理。Sites 云端任务目前最多每小时调用一次，尚不能保证“到期后一小时内物理删除”。
- `MODEL_API_KEY`、`MODEL_NAME`、`MODEL_BASE_URL` 三项均通过 Sites 运行时环境配置后，才显示可选的 AI 候选方案入口。模型只收到研究问题与列摘要；建议填入表单后仍须学生确认。登录后模型不可用时可继续使用手动方案与固定自查。

## 本地验收

在本工程目录执行：

```powershell
node scripts/build-prototype.mjs
npx wrangler d1 migrations apply DB --local --config wrangler.local.jsonc
npx wrangler dev --config wrangler.local.jsonc --local --ip 127.0.0.1 --port 8788 --inspector-port 0
```

另开终端执行：

```powershell
node scripts/smoke-local.mjs
python scripts/retention-local.py
node scripts/model-unit.mjs
```

打开 `http://127.0.0.1:8788/` 为完整学习工作台；`/trial` 保留原 webR 可行性页。真实浏览器执行需跨源隔离与可下载 webR/fixest 包。

## 参赛验收仍须补完

用实际 Sites 网址验证手机 webR、两个独立浏览器的所有资源隔离、PDF 中文排版、真实模型正常与失败场景、无人访问时长期清理时限。当前每小时 Sites 调度尚不能保证计划中严格的“一小时内物理删除”；该标准不变，未通过前不得在参赛材料中写为已验收。原 V9 回退方案继续保留。

## V12 学习闭环与任务工作台

- 四项主导航与五步 R 实操，资料与证据以抽屉展开；基础变量与高级参数分开，支持系统和用户减少动画设置。

## 原生 R / Stata 执行节点

本轮新增 `executor/`：持久队列、HMAC 网关、原生 R 与 Stata 固定模板。页面默认云端 R，尚未配置节点时明确不可执行；webR 保留为主动选择的回退。软件/位置变更须重新确认，原有浏览器任务兼容。Stata 本机三方法和取消已实测，公网入口等待网站授权和 Linux 验收；EViews 未接入。

完整部署与配置见 [executor/README.md](executor/README.md)，分级验收见 [EXECUTION_ACCEPTANCE.md](EXECUTION_ACCEPTANCE.md)。Linux/Docker/公网尚未验收；本机结果不能描述为已上线。
- 准备卡、蓝图和变量字典改变时提升 research_revision；方案确认绑定资料版本、输入及方案哈希，旧确认不能继续执行。历史任务保留执行快照。
- 政策准备显式记录同批、分批或未知；新旧资料冲突和未知批次阻止同批 DID。非政策问题使用通用准备卡。
- 方法短课跳过、客观题提示、自由文本自查、成果修订和模型反馈分别留存。自由文本不认定独立掌握。
- 三类模型接口共用 20 次／24 小时限额与 15 秒超时；分别显示配置状态。反馈模型只读课程或执行汇总，不读原始观测与样本索引。DeepSeek 运行时密钥已配置；真实三能力验收分别记录，不因配置完成自动标成通过。
- 成功任务可在新 webR 上下文重跑，逐项比较样本、哈希、版本、系数、标准误和区间，绝对容差 5e-6；这是浏览器复算证据。
- 学习报告 Markdown/JSON/PDF 读取最新持久记录；分析报告与 ZIP 读取执行快照和最新解释版本。PDF 支持中文分页与实际结果图，中文逐页预览已检查，自动化浏览器下载捕获仍未通过；需真实浏览器完成文件下载验收。
- 云端清理调度在本次查询中显示停用；清理接口与运行任务保护测试通过，不能写成自动物理清理时限已通过。

本地浏览器三种方法与 OLS 独立重跑证据存于忽略目录 outputs/v12-browser-execution-evidence.json；真实手机、公开站双独立浏览器隔离、在线模型、备份恢复与长期清理闸门仍需验收。

## 评分证据与真实 Agent 交互

见 [参赛证据台账](docs/COMPETITION_EVIDENCE.md)、[演示任务](docs/DEMO_TASKS.md)、[来源交接](docs/SOURCE_HANDOFF.md)、[新手试用](docs/NOVICE_PILOT.md) 和 [创新说明](docs/INNOVATION.md)。记录与报告可下载独立保存的 Agent 提示词、输入摘要、输出及失败证据；研究准备支持没有数据时先补问。

