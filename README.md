# 独立候选：三方法体验、DTA 与 Stata 对应教学（2026-10-22）

本目录继续在 `joycode-cloud-candidate` 上开发，未发布 JoyCode，也未更新旧 Sites。新增统一 CSV/TSV/DTA 材料、显式日期转换、计算前对应代码阅读、混合意图与换题确认，以及导出版本保护。

- 计算范围仅 OLS、双向固定效应、同批 DID；默认 StatsPAI/Python，浏览器 R 为主动选择的备用。Python 结果不标为 Stata 执行。
- DTA 数值码、中文标签、扩展缺失类别和日期格式保留；标签来自文件，未独立核实。未知单位不阻挡有效普通回归。
- 本机 Stata 两次批准继续保留，本轮没有改变旧站或用户助手的运行配置。
- 本地真实计算、独立数值参考、接口与部分真实浏览器链路通过；CSV/DTA完整浏览器上传、实体手机、200%缩放全链路、新手试用和完整PDF下载核验仍待补证。
- 原始材料、规范化数据和导入侧车分别保存；账号长期保留、练习最后活动七天到期。原书、学生数据与密钥不进入源码包。

请阅读 [优化内容说明](docs/EXPERIENCE_20261022_CHANGES.md) 和 [逐项验收报告](docs/EXPERIENCE_20261022_ACCEPTANCE.md)。当前电脑预览：在本目录运行 `node scripts/build-prototype.mjs`，再运行 `node scripts/preview-experience.mjs`，打开 `http://127.0.0.1:18843/`。该辅助脚本复用本机既有 Python 环境；跨机器部署配置见 [部署说明](deploy/joycode/README.md)，尚未验收通用安装。

`.openai/hosting.json` 仅保留构建需要的兼容绑定，不关联旧 Sites，也不表示 JoyCode 已部署。

---

## 以下为历史交付记录

旧版本验收按其日期理解，不能替代本候选验收。

# JoyCode 独立整站候选（2026-10-21）

本目录为 V46 基线导出的独立云端版本，尚未在 JoyCode 上线。默认 StatsPAI 云端三方法已完成本地真实计算与网站 HTTP 验收；平台资源、Linux 安装、真实浏览器及新增方法仍待验收。旧 Sites 站点不变，新站独立注册。

请先阅读 [部署与资源门槛](deploy/joycode/README.md) 和 [本轮验收报告](docs/JOYCODE_CLOUD_ACCEPTANCE.md)。下文保留旧站历史状态，不能当作本候选部署证明。

---

# 实证学徒：当前能力与交接入口

状态核对：2026-10-20。当前公开版本为 **V46 受限试用**；本轮增加独立完整DID示范、助手自动准备模拟文件、按方法精简设置、同步教学及有证据的解释评价。运行源码为 `51b64bdaf2a2be1d4d765e76a52a6197c1259a1f`；测试、失败回退及边界见专项报告。

