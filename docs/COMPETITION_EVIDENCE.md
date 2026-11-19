# 参赛证据台账

更新：2026-11-09。依据用户提供的《评审标准.pdf》，不再采用早期 50／40／10 范例。

|评分项|分值|可检查入口|当前缺口|
|---|---:|---|---|
|数据收集与处理|15|准备卡、变量字典、执行快照、ZIP 输入与样本记录|已接入 World Bank WDI 中国 2000–2023 真实数据（CC BY 4.0）并完成 Stata 复核；城市／企业级真实来源仍待补|
|分析过程|25|候选方案、适用性拦截、确认版本、真实计算与复算|已完成 5 条真实模型交互与真实数据描述性复核；公网 StatsPAI 已实际完成 OLS、FE、DID 与解释修订，DID 无对照组拦截返回 422（见 `docs/evidence/web-execution/`）|
|结果解释与建议|15|首次解释、反馈、修订与最新报告|新手的实际修订效果|
|创新性与独特视角|20|[创新说明](INNOVATION.md)|2–3 名探索性试用记录|
|Agent 应用成果|25|记录与报告中的 Agent 交互证据；完整提示词、输入摘要、输出及失败原因|已归档 5 条真实调用与 4 条公网执行／修订记录；失败记账见 `docs/evidence/web-execution/`|

## 状态与核验

- 代码已实现：三类模型共用限额和超时；独立持久交互记录；无数据问题可补问；受限候选方案；完整 MD/JSON 交互下载；学习与分析报告摘要及 ZIP 交互记录。
- 本地已实测：2026-10-08 会话、归属、准备、三类模型约束与模拟故障、草稿、解释修订、报告和 ZIP 回归通过。模拟接口测试不算真实模型调用。
- 运行时配置：DeepSeek 密钥通过 Sites secret 保存，兼容地址和模型名已配置。真实接口结果另存验收记录；配置本身不表示三个能力已验收。
- 既有执行证据：浏览器 webR 的三种方法及独立重跑见 UI_ACCEPTANCE.md。公网执行只接 StatsPAI Python；Stata 只展示对应语法，EViews 未接入。
- 待人工或外部证据：真实来源审校、新手试用、真实手机外网与软键盘、两个物理浏览器全部资源隔离（服务端隔离已测）、PDF 实际下载、无人值守清理时限。
- 七天到期拒读与清理接口不等于“到期一小时内物理删除”。该严格标准保留，不能用一次测试成功证明长期保证。

## 已完成的真实证据（2026-11-08）

