# 全站美化实现方案与资源使用说明

> 日期：2026-11-27 · 范围：实证学徒全部页面 · 原则：能力文案零改动、页面结构与功能逻辑不变、性能不回退。

## 1. 资源选型与筛选结论

筛选标准：与现有技术栈（原生 HTML/CSS/JS + Node 服务端）兼容、轻量无冗余、符合现代设计规范、社区维护活跃、无版权风险。

| 类别 | 选型 | 体积（gzip 后） | 许可 | 筛选理由 |
|---|---|---|---|---|
| 动画库 | GSAP 3.13.0（本地 vendor，非 CDN） | ~23KB | Standard "no charge"（全项目含商用免费） | 维护最活跃的动画库；本地 vendor 化不产生第三方请求，nginx gzip 同源加载 |
| 图标 | 内联 SVG（Lucide 路径风格） | 0（按需内嵌） | MIT | 已有体系，零运行时成本，无额外请求 |
| 配色方案 | `--ea-*` 设计 token 扩展 | 0 | 自建 | 与现有青绿主色 #087e75 同族调和，补语义色板 |
| 组件库 | 不新增；Bootstrap 已 vendored + 自建 components.css | 0 | 已有 LICENSE | React/Vue 生态组件库与技术栈不兼容 |
| 字体 | 系统字体栈 | 0 | 系统自带 | 不引入 webfont，零网络成本 |

结论：唯一新增运行时依赖是 GSAP（本地 vendor），其余全部基于现有体系纯 CSS 实现。

## 2. 实施内容

### 2.1 设计 token 扩展（static/ui/polish.css）

- 中性阶：`--ea-surface`（卡片面）、`--ea-ink-strong/soft`（文字层级）
- 阴影阶：`--ea-shadow-sm/md/lg`（按层级递进）
- 圆角阶：`--ea-radius-sm/md/lg`（10/14/22px）
- 语义色：success/warning/danger/info 四组（含 soft 底、line 边框），与青绿主色同族调和

### 2.2 统一视觉（polish 覆盖层，全页最后加载）

- 表格：斑马纹 `#f2f9f6`、表头渐变底、行悬浮反馈、数字等宽对齐
- 卡片：统一边框 + 圆角（不覆盖各页语义色块背景）
- 徽章：统一胶囊体系 + 语义色变体（bg-success 等 Bootstrap 类自动映射）
- 按钮：主按钮渐变 + 悬浮光晕 + 按压下沉；焦点环沿用主题
- 质感：文本选区色、细滚动条、details 指示色、dialog 渐入动画
- 无障碍：全部交互态尊重 `prefers-reduced-motion`；交互卡片悬浮仅用 transform/box-shadow

### 2.3 动效层（static/ui/motion.js + GSAP）

- 入场编排：`data-ea-rise` 元素自下而上淡入，同组 70ms 交错（首页 intro/卡片组、登录卡片等）
- 降级保障：`prefers-reduced-motion` 或 GSAP 缺失时完全跳过；隐藏态仅在 JS 就绪后生效（`html.ea-anim-ready`），**无 JS 时内容永远可见**
- 数值滚动：`data-ea-count` 从 0 滚动到目标值（按小数位保留），当前未挂载（演示页数值由 JS 动态生成，避免触碰功能脚本）

### 2.4 页面接线清单

| 页面 | polish.css | GSAP+motion.js | 入场动画钩子 |
|---|---|---|---|
| /login（auth.html） | ✓ | ✓ | auth-shell |
| /（home.html） | ✓ | ✓ | 首页 intro + 两张入口卡 |
| /learn（index.html） | ✓ | ✓ | —（工作台不做整页入场） |
| beginner-demo / judge-guide / random-did / real-data / local-assistant-guide / 404 | ✓ | ✓ | — |
| teaching/handbook.html（学习手册 iframe） | ✓（相对路径） | ✓ | — |

### 2.5 CI 守卫扩展（verify-site-integrity.mjs，新增 10 项）

- GSAP vendor 存在且 LICENSE 齐备、体积 sanity（60–100KB）
- polish/motion 资产存在；四个核心页面接线完整
- motion.js 必须包含 `prefers-reduced-motion` 降级
- 全部 HTML 禁止 `<script src="https?://…">` 外部 CDN 运行时（性能与可靠性红线）

## 3. 性能保障

- 新增网络资产仅 2 个（gsap.min.js ~23KB gzip、motion.js <2KB、polish.css <6KB），全部同源 + nginx gzip + 长缓存
- 动效仅作用于 `transform/opacity`（合成器线程，不触发重排）
- 无 webfont、无图标字体、无外部 CDN 请求
- 旧 CSS 未重写（815 处硬编码色值保留原状），覆盖层以最小侵入方式生效

## 4. 测试验证

- **CI 门禁**：`npm run ci` 全量 120 项通过（含新增 10 项守卫）
- **自动化审计**（Edge headless CDP，每页）：无重复 ID、无未标注按钮/输入、无缺 alt 图片、无正 tabindex、`scrollWidth == innerWidth`（无横向溢出）
- **响应式**：1280px 桌面 + 390px 移动端截图双端验证；移动端单列布局、触控目标 ≥44px 保持
- **浏览器兼容**：全部样式为现代浏览器标准特性（CSS 变量/`@media(prefers-reduced-motion)`/`::selection`/`dialog[open]` 动画），Chrome/Edge/Firefox/Safari 均支持；实测环境为 Edge Chromium，Safari/Firefox 未在真机验证，如实说明
- **线上冒烟**：post-deploy-smoke 0 失败

## 5. 第二轮精修（2026-11-27 · polish 层）

- **对比度补足（WCAG AA）**：`--ea-muted` #587071→#4e6667；首页 wordmark/辅助行/入口卡次要行逐项加深至 ≥4.5:1；焦点环 #278b80→#1b6e65（非文本对比 ≥3:1）；登录页深绿面板步骤卡描述 #cfe4dd（实测约 7.9:1）、底部说明 #b9d4cb
- **图案精修**：首页网格纹理透明度 4%→8%（可见但不干扰）、密度统一 44px、遮罩渐变收窄；入口卡光晕与登录卡片薄荷晕染柔化
- 原则不变：全部经 polish 覆盖层实现，旧 CSS 未动，结构与文案零改动

## 6. 资源使用说明

- **升级 GSAP**：`npm pack gsap@<版本>` → 替换 `static/vendor/gsap/gsap.min.js` → 更新 `static/vendor/gsap/LICENSE` → 跑 `npm run ci`（体积 sanity 60–100KB 会自动校验）
- **新增动效**：给目标元素加 `data-ea-rise`（可同值分组交错）；数值滚动加 `data-ea-count="0.774"`
- **关闭全部动效**：系统开启"减少动态效果"，或给 `<html>` 加 `motion-reduced` 类（主题已内置该开关样式）
- **新增语义色**：`var(--ea-success/warning/danger/info)` 及对应 `-soft/-line` 变体；徽章直接用 `.badge bg-success` 等 Bootstrap 兼容类
- **红线提醒**：polish 层不得加入任何文案；改动后必须跑 `npm run ci` 并重新部署
