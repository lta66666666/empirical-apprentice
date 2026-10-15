# Windows 本机计算助手（试验版）

## 当前电脑快速开始

保持 Trae 与 Stata MCP 扩展运行，命令面板执行 `Stata: Test MCP Server Connection`。Codex 已注册的连接不需重复添加；若出现 `No valid session ID provided`，先重启 Codex 刷新客户端连接，不要重复配置同名连接。

当前电脑已准备好独立 Python 环境，在项目根目录运行：

```powershell
.\local_stata\start.ps1 -StataHome "D:\Program Files\Stata18"
```

打开 http://127.0.0.1:8767/ ，网站地址填写 `https://empirical-apprentice-webr-trial.liskyler9.chatgpt.site`。进入网页“边分析边学 → 提交材料 → 使用本机 Stata / Python（试验）”，输入配对码。本机选择文件后，在网页核对方案并提交。

助手准备真实模板后，网页对话区自动显示核心命令。点击命令或语法片段，左侧显示说明；窄屏打开知识阅读窗口。字段别名与衍生变量均可展开核对。代码区只读，完整脚本仍在本机批准，点击讲解不会运行代码。

本机批准运行、再次批准上传结果摘要后，网页显示“实际 Stata 结果整理视图”。点击样本量、系数、标准误或区间可继续学习。阅读记录只表示看过，不计作答或掌握。通用代码和 Python 不冒充本次 Stata 模板教学。

下载 ZIP 的其他用户需先按下文安装；压缩包不包含 Python 运行时、Stata 或许可证。

## 安装与启动

1. 准备 Python **3.11 64位**。真实 Stata 需要有效安装和许可；当前模板要求 Stata18。
2. 在 PowerShell 运行 ./setup.ps1 -Python 你的Python311完整路径。依赖安装在本目录 .venv，使用固定源码和 requirements.lock。
3. 运行 ./start.ps1 -StataHome 'D:/Program Files/Stata18'，替换为自己的目录。无需修改全局 PATH 或 Codex 配置。
4. 打开 http://127.0.0.1:8767/，填写网站 HTTPS 根地址，生成配对码；登录网站，在当前练习的本机计算入口输入配对码。
5. 本机选择 CSV/TSV。只发送字段、行数、缺失摘要及哈希，不发送原始行。
6. 网页明确选择真实 Stata 或 StatsPAI Python，核对方案再提交。默认桥接器仍为旧 MCP：保持编辑器扩展和 localhost:4000 在线。stata-code 可独立调用 PyStata，无需编辑器。
7. 本机核对软件、桥接器、全部最终代码、固定适配器、参数、输入和目录，再批准执行。勾选对照才顺序运行两套，每个引擎最多120秒。
8. 查看拟上传 JSON，另行批准上传。原始输入、日志、原生结果及 ZIP 保存在 %LOCALAPPDATA%/EmpiricalApprentice/tasks；网站下载不含原始数据。

## 能力与边界

- 三方法：OLS、个体与年份固定效应、同批多时期 DID。Python DID 显式生成交互项并用原生 sp.fast.feols，不使用自动 DID 分派。
- StatsPAI 是 Python 计算，不操控 Stata.exe；stata-code 和旧 MCP 才执行真实 Stata。
- 通用 Stata 代码仍为试验；不接受远端任意 Python 代码。
- 固定源码：StatsPAI1.39.5 9f12d999d23a5bc2f2fa5fca38fe498aeea38752；stata-code0.17.0 f75aa7c7ec7270cedc7e91ebbf433a5384a575d5。MIT 许可证见 licenses/。
- OLS 模拟配置通过数值对照。聚类固定效应和 DID 的自由度、修正不同，显示“无法比较”；不自动择优。数值一致不证明因果。
- 本机依赖可用不等于验收完成。公网、浏览器、第二台电脑和休眠恢复独立验收，通过前不标为正式可用。

代码以本机账号权限执行；工作目录不是权限沙箱。仅批准自己理解的内容。4000、8767不开放公网。不要分享 connection.json 或含原始输入的复现包。断网不等于计算停止；重启不自动重跑。重启后先核对所属进程确已停止再重新提交。
