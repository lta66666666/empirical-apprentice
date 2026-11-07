# 实证学徒 · 全流程复盘与优化清单

日期：2026-11-07
范围：需求分析 → 方案设计 → 代码实现 → 测试验证 → 部署上线
基线证据：`npm run ci` 113 项、`scripts/verify-experience-site.mjs` 13 项、公网 Chromium 实测、容器内 StatsPAI 实测、线上 API 边界测试

## 结论

1. 未发现阻断性缺陷。核心链路（注册 → 研究准备 → 方案确认 → 云端 StatsPAI / 浏览器 webR → 双语言代码 → 导出）可稳定运行。
2. 本轮已落地 2 项低风险补强：方法注册表元数据一致性、5xx 请求追踪与结构化日志。本地 CI 与全链路 E2E 均通过，**线上部署待授权**。
3. 其余 17 项按 P1 / P2 / P3 排期，全部可在单容器内回滚，不引入架构级改动。

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
| 无失败注入 / 弱网 / 并发压测 | 现有用例以正常路径为主 | P2 |
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
| O1 | 构建门禁未包含 CI | P1 | S | 防止带病镜像上线 | `Dockerfile` 在 `build-prototype.mjs` 后追加 `node scripts/ci-check.mjs`；或部署脚本先跑 `npm run ci` | 低（构建时长 +约 1 分钟） | 待办 |
| O2 | 镜像无版本标识，回滚困难 | P1 | S | 一键回滚 | 构建时 `--build-arg IMAGE_TAG=$(git rev-parse --short HEAD)`，保留上一版镜像 | 低 | 待办 |
| O3 | 部署后无自动冒烟 | P1 | S | 上线即发现回归 | 部署脚本末尾串行执行：`/healthz` → `/api/research/status` → 一次最小 OLS 任务 | 低 | 待办 |
| O4 | 无跨浏览器验证 | P1 | M | 覆盖评委可能使用的 Safari / Firefox | Playwright 增加 `firefox` / `webkit` 用例：登录 + 云端 DID + 双语言代码展示 | 中（webR 在非 Chromium 内核可能受限，需单独标注） | 待办 |
| O5 | 方法注册表残留已下线引擎 | P2 | S | 对外元数据一致 | 已删除 `r_native` / `stata_native` 声明 | 低 | ✅ 已落地 |
| O6 | 5xx 无日志、无请求 ID | P2 | S | 故障可定位 | 已增加 `X-Request-Id`、`upstream_error` / `request_failed` 结构化日志与响应 `request_id` | 低 | ✅ 已落地（待部署） |
| O7 | 旧草稿带旧引擎进入执行阶段才失败 | P2 | S | 提前 422，减少无效等待 | 方案确认白名单收敛为 `statspai_cloud` / `browser_webr`；旧草稿给出"请重新选择执行方式"提示 | 中（需兼容历史草稿） | 待办 |
| O8 | 执行器任务生命周期无结构化日志 | P2 | S | 队列与失败可观测 | `executor/app.py` 在 queued / estimating / succeeded / failed 各打一行 JSON（任务 ID、方法、耗时、状态） | 低 | 待办 |
| O9 | `cloud-smoke.mjs` 断言已下线引擎 | P2 | S | 消除必失败的测试债 | 重写为云端 Stata 语法路径，或删除并在 README 注明由 `verify-experience-site.mjs` 覆盖 | 低 | 待办 |
| O10 | 旧回归脚本 schema 漂移 / 缺依赖 | P2 | M | 恢复自动化覆盖 | 统一模型 mock 到 `coaching` 结构；补齐 `jsdom` 或改用轻量 DOM 桩 | 中（测试专用，不影响产品） | 待办 |
| O11 | 静态资源全部 `no-store` | P2 | S | 降低重复访问流量、加快二次打开 | 仅对 `/static/*.js|css|svg|woff` 设 `max-age=300`，HTML 保持 `no-store`；沿用现有 `?v=` 版本串 | 中（需确认发版后版本串确实更新） | 待办 |
| O12 | 缺 CSP 等安全响应头 | P2 | M | 降低 XSS / 点击劫持面 | 先 `Content-Security-Policy-Report-Only` 收集违规，再切白名单；同步加 `X-Frame-Options`、`Referrer-Policy` | 中（页面存在内联脚本，需逐项放行） | 待办 |
| O13 | 执行器错误文案英文 | P2 | S | 用户体验一致 | `executor/app.py` 校验错误统一中文，保留稳定的错误分类 | 低 | 待办 |
| O14 | `sessions.js` / `research.js` 过大 | P2 | M | 降低维护成本与回归风险 | 按职责拆出 project、learning、case 三个模块，保持现有导出不变 | 中（需回归 113 项 CI） | 待办 |
| O15 | 健康检查不覆盖执行器 | P2 | S | 提前发现"网站正常但算不出来" | `/healthz` 增加执行器 `capabilities` 探测字段（超时 2s，失败只降级标注，不返回 503） | 低 | 待办 |
| O16 | 无失败注入 / 弱网 / 并发压测 | P2 | M | 稳定性信心 | 增加四类脚本化用例：模型 5xx、执行器超时、重复提交、队列排队超时 | 中 | 待办 |
| O17 | 无覆盖率统计 | P3 | S | 质量趋势 | CI 接入 `c8`，仅上报不设硬阈值 | 低 | 待办 |
| O18 | `/api/health` 硬编码 `browser_webr` | P3 | S | 信息准确 | 改为返回能力摘要或删除该字段 | 低 | 待办 |
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

