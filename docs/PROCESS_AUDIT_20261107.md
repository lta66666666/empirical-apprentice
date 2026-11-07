# 实证学徒 · 全流程复盘与优化清单

日期：2026-11-07
范围：需求分析 → 方案设计 → 代码实现 → 测试验证 → 部署上线
基线证据：`npm run ci` 115 项、`scripts/verify-experience-site.mjs` 13 项、公网 Chromium 实测、容器内 StatsPAI 实测、线上 API 边界测试

## 结论

1. 未发现阻断性缺陷。核心链路（注册 → 研究准备 → 方案确认 → 云端 StatsPAI / 浏览器 webR → 双语言代码 → 导出）可稳定运行。
2. 本轮已落地 12 项低风险补强：方法注册表元数据一致性、5xx 请求追踪与结构化日志、构建期 CI 门禁、镜像版本标签与回滚能力、部署后自动冒烟、旧引擎白名单、执行器任务日志、失效冒烟脚本清理、错误文案统一、健康检查覆盖执行器、静态资源短缓存、健康接口位置字段修正。线上构建与冒烟均已通过。
3. 其余 7 项按 P1 / P2 / P3 排期，全部可在单容器内回滚，不引入架构级改动；O10 仅完成部分修复。

## 一、流程节点梳理与问题识别

### 1. 需求分析

| 节点 | 现状 | 判定 |
|---|---|---|
| 学生提出研究问题 → 方法适配 | 由对话逐步澄清，六种方法 + 两种执行方式 | 需前置能力清单，现已由 `/api/research/status` 输出 `methods` / `engines`，前端据此禁用不可用项 |
| 评委演示诉求 → 双语言展示 | 结果页与方案页并列 Stata / R 对应代码 | 保留；维护成本由 CI 模板断言控制 |
| 早期"云端原生 R / 云端 Stata / EViews"需求 | 设计时先做了 UI 入口，后确认未配置再删除 | 冗余返工。根因：设计前未核对真实能力。后续以能力探测接口为唯一事实来源 |

### 2. 方案设计

| 节点 | 现状 | 判定 |
|---|---|---|
| 方法注册表 + 字段角色 | `worker/method-registry.js` 单一来源 | 设计良好，保留 |
| 引擎选择 | 用户选择软件 → 收敛为"按方法与可用环境选择" | 已消除死交互 |
| 确认令牌 + 幂等 + 版本号 | 方案确认、任务重试、409 版本冲突均有 | 设计良好，保留 |
| 双语模板 | 同源生成 Stata / R，附 `sha256` 与 `template_version` | 设计良好；缺口是模板"可执行性"仅靠人工与容器实测 |

### 3. 代码实现

| 问题 | 证据 | 严重度 |
|---|---|---|
| 方法注册表仍声明已下线引擎 | `worker/method-registry.js` 原 `engines` 含 `r_native` / `stata_native` | P2（已修） |
| 旧草稿可带 `r_native` 进入执行阶段才失败 | `worker/executor.js` 的 `engineMetadata` 仍接受旧引擎；执行器 `executor/app.py:99` 也接受 | P2 |
| 5xx 无日志、无请求 ID | `standalone/server.mjs` 原 catch 返回 500 但不记录，提示却要求"查日志" | P2（已修） |
| 执行器任务生命周期无结构化日志 | `executor/app.py` 仅落盘 `execution.log`，容器 stdout 无任务开始/结束/耗时 | P2 |
| 静态资源统一 `no-store` | `worker/index.js:16` 全局 `Cache-Control: no-store`，重复访问需重下约 1.2MB 资源 | P2 |
| 缺 CSP / X-Frame-Options / Referrer-Policy | `worker/index.js:12-17` 仅有 COOP/COEP/CORP | P2 |
| 错误文案中英混杂 | `executor/app.py` 多为英文（如 `CSV exceeds 2 MB`），前端直接展示 | P2 |
| 单文件过大 | `worker/sessions.js` 600 行、`static/research.js` 743 行 | P2（可维护性） |
| `/api/health` 硬编码 `execution_location: 'browser_webr'` | `worker/index.js:125-127` | P3 |
| 静态资源每次请求 base64 解码 | `worker/index.js:25` | P3（收益可忽略，不建议改） |

### 4. 测试验证

