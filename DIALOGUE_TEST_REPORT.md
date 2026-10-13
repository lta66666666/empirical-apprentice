# 边分析边学：逐项验收报告

日期：2026-10-13。
## 本地已通过

| 验收 | 证据 | 范围 |
|---|---|---|
| 普通提问无自动修改／引导、白名单提案 | dialogue-regression.mjs | 实际Worker、SQLite，模型响应受控 |
| 学生编辑后应用、未自动核实、同编号幂等 | dialogue-regression.mjs | 实际持久状态 |
| 过期建议、未知行动、账号隔离 | dialogue-regression.mjs | 实际拒绝响应 |
| 三方法上下文知识 | dialogue-regression.mjs | 当前草稿、字段与未执行标识传入；不是数值运行 |
| 概览、两个上部容器、当前轮行动、唯一当前任务 | dialogue-dom-regression.mjs | JSDOM＋实际Worker；不是浏览器像素验收 |
| 预览编辑应用、报告往返、明确开始／暂停／继续引导 | dialogue-dom-regression.mjs | 实际DOM事件与持久接口 |
| 教学材料正文、无全文复制、公式编辑预览 | dialogue-dom-regression.mjs | 实际DOM |
| 模拟教学数据上的候选字段填入，不勾选执行 | dialogue-dom-regression.mjs | 实际模拟输入；模型受控 |
| 正式解释发送即提交、两次修订与报告一致 | dialogue-dom-regression.mjs | 实际解释接口；完成结果为测试夹具 |
| 快捷知识问答不误提交学生成果 | dialogue-dom-regression.mjs | 实际持久结果记录 |
| 原课程、导航、迟到回复、草稿冲突、文件乱序、退出失败 | interaction-dom-regression.mjs、interaction-regression.mjs | 原有核心回归 |
| 原密码与账号隔离、首页只有两入口 | auth-module-smoke.mjs、module-dom-smoke.mjs | 实际认证与DOM |
| 模型省略、无效方法、失败回退 | model-unit.mjs、model-evidence-smoke.mjs | 单元及隔离本地HTTP |
| 草稿、MD/JSON/ZIP版本、助手确认／批准／上传门槛 | drafts-smoke.mjs、local-pairing-smoke.mjs | 隔离HTTP协议，非实际MCP运行 |
| webR取消与截止时限 | webr-lifecycle-regression.mjs | 运行时模拟，不是实际网络下载或数值执行 |

本地结构化证据：outputs/dialogue-regression.json、outputs/dialogue-dom-regression.json。测试使用隔离数据，不改真实学生任务。

## 界面证据与待验收

重构前真实浏览器 AX 状态及窄屏截图已在本对话取得，能看到上部旧表单、复制的知识回复与折叠当前轮。浏览器工具单次调用约55–68秒，仍需取得发布后截图和真实操作结果。
390/768/1366px、200%放大、键盘、减少动画、真实手机软键盘与长表格暂不能用DOM替代。
三方法真实计算、本机Stata实际批准执行、完整中文PDF分页及公网四种下载保持独立验收。上一轮用户“导学无异常”不扩展为本轮分析模块通过。

## 发布与结论

V25 已发布，部署状态 succeeded，Sites 源码提交 4f5e632b2adf578e572ceb6de24ef98b341daed3。

公网 15 项实际 HTTP 检查通过：注册、控制器加载、实际模型补问与建议、预览后应用、同编号重试、引导启动／暂停恢复、上下文知识、未知行动拒绝及持久对话报告。持久交互记录中的实际模型标识：deepseek-flash；候选提示词 ea-candidate-v4-dialogue。测试练习已删除，会话已退出。证据：outputs/public-dialogue-acceptance.json，脚本 scripts/public-dialogue-acceptance.ps1。

自动审批拒绝刷新已有分析页，理由为可能丢失未保存输入。已保留旧页；创建独立验收标签后通道超时，未获得发布后截图和完整页面点击证据。已请求用户补人工验收。

GitHub同步包含本节和公网验收脚本，属于发布后的证据补充，V25运行代码不因此改变。
当前不声明“对话驱动的全链路已通过真实验收”。