- 已具备：方法注册表单一来源、双语模板随任务落盘并带 `sha256` / `template_version`、113 项 CI 覆盖关键契约。
- 残余风险：两个旧回归脚本漂移、`cloud-smoke` 失效、两个大型模块。
- 结论：可维护，但需按 O9、O10、O14 清理测试债与模块体量。

### 性能

- 已具备：CSV 2MB / 20000 行上限、webR 仅在主动选择时按需加载、webR 资源磁盘流式 18MB 不经过 base64、云端任务 3 分钟内完成。
- 残余风险：静态资源无浏览器缓存；无并发与弱网压测数据。
- 结论：满足演示性能要求；O11 可在不改变功能的前提下降低二次打开成本。

### 无新增风险确认

- 本轮两处改动均为"只增不减"或"只删元数据"：日志为附加输出，`X-Request-Id` 为附加响应头，`method_registry.engines` 无任何业务逻辑读取。
- 回归证据：`node --check` 通过、CI 113 项通过、本地全链路 E2E 13 项通过、`build-prototype.mjs` 构建成功。
- 部署回滚：`git revert` 对应提交 → 重新 `docker compose build && up -d`，无需数据迁移（未改表结构）。
- 未部署项：线上仍为上一版（功能不受影响），部署需单独授权。

## 五、建议执行顺序

**批次 A（已完成，待部署）**
O5 + O6。验收：线上 `/api/research/status` 的 `method_registry.engines` 不再出现 `r_native` / `stata_native`；人为触发 500 时响应含 `request_id` 且 stderr 有对应日志。

**批次 B（提交前，约半天）**
O1 + O2 + O3 + O4（Firefox / Safari 至少各跑一条主流程）。验收：部署脚本一条命令完成构建、门禁、冒烟；失败即中止并保留上一版镜像。

**批次 C（提交后一个迭代）**
O7 + O8 + O9 + O10 + O13 + O15。验收：CI 恢复全部可执行用例；旧草稿收到明确 422；执行器日志可按任务 ID 追踪。

**批次 D（观察项）**
O11 + O12 + O14 + O16 + O17 + O18 + O19。验收：安全头以 Report-Only 观察一周无违规后再强制；模块拆分后 CI 全绿。