| 缺口 | 证据 | 严重度 |
|---|---|---|
| 构建流程未包含 CI 门禁 | `Dockerfile` 只跑 `build-prototype.mjs`，`ci-check.mjs` 依赖人工执行 | P1 |
| 无跨浏览器验证 | 仅 Chromium 实测，Firefox / Safari 未跑 | P1 |
| `scripts/cloud-smoke.mjs` 断言已下线的 `r_native` | 第 13、18 行；当前产品必失败 | P2 |
| 两个回归脚本 schema 漂移 | `research-understanding-regression.mjs` 旧 mock、`interaction-regression.mjs` 未带 `state_version` | P2 |
| 两个 DOM 测试缺依赖 | `conversation-first-regression.mjs` 缺 `jsdom`、`webr-lifecycle-regression.mjs` 缺 DOM 桩 | P2 |
| 无失败注入 / 弱网 / 并发压测 | 现有用例以正常路径为主 | P2（已修） | 已新增 `scripts/failure-injection.mjs`，覆盖模型 5xx、执行器提交超时与轮询中断、并发重复提交、排队超时 |
| 无覆盖率统计 | CI 无覆盖率报告 | P3 |

### 5. 部署上线

| 节点 | 现状 | 判定 |
|---|---|---|
| 构建 | 服务器 `docker compose build`，镜像内重建 `dist/server` | 可用；镜像 tag 固定 `20261105`，缺版本标识 |
| 健康检查 | 容器 `HEALTHCHECK` 仅查 `/healthz`（DB `SELECT 1`） | 可用但不覆盖执行器 |
| 自愈 | `deploy/tencent/check-health.sh` 连续失败后自动重启容器 | 已具备 |
| 备份 | `deploy/tencent/backup-joycode.sh`，保留 7 份 | 已具备 |
| 证书 | `renew-cert.sh` 同步 Let's Encrypt 并重载 | 已具备 |
| 部署后验证 | 手工浏览器 / API 复验 | 缺自动化冒烟 |
| 回滚 | 手工 `git checkout` + 重建 | 缺版本化镜像与一键回滚 |

## 二、优化清单（优先级 / 成本 / 收益）

优先级：P1 提交前建议完成，P2 提交后一个迭代，P3 观察项。
成本：S ≤ 0.5 人日，M ≤ 2 人日。