- 先注册或登录，首页只有“定向导学”和“边分析边学”两个入口。课程为八阶段；目录、图文手册和实验包说明统一读取 `worker/content.js`，生成命令为 `node scripts/build-course-materials.mjs`。
- 无已选执行方式时默认浏览器 R / webR。现有计算范围为 OLS、个体＋年份固定效应、同批 DID；参数与输入核对确认后才计算。真实浏览器及导出已有证据；首次外部运行时下载可能超时，实体手机及200%实际缩放仍待本版验收。
- 本机 Stata 需要有效安装与许可、本机助手及配对；执行批准与结果上传批准分别保留。实际模板代码可只读讲解。V46已取得公网DID真实浏览器配对、自动备数据、两次批准、真实执行、刷新恢复、正式解释与报告证据；本机三方法均实际计算，第二台Windows及真实休眠恢复继续待验。StatsPAI 结果明确标为 Python，不冒充 Stata。
- 八阶段第6阶段保留原有 Python 复现小实验，并提供 [Stata do-file 与运行记录导览](https://empirical-apprentice-webr-trial.liskyler9.chatgpt.site/analysis?stata_guide=do-files)；阅读导览不会执行代码，也不标为“已掌握”。
- 教材仅发布自编短卡和已核对来源索引；原书、扫描页、私有输入及运行凭据不进入源码包。自编教学表述仍待审校。
- 云端 R、大陆／JoyCode 部署、云端 Stata、EViews、第二台 Windows、真实休眠、长期清理与生产恢复继续按各自证据列为未完成或待验收。

本轮交付见 [Stata操作教学与验收](docs/STATA_OPERATION_ACCEPTANCE.md) 及 [操作来源索引](docs/STATA_OPERATION_SOURCES.md)；其余目标沿用 [统一优化与验收台账](docs/TEACHING_INTELLIGENCE_ACCEPTANCE.md)。材料出处见 [教学材料索引](docs/TEACHING_SOURCE_INDEX.md)，助手启动见 [本机助手说明](local_stata/README.md)，参赛记录见 [参赛证据台账](docs/COMPETITION_EVIDENCE.md)。历史版本记录用于追溯，不能覆盖本节的当前能力状态。

本轮入口及逐项证据见 [优化说明](docs/CORE_EXPERIENCE_CHANGES.md) 和 [测试验证报告](docs/CORE_EXPERIENCE_ACCEPTANCE.md)。简短演示：登录→边分析边学→一键体验同批DID→核对方案→确认计算；如切换Stata，先下载新版助手，配对后点击“在助手准备模拟数据”，再分别批准执行与上传。

---

## 历史记录：2026-10-15 · Stata 代码阅读教学

真实模板核心命令、字段映射与批准包绑定；当前轮只读代码卡、点击语法讲解、真实结果表点击学习、独立阅读记录及固定帮助。仅现有三方法，不新增测验或掌握认证。见 [优化与验收](STATA_TEACHING_ACCEPTANCE.md)、[启动说明](local_stata/README.md)；公网试用状态见 [发布后验收](STATA_TEACHING_PUBLIC_ACCEPTANCE.md)。

## 历史记录：2026-10-15 · 本机双引擎候选（当时尚未替换公网）

修复 Stata 标量 p 值导出；增加旧 MCP、stata-code/PyStata 与 StatsPAI Python 受控适配器。三方法本机真实执行、九条账号协议闭环及一次浏览器 OLS 对照已验证，仍缺公网、第二台 Windows、休眠与断网恢复验收。参见 [验收报告](LOCAL_DUAL_ACCEPTANCE.md) 与 [助手安装说明](local_stata/README.md)。两次本机批准及原始输入留本机规则保留。

重现实测前运行 node scripts/export-local-fixtures.mjs。依赖锁定 Python3.11 和两套审计源码提交；下载助手不含 Stata、输入、凭据或运行时。

## 历史记录：2026-10-13 · 对话驱动分析重构

底部当前轮持久行动、预览后应用、上下文教学、请求式引导与正式解释模式。验收范围见 [优化说明](DIALOGUE_OPTIMIZATION.md) 和 [测试报告](DIALOGUE_TEST_REPORT.md)，不将受控模型或结果夹具记为真实数值执行。

## 核心交互修复（2026-10-13）

导学先显示八阶段目录；课程位置与研究独立保存。会话写入携带 state_version，旧页面需要刷新，未提交输入仍保留。新增课程接口和任务幂等编号，普通读取不重写会话。优化范围与验收限制见 [优化说明](INTERACTION_OPTIMIZATION.md) 和 [测试报告](INTERACTION_TEST_REPORT.md)。

## 登录与双模块更新（2026-10-12）

新入口先注册或登录，然后只有“定向导学”和“边分析边学”两个整卡入口。账号长期保留；练习仍按最后活动七天到期。本轮没有密码找回。新代码默认要求真实账号登录。实际公网验收和未完成项见 [LOGIN_REBUILD_ACCEPTANCE.md](LOGIN_REBUILD_ACCEPTANCE.md)。`.openai/hosting.json`属于既有Sites配置，不代表JoyCode部署完成。

# 实证学徒 Sites 试用版

该工程独立于原 `agent1` V9。教学文本、模拟数据和五张进阶案例从 V9 导入；案例事实仍待队友审校。按用户 2026-10-05 的新要求，站点已允许所有人访问，供队友和老师试用。当前参赛验收闸门见 [统一验收台账](docs/TEACHING_INTELLIGENCE_ACCEPTANCE.md) 和 [参赛证据台账](docs/COMPETITION_EVIDENCE.md)，开放试用不代表这些闸门已经通过。

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

## 历史记录：V12 学习闭环与任务工作台

- 四项主导航与五步 R 实操，资料与证据以抽屉展开；基础变量与高级参数分开，支持系统和用户减少动画设置。

## 历史记录：原生 R / Stata 执行节点（验收台账日期：2026-10-05）

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

