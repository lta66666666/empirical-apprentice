import { parseCsv } from './research.js';

const aliases = {
  unit: ['city', 'unit', 'id', '城市', '地区', '个体'],
  time: ['year', 'time', '年份', '年'],
  outcome: ['outcome', 'y', 'energy', '结果变量', '能耗'],
  treated: ['treated', 'treatment', '处理组', '试点'],
};

const sha256 = async (text) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))]
  .map((part) => part.toString(16).padStart(2, '0')).join('');

export async function analyzeTwoPeriod(input) {
  const filename = String(input?.filename || 'data.csv').slice(0, 150);
  const text = String(input?.text || '');
  const data = parseCsv(text, filename);
  const columns = data.headers;
  const mapping = Object.fromEntries(Object.entries(aliases).map(([key, options]) => [key,
    input?.mapping?.[key] || columns.find((name) => options.includes(name.trim().toLowerCase())) || '']));
  const policyYear = Number(input?.policy_year);
  const errors = [], valid = [], invalid = [], groups = new Map(), keys = new Set(), units = new Map();
  let duplicates = 0;
  if (Object.values(mapping).some((name) => !columns.includes(name)) || new Set(Object.values(mapping)).size !== 4) {
    errors.push('请分别指定个体、年份、结果变量、处理组四个不同字段。');
  } else {
    for (let i = 0; i < data.rows.length; i++) {
      const row = data.rows[i], unit = row[columns.indexOf(mapping.unit)];
      const time = Number(row[columns.indexOf(mapping.time)]);
      const outcome = Number(row[columns.indexOf(mapping.outcome)]);
      const treated = Number(row[columns.indexOf(mapping.treated)]);
      if (!unit || !Number.isInteger(time) || !Number.isFinite(outcome) || ![0, 1].includes(treated)
        || [mapping.time, mapping.outcome, mapping.treated].some((name) => !row[columns.indexOf(name)])) {
        invalid.push(data.lines[i]); continue;
      }
      valid.push({ unit, time, outcome, treated });
      const key = JSON.stringify([unit, time]);
      if (keys.has(key)) duplicates++; else keys.add(key);
      if (!groups.has(unit)) groups.set(unit, new Set());
      groups.get(unit).add(treated);
      units.set(unit, (units.get(unit) || 0) + 1);
    }
  }
  if (invalid.length) errors.push(`${invalid.length} 行含缺失、非数值或非法编码；示例行号：${invalid.slice(0, 10).join('、')}。修复后重传，不自动删行。`);
  if (duplicates) errors.push(`存在 ${duplicates} 条重复个体—年份记录，请核对合并过程。`);
  if ([...groups.values()].some((set) => set.size !== 1)) errors.push('处理组身份随时间变化。treated 应表示是否属于处理组；分批实施暂不支持。');
  const years = [...new Set(valid.map((row) => row.time))].sort((a, b) => a - b);
  if (years.length !== 2) errors.push('本版严格支持两个年份；请自行明确研究窗口并准备两期数据。');
  if (!years.length || !Number.isInteger(policyYear) || !(years[0] < policyYear && policyYear <= years.at(-1))) errors.push('请填写位于两个观察年份之间（可等于后期）的政策实施年。');
  if (new Set(valid.map((row) => row.treated)).size !== 2) errors.push('需要处理组 treated=1 和对照组 treated=0。');
  if (valid.length && [...units.values()].some((count) => count !== 2)) errors.push('需要平衡面板：每个个体在两个年份各有一条记录。');
  if (input?.confirmed !== true) errors.push('请确认处理组同批实施、对照组研究期内未受该政策，且政策时间已人工核对。');
  const warnings = ['计算结果是描述性 DID，不提供标准误、p 值或因果证明。',
    '两期数据无法检查政策前趋势；平行趋势、同期政策、溢出及预期效应仍需研究者论证。'];
  const result = { filename, sha256: await sha256(text), columns, mapping, policy_year: input?.policy_year ?? null,
    status: errors.length ? 'blocked' : 'computed', audit: { rows: data.rows.length, valid_rows: valid.length,
      units: groups.size, years, duplicates, invalid_rows: invalid.length }, errors, warnings,
    context: Object.fromEntries(['research_question', 'outcome_definition', 'data_source'].map((name) => [name, String(input?.[name] || '').slice(0, 1000)])) };
  const lines = ['# 实证学徒：数据审计与描述性 DID', '', `文件：${filename}`, `数据指纹 SHA-256：${result.sha256}`,
    `字段映射：${JSON.stringify(mapping)}`, `政策年份（用户提供）：${result.policy_year}`, `审计：${JSON.stringify(result.audit)}`];
  if (!errors.length) {
    const means = [];
    for (const group of [0, 1]) for (const year of years) {
      const values = valid.filter((row) => row.treated === group && row.time === year).map((row) => row.outcome);
      if (!values.length) errors.push('某组某年没有观测，无法计算 DID。');
      means.push({ group, year, mean: values.reduce((a, b) => a + b, 0) / values.length, n: values.length });
    }
    if (!errors.length) {
      const controlChange = means[1].mean - means[0].mean;
      const treatedChange = means[3].mean - means[2].mean;
      result.estimate = { means, control_change: controlChange, treated_change: treatedChange, did: treatedChange - controlChange };
      lines.push('', '## 分组均值', '|组别|年份|均值|观察数|', '|---|---|---|---|',
        ...means.map((item) => `|${item.group ? '处理组' : '对照组'}|${item.year}|${item.mean.toPrecision(6)}|${item.n}|`),
        `处理组变化：${treatedChange.toPrecision(6)}；对照组变化：${controlChange.toPrecision(6)}；DID = ${(treatedChange - controlChange).toPrecision(6)}。`,
        '单位与上传的结果变量一致。这是两组变化之差，不能单凭该数字断言政策因果效应。');
    }
  }
  result.status = errors.length ? 'blocked' : 'computed';
  lines.push('', '## 待处理事项', ...errors, '', '## 解释边界', ...warnings);
  result.report_markdown = lines.join('\n') + '\n';
  return result;
}