| ID | 优化项 | 优先级 | 成本 | 预期收益 | 落地建议 | 风险 | 状态 |
|---|---|---|---|---|---|---|---|
| O1 | 构建门禁未包含 CI | P1 | S | 防止带病镜像上线 | 已改为镜像内先 `build-prototype.mjs` 再 `ci-check.mjs`，失败即中止构建，旧容器继续服务 | 低（构建 +约 5 秒） | ✅ 已落地 |
| O2 | 镜像无版本标识，回滚困难 | P1 | S | 一键回滚 | 已支持 `IMAGE_TAG` 构建参数与镜像标签，写入 `org.opencontainers.image.revision`；旧标签镜像保留 | 低 | ✅ 已落地 |
| O3 | 部署后无自动冒烟 | P1 | S | 上线即发现回归 | 已新增 `scripts/post-deploy-smoke.mjs`，检查健康、登录页、静态资源、400 请求 ID，可选已登录状态核对 | 低 | ✅ 已落地 |
| O4 | 无跨浏览器验证 | P1 | M | 覆盖评委可能使用的 Safari / Firefox | Playwright 增加 `firefox` / `webkit` 用例：登录 + 云端 DID + 双语言代码展示 | 中（webR 在非 Chromium 内核可能受限，需单独标注） | 待办 |
| O5 | 方法注册表残留已下线引擎 | P2 | S | 对外元数据一致 | 已删除 `r_native` / `stata_native` 声明 | 低 | ✅ 已落地 |
| O6 | 5xx 无日志、无请求 ID | P2 | S | 故障可定位 | 已增加 `X-Request-Id`、`upstream_error` / `request_failed` 结构化日志与响应 `request_id` | 低 | ✅ 已落地 |
| O7 | 旧草稿带旧引擎进入执行阶段才失败 | P2 | S | 提前 422，减少无效等待 | 方案确认白名单已收敛为 `statspai_cloud` / `browser_webr`，其他引擎返回"该执行方式已下线" | 中（需兼容历史草稿） | ✅ 已落地 |
| O8 | 执行器任务生命周期无结构化日志 | P2 | S | 队列与失败可观测 | 已输出 `task_started` / `task_finished` / `task_expired` JSON 行（任务 ID、方法、排队与执行耗时、状态、错误摘要） | 低 | ✅ 已落地 |
| O9 | `cloud-smoke.mjs` 断言已下线引擎 | P2 | S | 消除必失败的测试债 | 已删除脚本，`executor/README.md` 改指向 `verify-experience-site.mjs` | 低 | ✅ 已落地 |
| O10 | 旧回归脚本 schema 漂移 / 缺依赖 | P2 | M | 恢复自动化覆盖 | `interaction-regression.mjs` 已补 `state_version`；其余断言仍按旧课程/对话流，需重写；`jsdom` 依赖仍缺 | 中（测试专用，不影响产品） | 部分完成 |
| O11 | 静态资源全部 `no-store` | P2 | S | 降低重复访问流量、加快二次打开 | 已对 js/css/svg/woff 设 `public, max-age=300`，HTML 与接口保持 `no-store` | 中（需确认发版后版本串确实更新） | ✅ 已落地 |
| O12 | 缺 CSP 等安全响应头 | P2 | M | 降低 XSS / 点击劫持面 | 已加 `Content-Security-Policy-Report-Only`（含 `report-uri /api/csp-report`）、`X-Frame-Options`、`Referrer-Policy`、`Permissions-Policy`；上报端点仅记录违规字段并返回 204 | 中（页面存在内联脚本，需观察违规后再收紧） | 已完成（Report-Only） |
| O13 | 执行器错误文案英文 | P2 | S | 用户体验一致 | 校验错误、排队超时、中断与重启提示已统一为中文 | 低 | ✅ 已落地 |
| O14 | `sessions.js` / `research.js` 过大 | P2 | M | 降低维护成本与回归风险 | 按职责拆出 project、learning、case 三个模块，保持现有导出不变 | 中（需回归 113 项 CI） | 待办 |
| O15 | 健康检查不覆盖执行器 | P2 | S | 提前发现"网站正常但算不出来" | `/healthz` 已并行探测执行器可达性并返回 `executor: ok/down/not_configured`，数据库失败仍返回 503 | 低 | ✅ 已落地 |
| O16 | 无失败注入 / 弱网 / 并发压测 | P2 | M | 稳定性信心 | 已新增 `scripts/failure-injection.mjs`：模型连续 5xx 保留资料并可重试；执行器提交超时/轮询中断保持 `queued` 且恢复后按落盘快照重提；并发重复提交同 `id`、同编号不同内容 409；排队超时同步为 `failed` 并保留中文原因 | 低（仅测试与网络异常文案） | ✅ 已落地 |
| O17 | 无覆盖率统计 | P3 | S | 质量趋势 | `npm run coverage`（c8 包裹 CI，仅上报不设阈值）；基线（115 项 CI，含 O16 失败注入）：整体语句/行 32.14%、分支 52.45%、函数 36.9%，standalone 行覆盖 100%、worker 31.58% | 低 | 已完成（`npm run coverage` 需先安装 c8） |
| O18 | `/api/health` 硬编码 `browser_webr` | P3 | S | 信息准确 | 已改为 `execution_locations: ['statspai_cloud','browser_webr']` | 低 | ✅ 已落地 |
| O19 | "整理方案 → 确认 → 运行"三步 | P3 | M | 演示节奏更快 | 仅在"方案未变更且引擎就绪"时提供"确认并运行"，保留教学确认语义 | 中（涉及教学流程语义） | 待办 |

### 保留不动的"冗余"

- 双语言代码在方案页与结果页各展示一次：评委演示诉求，且由 CI 断言模板关键命令，不属于重复建设。
- 课程 / 有想法 / 已有数据三个入口：对应三种真实起点，不合并。
- 方案确认步骤：防误跑与教学确认价值高于一次点击的便利。
- `assets.js` 解码缓存：单文件解码成本极低，缓存反而增加常驻内存，不做。

## 三、本轮补充的机制

