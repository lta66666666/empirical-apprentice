# O16 任务清单

## - [x] T1 统一执行节点网络异常文案
- 修改 `worker/executor.js` 的 `nodeRequest`，包裹 `fetch`。
- 超时/中断 → `执行节点响应超时，请稍后重试。`
- 其他连接失败 → `执行节点连接失败，请稍后重试。`
- 不改 `response.ok` 与 JSON 解析逻辑。

## - [x] T2 新增失败注入脚本
- 新增 `scripts/failure-injection.mjs`。
- 覆盖 A 模型 5xx / B 执行器提交超时与弱网 / C 重复提交 / D 排队超时。
- 输出 `outputs/failure-injection.json`。

## - [x] T3 接入 CI 门禁
- 在 `scripts/ci-check.mjs` 脚本清单追加 `failure-injection.mjs`。

## - [x] T4 生成构建产物并验证
- `node scripts/build-prototype.mjs`。
- `node scripts/failure-injection.mjs`。
- `node scripts/ci-check.mjs`，期望 115 项。

## - [x] T5 更新审计文档
- `docs/PROCESS_AUDIT_20261107.md` 更新 O16 状态与覆盖说明。

## T6 提交与推送
- 按仓库现有提交风格提交上述四项变更并推送。
