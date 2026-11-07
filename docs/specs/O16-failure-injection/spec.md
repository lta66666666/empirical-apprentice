# O16 失败注入 / 弱网 / 并发压测 · 实施规格

日期：2026-11-07
状态：待批准

## 目标

新增一个可离线运行、无新增依赖的失败注入回归脚本，覆盖四类真实故障，并接入既有 CI 门禁：

1. 模型接口连续 5xx。
2. 执行器提交超时 / 轮询期间连接中断（弱网）。
3. 重复提交（并发 + 同编号不同内容）。
4. 执行器排队超时。

## 非目标

- 不引入 Playwright、k6、mock server 等新依赖。
- 不改动执行器队列容量与等待时长默认值。
- 不改动确认令牌、幂等键、任务状态机语义。

## 变更文件（精确）

### 1. `worker/executor.js`

`nodeRequest` 中 `fetch` 调用外包一层 `try/catch`，把底层异常统一为中文可读错误：

- `error.name === 'TimeoutError' || 'AbortError'` → `执行节点响应超时，请稍后重试。`
- 其他（DNS、连接重置、TLS 等）→ `执行节点连接失败，请稍后重试。`
- 保留 `response.json()` 解析与 `!response.ok` 的现有行为不变；不泄漏底层异常文本。

影响面：`engineCapabilities`（失败原因文案）、`submitCloudJob`（`sync_error`）、`syncCloudJob`（弱网轮询）、`deleteSessionNodes`、教学预览。均为文案级变化，无状态机变化。

### 2. `scripts/failure-injection.mjs`（新增）

复用现有离线测试范式：`openStorage('outputs/failure-injection-'+Date.now())` + `dist/server/index.js` 的 `worker.fetch`，通过替换 `globalThis.fetch` 注入故障；按 URL host 分流模型与执行器。

用例与断言：

**A. 模型 5xx**

- 模型桩连续两次返回 `500`（携带 `private-provider-body`）。
- `POST /api/research/chat`：
  - HTTP 200；
  - `message.dialogue.recovery.error_type === 'http'` 且 `can_retry === true`；
  - 回复正文包含「在线模型暂不可用」，不含 `private-provider-body`；
  - `research_summary` 中用户已陈述字段保留。
- 切换模型桩为合法 JSON，携带 `retry_of_message_id` 与新 `request_id` 重试：
  - 200；`recovery.can_retry === false`；生成新回复 id；
  - 用户消息数不增加（不重复入队）。

**B. 执行器提交超时 + 弱网**

- 用 `/api/research/examples/ols` + `/research/plan` 生成 `statspai_cloud` 方案并拿到确认令牌；随后才注入 `EXECUTOR_URL` / `EXECUTOR_SECRET`。
- 执行器桩分四种模式：`submit_timeout`（`capabilities` 正常、`POST /v1/jobs` 抛 `AbortError`）、`down`（全部抛 `AbortError`）、`ok`（回 `queued`）、`queue_timeout`（`GET /v1/jobs/:id` 回 `failed` + 中文排队超时文案）。
- `submit_timeout` 下提交：
  - 仍返回 202；
  - 任务 `status === 'queued'`（不得因超时直接置 `failed`）；
  - `sync_error` 为中文「执行节点响应超时」。
- `down` 下轮询：
  - `status` 仍为 `queued`，`sync_error` 为中文连接失败/超时，不暴露 DOMException 原文。
- 切回 `ok` 后轮询：
  - 依靠 `.node.json` 快照重提成功，`status === 'queued'` 且 `sync_error === null`。

**C. 重复提交**

- 同一 `request_id` 并发两次提交：
  - 两次均 202；
  - 返回同一 `id`；
  - 数据库中该 `request_id` 仅一条 `jobs` 记录。
- 同 `request_id`、不同 `source`：
  - 返回 409。

**D. 排队超时**

- 执行器桩返回 `{status:'failed', error:'排队超过 20 分钟，请重新确认后再提交。'}`：
  - 任务同步为 `failed`；
  - `error` 原样展示中文文案；
  - 不产生 `result`、不伪造成功。

输出：`outputs/failure-injection.json`，含 `scope`（仅断言控制桩下的状态机与文案，不声称真实弱网/真实并发压测）。

### 3. `scripts/ci-check.mjs`

在现有脚本清单中追加 `failure-injection.mjs`（与交互、理解回归同级）。CI 通过计数由 113 增至 114。

### 4. `docs/PROCESS_AUDIT_20261107.md`

- O16 行状态改为「✅ 已落地」，补充脚本名与覆盖的四类用例。
- 批次 D 说明中移除 O16，「无失败注入 / 弱网 / 并发压测」缺口更新为已覆盖。

## 验证步骤

1. `node scripts/build-prototype.mjs`（`dist/` 为生成物，需同步 `worker/executor.js`）。
2. `node scripts/failure-injection.mjs` → 全部 PASS。
3. `node scripts/ci-check.mjs` → `CI PASSED (115 checks)`（新增脚本同时增加一次 `node --check` 和一次运行）。
4. 抽查 `dist/server/executor.js` 与 `worker/executor.js` 内容一致。

## 风险与回滚

- 风险低：`nodeRequest` 仅改异常文案；测试脚本为纯新增；CI 仅新增一项。
- 回滚：删除 `scripts/failure-injection.mjs`、移除 CI 清单一行、还原 `executor.js` 的 `try/catch` 包裹即可；无数据结构与接口变更。