| 类型 | 位置 | 补充内容 | 验证 |
|---|---|---|---|
| 校验/一致性 | `worker/method-registry.js` | 删除 `r_native` / `stata_native`，对外只声明实际可用引擎 | CI 113 项；线上 status 接口复验 |
| 可观测性 | `standalone/server.mjs` | 每请求生成 `X-Request-Id`；500 时记录 `request_failed`（含路径、耗时、错误摘要、栈位置）；上游 5xx 记录 `upstream_error`；500 响应体回传 `request_id` | `node --check`、本地全链路 E2E 13 项 |
| 既有校验（确认无缺口） | `worker/research.js` / `executor/app.py` | 文件 2MB、行数 20000、列数 60、表头唯一、矩形校验、字段别名、方法专属参数、哈希证据链 | CI 与线上 422 边界测试 |
| 既有异常处理（确认无缺口） | `executor/app.py` | 队列等待超时、任务中断、重启恢复、导入互斥锁、临时目录清理 | 容器生命周期实测 |

## 四、稳定性 / 可维护性 / 性能确认

### 稳定性

- 已具备：容器 `restart: unless-stopped`、外部健康巡检自动重启、每日备份保留 7 份、7 天数据保留与清理、任务幂等与确认令牌、跨账号隔离、取消不伪造结果。
- 残余风险：单容器 + 执行器单并发队列，长任务会排队；仅手工回滚。
- 结论：满足演示与教学场景的稳定性要求；O1–O3 补齐上线门禁后风险进一步下降。

### 可维护性

- 已具备：方法注册表单一来源、双语模板随任务落盘并带 `sha256` / `template_version`、115 项 CI 覆盖关键契约。
- 残余风险：两个旧回归脚本漂移、`cloud-smoke` 失效、两个大型模块。
- 结论：可维护，但需按 O9、O10、O14 清理测试债与模块体量。

### 性能

- 已具备：CSV 2MB / 20000 行上限、webR 仅在主动选择时按需加载、webR 资源磁盘流式 18MB 不经过 base64、云端任务 3 分钟内完成。
- 残余风险：静态资源无浏览器缓存；无并发与弱网压测数据。
- 结论：满足演示性能要求；O11 可在不改变功能的前提下降低二次打开成本。

### 无新增风险确认

- 本轮改动均为"只增不减"或"只删元数据"：日志为附加输出，`X-Request-Id` 为附加响应头，`method_registry.engines` 无任何业务逻辑读取，构建期门禁只在失败时阻断。
- 回归证据：`node --check` 通过、CI 115 项通过（含镜像内构建期门禁）、本地全链路 E2E 13 项通过、`build-prototype.mjs` 构建成功、线上冒烟 5 项通过。
- 部署回滚：线上镜像保留 `20261105` 与 `20261107-df9b102` 两个标签，执行 `sudo env IMAGE_TAG=<旧标签> docker compose up -d` 即可回滚，无需数据迁移（未改表结构）。

## 五、建议执行顺序

**批次 A（已完成并上线）**
O5 + O6。线上 `/api/research/status` 的 `method_registry.engines` 已不再出现 `r_native` / `stata_native`；请求均带 `X-Request-Id`，畸形 JSON 请求可回传同一 ID。

**批次 B（已完成）**
O1 + O2 + O3 已上线：镜像内 CI 114 项通过后产出版本化镜像 `20261107-df9b102`，旧镜像 `20261105` 保留；部署后冒烟 5 项全部通过。O4（Firefox / Safari）仍需额外安装 Playwright 浏览器，单独排期。

**批次 C（已完成，O10 部分完成）**
O7 + O8 + O9 + O13 + O15 已落地：旧引擎提前 422、执行器任务日志、失效冒烟脚本清理、错误文案统一、健康检查覆盖执行器。O10 仅修复 `interaction-regression.mjs` 的 `state_version`，其余断言需按当前课程与对话流重写，暂不纳入本轮。

**批次 D（观察项）**
O11 + O12 + O14 + O17 + O18 + O19。验收：安全头以 Report-Only 观察一周无违规后再强制；模块拆分后 CI 全绿。

**批次 E（已完成）**
O16 已落地：`scripts/failure-injection.mjs` 四类故障用例接入 CI，`node scripts/ci-check.mjs` 通过 115 项；执行节点超时/连接失败的底层异常已统一为中文提示，弱网轮询只记录 `sync_error`，不伪造终态。
