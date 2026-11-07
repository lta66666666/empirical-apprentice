# 腾讯云部署 · 上线门禁与回滚

适用环境：`ubuntu@106.52.65.254:/home/ubuntu/joycode`，容器 `empirical-apprentice-joycode`。

## 一、版本化构建（O2）

镜像标签由 `IMAGE_TAG` 控制，未传时默认 `latest`。构建阶段会先跑 `scripts/build-prototype.mjs`，再跑 `scripts/ci-check.mjs`；CI 不通过则构建失败，旧容器继续提供服务。

本地 Windows PowerShell 执行：

```powershell
$k = 'C:\Users\LTA\.ssh\ea_deploy_key2'
$tag = (git rev-parse --short HEAD)

scp -i $k Dockerfile ubuntu@106.52.65.254:/home/ubuntu/joycode/
scp -i $k deploy/tencent/docker-compose.yml ubuntu@106.52.65.254:/home/ubuntu/joycode/docker-compose.yml
scp -i $k scripts/post-deploy-smoke.mjs ubuntu@106.52.65.254:/home/ubuntu/joycode/scripts/

ssh -i $k ubuntu@106.52.65.254 "cd /home/ubuntu/joycode && sudo env IMAGE_TAG=$tag docker compose build && sudo env IMAGE_TAG=$tag docker compose up -d"
```

## 二、部署后冒烟（O3）

```powershell
node scripts/post-deploy-smoke.mjs https://ea-demo.duckdns.org:8000
```

- 默认检查：`/healthz`、登录页 200 与 `X-Request-Id`、静态资源、畸形 JSON 返回 400 且带请求 ID。
- 设置 `EA_SMOKE_USERNAME`、`EA_SMOKE_PASSWORD` 后追加：登录并核对研究状态接口只暴露 `statspai_cloud` / `browser_webr`、方法列表含 `staggered_did`、注册表不再声明已下线引擎。
- 脚本只读，不创建账号、不提交计算。

## 三、回滚（O2）

```powershell
ssh -i $k ubuntu@106.52.65.254 "sudo docker images empirical-apprentice-joycode"
ssh -i $k ubuntu@106.52.65.254 "cd /home/ubuntu/joycode && sudo env IMAGE_TAG=<上一个标签> docker compose up -d"
```

旧标签的镜像会保留在服务器本地，无需重新构建；`docker compose up -d` 会按标签重起容器。

## 四、注意事项

- 模型密钥、执行器签名密钥只放 `.env`，不得作为构建参数或写入镜像。
- 至少保留最近两次镜像标签，确认新版本稳定后再清理更早版本。
- 构建门禁依赖 `python3`、`node` 与 `executor/` 源码，镜像内已预装；本地无 Docker 时以服务器构建结果为准。