|证据|实际记录|文件位置|
|---|---|---|
|随机面板 DID|固定种子 20261108，60 城 × 8 年，30 个处理城市；本机 Stata 18 经签名队列执行。β=−1.564（SE 0.118，95% CI −1.800～−1.328，p<0.001），真实参数 −1.6；N=480，60 个聚类；事件研究政策前联合 p=0.729；安慰剂 0.039（p=0.855）；主任务 1550 ms，临时输入目录已清理|`docs/evidence/random-did/`（结果 JSON、do 文件、Stata 日志、系数 CSV）；页面 `/static/random-did-demo.html`|
|公网部署验收|镜像 `empirical-apprentice-joycode:20261109-login2`，`https://ea-demo.duckdns.org:8000`；未登录 7 项全部通过（含新版登录页）；已登录状态检查沿用 `20261109-onboarding` 的 8/8 记录；临时账号均已删除|`scripts/post-deploy-smoke.mjs` 运行记录|
|按 IP 访问修复|原 Origin 校验只接受配置域名，IP 访问的注册/登录返回 403；新增 `EA_ALLOWED_ORIGINS` 允许评审 IP 入口，默认行为不变|`worker/auth.js`、`worker/index.js`、`deploy/tencent/docker-compose.yml`|
|真实模型调用（第 1 条）|2026-11-08 22:51 通过公网提交 tutor 提问“我想研究数字化有没有用，应该怎么开始？”；请求 `deepseek-chat`，实际返回 `deepseek-flash`，`response_valid`，2338 ms；会话 `bdd053ef40d9`、交互 `e2075d51-40dc-44d6-adb5-1efeeae0672b`；回答先追问对象与结果，未虚构变量或结果|`docs/evidence/model-call/real-model-evidence.json`|
|真实模型调用（第 2–5 条）|2026-11-08 23:17 四条教学交互均为 `response_valid`、实际 `deepseek-flash`、提示词 `ea-tutor-v4-coaching`：OLS 因果边界 2708 ms（`fab133452446`）、面板固定效应设定 2860 ms（`73ebdc4029f5`）、分批 DID 拦截建议 2993 ms（`9fcca6a64853`）、显著性与单位解释 2791 ms（`937ec41aed43`）；回答分别指出遗漏变量、双向固定效应、分批处理偏误和“显著不等于因果”|`docs/evidence/model-calls/demo-model-calls.json`|
|数据审计|4 份 CSV 的 SHA256、行数、列类型、缺失率、唯一值、重复行已核算：随机 DID 480 行 5 列；OLS 160 行 3 列；面板 / DID 384 行 7 列；全部 0 缺失、0 重复；`panel_fe.csv` 与 `did.csv` 哈希相同，是同一份教学夹具|`docs/evidence/data/SOURCE_CARD.md`、`docs/evidence/data/*.audit.json`|
|真实公开数据|World Bank WDI 中国 2000–2023：互联网使用率、人均产出（2021 PPP）、资本形成，24 行 × 4 列，0 缺失；CC BY 4.0；抓取日期 2026-11-09；SHA256 `5046…542e`；元数据含三个指标 API URL 与最后更新日期|`static/real-data/world-bank-china-2000-2023.csv`、`static/real-data/source.json`、`docs/evidence/real-data/`|
|真实数据 Stata 复核|Stata 18，Newey–West：水平值 N=24、R²=0.996，互联网系数 −0.00135（p=0.549），资本形成 0.01789（p<0.001）；一阶差分 N=23，互联网变化 −0.000982（p=0.252）；未发现显著正向关联，只作描述性证据，不宣称因果|`docs/evidence/real-data/worldbank-results.csv`、`worldbank-analysis.log`、`worldbank-analysis.do`|
|跨账号资源隔离|会话 `717cd386cdb7`：未登录读取 401；另一账号读取与 tutor 写入均 404；所属账号读取 200；临时账号已删除|`docs/evidence/acceptance/isolation-acceptance.json`|
|备份恢复|新全量备份 112 MB：`/home/ubuntu/joycode-full-backup-20261109-login2.tar.gz`，含登录页视觉改版与入场动效、计算方式说明、学习目录首卡引导与最新证据目录；旧备份保留。备份含 `.env`，禁止直接提交；恢复演练沿用 2026-11-08 的 441 文件校验记录|服务器 `/home/ubuntu/joycode-full-backup-20261109-login2.tar.gz`|
|公网 StatsPAI 三方法|临时账号经公网真实执行并已删除：OLS `education=0.774`（SE 0.0323，95% CI 0.7102–0.8378，N=160）；FE `digitalization=1.2761`（SE 0.0752，95% CI 1.1248–1.4275，N=384）；DID `DID effect=-1.8353`（SE 0.1317，95% CI −2.1003～−1.5702，N=384，48 聚类）；三次结果均 `succeeded`，AI 解读 `succeeded`；截图与任务 JSON 见目录|`docs/evidence/web-execution/ols-job.json`、`fe-job.json`、`did-job.json`、`manifest.json`|
|DID 适用性拦截|把教学 DID 夹具的 treated 全部改为 1、删除对照组后提交方案；公网真实返回 422「DID 需要政策前后与处理、对照两组观测。」，未创建任务|`docs/evidence/web-execution/did-interception.json`|
|解释与修订|同一 FE 任务保存两次解释，`reflections=2`、`record_version=4`；首次反馈指出系数、区间、固定效应局限，修订补充样本量与城市聚类口径；任务记录完整|`docs/evidence/web-execution/explain-fe-job.json`、`explain-fe-result.png`|
|交互回归修复|右栏缺口操作原先被 `[object HTMLButtonElement]` 文本替代，现恢复“我来补 / AI 帮我补 / 搜索 / 先跳过”四个按钮；移动端工具栏按钮不再拆字；注册密码提示改为中性灰，仅错误时变红|`static/conversation-workspace.js`、`static/module-layout.css`、`static/auth-view.js`、`static/auth.css`|
|解释并发写入修复|首次解释提交时，AI 解读等后台更新会先写入新 `record_version`，原实现直接 409；现改为重读任务并仅重试一次写入，保留用户已生成的反馈；修订记录实测成功|`worker/research.js`|
|移动端与证据页|390px 实际视口检查登录、注册、学习目录、课程页、分析页、验收指南、真实数据页；关键页 `scrollWidth=innerWidth`，无横向溢出；真实数据页新增 SHA256 复制按钮与来源卡入口|`docs/evidence/web-execution/manifest.json`；`static/real-data-demo.html`、`static/real-data-actions.js`|
|零基础公开体验|新增 `/static/beginner-demo.html`：无需注册，6 行模拟数据 → 点击看结果 → 自己判断“相关还是因果”；结果卡给出 0.774、区间与三条限制；页面明确标注“静态教学演示，不是本次实时计算”，并说明“不用先安装 Stata，浏览器 R／云端 StatsPAI 可用，本机 Stata 18 是可选进阶”。登录页、首页与验收指南均增加入口；登录页把验收链接归入“验收与证据”|`static/beginner-demo.html`、`static/beginner-demo.js`|
|DID 结果解读卡|随机 DID 演示首屏增加“先别急着看图表”三分栏：估计值含义、负号方向、为何不能证明因果；原有模拟数据标注和 Stata 18 运行记录未改|`static/random-did-demo.html`|
|登录后计算方式说明|登录后首页增加常驻提示“不用先安装 Stata：默认云端 StatsPAI，浏览器 R 可备用；本机 Stata 18 是可选进阶”，折叠展示三种方式对比表；不改变原有能力表述|`static/home.html`、`static/auth.css`|
|学习目录首卡引导|未开始时按钮改为“零基础开始阶段 1”，阶段 1 卡片标为“零基础推荐 · 从这里开始”，目录说明明确“不用先学回归或 DID”；本机 Stata 教程移入目录底部“进阶 · 本机 Stata 与真实软件”折叠卡，并从学习页工具栏移除|`static/module-layout.js`、`static/module-layout.css`、`static/stata-guide.js`|
|登录页视觉改版|新增深绿品牌面板与四步学习路径卡、EA 标记、输入图标、密码显示／隐藏按钮、“验收与证据”分隔线；加入 CSS 入场动效与品牌光晕，`prefers-reduced-motion` 下关闭；保留原有能力表述、零基础入口与验收链接；390px 无横向溢出|`static/auth.html`、`static/auth.css`、`static/auth-view.js`|

