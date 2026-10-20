# JoyCode 独立整站候选：部署与资源门槛

2026-10-21。当前是候选源码，**尚未部署到 JoyCode**。旧 Sites V46 保持不变。

## 当前已完成

- Node24 网站＋Python3.11 签名执行服务；对外8080，计算服务仅127.0.0.1:8000。
- StatsPAI1.39.5 固定源码提交；OLS、双向固定效应、同批DID实际本地计算和网站HTTP闭环。
- 新账号注册／登录，任务确认、幂等、隔离、结果保存、对应Stata代码、MD／ZIP与进程重启保持。
- 首页双入口与八阶段课程保留；默认云端，浏览器R主动备用，本机Stata为可选高级方式。
- Python复现与Stata对应代码分开记录，不生成假的Stata运行日志。

## 尚未通过，不能称正式可用

- JoyCode CPU／内存／应用额度／有效期／持久存储／HTTPS／实际费用尚未证实。
- Linux依赖文件完成指定平台解析锁定，未在Linux安装、构建或实际执行；本机无Docker，不自动安装。
- 浏览器工具连接超时，当前候选真实点击、PDF、手机、200%放大未验收。
- 本地真实DeepSeek三方法正确解释已通过；公网多轮、解释修订及全格式一致性仍待验。
- 2SLS、Sharp/Fuzzy RDD、分批DID、事件研究为阶段C，注册表明确不可执行，未冒充已接入。

## 先核对资源，不购买套餐代替核验

用户提供的两张截图分别证明“没有已部署应用”和“编码套餐权益”；不能证明已获正式应用资源。
在项目生成镜像后、正式部署确认前，核对：

1. 可选2核4GB及月费用（含磁盘、流量、存储），赛事额度及到期时间。
2. 挂载独立持久卷到`/data`，更新、重启、重新部署均保留；可写容器层不算。
3. HTTPS正式地址、关闭IDE后继续运行、后台任务与120秒计算支持。
4. 平台真实客户端IP头、直连代理地址及该头的覆盖规则。

费用超过100元/月、只有编码积分、持久存储无法确认时不正式上线，不开启自动按量扣费。

## 配置与构建

从仓库根目录使用`Dockerfile`，或`docker build -f deploy/joycode/Dockerfile .`。
平台启动`/bin/start.sh`；不要启动开发服务器。镜像为非root。
Python依赖见`requirements-linux.txt`；不复制Windows虚拟环境或pywin32。

运行时注入：

| 配置 | 内容 |
|---|---|
| PUBLIC_ORIGIN | JoyCode分配的正式HTTPS源地址，无路径 |
| EXECUTOR_SECRET | 至少32字符随机签名密钥；运行时保存 |
| MODEL_BASE_URL / MODEL_NAME / MODEL_API_KEY | 原有DeepSeek配置，仅网站进程使用 |
| EA_DATA_DIR | `/data/web` |
| EA_NODE_DATA | `/data/executor` |
| EA_DEPLOYMENT_APPROVED | 完成资源及持久性核对后才设`true` |
| EA_TRUSTED_PROXY_ADDRESSES | 已核验的平台代理对端地址，逗号分隔；不猜填 |
| EA_CLIENT_IP_HEADER | 已核验且由平台覆盖的单一IP头；不接受任意转发链 |

监督程序预加载依赖，待签名健康检查成功才开放网站。任一服务退出将停止另一服务，交给平台重启。
新站独立注册，不复制旧账号、Cookie或密钥。`.openai/hosting.json`没有旧站project_id。

## 持久性与回退实测步骤

隔离环境注册账号、创建模拟任务、保存结果→记录任务和版本→重启→验证登录及结果→部署同镜像新版本→再次核对→备份恢复到隔离卷。
备份必须一致地保存网站SQLite／文件与计算队列；不得只复制运行中的单个SQLite文件而忽略WAL。
沿用账号持续保存、练习最后活动七天到期；账号不是实名认证。必须再验七天删除及备份恢复。
关键归属、保存或结果绑定失败时撤回新入口；旧Sites保持原样。

## 对照与推断

OLS显式HC1；面板显式单向聚类。聚类采用t(G−1)，FE协方差采用native feols的ssc=fixest；不宣称与xtreg有限样本修正完全一致。
完整样本索引、软件包版本、推断和计划哈希保留。未知单位不猜测，不阻止有效普通回归。

官方部署说明：https://joycode.jd.com/docs/user-guide/user-guide/cloud-deployment/
