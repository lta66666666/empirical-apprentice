# 大陆独立部署：网站＋原生 R＋HTTPS

本目录部署整套产品，不需要访问 Sites、D1 或 R2。浏览器 Stata 助手仍主动访问这个网站。原 V9 保留作回退。

## 开通前

- 目标：Ubuntu 24.04、2核4GB、至少20GB可用磁盘。购买时核对**订单总额**，保持约定的100元预算；没有自动购买或开通续费。
- 对外访问的大陆站点按实际供应商与备案要求准备。自定义域名完成适用备案后再公开；不要把IP访问当作备案豁免结论。
- 云端 R 是免费软件栈；本机 Stata 需要使用者有效安装与许可。云端 Stata 网站授权另行核实，EViews仍未接入。

## 启动

在服务器项目的 deploy 目录：

```sh
cp environment.example .env
chmod 600 .env
# 在服务器本地生成随机秘密；不发送到聊天、不提交Git。
openssl rand -hex 32
# 将同一个秘密填到EXECUTOR_SECRET和EA_NODE_SECRET；另生成CLEANUP_TOKEN。
# 填入已准备的SITE_DOMAIN、PUBLIC_ORIGIN、兼容模型地址、实际模型名和密钥。
docker compose build
docker compose up -d
docker compose ps
docker compose logs --tail=100 web executor https
```

网站 SQLite/文件、R任务数据库和HTTPS证书分别使用持久卷。执行节点没有宿主机公网端口，容器私网请求继续签名验证。**保持单网站进程、单执行worker，不横向扩容这套队列。** 仅对外开放80/443；SSH限制管理来源。

模型密钥仅保留服务端；模型接收列摘要和教学上下文，不自动发送逐行数据。网站 `/api/research/status` 返回真实环境能力；版本或包不匹配时 R 拒绝执行。首次容器构建还需网络下载镜像与固定包，未构建通过不算部署验收。

## 留存、备份与恢复

独立网站进程每15分钟尝试清理到期数据并写 `/data/cleanup.jsonl`，运行任务受保护；进程停机时不能保证清理时限。Sites 原有无人值守调度门槛仍未解决，不能因本实现存在宣称长期验收通过。

备份前停止网站和执行节点，分别归档 `web-data` 与 `executor-data` 两个持久卷；不要只复制SQLite主文件而遗漏WAL或输入文件。完成后重启。保留 `.env` 的独立受保护副本，**不放进公开复现包**。恢复先在新的隔离 Compose 项目与卷中还原，检查会话、文件哈希、完成任务、取消及报告，再切换正式服务。到期数据的备份删除期限也须写入运维记录。

## 上线门槛

本机独立 Node/SQLite 流程已测试；当前电脑没有可用Docker命令，Docker镜像构建、Linux运行、公开HTTPS、真实手机、容器重启和备份恢复均仍待实测。提供服务器后按三方法、断网恢复、两浏览器隔离、下载和留存台账验收。