复验命令（任何一台可访问该地址的电脑）：

```bash
NODE_TLS_REJECT_UNAUTHORIZED=0 node scripts/post-deploy-smoke.mjs https://106.52.65.254:8000
```

公网容器保持 `STATA_TEACHING_ONLY=true`，只展示对应代码，不接收云端 Stata 执行；随机 DID 的本机 Stata 结果与公网 StatsPAI 结果分别记录，不能互相替代。

## 演示与冻结

用 [演示任务](DEMO_TASKS.md) 保存真实对话；用 [来源交接](SOURCE_HANDOFF.md) 与 [新手试用](NOVICE_PILOT.md) 收集队友材料。10 月 18 日冻结与彩排；提交日期、文件规格及匿名要求由队友核对报名系统。尚未通过的能力在网站和参赛材料中保持待验收标识。

站内导览：`/static/judge-guide.html` 把本表评分项对应到可点击入口，`/static/local-assistant-guide.html` 说明本机助手安装、配对与真实 Stata 执行条件，`/static/random-did-demo.html` 保存一次随机面板 DID 的完整记录（固定种子、签名队列、Stata 18、事件研究、安慰剂与目录清理）。导览只用于定位证据，不替代实际验收记录。

验收材料不得包含模型密钥、许可证、匿名访问 Cookie 或服务签名凭据。

## 提交包边界

- 可提交：源代码与静态资源（不含 `.env`）、`docs/evidence/web-execution/`、`docs/evidence/data/`、`docs/evidence/real-data/`、`scripts/`、`Dockerfile` 与 `deploy/` 配置（不含密钥）。
- 不可提交：`.env`、服务器备份 `*.tar.gz`、`outputs/`、`node_modules/`、`dist/`、临时截图与浏览器配置、任何私钥、许可证或访问 Cookie。
- 提交前复核：`git status --short`、`node scripts/verify-site-integrity.mjs`、`npm run ci`、`NODE_TLS_REJECT_UNAUTHORIZED=0 node scripts/post-deploy-smoke.mjs https://106.52.65.254:8000`。
