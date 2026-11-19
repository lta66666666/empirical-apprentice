# 原生执行节点

## 当前交付状态（2026-10-05）

已实现 FastAPI 签名接口、SQLite 持久任务、单 worker、固定 R/Stata 模板、真实样本索引、取消、重启恢复、排队限制、版本检查和 Sites 同步。Windows 本机 R 4.6.1 / fixest 0.14.2 / jsonlite 2.0.0 与 Stata 18 MP 三方法均已实际执行。Stata 仅作为本机开发验证；没有声明已取得网站计算授权。

服务器、HTTPS 与 Stata 网站许可尚未提供。Linux Docker 构建、实际公网连接、真实手机、跨独立浏览器公网隔离、备份恢复、长期留存同步均未验收。当前网站默认选云端 R，但保持“未配置”，用户须明确选择 webR 回退才能运行。

## 配置与部署

服务器目标至少 2 vCPU / 4 GB / 20 GB 可用空间，使用持久卷。部署时先查看本文件，执行节点仅运行一个应用进程：**不得将 uvicorn workers 改为多进程，不得横向增加副本共享这套队列**。

1. 在服务器本地安全生成至少 32 字符随机 `EA_NODE_SECRET`。通过受保护的服务器环境文件注入，不上传仓库、复现包或聊天。
2. 在本目录运行 `docker compose build`、`docker compose up -d`。Dockerfile 固定 R 4.6.1，启动能力检查也固定 fixest 0.14.2；任何标签/安装不可用须修正并重新验收，不能改版本绕过门槛。
3. 后端仅绑定宿主机 `127.0.0.1:8000`。为已取得的域名配置 Caddy（参考本目录 Caddyfile），完成 HTTPS 和防火墙检查。TLS 代理须限制请求体至 5 MB。
4. Sites 运行时添加 `EXECUTOR_URL=https://执行节点域名`、秘密值 `EXECUTOR_SECRET`（与节点一致）。**线上不得添加 `EXECUTOR_LOCAL_TEST`**。
5. 查询网站 `/api/research/status`，核对真实版本，再通过网站运行三方法、关闭页面后恢复、重跑、取消、两个独立浏览器隔离和下载。配置成功不等于验收完成。

R 本机配置：`EA_RSCRIPT` 指向 Rscript，`R_LIBS_USER` 指向固定包库；进程环境仅允许软件路径、语言和库目录，模型/节点密钥不传给估计子进程。

## Stata 开放门槛

- 向厂商或学校许可管理员确认匿名网站访客、预定并发和服务器部署均在许可范围内，保存书面依据。
- 安装与授权兼容的 Linux Stata；配置 `EA_STATA_EXECUTABLE`。不将安装包、许可证或序列号放入源码、镜像或公开下载。
- 实测三方法、命令、实际版本、e(sample)、完整参数、超时及取消后无残留进程。
- 只有上述门槛通过，才由维护者设置 `EA_STATA_WEB_AUTHORIZED=true`、`EA_STATA_RUNTIME_ACCEPTED=true`。这两个声明本身不构成许可或验收证据。
- EViews 保持未接入；不能使用普通桌面 COM 部署为网页服务。

本机开发验证可调用 `execute(..., development=True)`；HTTP 接口没有开发模式或授权绕过参数。Stata 命令固定为 regress / xtreg, fe 加年份效应，从矩阵和 e(sample) 导出数值。年份参数另存 full-coefficients.csv。标准误与区间使用 Stata 的自由度和有限样本口径，不会为匹配 R 改写结果。

## 签名协议

仅接受 `/v1/*`；无浏览器直接访问和 CORS 接口。

签名内容 UTF-8：`METHOD\nPATH\nUNIX_SECONDS\nREQUEST_UUID\nOWNER\nSHA256_BODY`，用共享密钥 HMAC-SHA256，十六进制放入 `X-EA-Signature`。另有 `X-EA-Time`、`X-EA-Request`、`X-EA-Owner`。正文必须使用实际发送的字节，GET 使用空正文。允许时钟偏差 60 秒；请求 UUID 持久防重放 120 秒。不同签名 UUID 重试同一个任务 ID，不重复计算；同 ID 不同内容拒绝。

接口：GET capabilities；POST jobs；GET jobs/:id 与 jobs/:id/result；POST jobs/:id/cancel；POST sessions/activity；POST sessions/delete。所有接口均签名并核对浏览器归属。提交含原始/方案/规范化输入哈希，规范化 CSV 只使用 v0…v59 别名，不接受公式、脚本或路径。

限制：2 MB CSV、20,000 行、60 列、最多 12 个解释变量；每归属 24 小时 30 次；1 个执行、10 个等待；等待 20 分钟、估计 120 秒。取消和超时终止进程树。节点断网时 Sites 保存精确提交快照和同步错误，恢复后按原任务 ID 查询/重试；明确 4xx 拒绝显示失败。

## 留存与备份

Sites 每次会话活动向节点续期至最后活动加 7 天。同步失败不能自动延长远端留存，网页读取仍检查 Sites 会话到期。节点空闲维护循环删除到期非运行任务；执行完清理临时输入。手动删除先停止并删除远端任务，再删除 D1/R2 数据。

节点另保留不含输入和结果的每日配额计数，24 小时后清理；手动删除分析不能重置节点配额。匿名 Cookie 归属仍不能替代账号身份或防滥用系统。

Sites 定时清理会查询远端未完成状态。当前每小时调度未恢复，且网络故障时无法保证两端同步，所以“到期后一小时内物理删除”仍未验收；不得宣传已满足。需验证无人访问、多会话、大批量、断网和时钟边界，不以一次清理通过替代长期时限。

备份时先停止执行节点，备份 `/data/tasks.sqlite3` 及 WAL/SHM（或使用 SQLite backup API），再启动；同时备份 D1/R2 和运行时配置。密钥另行保管。备份包含用户数据，必须限定保存时间与访问范围；备份恢复与过期数据处理仍需实际验收。

## 本机验收

在站点根目录，设置独立 `EA_NODE_DATA` 与测试用签名值（禁止使用线上秘密），运行：

测试环境先安装 `pip install -r executor/requirements-test.txt`；生产节点仅需 requirements.txt。

```
node --input-type=module -e "import {fixtures} from './worker/fixtures.js';import fs from 'node:fs';fs.writeFileSync('outputs/executor-fixtures.json',JSON.stringify(fixtures));"
python -m executor.verify
python -m executor.verify_lifecycle
```

`EA_STATA_EXECUTABLE` 仅用于自有软件的本机开发验证；本机也可设置 `EA_STATA_MCP_URL=http://127.0.0.1:4000`（仅接受回环地址）复用已运行的 Stata MCP `/run_file` 接口；两者都未设置时跳过 Stata。本机云端链路验收改用 `node scripts/verify-experience-site.mjs`（需本地网站与执行器）。复现 ZIP 的原生 R 命令：`Rscript --vanilla estimate.R .`；Stata 在包目录运行 estimate.do。不要解析屏幕显示表格。数值证据在站点 outputs（忽略、不发布），摘要见 EXECUTION_ACCEPTANCE.md。

## 2026-10-08 网站入口调整

当前没有云端执行节点配置。新表单不再默认选择不可用云端 R；网页突出浏览器 R / fixest 的主动选择与初始化检查。旧方案不会自动切换，确认仍绑定软件和执行位置。云端 R、Stata 的上述部署／授权门槛不变，EViews 未接入。

