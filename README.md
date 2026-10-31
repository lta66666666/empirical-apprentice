# 实证学徒 · 单一操作主线候选（2026-10-31）

本轮修改与证据见 [操作主线验收](docs/FLOW_20261031_ACCEPTANCE.md)。当前仍为部分验收通过的独立候选。

# 实证学徒 · 界面升级候选（2026-10-30）

本轮采用清爽青绿主题、新手简洁布局与按需 Bootstrap 5.3.8 组件样式。首页增加标题和视觉层次，仍只有两个入口。所有业务控制器与计算接口沿用现有实现。

本轮状态和未完成验收见 [视觉升级验收](docs/UI_20261030_ACCEPTANCE.md)。修改前回退副本：`outputs/ui-baseline-20261030/source.zip`。

样式开发：`npm ci --prefix ui --ignore-scripts`，然后 `node scripts/build-ui.mjs`。依赖仅用于编译；页面从本地读取已打包样式，不依赖CDN。通常预览继续运行 `node scripts/build-prototype.mjs` 和 `node scripts/preview-experience.mjs`。

本目录继续在 `joycode-cloud-candidate` 上开发，未发布 JoyCode，也未更新旧 Sites。本轮将主要操作移到中央卡，上传后按需请求AI辅导；修复独立重跑幂等、DTA失败恢复、DID前置检查和教学软件标识。

- 计算范围仅 OLS、双向固定效应、同批 DID；默认 StatsPAI/Python，浏览器 R 为主动选择的备用。Python 结果不标为 Stata 执行。
- DTA 数值码、中文标签、扩展缺失类别和日期格式保留；标签来自文件，未独立核实。未知单位不阻挡有效普通回归。
- 本机 Stata 两次批准继续保留，本轮没有改变旧站或用户助手的运行配置。
- 本地真实计算、独立数值参考、接口与部分真实浏览器链路通过；CSV/DTA完整浏览器上传、实体手机、200%缩放全链路、新手试用和完整PDF下载核验仍待补证。
- 原始材料、规范化数据和导入侧车分别保存；账号长期保留、练习最后活动七天到期。原书、学生数据与密钥不进入源码包。

本轮修改、证据与限制见 [本轮精简与补缺验收](docs/NOVICE_20261029_ACCEPTANCE.md)。

前轮详情：[优化内容说明](docs/EXPERIENCE_20261022_CHANGES.md) 和 [逐项验收报告](docs/EXPERIENCE_20261022_ACCEPTANCE.md)。当前电脑预览：在本目录运行 `node scripts/build-prototype.mjs`，再运行 `node scripts/preview-experience.mjs`，打开 `http://127.0.0.1:18843/`。该辅助脚本复用本机既有 Python 环境；跨机器部署配置见 [部署说明](deploy/joycode/README.md)，尚未验收通用安装。

`.openai/hosting.json` 仅保留构建需要的兼容绑定，不关联旧 Sites，也不表示 JoyCode 已部署。

---

## 历史资料

[历史交付与验收索引](docs/HISTORY_ARCHIVE.md)。历史结论仅适用于对应版本。
