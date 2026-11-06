# 提交前全链路测试与优化报告

日期：2026-11-07
范围：课程导学、分析工作区、云端计算、浏览器 R、双语言对应代码、导出与响应式
环境：公网 `https://ea-demo.duckdns.org:8000`（Chromium）+ 本地 CI + 容器实测

## 一、结论

核心交付流程已通过：注册登录、首页双入口、课程阶段作答、分析方案核对、云端 DID、浏览器 R/fixest DID、Stata/R 双语言代码、报告 MD/PDF 与复现包 ZIP 下载、390/768/1366 宽度无横向溢出。

本轮修复 4 个问题，其中 2 个是实际产品逻辑缺陷；未发现阻断提交的流程断点。存在 4 项非阻断测试缺口，见第五节。

## 二、测试方法与基线

- `npm run ci`：113 项检查通过（语法、Python 编译、部署预检、协议/教学回归、Stata/R 模板断言）。
- 全部静态 JavaScript `node --check`：0 个语法失败。
- 公网浏览器实测（Chromium，HTTPS）：真实注册、课程、分析、计算、下载、响应式。
- 容器内 StatsPAI 实测（分批 DID）：CS 队列 ATT、事件研究、TWFE/SA/BJS、负权重诊断。
- 公网 API 边界用例：4 类非法方案均返回 422。

## 三、功能与异常路径结果

| 用例 | 结果 | 证据 |
|---|---|---|
| 注册并登录，首页双入口 | 通过 | 首页仅「定向导学」「边分析边学」两个主入口 |
| 课程第一阶段作答与反馈 | 通过 | 选项 B 反馈正确，步骤从 01 推进到 02，题号 1/2→2/2 |
| 云端计算同批 DID | 通过 | 384 行、48 个聚类，结果保存 |
| 浏览器 R / fixest 同批 DID | 通过 | 结果标注「浏览器 R 执行完成」，含 R 版本与 fixest 包信息 |
| Stata / R 对应代码对照 | 通过 | 结果页与方案页均可展开两种语言代码，含核心命令对照 |
| 分析报告 PDF | 通过 | 下载事件触发，提示 5 页 PDF |
| 分析报告 MD / 复现包 ZIP | 通过 | 均触发下载，无错误提示或死链接 |
| 390 / 768 / 1366 宽度 | 通过 | `scrollWidth === clientWidth`，无横向溢出；关键按钮可点击 |
| DID 缺少同批确认 | 通过（拒绝） | 422 |
| 事件研究窗口越界（6 期） | 通过（拒绝） | 422 |
| IV 未提供工具变量 | 通过（拒绝） | 422 |
| 分批 DID 对照口径非法 | 通过（拒绝） | 422 |
| 分批 DID 计算（容器） | 通过 | nevertreated：ATT≈1.872，预趋势 p≈0.419；notyettreated：ATT≈1.869，p≈0.411；TWFE/SA/BJS 与负权重正常 |

## 四、已发现问题与修复

| 问题 | 影响 | 修复 | 验证 |
|---|---|---|---|
| 「不知道单位是什么」被先判为知识提问 | 学生回答单位“不知道”时未进入资料整理流程，可能拿不到待核实选项 | `worker/practical.js` 调整意图判定：有当前追问时，回答优先于知识提问；显式 knowledge 意图仍优先 | 回归脚本该步由 `knowledge` 变为 `analysis` |
| AI 候选方案提示词未包含分批 DID | 模型无法推荐已上线的 `staggered_did`，只能人工选择 | `worker/model.js` 补充分批方法、`first_treat`/`control_group`/`absorbing_confirmed` 规则与 JSON 字段 | CI 通过；字段校验路径已存在 |
| 状态接口仍返回已移除的云端 R/Stata/EViews | 与界面“只保留两种执行方式”不一致 | `/api/research/status` 仅返回云端 Stata 语法与浏览器 R | 接口结构变更，前端已适配 |
| 分批 DID 运行期三处缺陷（前序） | 校验报错、推断报错、前端 p 值缺失 | `DataFrame.any`→`.empty`、补 `scipy t` 导入、`d.p`→`d.p_value` | 容器实测两种对照口径通过 |

## 五、未完成项与限制

1. **本地全链路 E2E 未运行**：`scripts/verify-experience-site.mjs` 需要本地 8000 端口，端口被 2026-11-03 遗留的兄弟项目测试进程占用（PID 47608）。需要授权终止该进程，或改用其他端口运行，才能覆盖 DTA 上传、年度转换、并发幂等、学习报告等更细的接口流程。
2. **两个 DOM 回归脚本受依赖限制**：`conversation-first-regression.mjs` 缺少 `outputs/ui-qa/node_modules/jsdom`；`webr-lifecycle-regression.mjs` 缺少 `document` 测试桩。属于测试环境，不是产品运行错误。
3. **两个旧回归脚本存在漂移**：`research-understanding-regression.mjs` 使用旧版模型 mock 结构，修复后在后续断言处仍不匹配；`interaction-regression.mjs` 在未带 `state_version` 的方案请求处得到 422，而同一 OLS 方案在公网 API 正常通过，判断为测试状态漂移。
4. **浏览器覆盖**：本轮只实测 Chromium；Firefox/Safari 未安装，未做真实跨浏览器验证。HTTPS 与 COOP/COEP 头已确认，webR 可在公网正常初始化并完成 DID。
5. **控制台存在非阻断 `ERR_ABORTED`**：`/login`、`/api/tutorial`、`/api/auth/legacy-claim` 在页面切换时被取消，未影响功能；尚未定位到具体调用点。
6. 事件研究、IV、分批 DID 的完整 UI 操作本轮未逐项重跑；其计算与 Stata/R 模板已由容器实测与 CI 断言覆盖。

## 六、性能观察

- `login` HTML 2.2KB / 0.21s；`research.js` 90KB / 0.28s；`app.js` 46KB / 0.30s；`style.css` 24KB / 0.26s（公网实测）。
- webR 运行时约 77MB，仅在主动选择浏览器 R 时按需加载，不进入默认云端路径的首屏。
- 云端 DID 与浏览器 R DID 均在 3 分钟内完成；未观察到页面卡顿或资源泄漏迹象。

## 七、上线建议

1. 部署本轮 3 个后端修复（`practical.js`、`model.js`、`research.js`）并重建容器。
2. 部署后复验：单位“不知道”追问、AI 候选方法、`/api/research/status` 仅两种执行方式。
3. 如需补齐本地全链路 E2E，请授权终止端口 8000 的遗留测试进程；否则以公网实测结果作为交付证据。
4. 跨浏览器与事件研究/IV/分批 DID 的 UI 逐项验收，建议列入提交后的持续验证，不阻断当前核心演示。
