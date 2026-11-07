// Generated from static/teaching/knowledge-index.json. Do not edit by hand.
export const knowledgeExtra = [
 {
  "id": "kb_did",
  "title": "双重差分 DID",
  "section": "教材知识卡",
  "keywords": [
   "DID",
   "双重差分",
   "倍差法",
   "diff-in-diff"
  ],
  "content": "**核心思想：** DID 用“处理组前后变化 − 对照组前后变化”识别政策效应；前提是没有政策时两组趋势可比（平行趋势）。\n**2×2 表：** (处理后−处理前) − (对照后−对照前)。\n**回归形式：** Y_it = α + β·Treat_i×Post_t + γ·Treat_i + δ·Post_t + ε_it；面板中通常用个体与年份双向固定效应替代两组主效应。\n**关键假设：** 平行趋势、无预期效应、处理时点明确、对照组研究期内未受同一政策影响（SUTVA）。\n**Stata：** regress y treat##post, vce(cluster id)；面板用 xtset id year 后 xtreg y i.treat##i.post, fe vce(cluster id)。\n**误区：** 显著不等于因果；两组均值线看起来平行不等于平行趋势检验通过；聚类层级应接近处理分配层级。",
  "source": "本课程阶段 5–6；主线手算小实验",
  "version": "2026-11-07",
  "review_status": "教材摘要与教学整理，页码待逐页复核",
  "methods": [],
  "task_stages": [
   "prepare",
   "plan",
   "execute",
   "explain"
  ],
  "topic": "research_concept",
  "accessed_at": "2026-11-07"
 },
 {
  "id": "kb_parallel_trends",
  "title": "平行趋势",
  "section": "教材知识卡",
  "keywords": [
   "平行趋势",
   "平行趋势检验",
   "事前趋势",
   "pre-trends",
   "pre-trend test",
   "共同趋势",
   "事件研究检验"
  ],
  "content": "**识别假设：** 没有政策时，处理组与对照组的潜在结果趋势应一致。它不是“检验通过证书”，而是 DID 解释因果的前提。\n**检验步骤：** 1) 明确政策实施期，构造相对时间；2) 通常省略政策前一期作为基准；3) 事件研究回归中观察政策前各期系数是否接近 0；4) 对政策前系数做联合检验（Stata: testparm 或 test）；5) 同时报告图形、点估计与置信区间。\n**稳健性：** 更换基准期或窗口、安慰剂政策时点、调整对照组、加入地区趋势。\n**常见误区：** 不拒绝原假设不等于平行趋势成立（可能功效不足）；政策前系数显著也不必然否定 DID，但要解释预期效应、政策前调整与对照组污染。\n**分批 DID：** TWFE 事件研究可能用已处理单位作对照；应使用 never-treated 或 not-yet-treated（如 csdid、Sun–Abraham）。",
  "source": "本课程阶段 7",
  "version": "2026-11-07",
  "review_status": "教材摘要与教学整理，页码待逐页复核",
  "methods": [],
  "task_stages": [
   "prepare",
   "plan",
   "execute",
   "explain"
  ],
  "topic": "research_concept",
  "accessed_at": "2026-11-07"
 },
 {
  "id": "kb_twfe",
  "title": "双向固定效应",
  "section": "教材知识卡",
  "keywords": [
   "双向固定效应",
   "TWFE",
   "个体固定效应",
   "年份固定效应"
  ],
  "content": "**模型：** Y_it = α_i + λ_t + βX_it + ε_it，同时吸收个体不随时间变化的差异和所有单位共同经历的时间冲击。\n**估计：** 组内变换先去个体均值再去年份均值，等价于 LSDV。\n**解释：** β 来自同一单位随时间的变化，识别“偏离个体均值后的 X–Y 关系”，不是横截面差异。\n**Stata：** xtset id year；xtreg y x, fe vce(cluster id)；高维固定效应用 reghdfe y x, absorb(id year) vce(cluster id)。\n**局限：** 不能消除随时间变化的遗漏变量；控制中介或碰撞变量会引入偏误；单向 FE 与双向 FE 的解释不同。",
  "source": "本课程阶段 4–6；进阶阅读 Callaway & Sant'Anna",
  "version": "2026-11-07",
  "review_status": "教材摘要与教学整理，页码待逐页复核",
  "methods": [],
  "task_stages": [
   "prepare",
   "plan",
   "execute",
   "explain"
  ],
  "topic": "research_concept",
  "accessed_at": "2026-11-07"
 },
 {
  "id": "kb_event_study",
  "title": "事件研究",
  "section": "教材知识卡",
  "keywords": [
   "事件研究",
   "动态效应",
   "event study",
   "事件时间"
  ],
  "content": "**用途：** 把政策效应拆成政策前后每一期的动态系数，并可视化政策前趋势。\n**设定：** 生成相对时间 k=t−E_i，事件研究回归 Y_it=α_i+λ_t+Σβ_k·1(k)_it+ε；通常省略 k=−1 作为基准。\n**读法：** k<0 的 β_k 应接近 0 且联合不显著；k≥0 反映动态效应；同时看置信区间，不只盯 p 值。\n**Stata：** 可用 eventdd、eventstudyinteract 或 csdid；联合检验用 testparm pre_*。\n**注意：** 基准期选择会影响所有系数；政策前系数显著要解释预期效应；TWFE 事件研究在分批实施下可能偏误。",
  "source": "本课程阶段 7；教学示意图",
  "version": "2026-11-07",
  "review_status": "教材摘要与教学整理，页码待逐页复核",
  "methods": [],
  "task_stages": [
   "prepare",
   "plan",
   "execute",
   "explain"
  ],
  "topic": "research_concept",
  "accessed_at": "2026-11-07"
 },
 {
  "id": "kb_clustering",
  "title": "聚类标准误",
  "section": "教材知识卡",
  "keywords": [
   "聚类",
   "cluster",
   "标准误",
   "稳健标准误"
  ],
  "content": "**何时聚类：** 误差在更高层单位内相关（同一城市多年、同一学校多学生）。聚类层级应接近处理分配层级。\n**代价：** 聚类数少（常见 <30–50）时常规聚类标准误偏乐观；需要 wild cluster bootstrap 或 CR2 等修正。\n**Stata：** regress y x, vce(cluster id)；xtreg ..., fe vce(cluster id)；reghdfe ..., vce(cluster id)；双向聚类需专门命令。\n**误区：** robust 只处理异方差，不处理组内相关；聚类数不是越多越好，而是覆盖误差相关层级。",
  "source": "本课程阶段 4；分析方案窗口",
  "version": "2026-11-07",
  "review_status": "教材摘要与教学整理，页码待逐页复核",
  "methods": [],
  "task_stages": [
   "prepare",
   "plan",
   "execute",
   "explain"
  ],
  "topic": "research_concept",
  "accessed_at": "2026-11-07"
 },
 {
  "id": "kb_log_coef",
  "title": "对数系数怎么解释",
  "section": "教材知识卡",
  "keywords": [
   "对数",
   "log",
   "ln",
   "系数解释",
   "百分比"
  ],
  "content": "**半弹性（y 取对数，x 不取）：** β≈x 增加 1 单位时 y 变化的百分比；精确值 100×(exp(β)−1)%。\n**弹性（两边都取对数）：** β≈x 增加 1% 时 y 变化的百分比。\n**y 不取对数、x 取对数：** β 表示 x 增加 1% 时 y 变化的绝对量（约 β/100 单位）。\n**注意：** 对数变换会改变样本（y=0 被排除）；系数大小依赖单位；不能把 log 系数直接说成“增加 β 元”。",
  "source": "本课程阶段 7",
  "version": "2026-11-07",
  "review_status": "教材摘要与教学整理，页码待逐页复核",
  "methods": [],
  "task_stages": [
   "prepare",
   "plan",
   "execute",
   "explain"
  ],
  "topic": "research_concept",
  "accessed_at": "2026-11-07"
 },
 {
  "id": "kb_ci_pvalue",
  "title": "置信区间与 p 值",
  "section": "教材知识卡",
  "keywords": [
   "置信区间",
   "p值",
   "显著",
   "区间",
   "95%"
  ],
  "content": "**p 值：** 在原假设与模型假设下，观察到当前或更极端结果的概率；不是“原假设为真的概率”。\n**置信区间：** 点估计 ± 临界值×标准误；95% CI 不跨 0 与双侧 5% 检验通常一致，但区间更能表达不确定性。\n**报告：** 系数、标准误、CI、样本量、聚类/自由度设置；不要只报星号。\n**误区：** p>0.05 不等于效应为 0；多重比较需校正；统计显著不等于经济显著或因果。",
  "source": "本课程阶段 7；ASA 统计解释声明",
  "version": "2026-11-07",
  "review_status": "教材摘要与教学整理，页码待逐页复核",
  "methods": [],
  "task_stages": [
   "prepare",
   "plan",
   "execute",
   "explain"
  ],
  "topic": "research_concept",
  "accessed_at": "2026-11-07"
 },
 {
  "id": "kb_missing",
  "title": "缺失值怎么处理",
  "section": "教材知识卡",
  "keywords": [
   "缺失",
   "缺失值",
   "补值",
   "NA",
   "空值"
  ],
  "content": "**机制：** MCAR（完全随机缺失）、MAR（条件随机缺失）、MNAR（非随机缺失）。处理方式取决于机制。\n**常用：** 完整案例删除简单但可能偏；多重插补适合 MAR；MNAR 需要敏感性分析或模型。\n**Stata：** misstable summarize；mi set；mi register imputed；mi impute mvn 或 chained；mi estimate。\n**注意：** 不要用均值填补做正式推断；插补模型应包含分析变量与结果；报告缺失率与处理规则。",
  "source": "本课程阶段 4",
  "version": "2026-11-07",
  "review_status": "教材摘要与教学整理，页码待逐页复核",
  "methods": [],
  "task_stages": [
   "prepare",
   "plan",
   "execute",
   "explain"
  ],
  "topic": "research_concept",
  "accessed_at": "2026-11-07"
 },
 {
  "id": "kb_winsor",
  "title": "缩尾与异常值",
  "section": "教材知识卡",
  "keywords": [
   "缩尾",
   "winsor",
   "异常值",
   "极端值",
   "截尾"
  ],
  "content": "**缩尾：** 把极端值替换为第 p 与 1−p 分位点（如 1%/99%）；截尾则直接删除。\n**何时：** 极端值可能由测量错误或离群导致，但处理规则必须事先确定，不能按结果显著性调整。\n**Stata：** winsor2 y, cuts(1 99) replace；或 egen pct=pctile(y), p(1 99) 后 replace。\n**注意：** 缩尾会改变样本与系数；报告缩尾比例、分位点与稳健性。",
  "source": "数据清洗通用规范",
  "version": "2026-11-07",
  "review_status": "教材摘要与教学整理，页码待逐页复核",
  "methods": [],
  "task_stages": [
   "prepare",
   "plan",
   "execute",
   "explain"
  ],
  "topic": "research_concept",
  "accessed_at": "2026-11-07"
 },
 {
  "id": "kb_psm",
  "title": "倾向得分匹配",
  "section": "教材知识卡",
  "keywords": [
   "PSM",
   "倾向得分",
   "匹配",
   "propensity"
  ],
  "content": "**思想：** 用可观测协变量估计倾向得分，给处理组找相似的对照组，缓解选择偏差。\n**步骤：** 设定处理变量与协变量 → 估计 logit/probit → 匹配（最近邻/半径/核）→ 检查共同支撑与平衡性 → 估计 ATT。\n**Stata：** teffects psmatch (y) (t x1 x2, logit), atet；或 psmatch2 t x1 x2, outcome(y) neighbor(1) common。\n**局限：** 只能处理可观测混杂；共同支撑差、匹配质量差时结果不可信；匹配后标准误需考虑匹配不确定性。",
  "source": "进阶方法阅读",
  "version": "2026-11-07",
  "review_status": "教材摘要与教学整理，页码待逐页复核",
  "methods": [],
  "task_stages": [
   "prepare",
   "plan",
   "execute",
   "explain"
  ],
  "topic": "research_concept",
  "accessed_at": "2026-11-07"
 },
 {
  "id": "kb_scm",
  "title": "合成控制法",
  "section": "教材知识卡",
  "keywords": [
   "合成控制",
   "SCM",
   "单一处理",
   "合成对照"
  ],
  "content": "**适用：** 单一或少数处理单位、较长时间面板，用“合成对照组”拟合处理单位政策前的轨迹。\n**步骤：** 选择未受政策影响的 donor pool → 用政策前数据估计权重 → 比较政策后差距 → 安慰剂/排列检验。\n**Stata：** synth、synth_runner（不同实现语法略有差异）。\n**注意：** donor pool 不能包含受同一政策溢出影响的单位；政策前拟合差、权重集中、安慰剂分布都需报告。",
  "source": "进阶案例 case_004",
  "version": "2026-11-07",
  "review_status": "教材摘要与教学整理，页码待逐页复核",
  "methods": [],
  "task_stages": [
   "prepare",
   "plan",
   "execute",
   "explain"
  ],
  "topic": "research_concept",
  "accessed_at": "2026-11-07"
 },
 {
  "id": "kb_rdd",
  "title": "断点回归",
  "section": "教材知识卡",
  "keywords": [
   "断点回归",
   "RDD",
   "门槛",
   "cutoff",
   "McCrary"
  ],
  "content": "**思想：** 在 cutoff 附近处理概率发生跳跃；比较 cutoff 两侧局部样本识别效应。\n**类型：** Sharp RDD（cutoff 决定处理）；Fuzzy RDD（cutoff 只提高处理概率，用 IV）。\n**关键：** 运行变量不能被操纵（McCrary 密度检验）；协变量在 cutoff 处连续；带宽与核函数选择；局部线性回归。\n**Stata：** rdrobust y x, c(cutoff)；fuzzy 用 rdrobust y x, c(cutoff) fuzzy(t)；rddensity 做密度检验。\n**注意：** 远离 cutoff 的样本不能外推；带宽对结果敏感，要报告多种带宽。",
  "source": "进阶案例 case_005",
  "version": "2026-11-07",
  "review_status": "教材摘要与教学整理，页码待逐页复核",
  "methods": [],
  "task_stages": [
   "prepare",
   "plan",
   "execute",
   "explain"
  ],
  "topic": "research_concept",
  "accessed_at": "2026-11-07"
 },
 {
  "id": "kb_iv",
  "title": "工具变量与 2SLS",
  "section": "教材知识卡",
  "keywords": [
   "工具变量",
   "IV",
   "2SLS",
   "弱工具",
   "内生性"
  ],
  "content": "**何时用：** 解释变量与误差相关（内生性），且存在满足相关性与排除性约束的工具变量。\n**2SLS：** 第一阶段用工具变量预测内生变量；第二阶段用预测值回归结果变量；标准误需考虑第一阶段估计。\n**检验：** 第一阶段 F（弱工具，经验上 >10 但仍需谨慎）；过度识别 Sargan/Hansen；内生性 Durbin-Wu-Hausman；排除性约束主要靠理论。\n**Stata：** ivreg2 y (x=z) controls, robust first；ivregress 2sls；weakiv。\n**误区：** 工具变量外生性无法用统计检验证明；弱工具会导致偏误方向不可控；LATE 只识别依从者效应。",
  "source": "进阶方法；同批 2SLS 模板",
  "version": "2026-11-07",
  "review_status": "教材摘要与教学整理，页码待逐页复核",
  "methods": [],
  "task_stages": [
   "prepare",
   "plan",
   "execute",
   "explain"
  ],
  "topic": "research_concept",
  "accessed_at": "2026-11-07"
 },
 {
  "id": "kb_staggered",
  "title": "分批实施与稳健估计",
  "section": "教材知识卡",
  "keywords": [
   "分批",
   "交错",
   "staggered",
   "异质性稳健",
   "负权重"
  ],
  "content": "**问题：** 政策分批实施时，TWFE 会把已处理单位当作对照，产生负权重与偏误；事件研究也可能污染基准。\n**稳健方法：** Callaway & Sant'Anna（csdid）、Sun & Abraham（eventstudyinteract）、Borusyak 等、de Chaisemartin & D'Haultfœuille。\n**选择：** 有 never-treated 时优先 never-treated；没有时用 not-yet-treated；报告不同对照组与估计量的差异。\n**Stata：** csdid y, ivar(id) time(year) gvar(first_treat) method(dripw)；estat event；eventstudyinteract。\n**注意：** 平行趋势仍需检验；不同估计量的目标参数不同，不能混着解释。",
  "source": "进阶阅读；分批实施警示",
  "version": "2026-11-07",
  "review_status": "教材摘要与教学整理，页码待逐页复核",
  "methods": [],
  "task_stages": [
   "prepare",
   "plan",
   "execute",
   "explain"
  ],
  "topic": "research_concept",
  "accessed_at": "2026-11-07"
 },
 {
  "id": "kb_ols",
  "title": "OLS 线性回归与基本假定",
  "section": "教材知识卡",
  "keywords": [
   "OLS",
   "最小二乘",
   "线性回归",
   "regress",
   "古典假定"
  ],
  "content": "**假定：** 线性于参数、随机抽样、无完全共线、零条件均值（或外生性）、同方差（用于常规标准误）。\n**估计：** β=(X'X)^{-1}X'y；残差平方和最小。\n**解释：** β_j 是在其他解释变量不变时，X_j 增加一单位对 y 条件均值的影响。\n**Stata：** regress y x1 x2；异方差稳健 vce(robust)；聚类 vce(cluster id)。\n**注意：** 零条件均值是因果解释的关键；同方差只影响标准误，不影响系数无偏性。",
  "source": "陈强《高级计量经济学及Stata应用》第2版，第3章、第5章；PDF 第28–78页",
  "version": "2026-11-07",
  "review_status": "教材摘要与教学整理，页码待逐页复核",
  "methods": [
   "ols"
  ],
  "task_stages": [
   "plan",
   "execute",
   "explain"
  ],
  "topic": "research_concept",
  "accessed_at": "2026-11-07"
 },
 {
  "id": "kb_hetero",
  "title": "异方差：检验与稳健标准误",
  "section": "教材知识卡",
  "keywords": [
   "异方差",
   "heteroskedasticity",
   "Breusch-Pagan",
   "White",
   "robust"
  ],
  "content": "**后果：** 系数仍可能无偏，但常规标准误错误，t/F 检验失效。\n**检验：** 残差图；Breusch-Pagan/Cook-Weisberg（estat hettest）；White 检验（estat imtest, white）。\n**处理：** vce(robust) 或 vce(cluster)；方差形式已知时可用 WLS/FGLS；不要只看检验 p 值决定是否稳健。\n**Stata：** regress y x, vce(robust)；estat hettest；estat imtest, white。\n**注意：** robust 不解决内生性、遗漏变量或组内相关。",
  "source": "陈强《高级计量经济学及Stata应用》第2版，第7章，PDF 第102页",
  "version": "2026-11-07",
  "review_status": "教材摘要与教学整理，页码待逐页复核",
  "methods": [
   "ols"
  ],
  "task_stages": [
   "plan",
   "execute",
   "explain"
  ],
  "topic": "result_reading",
  "accessed_at": "2026-11-07"
 },
 {
  "id": "kb_autocorr",
  "title": "自相关：检验与 HAC 标准误",
  "section": "教材知识卡",
  "keywords": [
   "自相关",
   "序列相关",
   "DW",
   "Breusch-Godfrey",
   "Newey-West",
   "HAC"
  ],
  "content": "**后果：** 标准误偏小、t 值偏大；但只要解释变量与误差同期无关，系数仍可能一致。\n**检验：** DW（主要适用于一阶、无滞后因变量）；Breusch-Godfrey（bgodfrey）；面板用 xtserial。\n**处理：** Newey-West/HAC 标准误（newey）；FGLS/Prais-Winsten；动态面板用 GMM。\n**Stata：** newey y x, lag(n)；prais y x；xtserial y x。\n**注意：** 时间序列回归要先判断平稳性，避免伪回归。",
  "source": "陈强《高级计量经济学及Stata应用》第2版，第8章，PDF 第115页",
  "version": "2026-11-07",
  "review_status": "教材摘要与教学整理，页码待逐页复核",
  "methods": [
   "ols",
   "panel_fe"
  ],
  "task_stages": [
   "plan",
   "execute"
  ],
  "topic": "result_reading",
  "accessed_at": "2026-11-07"
 },
 {
  "id": "kb_multicollinearity",
  "title": "多重共线性与 VIF",
  "section": "教材知识卡",
  "keywords": [
   "多重共线性",
   "共线性",
   "VIF",
   "collinearity"
  ],
  "content": "**后果：** 系数标准误变大、单个系数不显著，但联合检验可能显著；不影响 BLUE 性质。\n**检验：** VIF（经验 >10 警示）、条件数、相关系数矩阵。\n**处理：** 合并/剔除重复变量、改变模型设定、增加样本；不要仅因 VIF 高就删除有理论意义的变量。\n**Stata：** regress 后 estat vif；collin。\n**注意：** 多重共线性是样本问题，不是内生性；删除变量可能引入遗漏变量偏误。",
  "source": "陈强《高级计量经济学及Stata应用》第2版，第9.6节，PDF 第138页",
  "version": "2026-11-07",
  "review_status": "教材摘要与教学整理，页码待逐页复核",
  "methods": [
   "ols",
   "panel_fe"
  ],
  "task_stages": [
   "plan",
   "execute"
  ],
  "topic": "data_check",
  "accessed_at": "2026-11-07"
 },
 {
  "id": "kb_omitted",
  "title": "遗漏变量偏误与敏感性分析",
  "section": "教材知识卡",
  "keywords": [
   "遗漏变量",
   "OVB",
   "omitted variable",
   "内生性",
   "Oster"
  ],
  "content": "**OVB 公式：** 遗漏变量偏误 = 被遗漏变量的真实系数 × 该变量对已纳入解释变量的回归系数。\n**后果：** 系数方向与大小都可能偏；标准误与显著性不能补救。\n**应对：** 理论控制、固定效应、工具变量、代理变量、敏感性分析（如 Oster 边界）。\n**Stata：** 没有一键修复；可用 psacalc/Oster 做敏感性分析。\n**注意：** 控制变量不是越多越好；控制中介或碰撞变量会引入新偏误。",
  "source": "陈强《高级计量经济学及Stata应用》第2版，第9.1节，PDF 第131页",
  "version": "2026-11-07",
  "review_status": "教材摘要与教学整理，页码待逐页复核",
  "methods": [
   "ols",
   "panel_fe",
   "iv_2sls"
  ],
  "task_stages": [
   "prepare",
   "plan",
   "explain"
  ],
  "topic": "research_concept",
  "accessed_at": "2026-11-07"
 },
 {
  "id": "kb_sample_selection",
  "title": "样本选择、截断与 Heckman",
  "section": "教材知识卡",
  "keywords": [
   "样本选择",
   "Heckman",
   "截断",
   "Tobit",
   "逆米尔斯比"
  ],
  "content": "**截断 vs 选择：** 截断是只观察到某一范围的 y；样本选择是先决定是否进入样本，进入后 y 可观测。\n**Heckman：** 选择方程 + 结果方程，利用排除性约束构造逆米尔斯比；至少一个变量影响选择但不直接影响结果。\n**Stata：** heckman y x, select(sel=z x2)；两步法 heckman ..., twostep。\n**注意：** 排除性约束靠理论；正态误差假设敏感；不要用 Heckman 当万能药。",
  "source": "陈强《高级计量经济学及Stata应用》第2版，第14.4节，PDF 第250页",
  "version": "2026-11-07",
  "review_status": "教材摘要与教学整理，页码待逐页复核",
  "methods": [
   "ols"
  ],
  "task_stages": [
   "prepare",
   "plan",
   "explain"
  ],
  "topic": "research_concept",
  "accessed_at": "2026-11-07"
 },
 {
  "id": "kb_binary",
  "title": "二值选择模型：Logit 与 Probit",
  "section": "教材知识卡",
  "keywords": [
   "Logit",
   "Probit",
   "二值选择",
   "边际效应",
   "margins"
  ],
  "content": "**模型：** Logit/Probit 估计 P(y=1|X)，系数是潜变量尺度，不是概率的边际效应。\n**解释：** 用 margins/dydx 计算平均边际效应；优势比（logit）解释倍数；伪 R² 仅作参考。\n**Stata：** logit y x；margins, dydx(*)；logistic；probit。\n**注意：** 完全分离会导致估计不稳定；稀有事件偏差；固定效应 logit 会丢掉不随结果变化的单位。",
  "source": "陈强《高级计量经济学及Stata应用》第2版，第11章，PDF 第184页",
  "version": "2026-11-07",
  "review_status": "教材摘要与教学整理，页码待逐页复核",
  "methods": [
   "ols"
  ],
  "task_stages": [
   "plan",
   "execute",
   "explain"
  ],
  "topic": "research_concept",
  "accessed_at": "2026-11-07"
 },
 {
  "id": "kb_count",
  "title": "计数模型：Poisson 与负二项",
  "section": "教材知识卡",
  "keywords": [
   "Poisson",
   "泊松",
   "泊松回归",
   "负二项",
   "计数模型",
   "过度分散",
   "发生率比"
  ],
  "content": "**Poisson：** 假定均值=方差；系数解释为发生率比（IRR=exp(β)）。\n**过度分散：** 方差>均值时用负二项回归；检验用 estat gof / dispersion。\n**暴露变量：** 用 offset 或 exposure 处理不同观察时长。\n**Stata：** poisson y x, exposure(t)；nbreg y x；estat gof；margins, dydx(*)。\n**注意：** 零膨胀模型适用于结构性零过多；不要用线性回归处理计数结果。",
  "source": "陈强《高级计量经济学及Stata应用》第2版，第13章，PDF 第224页",
  "version": "2026-11-07",
  "review_status": "教材摘要与教学整理，页码待逐页复核",
  "methods": [
   "ols"
  ],
  "task_stages": [
   "plan",
   "execute",
   "explain"
  ],
  "topic": "research_concept",
  "accessed_at": "2026-11-07"
 },
 {
  "id": "kb_time_series",
  "title": "时间序列：平稳性、单位根与协整",
  "section": "教材知识卡",
  "keywords": [
   "时间序列",
   "平稳性",
   "单位根",
   "ADF",
   "协整",
   "误差修正"
  ],
  "content": "**核心：** 先判断平稳性；非平稳序列直接回归可能产生伪相关。\n**步骤：** 画时序图 → 单位根检验（ADF/DF-GLS/KPSS）→ 差分/去趋势 → ARMA/ARDL → 协整检验（EG/Johansen）→ 误差修正模型。\n**Stata：** tsset date；dfuller；kpss；arima；vecm；newey。\n**注意：** 结构突变、季节性与异常值会影响检验；协整关系要有理论依据。",
  "source": "陈强《高级计量经济学及Stata应用》第2版，第20–22章，PDF 第376页起",
  "version": "2026-11-07",
  "review_status": "教材摘要与教学整理，页码待逐页复核",
  "methods": [
   "ols"
  ],
  "task_stages": [
   "plan",
   "execute",
   "explain"
  ],
  "topic": "research_concept",
  "accessed_at": "2026-11-07"
 },
 {
  "id": "kb_survival",
  "title": "生存分析：Kaplan-Meier 与 Cox",
  "section": "教材知识卡",
  "keywords": [
   "生存分析",
   "Cox",
   "Kaplan-Meier",
   "风险比",
   "删失"
  ],
  "content": "**核心：** 分析“事件发生时间”，需处理右删失。\n**方法：** Kaplan-Meier 生存曲线；Cox 比例风险模型（半参数）；参数模型（Weibull 等）。\n**解释：** Cox 系数 exp(β) 是风险比（hazard ratio）；比例风险假设需检验。\n**Stata：** stset time, failure(event)；sts graph；stcox x1 x2；estat phtest；streg。\n**注意：** 删失机制、时间起点、竞争风险都会影响结果。",
  "source": "杨维忠、张甜《Stata统计分析从入门到精通》第15章，PDF 第688页",
  "version": "2026-11-07",
  "review_status": "教材摘要与教学整理，页码待逐页复核",
  "methods": [
   "ols"
  ],
  "task_stages": [
   "plan",
   "execute",
   "explain"
  ],
  "topic": "research_concept",
  "accessed_at": "2026-11-07"
 },
 {
  "id": "kb_factor",
  "title": "因子分析与主成分分析",
  "section": "教材知识卡",
  "keywords": [
   "因子分析",
   "主成分",
   "PCA",
   "载荷",
   "KMO",
   "varimax"
  ],
  "content": "**因子分析 vs PCA：** 因子分析假设潜在因子解释变量间相关；PCA 是降维，不区分共同/独特方差。\n**步骤：** 相关性/KMO/Bartlett 检验 → 提取因子（主轴/最大似然）→ 旋转（varimax/promax）→ 解释载荷 → 计算因子得分。\n**Stata：** factor v1-v10, pcf；rotate, varimax；predict f1 f2；pca。\n**注意：** 样本量、变量方向与量表一致性；载荷小于 0.4 的项需谨慎解释。",
  "source": "杨维忠、张甜《Stata统计分析从入门到精通》第11章，PDF 第459页",
  "version": "2026-11-07",
  "review_status": "教材摘要与教学整理，页码待逐页复核",
  "methods": [
   "ols"
  ],
  "task_stages": [
   "plan",
   "execute",
   "explain"
  ],
  "topic": "research_concept",
  "accessed_at": "2026-11-07"
 },
 {
  "id": "kb_mediation",
  "title": "中介效应：机制检验的边界",
  "section": "教材知识卡",
  "keywords": [
   "中介效应",
   "mediation",
   "间接效应",
   "Baron-Kenny",
   "bootstrap"
  ],
  "content": "**中介效应：** X→M→Y，检验间接效应 a×b；常用 Baron-Kenny 三步，但逐步回归不是因果识别。\n**现代做法：** 用 bootstrap 检验间接效应；结构方程/因果中介分析；需满足序贯可忽略性等假设。\n**Stata：** sem (M<-X)(Y<-M X)；bootstrap；medeff/medsem（用户命令）。\n**注意：** 中介变量若受结果反向影响、或存在未观测混杂，间接效应不可识别；不能把统计中介当成因果机制。",
  "source": "陈强《计量经济学及Stata应用》；杨维忠《Stata统计分析从入门到精通》回归章节",
  "version": "2026-11-07",
  "review_status": "教材摘要与教学整理，页码待逐页复核",
  "methods": [
   "ols",
   "panel_fe"
  ],
  "task_stages": [
   "prepare",
   "plan",
   "explain"
  ],
  "topic": "research_concept",
  "accessed_at": "2026-11-07"
 },
 {
  "id": "kb_moderation",
  "title": "调节效应与交互项",
  "section": "教材知识卡",
  "keywords": [
   "调节效应",
   "交互项",
   "moderation",
   "margins",
   "简单斜率"
  ],
  "content": "**调节效应：** Y 与 X 的关系随 Z 变化；用 X×Z 交互项检验。\n**解释：** 交互项系数表示 Z 每增加一单位，X 对 Y 的斜率变化；主效应解释依赖变量编码。\n**Stata：** regress y c.x##c.z；margins, dydx(x) at(z=(...))；marginsplot。\n**注意：** 连续变量中心化不改变交互项显著性但改善解释；不要用分组回归代替交互检验；因果解释仍需识别策略。",
  "source": "杨维忠、张甜《Stata统计分析从入门到精通》回归与交互章节",
  "version": "2026-11-07",
  "review_status": "教材摘要与教学整理，页码待逐页复核",
  "methods": [
   "ols",
   "panel_fe"
  ],
  "task_stages": [
   "prepare",
   "plan",
   "explain"
  ],
  "topic": "research_concept",
  "accessed_at": "2026-11-07"
 },
 {
  "id": "kb_data_cleaning",
  "title": "数据清洗与可复现日志",
  "section": "教材知识卡",
  "keywords": [
   "数据清洗",
   "重复值",
   "缺失",
   "destring",
   "do文件",
   "日志"
  ],
  "content": "**流程：** 读取 → 变量类型/标签 → 重复键 → 缺失/异常 → 单位与量纲 → 保存清洗日志。\n**Stata：** import delimited/use；describe；codebook；duplicates report id year；destring, replace；misstable；label define。\n**注意：** 不猜单位；不按结果显著性删样本；所有剔除规则写入日志；保留原始文件与清洗后文件。",
  "source": "杨维忠、张甜《Stata统计分析从入门到精通》第1–2章；王天夫、李博柏《Stata实用教程》",
  "version": "2026-11-07",
  "review_status": "教材摘要与教学整理，页码待逐页复核",
  "methods": [],
  "task_stages": [
   "data",
   "health",
   "reports"
  ],
  "topic": "software_operation",
  "accessed_at": "2026-11-07"
 },
 {
  "id": "kb_stata_ops",
  "title": "Stata 常用命令与 do 文件习惯",
  "section": "教材知识卡",
  "keywords": [
   "Stata",
   "regress",
   "xtreg",
   "reghdfe",
   "ivreg2",
   "esttab",
   "do文件"
  ],
  "content": "**常用：** use/import delimited；xtset id year；regress y x, vce(cluster id)；xtreg y x, fe；reghdfe；ivreg2；csdid；outreg2/esttab 导出；coefplot/eventdd 绘图。\n**习惯：** do 文件分块、每步 log using、路径用相对路径、运行前 clear。\n**注意：** 旧教材命令以当前 Stata 帮助为准；不同命令默认样本与自由度可能不同。",
  "source": "陈强《高级计量经济学及Stata应用》第4章；杨维忠《Stata统计分析从入门到精通》；王天夫《Stata实用教程》",
  "version": "2026-11-07",
  "review_status": "教材摘要与教学整理，页码待逐页复核",
  "methods": [],
  "task_stages": [
   "data",
   "execute",
   "reports"
  ],
  "topic": "command_syntax",
  "accessed_at": "2026-11-07"
 },
 {
  "id": "kb_result_reading",
  "title": "回归结果怎么读：系数、标准误与区间",
  "section": "教材知识卡",
  "keywords": [
   "回归结果",
   "系数",
   "标准误",
   "p值",
   "置信区间",
   "R2"
  ],
  "content": "**先看：** 样本量、实际估计样本、因变量单位、系数、标准误、CI、p、R²/伪 R²、固定效应与聚类设置。\n**解释：** 系数是“在其他变量不变时”的平均变化；因果解释需识别假设；经济显著性看系数相对均值/标准差。\n**报告：** 不省略失败项与样本损失；说明软件版本、包版本、代码哈希。\n**误区：** 星号不是结论；不显著不等于无效应；R² 高不代表因果。",
  "source": "陈强《高级计量经济学及Stata应用》第3.6–3.7节，PDF 第35–38页",
  "version": "2026-11-07",
  "review_status": "教材摘要与教学整理，页码待逐页复核",
  "methods": [
   "ols",
   "panel_fe",
   "did"
  ],
  "task_stages": [
   "execute",
   "explain",
   "reports"
  ],
  "topic": "result_reading",
  "accessed_at": "2026-11-07"
 },
 {
  "id": "kb_model_selection",
  "title": "模型设定与检验：F、LR、AIC/BIC",
  "section": "教材知识卡",
  "keywords": [
   "模型选择",
   "F检验",
   "似然比",
   "AIC",
   "BIC",
   "RESET"
  ],
  "content": "**嵌套模型：** F 检验/似然比检验；非嵌套可用 AIC/BIC 或 J 检验。\n**函数形式：** 残差图、RESET、连接函数；不要用 R² 选模型。\n**Stata：** test；lrtest；estat ic；linktest；ovtest。\n**注意：** 模型选择应基于理论与识别策略，不能只看拟合优度。",
  "source": "陈强《高级计量经济学及Stata应用》第9.3–9.5节，PDF 第133–135页",
  "version": "2026-11-07",
  "review_status": "教材摘要与教学整理，页码待逐页复核",
  "methods": [
   "ols"
  ],
  "task_stages": [
   "plan",
   "execute"
  ],
  "topic": "result_reading",
  "accessed_at": "2026-11-07"
 },
 {
  "id": "kb_ddd",
  "title": "三重差分 DDD",
  "section": "教材知识卡",
  "keywords": [
   "三重差分",
   "DDD",
   "triple difference",
   "三重交互"
  ],
  "content": "**三重差分：** 在 DID 基础上再加一个维度，比较“处理组 vs 对照组的 DID”之差。\n**用途：** 控制随第三个维度变化的冲击，或检验政策在不同群体的差异。\n**假设：** 平行趋势需在更细层组成立；三重交互项解释复杂；样本与固定效应设定要匹配。\n**Stata：** regress y i.treat##i.post##i.group, vce(cluster id)；或 reghdfe 高维 FE。\n**注意：** 不是所有“加交互项”都是 DDD；要明确第三个维度的识别逻辑。",
  "source": "陈强《高级计量经济学及Stata应用》第2版，第18.7节，PDF 第358页",
  "version": "2026-11-07",
  "review_status": "教材摘要与教学整理，页码待逐页复核",
  "methods": [
   "did"
  ],
  "task_stages": [
   "prepare",
   "plan",
   "explain"
  ],
  "topic": "research_concept",
  "accessed_at": "2026-11-07"
 },
 {
  "id": "kb_random_effects",
  "title": "随机效应与 Hausman 检验",
  "section": "教材知识卡",
  "keywords": [
   "随机效应",
   "RE",
   "Hausman",
   "豪斯曼",
   "FGLS"
  ],
  "content": "**模型：** RE 假设个体效应与解释变量不相关，用可行广义最小二乘（FGLS）加权。\n**检验：** Hausman 检验比较 FE 与 RE；p 小拒绝 RE。稳健 Hausman 可用 xtoverid。\n**Stata：** xtset id year；xtreg y x, re；hausman fe re；xtoverid。\n**注意：** FE 允许个体效应与 X 相关，但无法估计不随时间变化的变量；RE 的聚类标准误与假设需单独核对。",
  "source": "陈强《高级计量经济学及Stata应用》第2版，第15.7、15.11节，PDF 第269–272页",
  "version": "2026-11-07",
  "review_status": "教材摘要与教学整理，页码待逐页复核",
  "methods": [
   "panel_fe"
  ],
  "task_stages": [
   "plan",
   "execute",
   "explain"
  ],
  "topic": "research_concept",
  "accessed_at": "2026-11-07"
 },
 {
  "id": "kb_tobit",
  "title": "Tobit、截断与归并数据",
  "section": "教材知识卡",
  "keywords": [
   "Tobit",
   "截断",
   "归并",
   "censored",
   "truncreg"
  ],
  "content": "**Tobit：** 结果变量在某个界限被归并（如 y<=0 记为 0），用最大似然同时估计潜变量与观测机制。\n**截断 vs 归并：** 截断是只观察 y>c 的样本；Tobit 允许在界限处堆积。\n**Stata：** tobit y x, ll(0)；truncreg y x, ll(0)。\n**注意：** 系数是潜变量尺度；不要对归并数据直接用 OLS；正态同方差假设敏感。",
  "source": "陈强《高级计量经济学及Stata应用》第2版，第14章，PDF 第238页起",
  "version": "2026-11-07",
  "review_status": "教材摘要与教学整理，页码待逐页复核",
  "methods": [
   "ols"
  ],
  "task_stages": [
   "plan",
   "execute",
   "explain"
  ],
  "topic": "research_concept",
  "accessed_at": "2026-11-07"
 },
 {
  "id": "kb_dynamic_panel",
  "title": "动态面板与 GMM",
  "section": "教材知识卡",
  "keywords": [
   "动态面板",
   "GMM",
   "Arellano-Bond",
   "Blundell-Bond",
   "Nickell偏误"
  ],
  "content": "**问题：** 滞后因变量与个体效应相关，FE 产生 Nickell 偏误；需要 GMM。\n**方法：** Arellano-Bond 差分 GMM、Blundell-Bond 系统 GMM；用滞后项作工具变量。\n**检验：** AR(1)/AR(2) 序列相关、Hansen/Sargan 过度识别；工具变量数量要克制。\n**Stata：** xtabond2 y L.y x, gmm(L.y) iv(x) twostep robust；xtdpd。\n**注意：** 系统 GMM 需要额外假设；结果对工具变量集与滞后阶数敏感。",
  "source": "陈强《高级计量经济学及Stata应用》第2版，第16.11–16.12节，PDF 第304–306页",
  "version": "2026-11-07",
  "review_status": "教材摘要与教学整理，页码待逐页复核",
  "methods": [
   "panel_fe"
  ],
  "task_stages": [
   "plan",
   "execute",
   "explain"
  ],
  "topic": "research_concept",
  "accessed_at": "2026-11-07"
 },
 {
  "id": "kb_quantile",
  "title": "分位数回归",
  "section": "教材知识卡",
  "keywords": [
   "分位数回归",
   "quantile",
   "qreg",
   "异质性"
  ],
  "content": "**方法：** 最小化加权绝对残差，估计条件分位点；对异常值较稳健。\n**解释：** β_τ 是 X 对 Y 第 τ 分位点的边际影响，不同分位点可有不同斜率。\n**Stata：** qreg y x, q(0.5)；sqreg y x, q(0.1 0.5 0.9)；bsqreg。\n**注意：** 标准误通常用 bootstrap；与 OLS 均值系数不是同一个目标参数。",
  "source": "陈强《高级计量经济学及Stata应用》相关分位数回归章节；杨维忠《Stata统计分析从入门到精通》回归章节",
  "version": "2026-11-07",
  "review_status": "教材摘要与教学整理，页码待逐页复核",
  "methods": [
   "ols"
  ],
  "task_stages": [
   "plan",
   "explain"
  ],
  "topic": "research_concept",
  "accessed_at": "2026-11-07"
 },
 {
  "id": "kb_threshold",
  "title": "门槛/门限模型",
  "section": "教材知识卡",
  "keywords": [
   "门槛模型",
   "门限",
   "threshold",
   "xthreg",
   "Hansen"
  ],
  "content": "**思想：** 在门槛值两侧分别估计斜率，检验门槛是否真实存在。\n**步骤：** 设定门槛变量与候选值 → 网格搜索最小残差平方和 → bootstrap 检验门槛存在性 → 报告分段系数。\n**Stata：** xthreg（面板门槛）、threshold（用户命令，语法随版本变化）。\n**注意：** 门槛估计带来额外不确定性；不能把连续异质性强行切成两段而不检验。",
  "source": "陈强《高级计量经济学及Stata应用》非线性/门槛相关章节；杨维忠《Stata统计分析从入门到精通》",
  "version": "2026-11-07",
  "review_status": "教材摘要与教学整理，页码待逐页复核",
  "methods": [
   "panel_fe"
  ],
  "task_stages": [
   "plan",
   "execute"
  ],
  "topic": "research_concept",
  "accessed_at": "2026-11-07"
 },
 {
  "id": "kb_multinomial",
  "title": "多项与有序选择模型",
  "section": "教材知识卡",
  "keywords": [
   "多项Logit",
   "有序Logit",
   "mlogit",
   "oprobit",
   "多值选择"
  ],
  "content": "**多项 Logit/Probit：** 结果有 J 个无序类别，估计相对基准类别的对数几率。\n**有序 Logit/Probit：** 结果是有序等级，假设比例优势；需检验该假设。\n**Stata：** mlogit y x；oprobit y x；margins, dydx(*)。\n**注意：** 系数不是概率；要看 margins；不要把二值模型逐类拆分替代多项模型。",
  "source": "陈强《高级计量经济学及Stata应用》第2版，第12章，PDF 第207页起",
  "version": "2026-11-07",
  "review_status": "教材摘要与教学整理，页码待逐页复核",
  "methods": [
   "ols"
  ],
  "task_stages": [
   "plan",
   "execute",
   "explain"
  ],
  "topic": "research_concept",
  "accessed_at": "2026-11-07"
 }
];
