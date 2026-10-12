# 实证学徒

面向计量研究初学者的教学与分析 Agent：研究准备、方法指导、R/fixest 真实计算、本机 Stata MCP 助手、学习反馈及可追溯报告。

本仓库是当前产品的独立源码副本，包含最新修复；不含原 agent1 V9 回退项目或其 Git 历史。默认分支 main，私有保存。JoyCode 代码库绑定与部署尚未实施。

## 源码结构

| 目录 | 用途 |
| --- | --- |
| static/ | 当前教学工作台、课程、模拟资源、浏览器 webR 及本机助手下载包 |
| worker/ | 会话、研究方案、教学反馈、模型接口、报告、归属与清理 API |
| standalone/ | 独立 Node HTTP 服务、SQLite 与本地文件存储适配 |
| executor/ | FastAPI 持久队列、原生 R/fixest 与 Stata 固定模板适配 |
| local_stata/ | Windows 本机助手、配对、代码批准与结果摘要上传 |
| drizzle/、db/ | 数据库迁移与定义 |
| scripts/ | 构建及模型、草稿、配对、执行验收脚本 |
| deploy/ | Docker Compose、HTTPS、配置模板及部署说明 |
| docs/ | 比赛证据、案例交接、试用与演示材料 |
| app/、components/、lib/等 | 保留的框架脚手架；当前独立工作台入口是 static/ 与 worker/ |

第三方许可证保留在 build/、vendor/、static/vendor/ 等原位置；本次没有新增项目开源许可证。

## 独立运行

安装 Node.js 24，在仓库根目录运行以下命令。这个独立入口不需要安装前端脚手架依赖：

```powershell
node scripts/build-prototype.mjs
node standalone/server.mjs
```

打开 http://127.0.0.1:8766/。默认将会话和文件保存在 outputs/standalone；可设置 EA_DATA_DIR 指向独立持久目录。真实浏览器 R 需要下载 webR/fixest，并满足跨源隔离要求。公网运行使用 HTTPS；完整部署见 deploy/README.md，原生执行节点见 executor/README.md，本机 Stata 使用方式见 local_stata/README.md。

框架/Sites 的 npm build 与 start 不等于上述独立入口。构建依赖 .openai/hosting.json：它是既有 Sites 的非密钥配置，保留以兼容构建，不代表 JoyCode 已部署，也不要求独立运行接入 Sites。

## 运行时配置

| 配置 | 含义 |
| --- | --- |
| PORT、BIND_ADDRESS | HTTP 端口与绑定地址，默认 8766、127.0.0.1 |
| PUBLIC_ORIGIN | 网站根地址；生产模式必须为 HTTPS |
| EA_DATA_DIR | 会话、数据库和文件持久目录 |
| MODEL_API_KEY、MODEL_BASE_URL、MODEL_NAME | 兼容模型接口；仅运行时提供，逐行数据不发送给模型 |
| EXECUTOR_URL、EXECUTOR_SECRET | 网站访问云端执行节点的地址与签名凭据 |
| EA_NODE_SECRET | 执行节点签名凭据，配置方式见节点说明 |
| CLEANUP_TOKEN | 受保护的清理接口凭据 |

配置模板见 deploy/environment.example。密钥、.env、学生记录、数据库、日志、备份、依赖和构建产物不得提交。本机助手 connection.json 与原始数据默认保存在使用者电脑，不纳入仓库。

## 能力与验收边界

- 已有八阶段课程、研究准备、OLS、固定效应及同批 DID、方案确认、解释修订、学习与分析报告和复现材料。
- 浏览器 webR 三种方法及中断已有执行证据；结果来自浏览器，不能称为服务器独立认证结果。
- 原生 R、Stata 三方法及本机 MCP/助手闭环有本机证据；云端节点与公开站助手完整闭环仍须分别验收。
- 模型候选方案、课程问答与解释反馈具备接口及持久记录；真实服务能力以对应环境联调台账为准，源码不含模型凭据。
- 公网原生 R 部署、云端 Stata 网站授权、EViews 接入、真实手机完整流程、备份恢复及长期清理时限尚未全部验收。
- 模拟教学数据不能作为真实政策证据；案例措辞、真实来源材料及新手试用仍由队友审校和交付。

详细记录见 EXECUTION_ACCEPTANCE.md、UI_ACCEPTANCE.md、docs/COMPETITION_EVIDENCE.md。源代码完成、本机通过和公网验收分别记录。

## 开发检查

```powershell
node scripts/build-prototype.mjs
node scripts/model-unit.mjs
node scripts/local-drafts-smoke.mjs
```

启动独立测试服务在 8788 端口后，可运行 scripts/drafts-smoke.mjs 与 scripts/model-evidence-smoke.mjs。测试生成的 outputs/ 数据不提交。真实 R、Stata、手机和公网行为需要实际环境验收，不能由这些测试替代。

