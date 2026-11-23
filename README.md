# 实证学徒 · 结果优先（2026-11-23）

公网入口：https://ea-demo.duckdns.org:8000 （备用 https://106.52.65.254:8000 ；已启用 ZeroSSL 正式 HTTPS 证书，2027-02 到期）。未登录可先做 [3 分钟零基础体验](static/beginner-demo.html)；5 分钟验收路线与可检查入口见 [验收指南](static/judge-guide.html)；部署镜像、公网真实执行与数据来源记录见 [参赛证据台账](docs/COMPETITION_EVIDENCE.md)。

教材更新：七份文件登记为五部教材与一份勘误，17张自编卡已接入检索；原书全文未发布。详见[教材接入验收](docs/MATERIALS_20261103_ACCEPTANCE.md)。

## 当前能力

- 真实账号登录、双入口首页、八阶段导学、三栏短卡与中央操作主线。
- CSV／TSV／DTA材料、OLS／双向固定效应／同批DID；默认StatsPAI/Python，浏览器R主动备用。本机Stata为可选方式，仍需两次本机批准。
- 真实系数与区间、按需代码教学、独立AI辅助解读、学生解释与版本化报告。Python结果不会标为Stata软件执行。
- 账号长期保留，练习最后活动七天到期；单位未知不阻挡有效普通回归，不猜测数据含义。

## 启动与演示

本机既有环境：`node scripts/build-prototype.mjs`，然后 `node scripts/preview-experience.mjs`，打开 `http://127.0.0.1:18843/`。预览复用本机已安装Python与已忽略的模型配置，不是通用安装包。

演示：注册／登录→边分析边学→一键同批DID或提交数据→核对方案→确认计算→查看区间、AI讲解及对应代码→导出报告。AI讲解与学生正式解释分开保存。

样式：`npm ci --prefix ui --ignore-scripts`，再运行 `node scripts/build-ui.mjs`。成熟组件样式本地编译，无CDN依赖。

正式容器、运行配置、健康检查、更新、备份与回退见 [腾讯云部署说明](deploy/tencent/README.md)；旧 JoyCode 方案文档见 [历史部署](deploy/joycode/README.md)。`.openai/hosting.json`只作构建兼容，不代表JoyCode部署成功。

## 未通过项

独立新手试用、完整报告修订矩阵、真机手机外网与软键盘、两台物理浏览器隔离仍未完成；健康检查失败目前只写本地日志、无告警通知。IV、RDD、分批DID和事件研究未开放执行。

历史证据：[操作主线](docs/FLOW_20261031_ACCEPTANCE.md)、[视觉升级](docs/UI_20261030_ACCEPTANCE.md)、[新手主线](docs/NOVICE_20261029_ACCEPTANCE.md)、[历史索引](docs/HISTORY_ARCHIVE.md)。历史结论不能代替当前版本验收。
