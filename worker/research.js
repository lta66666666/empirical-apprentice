import { engineMetadata, engineCapabilities, nodeRequest, digest } from './executor.js';
import { fixtures } from './fixtures.js';
import { loadOwnedSession, saveSession } from './sessions.js';
import { zipFiles } from './zip.js';
import { proposeCandidate, modelFeedback, reserveModelCall, modelCapabilities } from './model.js';
import { evidenceSnapshot, didConflict } from './evidence.js';
import {modelInteractions,modelEvidenceMarkdown} from './model-evidence.js';

const RETENTION = 7 * 86400000;
const MAX_BYTES = 2_000_000;
const MAX_ROWS = 20_000;
const MISSING = new Set(['', 'NA', 'N/A', 'null', 'NaN']);
const resultJson = (value, status = 200) => Response.json(value, { status });
const fault = (message, status = 422) => resultJson({ detail: message }, status);

export function parseCsv(text, filename = 'data.csv') {
  if (typeof text !== 'string' || new TextEncoder().encode(text).length > MAX_BYTES) throw new Error('文件最多 2 MB。');
  if (text.includes('\ufffd')) throw new Error('检测到无法解码的字符，请重新导出 UTF-8 CSV/TSV。');
  const delimiter = filename.toLowerCase().endsWith('.tsv') ? '\t' : ',';
  const rows = [], starts = [];
  let row = [], value = '', quoted = false, afterQuote = false, line = 1, rowLine = 1;
  const source = text.replace(/^\ufeff/, '');
  const pushField = () => { row.push(value); value = ''; afterQuote = false; };
  const pushRow = () => { pushField(); rows.push(row); starts.push(rowLine); row = []; rowLine = line + 1; };
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (quoted) {
      if (ch === '"' && source[i + 1] === '"') { value += '"'; i++; }
      else if (ch === '"') { quoted = false; afterQuote = true; }
      else { value += ch; if (ch === '\n') line++; }
    } else if (ch === '"' && value === '' && !afterQuote) quoted = true;
    else if (ch === delimiter) pushField();
    else if (ch === '\n') { pushRow(); line++; }
    else if (ch === '\r' && source[i + 1] === '\n') { pushRow(); i++; line++; }
    else if (afterQuote && ch !== ' ' && ch !== '\t') throw new Error(`第 ${line} 行引号后的内容无效。`);
    else value += ch;
  }
  if (quoted) throw new Error('CSV 引号未闭合。');
  if (value || row.length || afterQuote) pushRow();
  if (!rows.length) throw new Error('数据文件为空。');
  const headers = rows.shift().map((value) => value.trim());
  starts.shift();
  if (!headers.length || headers.length > 60 || headers.some((value) => !value || value.length > 100) || new Set(headers).size !== headers.length) {
    throw new Error('列名须非空且不重复，最多 60 列，单列名最多 100 字。');
  }
  const body = [], lines = [];
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].every((value) => !value.trim())) continue;
    if (rows[i].length !== headers.length) throw new Error(`第 ${starts[i]} 行列数与表头不一致。`);
    if (body.length >= MAX_ROWS) throw new Error('最多支持 20000 行。');
    body.push(rows[i].map((value) => value.trim())); lines.push(starts[i]);
  }
  if (!body.length) throw new Error('文件没有观测行。');
  const columns = headers.map((name, index) => {
    const values = body.map((row) => row[index]);
    const present = values.filter((value) => !MISSING.has(value));
    return { name, missing: values.length - present.length,
      numeric: !!present.length && present.every((value) => Number.isFinite(Number(value))), unique: new Set(present).size };
  });
  return { headers, rows: body, lines, profile: { row_count: body.length, columns, format: delimiter === '\t' ? 'TSV' : 'CSV' } };
}

