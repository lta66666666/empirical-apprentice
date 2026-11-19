# 数据来源卡与审计记录

生成：2026-11-08，真实公开数据补充于 2026-11-09。审计只核对文件结构、哈希、缺失与重复，不证明来源真实性。

## 真实公开数据：World Bank WDI 中国年度序列

|字段|内容|
|---|---|
|发布机构|World Bank（世界银行）|
|数据集|World Development Indicators (WDI)|
|国家 / 期间|中国 CHN，2000–2023，24 个年度观测|
|指标|`IT.NET.USER.ZS` 互联网使用率（% 人口）；`SL.GDP.PCAP.EM.KD` 人均产出（2021 PPP 美元）；`NE.GDI.TOTL.ZS` 资本形成（% GDP）|
|获取方式|WDI API：`https://api.worldbank.org/v2/country/CHN/indicator/<code>?format=json&date=2000:2023`|
|获取日期|2026-11-09|
|许可|CC BY 4.0，需署名 World Bank|
|建议引用|World Bank. World Development Indicators. Washington, D.C.: World Bank Group. `https://datacatalog.worldbank.org/dataset/world-development-indicators`|
|原始文件|`static/real-data/world-bank-china-2000-2023.csv`|
|元数据|`static/real-data/source.json`（含各指标 API URL、最后更新日期）|
|SHA256|`504602230ad052d9fd24a5db10b8f3524bce9011fa96f7c59eea0173b3b0542e`|
|规模|24 行 × 4 列，0 缺失，0 重复|
|复验|`node scripts/fetch-world-bank.mjs`，再运行 `node scripts/data-evidence.mjs`|

### 真实数据描述性复核（Stata 18）

被解释变量为 `ln(人均产出)`，Newey–West 标准误；这是描述性关联，不是因果估计。

|模型|变量|系数|标准误|p|
|---|---|---:|---:|---:|
|水平值 + 年份趋势，N=24，R²=0.996|互联网使用率|−0.00135|0.00222|0.549|
||资本形成|0.01789|0.00256|<0.001|
||年份|0.07969|0.00798|<0.001|
|一阶差分，N=23，R²=0.129|互联网使用率变化|−0.000982|0.000832|0.252|
||资本形成变化|0.004387|0.002152|0.055|

结果没有显示互联网使用率与人均产出存在统计上显著的正向关联；年份趋势与资本形成的解释力更强。可能原因包括样本只有 24 个国家年度点、指标口径过粗、遗漏变量与反向因果。**不能据此否定数字化作用，也不能据此宣称因果效应。**

原始 do、日志与结果：`docs/evidence/real-data/`。

## 项目内置模拟数据

|数据集|文件|SHA256|行|列|缺失|重复|来源与用途|不能证明|
|---|---|---|---|---|---:|---:|---|---|
|随机面板 DID|`static/random-did-data.csv`|`6dcabd196078de0b6704baf81908b4ac0a7d70e0b4902143d35f470732d171af`|480|5|0|0|固定种子 20261108 生成，60 城 × 8 年，用于随机 DID 演示|现实政策效果、真实城市数据|
|OLS 教学|`local_stata/sample-fixtures/ols.csv`|`1a771585847400ca1ce294a2ed17db68d2208fbb33326f10445acc4c6abf8f5d`|160|3|0|0|项目内置教学夹具 `teaching-fixtures-v1`|真实调查样本、总体推断|
|面板 / DID 教学|`local_stata/sample-fixtures/panel_fe.csv`、`did.csv`|`36666c9380bed25e79c8aa7a9a723ebe3e11eb65fe7d0e75498e44039c64abf6`|384|7|0|0|项目内置教学夹具；两个文件名指向同一份面板，不是两个独立来源|真实城市统计、政策名单|

字段：

- 随机 DID：`city, year, treated, investment, emissions`
- OLS：`income, education, experience`
- 面板 / DID：`city, year, productivity, digitalization, investment, emissions, treated`

## 变量字典（模拟数据）

|变量|含义|单位 / 取值|生成方式或限制|
|---|---|---|---|
|`city`|城市代码|`C001`–`C060`|60 个模拟城市，不对应真实城市|
|`year`|年份|2014–2021|8 年平衡面板|
|`treated`|是否处理城市|0 / 1|固定 30 个城市，2018 年起为 1|
|`investment`|投资强度|模拟连续变量|控制变量，不来自统计年鉴|
|`emissions`|排放强度|模拟连续变量|结果变量，含城市固定效应、年份趋势与噪声|
|`income`|收入|模拟连续变量|OLS 教学夹具的结果变量|
|`education`|教育年限|模拟连续变量|OLS 教学夹具的核心解释变量|
|`experience`|工作经验|模拟连续变量|OLS 教学夹具的控制变量|
|`productivity`|生产率|模拟连续变量|面板教学夹具的结果变量|
|`digitalization`|数字化程度|模拟连续变量|面板教学夹具的核心解释变量|

以上变量、单位与生成规则只适用于模拟教学，不能映射为任何真实地区、企业或个人的统计口径。真实数据接入必须另填下方交接表，并在变量字典中写明原始口径与单位。

逐文件审计结果见 `docs/evidence/data/*.audit.json`，含每个字段的类型推断、缺失数与缺失率、唯一值数、数值范围。

## 真实来源待交接

队友提供真实数据后，由同一脚本生成审计，并补下表；未补齐前，网站和报告继续标注“模拟／未核对”。

|字段|内容|
|---|---|
|发布机构||
|数据集名称||
|原文链接 / DOI||
|获取日期||
|许可与再分发条件||
|原始行数与变量数||
|变量含义、单位、口径、频率||
|样本范围与筛选规则||
|原始文件 SHA256||
|清洗与合并步骤||
|不能据此得出的结论||
|核对人 / 日期||

## 复验

```bash
node scripts/data-evidence.mjs <csv> --label "<名称>" --provenance "<来源说明>" --out docs/evidence/data/<名称>.audit.json
```

模拟数据仅用于教学演示；不得在参赛材料中称为真实来源证据。