function quoteCsv(value) {
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function normalized(data, plan) {
  const aliases = Object.fromEntries(data.headers.map((name, index) => [name, `v${index}`]));
  const normalizedPlan = { ...plan, predictors: plan.predictors.map((name) => aliases[name]),
    labels: Object.fromEntries(Object.entries(aliases).map(([name, alias]) => [alias, name])) };
  for (const key of ['outcome', 'unit', 'time', 'treated', 'cluster']) if (normalizedPlan[key]) normalizedPlan[key] = aliases[normalizedPlan[key]];
  const csv = [data.headers.map((name) => aliases[name]).join(','), ...data.rows.map((row) => row.map(quoteCsv).join(','))].join('\n') + '\n';
  return { csv, plan: normalizedPlan };
}

function validatePlan(input, data, blueprint, session) {
  if (!input || typeof input !== 'object') throw new Error('请先整理方案。');
  const plan = {
    method: input.method || 'ols', outcome: input.outcome || '',
    predictors: Array.isArray(input.predictors) ? input.predictors : [], unit: input.unit || '',
    time: input.time || '', treated: input.treated || '', policy_year: input.policy_year ?? null,
    vcov: input.vcov || 'hetero', cluster: input.cluster || '', missing: input.missing || 'block',
    same_batch: input.same_batch === true, engine_id: input.engine_id || 'r_native',
  };
  if (!engineMetadata[plan.engine_id]) throw new Error('执行引擎未接入。');
  for(const key of ['software','execution_location'])if(input[key]!==undefined && input[key]!==engineMetadata[plan.engine_id][key])throw new Error('软件、位置与引擎不一致，请重新整理方案。');
  Object.assign(plan,engineMetadata[plan.engine_id]); delete plan.label;
  if (!['ols', 'panel_fe', 'did'].includes(plan.method)) throw new Error('仅支持 OLS、固定效应和同批 DID。');
  if (!['iid', 'hetero', 'cluster'].includes(plan.vcov) || !['block', 'drop'].includes(plan.missing)) throw new Error('标准误或缺失处理设置无效。');
  if (!data.headers.includes(plan.outcome)) throw new Error('请选择数据中的结果变量。');
  if (plan.predictors.length > 12 || new Set(plan.predictors).size !== plan.predictors.length || plan.predictors.includes(plan.outcome)) throw new Error('解释变量不能重复或包含结果变量，最多 12 列。');
  if (plan.method !== 'did' && !plan.predictors.length) throw new Error('请至少选择一个解释变量。');
  if (plan.method !== 'ols' && (!plan.unit || !plan.time || plan.unit === plan.time)) throw new Error('面板分析需要不同的个体列和年份列。');
  if (plan.method === 'did' && (!plan.treated || !Number.isInteger(plan.policy_year) || plan.policy_year < 1800 || plan.policy_year > 2200 || !plan.same_batch)) {
    throw new Error('本版 DID 仅支持同批实施：需核对组别、政策年份和适用条件。');
  }
  const batches = blueprint?.policy_batches?.value || '';
  if (plan.method === 'did' && session && didConflict(session)) throw new Error(didConflict(session));
  if (plan.method === 'did' && /分批/.test(batches) && !/没有分批|不是分批|非分批/.test(batches)) throw new Error('蓝图记录了分批实施，本版同批 DID 不适用。');
  if (plan.method !== 'ols' && (plan.vcov !== 'cluster' || !plan.cluster)) throw new Error('固定效应和 DID 需指定聚类标准误。');
  if (plan.vcov === 'cluster' && !plan.cluster) throw new Error('聚类标准误需要聚类列。');
  const required = [plan.outcome, ...plan.predictors, plan.unit, plan.time, plan.treated, plan.cluster].filter(Boolean);
  const absent = required.filter((name) => !data.headers.includes(name));
  if (absent.length) throw new Error('数据中没有这些列：' + absent.join(', '));
  for (const name of [plan.outcome, ...plan.predictors]) {
    if (!data.profile.columns.find((column) => column.name === name).numeric) throw new Error(`${name} 不是可用数值列。`);
  }
  const selected = [...new Set(required)];
  const incomplete = (row) => selected.some((name) => MISSING.has(row[data.headers.indexOf(name)]));
  const missingLines = data.rows.flatMap((row, index) => incomplete(row) ? [data.lines[index]] : []);
  if (missingLines.length && plan.missing === 'block') throw new Error(`选定列存在 ${missingLines.length} 行缺失；请核查或明确允许删除。`);
  const usableRows = data.rows.filter((row) => !incomplete(row));
  if (usableRows.length < Math.max(3, plan.predictors.length + 2)) throw new Error('删除缺失行后可用观测不足，请核对样本与变量。');
  if (plan.method !== 'ols') {
    const ui = data.headers.indexOf(plan.unit), ti = data.headers.indexOf(plan.time), seen = new Set();
    for (const row of usableRows) {
      const key = JSON.stringify([row[ui], row[ti]]);
      if (seen.has(key)) throw new Error('个体 × 时间键重复，请核查或合并重复观测。');
      seen.add(key);
    }
  }
  if (plan.method === 'did') {
    const ui = data.headers.indexOf(plan.unit), ti = data.headers.indexOf(plan.time), gi = data.headers.indexOf(plan.treated);
    const groups = new Map(); let before = 0, after = 0, treated = 0, control = 0;
    for (const row of usableRows) {
      const group = row[gi], year = Number(row[ti]);
      if (!['0', '1'].includes(group) || !Number.isFinite(year)) throw new Error('DID 组别须为 0/1，年份须为数值。');
      if (groups.has(row[ui]) && groups.get(row[ui]) !== group) throw new Error('同一单位的处理组身份随时间变化。');
      groups.set(row[ui], group);
      if (year < plan.policy_year) before++; else after++;
      if (group === '1') treated++; else control++;
    }
    if (!before || !after || !treated || !control) throw new Error('DID 需要政策前后与处理、对照两组观测。');
  }
  return { plan, missingLines };
}

function description(plan) {
  const labels = { ols: 'OLS／多元线性回归', panel_fe: '个体与年份固定效应', did: '同批 DID' };
  const rhs = plan.method === 'did' ? ['处理组 × 政策后', ...plan.predictors].join(' + ') : plan.predictors.join(' + ');
  return { label: labels[plan.method], formula: `${plan.outcome} ~ ${rhs}${plan.method === 'ols' ? '' : ` | ${plan.unit} + ${plan.time}`}`,
    meaning: plan.method === 'did' ? '交互项表示处理组在政策后的相对变化；因果解释仍需识别假设证据。' : '系数表示条件关联，单位须结合变量定义解释；显著性不等于因果。',
    checks: plan.method === 'did' ? '实施批次、处理与对照选择、政策前走势和同期冲击。' : plan.method === 'panel_fe' ? '随时间变化的混杂因素、样本变化和聚类层级。' : '混杂因素、变量单位、函数形式和缺失数据。',
    quiz: '请解释一个系数及其单位，并指出模型尚未验证的条件。' };
}

async function sha256(value) {
  const bytes = new TextEncoder().encode(value);
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function getJob(env, owner, id, touch=false) {
  const row = await env.DB.prepare('SELECT body,last_activity,lease_until FROM jobs WHERE id=? AND owner=?').bind(id, owner).first();
  if (!row || row.last_activity + RETENTION <= Date.now()) return null;
  const job = JSON.parse(row.body);
  const session = await loadOwnedSession(env, owner, job.session_id,touch);
  if (!session || session==='expired') return null;
  job.stale = !!session && session !== 'expired' && job.research_revision !== undefined && job.research_revision !== session.research_revision;
  job.changed_evidence = job.stale ? ['研究准备、蓝图或变量字典已修改，请核对当前资料与历史快照。'] : [];
  if (job.execution_location === 'cloud_native') await syncCloudJob(env,job,session);
  if (job.execution_location !== 'cloud_native' && job.status === 'running' && row.lease_until < Date.now()) {
    job.status = 'interrupted'; job.error = '浏览器执行已中断，可从保存的输入重新运行。';
    await saveJob(env, job);
  }
  return job;
}

async function saveJob(env, job, touchSession = false) {
  const now = Date.now();
  job.last_activity = now;
  await env.DB.prepare('UPDATE jobs SET body=?,status=?,last_activity=?,lease_until=? WHERE id=? AND owner=?')
    .bind(JSON.stringify(job), job.status, now, job.status === 'running' ? now + 30000 : 0, job.id, job.owner).run();
  if (touchSession) {
    const session = await loadOwnedSession(env, job.owner, job.session_id);
    if (session && session !== 'expired') await saveSession(env, session);
  }
}

function publicJob(job) {
  const { owner, nonce, input_key, node_artifacts, ...visible } = job;
  return {software:job.software||'r',engine_id:job.engine_id||'browser_webr',execution_location:job.execution_location||'browser_webr',...visible};
}

function validateSubmittedResult(result, job) {
  if (!result || !Number.isInteger(result.n_used) || result.n_used < 1 || result.n_used > job.n_rows) throw new Error('结果样本数无效。');
  if (result.package_versions?.fixest !== '0.14.2' || !/^R 4\./.test(result.r_version || '')) throw new Error('执行版本与已验收版本不符。');
  if (!Array.isArray(result.coefficients) || !result.coefficients.length || result.coefficients.length > 15) throw new Error('系数表格式无效。');
  if (new Set(result.coefficients.map(row=>row.term)).size !== result.coefficients.length) throw new Error('系数表变量重复。');
  for (const row of result.coefficients) {
    if (typeof row.term !== 'string' || row.term.length > 120 || !['estimate', 'std_error', 'p_value', 'ci_low', 'ci_high'].every((key) => Number.isFinite(row[key]))) throw new Error('系数表含无效数值。');
    if (row.std_error < 0 || row.p_value < 0 || row.p_value > 1 || row.ci_low > row.ci_high) throw new Error('系数表区间或标准误无效。');
  }
  return {
    r_version: result.r_version, package_versions: { fixest: '0.14.2' }, n_used: result.n_used,
    coefficients: result.coefficients, clusters: Number.isInteger(result.clusters) ? result.clusters : null,
    warnings: Array.isArray(result.warnings) ? result.warnings.filter((item) => typeof item === 'string').slice(0, 20) : [],
    audit: { missing_removed_csv_lines: job.missing_lines,
      model_removed_count: Math.max(0, job.n_rows - job.missing_lines.length - result.n_used),
      model_removed_csv_lines: Array.isArray(result.used_indices) && result.used_indices.length === result.n_used && job.csv_lines ? job.csv_lines.filter((_,i)=>!result.used_indices.includes(i+1) && !job.missing_lines.includes(job.csv_lines[i])) : [],
      used_indices: Array.isArray(result.used_indices) ? result.used_indices : null },
  };
}

export async function handleResearch(request, env, owner, path) {
  if (path === '/api/research/status' && request.method === 'GET') {
    const engines=await engineCapabilities(env,owner);
    return resultJson({r:engines.browser_webr,engines,default_engine:'r_native',software:[{id:'r',label:'云端原生 R',...engines.r_native},{id:'browser_webr',label:'浏览器 webR',...engines.browser_webr},{id:'stata',label:'Stata',...engines.stata_native},{id:'eviews',label:'EViews',...engines.eviews_native}],methods:['ols','panel_fe','did'],unsupported:['分批 DID','IV','RDD','事件研究回归'],planner_mode:env.MODEL_API_KEY&&env.MODEL_NAME&&env.MODEL_BASE_URL?'online':'rules',model_capabilities:modelCapabilities(env)});
  }
  if (path === '/api/research/candidate' && request.method === 'POST') {
    try {
      const body = await request.json();
      const session = await loadOwnedSession(env, owner, String(body?.session_id || ''));
      if (!session || session === 'expired') return fault('会话不存在或已到期。', 404);
      const profile = body?.text===undefined?{row_count:0,columns:[]}:parseCsv(body.text, body.filename || 'data.csv').profile;
      if(modelCapabilities(env).candidate!=='unconfigured')await reserveModelCall(env, owner);
      const history=(await modelInteractions(env,session.session_id,owner)).filter(x=>x.kind==='candidate').slice(-3).map(x=>({question:x.input_summary.question,output:x.output}));
      const preparation={question_type:session.preparation.question_type,adoption_mode:session.preparation.adoption_mode,effective_date:session.preparation.cards.effective_date?.value||'',sample_batch_note:session.preparation.sample_batch_note||''};
      return await proposeCandidate({ question: body.question, profile,preparation,blocker:didConflict(session),history }, env,{session_id:session.session_id,owner});
    } catch (cause) { return fault(cause?.message || '方案建议失败。'); }
  }
  const example = /^\/api\/research\/examples\/(ols|panel_fe|did)$/.exec(path);
  if (example && request.method === 'GET') return resultJson(fixtures[example[1]]);
  const sessionRoute = /^\/api\/sessions\/([a-z0-9]{12})\/research\/(inspect|plan|jobs)$/.exec(path);
  if (sessionRoute) {
    const session = await loadOwnedSession(env, owner, sessionRoute[1]);
    if (session === 'expired') return fault('会话已到期。', 410);
    if (!session) return fault('会话不存在或不属于当前浏览器。', 404);
    try {
      const action = sessionRoute[2];
      if (action === 'jobs' && request.method === 'GET') {
        await saveSession(env,session);
        const rows = await env.DB.prepare('SELECT body FROM jobs WHERE session_id=? AND owner=? AND last_activity>? ORDER BY created_at DESC LIMIT 30')
          .bind(session.session_id, owner, Date.now() - RETENTION).all();
        return resultJson({ jobs: await Promise.all(rows.results.map(async row => publicJob(await getJob(env,owner,JSON.parse(row.body).id)))) });
      }
      if (request.method !== 'POST') return fault('方法不支持。', 405);
      const body = await request.json();
      const data = parseCsv(body?.text, body?.filename || 'data.csv');
      if (action === 'inspect') return resultJson(data.profile);
      if (action === 'plan') {
        const { plan, missingLines } = validatePlan(body.candidate, data, session.project, session);
        session.pending_confirmation = { token: crypto.randomUUID(), input_sha256: await sha256(body.text), plan_sha256: await sha256(JSON.stringify(plan)), research_revision: session.research_revision };
        await saveSession(env, session);
        return resultJson({ plan, confirmation: session.pending_confirmation, description: description(plan), profile: data.profile,
          note: `基于当前手选字段整理；未连接在线模型。原始 ${data.rows.length} 行，选定变量缺失 ${missingLines.length} 行。来源、单位和方法假设仍需学生核对。` });
      }
      if (action === 'jobs') {
        if (body?.confirmed !== true) throw new Error('执行前必须确认方案。');
        if (!String(body?.source || '').trim()) throw new Error('请填写数据来源与变量单位；暂不明确时请注明待核实。');
        const { plan, missingLines } = validatePlan(body.plan, data, session.project, session);
        const confirmation = session.pending_confirmation;
        if (!confirmation || body.confirmation_token !== confirmation.token || confirmation.research_revision !== session.research_revision || confirmation.input_sha256 !== await sha256(body.text) || confirmation.plan_sha256 !== await sha256(JSON.stringify(plan))) return fault('资料、输入或方案已变化，请重新整理并确认方案。',409);
        const count = await env.DB.prepare('SELECT ((SELECT COUNT(*) FROM jobs WHERE owner=? AND created_at>?)+(SELECT COUNT(*) FROM local_stata_tasks WHERE owner=? AND created_at>?)) AS n').bind(owner, Date.now() - 86400000,owner,Date.now()-86400000).first();
        if (count.n >= 30) return fault('今日分析次数达到上限。', 429);
        if(plan.engine_id!=='browser_webr' && !(await engineCapabilities(env,owner))[plan.engine_id].ready) throw new Error((await engineCapabilities(env,owner))[plan.engine_id].reason);
        const id = crypto.randomUUID(), key = `jobs/${owner}/${id}/input.csv`;
        const inputHash = await sha256(body.text), planHash = await sha256(JSON.stringify(plan));
        const submittedDictionary = body.dictionary && typeof body.dictionary === 'object' && !Array.isArray(body.dictionary) ? body.dictionary : {};
        const dictionary = Object.fromEntries(Object.entries(submittedDictionary)
          .filter(([name, value]) => data.headers.includes(name) && typeof value === 'string')
          .slice(0, 60).map(([name, value]) => [name, value.slice(0, 300)]));
        const job = { id, owner, session_id: session.session_id, status: 'running', created: Date.now() / 1000,
          last_activity: Date.now(), execution_location: plan.execution_location, software:plan.software, engine_id:plan.engine_id, nonce: crypto.randomUUID(),
          input_key: key, input_sha256: inputHash, plan_sha256: planHash, n_rows: data.rows.length,
          filename: String(body.filename || 'data.csv').slice(0, 200), plan, description: description(plan),
          dictionary, csv_lines:data.lines, research_revision:session.research_revision, evidence_snapshot:{...evidenceSnapshot(session),dictionary}, record_version:1,
          source: String(body.source || '').slice(0, 1000), question: String(body.question || '').slice(0, 1000),
          simulated: body.simulated === true, missing_lines: missingLines, result: null, reflections: [],
          tool_trace: [{ transport: plan.execution_location, tool: plan.software==='stata'?'Stata regress/xtreg':'fixest::feols' }],
        };
        await env.FILES.put(key, body.text);
        try {
          await env.DB.prepare('INSERT INTO jobs(id,session_id,owner,body,status,input_key,created_at,last_activity,lease_until) VALUES(?,?,?,?,?,?,?,?,?)')
            .bind(id, session.session_id, owner, JSON.stringify(job), 'running', key, Date.now(), Date.now(), Date.now() + 30000).run();
        } catch (cause) { await env.FILES.delete(key); throw cause; }
        if(job.execution_location==='cloud_native') await submitCloudJob(env,job,body.text,session);
        await saveSession(env, session);
        return resultJson({ ...publicJob(job), execution_nonce: job.nonce }, 202);
      }
    } catch (cause) { return fault(cause?.message || '分析请求无法处理。'); }
  }
  const jobRoute = /^\/api\/research\/jobs\/([0-9a-f-]{36})(?:\/(.*))?$/.exec(path);
  if (!jobRoute) return null;
  const job = await getJob(env, owner, jobRoute[1],true);
  if (!job) return fault('任务不存在、已到期或不属于当前浏览器。', 404);
  const tail = jobRoute[2] || '';
  try {
    if (!tail && request.method === 'GET') return resultJson(publicJob(job));
    if (tail === 'input' && request.method === 'GET') {
      const object = await env.FILES.get(job.input_key);
      if (!object) return fault('输入文件已丢失。', 404);
      const text = await object.text();
      const data = parseCsv(text, job.filename);
      return resultJson({ ...normalized(data, job.plan), original_text: text, filename: job.filename,
        input_sha256: job.input_sha256, plan_sha256: job.plan_sha256, nonce: job.nonce, n_rows: job.n_rows });
    }
    if (job.execution_location==='cloud_native' && ['complete','fail','heartbeat'].includes(tail)) return fault('云端任务仅接受签名执行节点的结果。',409);
    if (tail === 'heartbeat' && request.method === 'POST') {
      if (job.status !== 'running') return fault('任务已结束。', 409);
      await saveJob(env, job, true); return resultJson({ ok: true });
    }
    if (tail === 'interrupt' && request.method === 'POST') {
      if(job.execution_location==='cloud_native'){job.cancel_requested=true;await saveJob(env,job);await syncCloudJob(env,job);return resultJson(publicJob(job));}
      if (job.status === 'running') { job.status = 'interrupted'; job.error = '浏览器执行已中断，可重新运行。'; await saveJob(env, job, true); }
      return resultJson(publicJob(job));
    }
    if (tail === 'complete' && request.method === 'POST') {
      const body = await request.json();
      if (job.status !== 'running' || body?.nonce !== job.nonce) return fault('任务状态或执行凭证已失效。', 409);
      if (Array.isArray(body.result?.used_indices) && (new Set(body.result.used_indices).size !== body.result.n_used || body.result.used_indices.length !== body.result.n_used || body.result.used_indices.some(i=>!Number.isInteger(i)||i<1||i>job.n_rows))) throw new Error('R 样本索引无效。');
      job.result = validateSubmittedResult(body.result, job);
      job.status = 'succeeded'; job.completed = Date.now() / 1000;
      job.result_origin = '浏览器提交；服务器仅校验格式，未重新估计数值';
      if (job.verification_of_job_id) {
        const original = await getJob(env,owner,job.verification_of_job_id);
        job.verification = compareResults(original,job);
        if (original) { original.verification = {...job.verification,rerun_job_id:job.id}; original.record_version=(original.record_version||1)+1; await saveJob(env,original); }
      }
      await saveJob(env, job, true);
      return resultJson(publicJob(job));
    }
    if (tail === 'fail' && request.method === 'POST') {
      const body = await request.json();
      if (job.status !== 'running' || body?.nonce !== job.nonce) return fault('任务状态或执行凭证已失效。', 409);
      job.status = 'failed'; job.error = String(body.error || '浏览器执行失败。').slice(0, 500);
      await saveJob(env, job, true); return resultJson(publicJob(job));
    }
    if (tail === 'reflection' && request.method === 'POST') {
      if (job.status !== 'succeeded') return fault('请先完成分析。', 409);
      const body = await request.json(), text = String(body?.answer || '').trim();
      if(body.answer_version!==undefined&&body.answer_version!==job.reflections.length)return fault('解释记录已在另一标签页修订。草稿保留，请读取最新反馈后再提交。',409);
      const previousVersion=job.record_version||1;
      if (!text || text.length > 2000) throw new Error('解释须为 1 到 2000 字。');
      if (modelCapabilities(env).reflection !== 'unconfigured') await reserveModelCall(env, owner);
      const {audit,used_indices,...summaryResult}=job.result;
      summaryResult.sample_changes={missing_removed:audit.missing_removed_csv_lines.length,model_removed:audit.model_removed_count};
      const result = await modelFeedback('reflection', { answer:text, materials:[{id:'executed_result',content:summaryResult},{id:'confirmed_plan',content:{plan:job.plan,dictionary:job.dictionary,checks:job.description.checks}}] },env,{session_id:job.session_id,owner,task_id:job.id});
      const item = { task_id:job.id,answer: text, feedback: `${result.warning}\n${result.answer}`, mode:result.mode, model:result.actual_model||result.model,prompt_version:result.prompt_version, interaction_id:result.interaction_id||null,created: Date.now() / 1000, answer_version:job.reflections.length+1 };
      job.reflections.push(item); job.reflection = item;
      job.record_version=(job.record_version||1)+1;
      job.last_activity=Date.now();
      const saved=await env.DB.prepare("UPDATE jobs SET body=?,last_activity=? WHERE id=? AND owner=? AND COALESCE(json_extract(body,'$.record_version'),1)=?")
        .bind(JSON.stringify(job),job.last_activity,job.id,job.owner,previousVersion).run();
      if(!saved.meta.changes)return fault('结果记录已变化。解释草稿保留，请读取最新记录后再提交。',409);
      return resultJson(item);
    }
    if (tail === 'rerun' && request.method === 'POST') {
      if (job.status !== 'succeeded') return fault('仅完成的任务可独立核对。',409);
      const count=await env.DB.prepare('SELECT ((SELECT COUNT(*) FROM jobs WHERE owner=? AND created_at>?)+(SELECT COUNT(*) FROM local_stata_tasks WHERE owner=? AND created_at>?)) AS n').bind(owner,Date.now()-86400000,owner,Date.now()-86400000).first();
      if(count.n>=30)return fault('今日分析次数达到上限。',429);
      const object=await env.FILES.get(job.input_key);if(!object)return fault('原始输入丢失。',404);
      const originalText=await object.text();
      const id=crypto.randomUUID(),key=`jobs/${owner}/${id}/input.csv`;
      const clone={...job,id,input_key:key,nonce:crypto.randomUUID(),status:'running',created:Date.now()/1000,result:null,reflections:[],reflection:null,verification:null,verification_of_job_id:job.id,record_version:1};
      delete clone.completed;delete clone.error;delete clone.node_artifacts;delete clone.remote_submitted;delete clone.remote_synced;delete clone.cancel_requested;clone.execution_location=job.execution_location||'browser_webr';clone.engine_id=job.engine_id||'browser_webr';
      await env.FILES.put(key,originalText);
      try { await env.DB.prepare('INSERT INTO jobs(id,session_id,owner,body,status,input_key,created_at,last_activity,lease_until) VALUES(?,?,?,?,?,?,?,?,?)').bind(id,job.session_id,owner,JSON.stringify(clone),'running',key,Date.now(),Date.now(),Date.now()+30000).run(); }
      catch(cause){await env.FILES.delete(key);throw cause;}
      if(clone.execution_location==='cloud_native')await submitCloudJob(env,clone,originalText);
      return resultJson({...publicJob(clone),execution_nonce:clone.nonce},202);
    }
    if (tail === 'report' && request.method === 'GET') return new Response(reportMarkdown(job)+'\n'+modelEvidenceMarkdown(await modelInteractions(env,job.session_id,owner,job.id),false), { headers: { 'Content-Type': 'text/markdown; charset=utf-8', 'Content-Disposition': 'attachment; filename="r-analysis-report.md"' } });
    if (tail === 'package' && request.method === 'GET') {
      const object = await env.FILES.get(job.input_key);
      if (!object) return fault('输入文件已丢失。', 404);
      const original = await object.text();
      const prepared = normalized(parseCsv(original, job.filename), job.plan);
      const interactions=await modelInteractions(env,job.session_id,owner,job.id);
      const files = {
        'README.md': `# 实证学徒复现包\n\n输入 SHA-256：${job.input_sha256}\n方案 SHA-256：${job.plan_sha256}\n执行位置：${locationLabel(job)}。${job.result_origin||'任务未完成'}\n\n${job.software==='stata'?'使用记录的 Stata 版本，在当前目录批处理 estimate.do。完整参数（含年份虚拟变量）见 full-coefficients.csv。':job.execution_location==='cloud_native'?'使用 R 4.6.1、fixest 0.14.2 与 jsonlite 2.0.0，运行 Rscript --vanilla estimate.R .；结果写入 result.json。':'使用记录的 R/fixest，在本目录运行 reproduce.R。'}\n与 results.json 核对变量、实际样本、系数、标准误、区间及推断口径。原始来源与使用条件须由学生自行核实。\n`,
        'input.csv': original, 'normalized.csv': prepared.csv,
        'plan.json': JSON.stringify(job.plan, null, 2),
        'variable_dictionary.json': JSON.stringify(job.dictionary || {}, null, 2),
        'evidence_snapshot.json': JSON.stringify(job.evidence_snapshot || {},null,2),
        'verification.json': JSON.stringify(job.verification || {status:'not_checked'},null,2),
        'export_version.json':JSON.stringify({task_id:job.id,research_revision:job.research_revision,record_version:job.record_version||1,execution_location:job.execution_location||'browser_webr',engine_id:job.engine_id||'browser_webr',software:job.software||'r'}),
        'results.json': JSON.stringify(job.result || { status: job.status, error: job.error || '' }, null, 2),
        'report.md': reportMarkdown(job)+'\n'+modelEvidenceMarkdown(interactions,false), 'agent_interactions.json':JSON.stringify(interactions,null,2),...(job.node_artifacts||{'reproduce.R': reproductionScript(prepared.plan)}),
        'execution.log': job.node_artifacts?.['execution.log'] || `created=${new Date(job.created * 1000).toISOString()}\nstatus=${job.status}\nlocation=${job.execution_location||'browser_webr'}\nR=${job.result?.r_version || 'not completed'}\nfixest=${job.result?.package_versions?.fixest || 'not completed'}\n`,
      };
      if(job.result){files['coefficients.svg']=coefficientsSvg(job);if(job.plan.method==='did')files['group_trends.svg']=groupTrendsSvg(job,parseCsv(original,job.filename));}
      return new Response(zipFiles(files), { headers: { 'Content-Type': 'application/zip', 'Content-Disposition': 'attachment; filename="r-reproduction.zip"' } });
    }
    if (/^artifacts\/(coefficients\.svg|group_trends\.svg|coefficients\.csv|execution\.log)$/.test(tail) && request.method === 'GET') {
      if (!job.result) return fault('任务尚无执行结果。', 409);
      const name = tail.split('/')[1];
      if (name === 'coefficients.svg') return new Response(coefficientsSvg(job), { headers: { 'Content-Type': 'image/svg+xml; charset=utf-8' } });
      if (name === 'coefficients.csv') return new Response('term,estimate,std_error,p_value,ci_low,ci_high\n' + job.result.coefficients.map((row) => [row.term, row.estimate, row.std_error, row.p_value, row.ci_low, row.ci_high].map(quoteCsv).join(',')).join('\n'), { headers: { 'Content-Type': 'text/csv; charset=utf-8' } });
      if (name === 'execution.log') return new Response(job.node_artifacts?.['execution.log'] || `location=${job.execution_location||'browser_webr'}\nstatus=${job.status}\nR=${job.result.r_version}\nfixest=${job.result.package_versions.fixest}\n`, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
      const object = await env.FILES.get(job.input_key);
      if (!object) return fault('输入文件已丢失。', 404);
      return new Response(groupTrendsSvg(job, parseCsv(await object.text(), job.filename)), { headers: { 'Content-Type': 'image/svg+xml; charset=utf-8' } });
    }
    return null;
  } catch (cause) { return fault(cause?.message || '任务请求无法处理。'); }
}

export function reportMarkdown(job) {
  const lines = [`# 分析与复现报告`, '', `> ${job.result_origin || '任务尚未完成，无可用估计结果。'}`, '',
    `- 研究问题：${job.question || '未提供'}`, `- 数据来源（学生提供，未自动核实）：${job.source || '未提供'}`,
    `- 文件：${job.filename}`, `- 原始行数：${job.n_rows}`, `- 选定列缺失行：${job.missing_lines.join(', ') || '无'}`,
    `- 方法：${job.description.label}`, `- 公式：${job.description.formula}`,
    `- 输入 SHA-256：${job.input_sha256}`, `- 方案 SHA-256：${job.plan_sha256}`,
    `- 执行位置：${locationLabel(job)}`, `- 方案确认：学生执行前确认`];
  lines.push(`- 执行资料版本：${job.research_revision ?? '历史未记录'}；导出版本：${job.record_version || 1}`,`- 重跑核对：${job.verification?.status || 'not_checked'}`);
  if(job.stale)lines.push('> 当前研究资料已修改；以下为历史方案与执行结果。');
  lines.push('', '## 执行前资料与来源状态');
  const snapshot=job.evidence_snapshot||{},cards=snapshot.preparation?.cards||{};
  const sourceStatuses={verified:'学生已核对（系统未认证）',filled:'已填写，待核对',to_find:'待查找'};
  const labels={question:'研究问题',sample:'对象与时期',outcome:'结果与单位',predictor:'解释变量',data_source:'数据来源',access:'获取条件',policy_doc:'政策原文',release_date:'发布日期',effective_date:'实施日期',expansion_date:'扩围信息',treated_list:'处理名单',comparison:'比较对象'};
  if(!Object.keys(cards).length)lines.push('- 未填写准备卡；上方来源声明仍需自行核对。');
  for(const [key,card]of Object.entries(cards))lines.push(`- ${labels[key]||key}：${card.value||'待查找'}；${sourceStatuses[card.status]||'待查找'}；来源：${card.source_title||'未提供'}；链接：${card.source_url||'未提供'}；查阅：${card.accessed_on||'未提供'}`);
  for(const [key,field]of Object.entries(snapshot.blueprint||{}))if(field.value)lines.push(`- 蓝图 ${key}：${field.value}；来源核对状态：${field.verification}`);
  lines.push('- 完整执行快照见复现包 evidence_snapshot.json。');
  lines.push('', '## 变量定义与单位（学生提供，未自动核实）');
  const names = [job.plan.outcome, ...job.plan.predictors, job.plan.unit, job.plan.time, job.plan.treated, job.plan.cluster].filter(Boolean);
  for (const name of new Set(names)) lines.push(`- ${name}：${job.dictionary?.[name] || '未提供定义与单位，需核对'}`);
  lines.push('', '## 已执行结果');
  if (job.result) {
    lines.push(`- 软件：${job.result.software_version||job.result.r_version}`, `- 包：${JSON.stringify(job.result.package_versions)}`,`- 推断口径：${JSON.stringify(job.result.inference||{vcov:job.plan.vcov})}`, `- 估计样本：${job.result.n_used}`, '', '| 变量 | 系数 | 标准误 | p 值 | 95% 区间 |', '|---|---:|---:|---:|---:|');
    for (const row of job.result.coefficients) lines.push(`| ${row.term} | ${row.estimate} | ${row.std_error} | ${row.p_value} | [${row.ci_low}, ${row.ci_high}] |`);
    lines.push('', `- 选定变量缺失删除 ${job.missing_lines.length} 行；模型另排除 ${job.result.audit.model_removed_count} 行。`,
      `- R 模型排除原始 CSV 行：${job.result.audit.model_removed_csv_lines?.join(', ') || (job.result.audit.used_indices ? '无' : '历史执行未记录')}`,
      '## 警告与局限', ...job.result.warnings.map((item) => `- ${item}`), `- ${job.description.checks}`);
  } else lines.push(`状态：${job.status}；${job.error || '尚无执行结果。'}`);
  lines.push('', '## 学生解释与修订');
  if(!job.reflections.length)lines.push('- 解释练习待完成；分析结果可以下载，学习成果尚未提交。');
  for (const [index, item] of job.reflections.entries()) lines.push(`### 第 ${index + 1} 次`, item.answer, '', `反馈：${item.feedback}`);
  lines.push('', '## 独立复现与核对', '- 下载并解压该任务的完整复现包，保留原始输入、方案、哈希与版本记录。', '- 使用记录的 R 与 fixest 版本，在解压目录运行复现脚本；核对实际样本、变量、系数、标准误和区间。', '- 也可在页面点击“从原始输入独立重跑核对”，使用相同引擎的新任务复算，绝对误差容差 5×10⁻⁶。', '- 浏览器复算一致仍不代表服务器数值认证或因果条件已满足。');
  if(job.verification?.differences?.length)for(const difference of job.verification.differences)lines.push(`- 差异：${difference.term||''} ${difference.field}；${difference.reason||`绝对误差 ${difference.absolute_difference}`}`);
  return lines.join('\n') + '\n';
}

function reproductionScript(plan) {
  const rhs = [...(plan.method === 'did' ? ['policy_effect'] : []), ...plan.predictors].join(' + ');
  const formula = `${plan.outcome} ~ ${rhs}${plan.method === 'ols' ? '' : ` | ${plan.unit} + ${plan.time}`}`;
  const vcov = plan.vcov === 'cluster' ? `~${plan.cluster}` : JSON.stringify(plan.vcov);
  const did = plan.method === 'did' ? `d$policy_effect <- as.numeric(d[[${JSON.stringify(plan.treated)}]]) * as.integer(as.numeric(d[[${JSON.stringify(plan.time)}]]) >= ${plan.policy_year})\n` : '';
  return `stopifnot(as.character(packageVersion('fixest')) == '0.14.2')\nd <- read.csv('normalized.csv', check.names=FALSE, na.strings=c('', 'NA', 'N/A', 'null', 'NaN'))\n${did}fit <- fixest::feols(as.formula(${JSON.stringify(formula)}), data=d, vcov=${vcov}, nthreads=1, notes=FALSE)\nprint(summary(fit))\nprint(confint(fit, level=.95))\nwrite.csv(cbind(fixest::coeftable(fit), confint(fit, level=.95)), 'reproduced-coefficients.csv')\n`;
}

export function compareResults(original, rerun) {
  const a=original?.result,b=rerun?.result,tolerance=5e-6,differences=[];
  if(!a||!b)return {status:'not_checked',tolerance};
  for(const key of ['input_sha256','plan_sha256'])if(original[key]!==rerun[key])differences.push({field:key,reason:'哈希不同'});
  if(a.n_used!==b.n_used||a.r_version!==b.r_version||a.software_version!==b.software_version||JSON.stringify(a.package_versions)!==JSON.stringify(b.package_versions)||JSON.stringify(a.audit?.used_indices)!==JSON.stringify(b.audit?.used_indices)||JSON.stringify(a.inference)!==JSON.stringify(b.inference)||original.engine_id!==rerun.engine_id)differences.push({field:'sample_or_version',reason:'样本或版本不同'});
  const terms=new Map(b.coefficients.map(r=>[r.term,r]));
  if(terms.size!==a.coefficients.length)differences.push({field:'terms',reason:'系数集合不同'});
  for(const row of a.coefficients)for(const key of ['estimate','std_error','ci_low','ci_high']){
    const delta=terms.has(row.term)?Math.abs(row[key]-terms.get(row.term)[key]):null;
    if(delta===null||delta>tolerance)differences.push({term:row.term,field:key,absolute_difference:delta});
  }
  return {status:differences.length?'inconsistent':'consistent',tolerance,differences,location:rerun.execution_location||'browser_webr',at:new Date().toISOString()};
}
const xml = (value) => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char]);
function coefficientsSvg(job) {
  const rows = job.result.coefficients, width = 680, height = Math.max(180, 60 + rows.length * 42);
  const min = Math.min(0, ...rows.map((row) => row.ci_low)), max = Math.max(0, ...rows.map((row) => row.ci_high));
  const span = Math.max(.001, max - min), x = (value) => 180 + ((value - min) / span) * 460;
  const marks = rows.map((row, index) => {
    const y = 55 + index * 42;
    return `<text x="8" y="${y + 4}" font-size="13">${xml(row.term)}</text><line x1="${x(row.ci_low)}" y1="${y}" x2="${x(row.ci_high)}" y2="${y}" stroke="#087e75" stroke-width="3"/><circle cx="${x(row.estimate)}" cy="${y}" r="5" fill="#0b645e"/>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="系数与95%区间"><rect width="100%" height="100%" fill="#fff"/><line x1="${x(0)}" y1="25" x2="${x(0)}" y2="${height - 25}" stroke="#a0aaa7" stroke-dasharray="4 4"/>${marks}<text x="8" y="${height - 10}" font-size="11" fill="#586765">${xml(locationLabel(job))} 结果；来源与因果条件未认证</text></svg>`;
}

function groupTrendsSvg(job, data) {
  if (job.plan.method !== 'did') return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 80"><text x="12" y="40">仅 DID 提供组均值图</text></svg>`;
  const { time, treated, outcome } = job.plan;
  const ti = data.headers.indexOf(time), gi = data.headers.indexOf(treated), yi = data.headers.indexOf(outcome);
  const cells = new Map();
  const used=job.result?.audit?.used_indices?new Set(job.result.audit.used_indices):null;
  for (const [index,row] of data.rows.entries()) {
    if(used&&!used.has(index+1))continue;
    if([time,treated,outcome,...job.plan.predictors].some(name=>MISSING.has(row[data.headers.indexOf(name)])))continue;
    const year = Number(row[ti]), value = Number(row[yi]), group = row[gi];
    if (!Number.isFinite(year) || !Number.isFinite(value)) continue;
    const key = `${group}:${year}`, item = cells.get(key) || { group, year, sum: 0, n: 0 };
    item.sum += value; item.n++; cells.set(key, item);
  }
  const values = [...cells.values()].sort((a, b) => a.year - b.year);
  const years = [...new Set(values.map((item) => item.year))].sort((a, b) => a - b);
  const lo = Math.min(...values.map((item) => item.sum / item.n)), hi = Math.max(...values.map((item) => item.sum / item.n));
  const x = (year) => 55 + (year - years[0]) / Math.max(1, years.at(-1) - years[0]) * 480;
  const y = (value) => 205 - (value - lo) / Math.max(.001, hi - lo) * 150;
  const lines = ['0', '1'].map((group) => {
    const points = values.filter((item) => item.group === group).map((item) => `${x(item.year)},${y(item.sum / item.n)}`).join(' ');
    return `<polyline points="${points}" fill="none" stroke="${group === '1' ? '#087e75' : '#c57442'}" stroke-width="3"/>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 260" role="img" aria-label="处理组与对照组描述性均值"><rect width="100%" height="100%" fill="#fff"/>${lines}${years.map((year) => `<text x="${x(year)}" y="230" text-anchor="middle" font-size="11">${year}</text>`).join('')}<text x="55" y="20" font-size="12">处理组</text><text x="145" y="20" font-size="12" fill="#c57442">对照组</text><text x="55" y="252" font-size="11">描述性图；不能证明平行趋势</text></svg>`;
}

export function locationLabel(job){return job.execution_location==='cloud_native'?`云端原生 ${job.software==='stata'?'Stata':'R'}`:'浏览器 webR';}
async function submitCloudJob(env,job,text,session){
  const prepared=normalized(parseCsv(text,job.filename),job.plan);
  const payload={id:job.id,session_id:job.session_id,software:job.software,engine_id:job.engine_id,execution_location:job.execution_location,input_sha256:job.input_sha256,plan_sha256:job.plan_sha256,normalized_sha256:await digest(prepared.csv),csv:prepared.csv,plan:prepared.plan,expires_at:(session?.last_activity||Date.now()/1000)+7*86400};
  job.status='queued';job.remote_payload_sha256=await digest(JSON.stringify(payload));await saveJob(env,job);
  // Persist the exact payload before network IO so retries are idempotent even if submission response is lost.
  await env.FILES.put(job.input_key+'.node.json',JSON.stringify(payload));
  try { const remote=await nodeRequest(env,job.owner,'jobs',payload);job.status=remote.status;job.remote_submitted=true; }
  catch(e){job.sync_error=e.message;job.remote_submitted=false;if(e.status>=400&&e.status<500){job.status='failed';job.error=e.message;job.remote_synced=true;}}
  await saveJob(env,job);
}
export async function syncCloudJob(env,job,session){
  if(job.execution_location!=='cloud_native')return;
  if(job.remote_synced && ['succeeded','failed','interrupted','cancelled'].includes(job.status))return;
  try {
    if(job.cancel_requested){
      try{await nodeRequest(env,job.owner,`jobs/${job.id}/cancel`,{});job.remote_submitted=true;}
      catch(e){if(e.status===404){job.status='cancelled';job.error='取消请求已保存，节点没有可访问任务。';job.remote_synced=true;job.sync_error=null;await saveJob(env,job);return;}throw e;}
    }
    if(!job.remote_submitted){const object=await env.FILES.get(job.input_key+'.node.json');if(!object)throw new Error('云端提交快照丢失。');const remote=await nodeRequest(env,job.owner,'jobs',JSON.parse(await object.text()));job.remote_submitted=true;job.status=remote.status;}
    if(job.remote_synced && ['succeeded','failed','interrupted','cancelled'].includes(job.status))return;
    const remote=await nodeRequest(env,job.owner,`jobs/${job.id}`);
    if(remote.input_sha256!==job.input_sha256||remote.plan_sha256!==job.plan_sha256||remote.engine_id!==job.engine_id)throw new Error('执行节点返回的任务快照不匹配。');
    if(remote.status==='succeeded'&&!remote.result)throw new Error('执行节点未提供已完成任务的结果。');
    if(remote.result){
      const r=remote.result;
      if(!Number.isInteger(r.n_used)||r.n_used<1||r.n_used>job.n_rows||!Array.isArray(r.coefficients)||!r.coefficients.length||r.coefficients.length>15||r.coefficients.some(c=>!['estimate','std_error','p_value','ci_low','ci_high'].every(k=>Number.isFinite(c[k]))))throw new Error('执行节点结果格式无效。');
      if(!Array.isArray(r.used_indices)||r.used_indices.length!==r.n_used||new Set(r.used_indices).size!==r.n_used||r.used_indices.some(i=>!Number.isInteger(i)||i<1||i>job.n_rows))throw new Error('执行节点样本索引无效。');
      r.audit={missing_removed_csv_lines:job.missing_lines,used_indices:r.used_indices,model_removed_count:job.n_rows-job.missing_lines.length-r.n_used,model_removed_csv_lines:job.csv_lines.filter((line,i)=>!r.used_indices.includes(i+1)&&!job.missing_lines.includes(line))};
      job.result=r;job.completed=remote.completed;job.node_artifacts=Object.fromEntries(Object.entries(remote.artifacts||{}).filter(([k,v])=>/^(estimate\.(R|do)|parameters\.json|execution\.log|session-info\.txt|full-coefficients\.csv|sample\.csv)$/.test(k)&&typeof v==='string'));
      job.result_origin=`${locationLabel(job)}执行节点返回；Sites 校验归属、快照与格式，未另行复算。`;
      if(job.verification_of_job_id){const original=await getJob(env,job.owner,job.verification_of_job_id);job.verification=compareResults(original,job);if(original){original.verification={...job.verification,rerun_job_id:job.id};original.record_version=(original.record_version||1)+1;await saveJob(env,original);}}
    }
    job.status=remote.status;job.error=remote.error;job.sync_error=null;
    job.remote_synced=['succeeded','failed','interrupted','cancelled'].includes(remote.status);
    await saveJob(env,job);
  } catch(e){job.sync_error=e.message;} // Keep running cloud jobs recoverable during connectivity loss.
}
