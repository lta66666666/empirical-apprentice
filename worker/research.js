import {normalizeMethodPlan} from './plan-normalization.js';
import {methodRegistry,enabledMethods} from './method-registry.js';
import {handleResearchData,loadResearchData} from './research-data.js';
import {correspondingReference} from './corresponding-teaching.js';
import {sampleEvidence,sampleEvidenceText} from './sample-evidence.js';
import {datasetMetadata,interpretationWarnings} from './dataset-metadata.js';
import { engineMetadata, engineCapabilities, nodeRequest, digest } from './executor.js';
import { fixtures } from './fixtures.js';
import { loadOwnedSession, saveSession, touchSession, requireSessionVersion } from './sessions.js';
import {requestIdentity,repeatedTask} from './request-consistency.js';
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
const jobSnapshots=new WeakMap();
const requestFault=cause=>resultJson({detail:cause?.message||'���������޷�������',...(cause?.state_version!==undefined?{state_version:cause.state_version}:{})},cause?.status||422);

export function parseCsv(text, filename = 'data.csv') {
  if (typeof text !== 'string' || new TextEncoder().encode(text).length > MAX_BYTES) throw new Error('�ļ���� 2 MB��');
  if (text.includes('\ufffd')) throw new Error('��⵽�޷�������ַ��������µ��� UTF-8 CSV/TSV��');
  const delimiter = filename.toLowerCase().endsWith('.tsv') ? '\t' : ',';
  const rows = [], starts = [], meaningful=[];
  let row = [], value = '', quoted = false, rowQuoted=false, afterQuote = false, line = 1, rowLine = 1;
  const source = text.replace(/^\ufeff/, '');
  const pushField = () => { row.push(value); value = ''; afterQuote = false; };
  const pushRow = () => { meaningful.push(rowQuoted||row.length>0||Boolean(value.trim()));pushField(); rows.push(row); starts.push(rowLine); row = [];rowQuoted=false; rowLine = line + 1; };
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (quoted) {
      if (ch === '"' && source[i + 1] === '"') { value += '"'; i++; }
      else if (ch === '"') { quoted = false; afterQuote = true; }
      else { value += ch; if (ch === '\n') line++; }
    } else if (ch === '"' && value === '' && !afterQuote) {quoted = true;rowQuoted=true;}
    else if (ch === delimiter) pushField();
    else if (ch === '\n') { pushRow(); line++; }
    else if (ch === '\r' && source[i + 1] === '\n') { pushRow(); i++; line++; }
    else if (afterQuote && ch !== ' ' && ch !== '\t') throw new Error(`�� ${line} �����ź��������Ч��`);
    else value += ch;
  }
  if (quoted) throw new Error('CSV ����δ�պϡ�');
  if (value || row.length || afterQuote) pushRow();
  if (!rows.length) throw new Error('�����ļ�Ϊ�ա�');
  const headers = rows.shift().map((value) => value.trim());
  starts.shift();meaningful.shift();
  if (!headers.length || headers.length > 60 || headers.some((value) => !value || value.length > 100) || new Set(headers).size !== headers.length) {
    throw new Error('������ǿ��Ҳ��ظ������ 60 �У���������� 100 �֡�');
  }
  const body = [], lines = [];
  for (let i = 0; i < rows.length; i++) {
    if (!meaningful[i]) continue;
    if (rows[i].length !== headers.length) throw new Error(`�� ${starts[i]} ���������ͷ��һ�¡�`);
    if (body.length >= MAX_ROWS) throw new Error('���֧�� 20000 �С�');
    body.push(rows[i].map((value) => value.trim())); lines.push(starts[i]);
  }
  if (!body.length) throw new Error('�ļ�û�й۲��С�');
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
function validateDateRole(plan,material){
 const format=material.labels?.date_formats?.[plan.time];
 if(plan.method!=='ols'&&format&&!/^%ty/.test(format))throw new Error('��ѡʱ������Stata�£������յ����ڱ��룬����ֱ�ӵ�����ȡ�����Ԥ����ȷ�����ת���������Զ��ϲ��۲⡣');
}

function validatePlan(input, data, blueprint, session) {
  if (!input || typeof input !== 'object') throw new Error('��������������');
  input=normalizeMethodPlan({...input,method:input.method||'ols',vcov:input.vcov||'hetero'});
  const plan = {
    method: input.method || 'ols', outcome: input.outcome || '',
    predictors: Array.isArray(input.predictors) ? input.predictors : [], unit: input.unit || '',
    time: input.time || '', treated: input.treated || '', policy_year: input.policy_year ?? null,
    vcov: input.vcov || 'hetero', cluster: input.cluster || '', missing: input.missing || 'block',
    same_batch: input.same_batch === true, engine_id: input.engine_id || 'statspai_cloud',
  };
  if (!engineMetadata[plan.engine_id]) throw new Error('ִ������δ���롣');
  for(const key of ['software','execution_location'])if(input[key]!==undefined && input[key]!==engineMetadata[plan.engine_id][key])throw new Error('������λ�������治һ�£�����������������');
  Object.assign(plan,engineMetadata[plan.engine_id]); delete plan.label;
  if (!enabledMethods.includes(plan.method)) throw new Error(methodRegistry[plan.method]?.reason||'�÷�����δ���롣');
  if (!['iid', 'hetero', 'cluster'].includes(plan.vcov) || !['block', 'drop'].includes(plan.missing)) throw new Error('��׼���ȱʧ����������Ч��');
  if(plan.method!=='ols'&&plan.vcov!=='cluster')throw new Error('���̶ֹ�ЧӦ��DID�����ŵ�������׼����ѡ������С�');
  if (!data.headers.includes(plan.outcome)) throw new Error('��ѡ�������еĽ��������');
  if (plan.predictors.length > 12 || new Set(plan.predictors).size !== plan.predictors.length || plan.predictors.includes(plan.outcome)) throw new Error('���ͱ��������ظ������������������ 12 �С�');
  if (plan.method !== 'did' && !plan.predictors.length) throw new Error('������ѡ��һ�����ͱ�����');
  if (plan.method !== 'ols' && (!plan.unit || !plan.time || plan.unit === plan.time)) throw new Error('��������Ҫ��ͬ�ĸ����к�����С�');
  if (plan.method === 'did' && (!plan.treated || !Number.isInteger(plan.policy_year) || plan.policy_year < 1800 || plan.policy_year > 2200 || !plan.same_batch)) {
    throw new Error('���� DID ��֧��ͬ��ʵʩ����˶����������ݺ�����������');
  }
  const batches = blueprint?.policy_batches?.value || '';
  if (plan.method === 'did' && session && didConflict(session)) throw new Error(didConflict(session));
  if (plan.method === 'did' && /����/.test(batches) && !/û�з���|���Ƿ���|�Ƿ���/.test(batches)) throw new Error('��ͼ��¼�˷���ʵʩ������ͬ�� DID �����á�');
  if (plan.method !== 'ols' && (plan.vcov !== 'cluster' || !plan.cluster)) throw new Error('�̶�ЧӦ�� DID ��ָ�������׼��');
  if (plan.vcov === 'cluster' && !plan.cluster) throw new Error('�����׼����Ҫ�����С�');
  const required = [plan.outcome, ...plan.predictors, plan.unit, plan.time, plan.treated, plan.cluster].filter(Boolean);
  const absent = required.filter((name) => !data.headers.includes(name));
  if (absent.length) throw new Error('������û����Щ�У�' + absent.join(', '));
  for (const name of [plan.outcome, ...plan.predictors]) {
    if (!data.profile.columns.find((column) => column.name === name).numeric) throw new Error(`${name} ���ǿ�����ֵ�С�`);
  }
  const selected = [...new Set(required)];
  const incomplete = (row) => selected.some((name) => MISSING.has(row[data.headers.indexOf(name)]));
  const missingLines = data.rows.flatMap((row, index) => incomplete(row) ? [data.lines[index]] : []);
  if (missingLines.length && plan.missing === 'block') throw new Error(`ѡ���д��� ${missingLines.length} ��ȱʧ����˲����ȷ����ɾ����`);
  const usableRows = data.rows.filter((row) => !incomplete(row));
  if (usableRows.length < Math.max(8, plan.predictors.length+(plan.method==='did'?1:0)+2)) throw new Error('ѡ�����������������㣬������Ҫ max(8,������������2) �С�');
  if(plan.vcov==='cluster'&&new Set(usableRows.map(r=>r[data.headers.indexOf(plan.cluster)])).size<2)throw new Error('������Ҫ���������顣');
  if (plan.method !== 'ols') {
    const ui = data.headers.indexOf(plan.unit), ti = data.headers.indexOf(plan.time), seen = new Set();
    for (const row of usableRows) {
      const year=Number(row[ti]);if(!Number.isInteger(year))throw new Error('��ݱ���Ϊ������');
      const key = JSON.stringify([row[ui], year]);
      if (seen.has(key)) throw new Error('���� �� ʱ�����������˲��ϲ��ظ��۲⡣');
      seen.add(key);
    }
  }
  if (plan.method === 'did') {
    const ui = data.headers.indexOf(plan.unit), ti = data.headers.indexOf(plan.time), gi = data.headers.indexOf(plan.treated);
    const groups = new Map(); let before = 0, after = 0, treated = 0, control = 0;
    for (const row of usableRows) {
      const group = row[gi], year = Number(row[ti]);
      if (!['0', '1'].includes(group) || !Number.isFinite(year)) throw new Error('DID �����Ϊ 0/1�������Ϊ��ֵ��');
      if (groups.has(row[ui]) && groups.get(row[ui]) !== group) throw new Error('ͬһ��λ�Ĵ�����������ʱ��仯��');
      groups.set(row[ui], group);
      if (year < plan.policy_year) before++; else after++;
      if (group === '1') treated++; else control++;
    }
    if (!before || !after || !treated || !control) throw new Error('DID ��Ҫ����ǰ���봦������������۲⡣');
    const periods=new Map(),cells=new Set();
    for(const row of usableRows){const post=Number(row[ti])>=plan.policy_year?1:0;periods.set(row[ui],(periods.get(row[ui])||0)|(post?2:1));cells.add(row[gi]+':'+post);}
    const incompleteUnits=[...periods.values()].filter(mask=>mask!==3).length;
    if(incompleteUnits)throw new Error(`������������ ${incompleteUnits} ������ȱ������ǰ�����ߺ�۲⣻���������ȱʧ������δ�Զ�ɾ�����塣`);
    if(cells.size!==4)throw new Error('��������ȱ�ٴ����������ǰ���ĸ��еĹ۲⣬��˶�������');
  }
  return { plan, missingLines };
}

function description(plan) {
  const labels = { ols: 'OLS����Ԫ���Իع�', panel_fe: '��������ݹ̶�ЧӦ', did: 'ͬ�� DID' };
  const rhs = plan.method === 'did' ? ['������ �� ���ߺ�', ...plan.predictors].join(' + ') : plan.predictors.join(' + ');
  return { label: labels[plan.method], formula: `${plan.outcome} ~ ${rhs}${plan.method === 'ols' ? '' : ` | ${plan.unit} + ${plan.time}`}`,
    meaning: plan.method === 'did' ? '�������ʾ�����������ߺ����Ա仯�������������ʶ�����֤�ݡ�' : 'ϵ����ʾ������������λ���ϱ���������ͣ������Բ����������',
    checks: plan.method === 'did' ? 'ʵʩ���Ρ����������ѡ������ǰ���ƺ�ͬ�ڳ����' : plan.method === 'panel_fe' ? '��ʱ��仯�Ļ������ء������仯�;���㼶��' : '�������ء�������λ��������ʽ��ȱʧ���ݡ�',
    quiz: '�����һ��ϵ�����䵥λ����ָ��ģ����δ��֤��������' };
}

async function sha256(value) {
  const bytes = new TextEncoder().encode(value);
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function getJob(env, owner, id, touch=false) {
  const row = await env.DB.prepare('SELECT body,last_activity,lease_until FROM jobs WHERE id=? AND owner=?').bind(id, owner).first();
  if (!row || row.last_activity + RETENTION <= Date.now()) return null;
  const job = JSON.parse(row.body);
  jobSnapshots.set(job,row.body);
  const session = await loadOwnedSession(env, owner, job.session_id,touch);
  if (!session || session==='expired') return null;
  job.stale = !!session && session !== 'expired' && job.research_revision !== undefined && job.research_revision !== session.research_revision;
  job.changed_evidence = job.stale ? ['�о�׼������ͼ������ֵ����޸ģ���˶Ե�ǰ��������ʷ���ա�'] : [];
  if (job.execution_location === 'cloud_native') await syncCloudJob(env,job,session);
  if (job.execution_location !== 'cloud_native' && job.status === 'running' && row.lease_until < Date.now()) {
    job.status = 'interrupted'; job.error = '�����ִ�����жϣ��ɴӱ���������������С�';
    try{await saveJob(env,job);}catch(error){if(error.status!==409)throw error;const current=await env.DB.prepare('SELECT body FROM jobs WHERE id=? AND owner=?').bind(id,owner).first();if(current){Object.assign(job,JSON.parse(current.body));jobSnapshots.set(job,current.body);}}
  }
  return job;
}

async function saveJob(env, job, touchOwner = false) {
  const now = Date.now();
  job.last_activity = now;
  const previous=jobSnapshots.get(job),body=JSON.stringify(job);
  const changed=await env.DB.prepare('UPDATE jobs SET body=?,status=?,last_activity=?,lease_until=? WHERE id=? AND owner=? AND body=?')
    .bind(body,job.status,now,job.status==='running'?now+30000:0,job.id,job.owner,previous??body).run();
  if(!changed.meta.changes){const error=Error('����״̬�ѱ仯�����ȡ���½�����ٲ�����');error.status=409;throw error;}
  jobSnapshots.set(job,body);
  if (touchOwner) {
    const session = await loadOwnedSession(env, job.owner, job.session_id);
    if (session && session !== 'expired') await touchSession(env, session);
  }
}

function publicJob(job) {
  const { owner, nonce, input_key, node_artifacts, ...visible } = job;
  return {software:job.software||'r',engine_id:job.engine_id||'browser_webr',execution_location:job.execution_location||'browser_webr',...visible,sample_evidence:sampleEvidence(job)};
}

function validateSubmittedResult(result, job) {
  if (!result || !Number.isInteger(result.n_used) || result.n_used < 1 || result.n_used > job.n_rows) throw new Error('�����������Ч��');
  if (result.package_versions?.fixest !== '0.14.2' || !/^R 4\./.test(result.r_version || '')) throw new Error('ִ�а汾�������հ汾������');
  if (!Array.isArray(result.coefficients) || !result.coefficients.length || result.coefficients.length > 15) throw new Error('ϵ������ʽ��Ч��');
  if (new Set(result.coefficients.map(row=>row.term)).size !== result.coefficients.length) throw new Error('ϵ���������ظ���');
  for (const row of result.coefficients) {
    if (typeof row.term !== 'string' || row.term.length > 120 || !['estimate', 'std_error', 'p_value', 'ci_low', 'ci_high'].every((key) => Number.isFinite(row[key]))) throw new Error('ϵ��������Ч��ֵ��');
    if (row.std_error < 0 || row.p_value < 0 || row.p_value > 1 || row.ci_low > row.ci_high) throw new Error('ϵ����������׼����Ч��');
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

async function exportInteractions(env,job,owner){
 const accepted=new Set((job.reflections||[]).map(x=>x.interaction_id).filter(Boolean));
 return (await modelInteractions(env,job.session_id,owner,job.id)).filter(x=>x.kind!=='reflection'||accepted.has(x.id));
}
async function requireExportVersion(env,job){const row=await env.DB.prepare('SELECT body FROM jobs WHERE id=? AND owner=?').bind(job.id,job.owner).first();if(!row||(JSON.parse(row.body).record_version||1)!==(job.record_version||1))throw Object.assign(Error('�����ڵ����ڼ���£����������ɡ�'),{status:409});}

export async function handleResearch(request, env, owner, path) {
  const materialReply=await handleResearchData(request,env,owner,path);if(materialReply)return materialReply;
  const teachingRoute=/^\/api\/sessions\/([a-z0-9]{12})\/research\/teaching$/.exec(path);
  if(teachingRoute&&request.method==='GET')try{const state=await loadOwnedSession(env,owner,teachingRoute[1]);if(!state||state==='expired')return fault('��ϰ���ɶ�ȡ��',404);const ref=Object.fromEntries(new URL(request.url).searchParams),lesson=await correspondingReference(env,owner,state,ref);return resultJson({card:lesson.card,reference:lesson.reference});}catch(e){return fault(e.message,e.status||422);}
  if (path === '/api/research/status' && request.method === 'GET') {
    const engines=await engineCapabilities(env,owner);
    return resultJson({r:engines.browser_webr,engines,default_engine:'statspai_cloud',software:[{id:'statspai_cloud',label:'�ƶ˼���',...engines.statspai_cloud},{id:'r',label:'�ƶ�ԭ�� R',...engines.r_native},{id:'browser_webr',label:'����� webR',...engines.browser_webr},{id:'stata',label:'Stata',...engines.stata_native},{id:'eviews',label:'EViews',...engines.eviews_native}],methods:enabledMethods,method_registry:methodRegistry,unsupported:['���� DID','IV','RDD','�¼��о��ع�'],planner_mode:env.MODEL_API_KEY&&env.MODEL_NAME&&env.MODEL_BASE_URL?'online':'rules',model_capabilities:modelCapabilities(env)});
  }
  if (path === '/api/research/candidate' && request.method === 'POST') {
    try {
      const body = await request.json();
      const session = await loadOwnedSession(env, owner, String(body?.session_id || ''));
      if(session==='expired')return fault('��ϰ�ѵ��ڡ�',410);if(!session)return fault('��ϰ�����ڻ򲻿ɶ�ȡ��',404);
      let material=null;
      if(body.data_id){material=await loadResearchData(env,owner,session.session_id,body.data_id);body.text=material.text;body.filename=material.format==='dta'?'normalized.csv':material.filename;}
      requireSessionVersion(session,body);
      const profile = body?.text===undefined?{row_count:0,columns:[]}:parseCsv(body.text, body.filename || 'data.csv').profile;
      if(modelCapabilities(env).candidate!=='unconfigured')await reserveModelCall(env, owner);
      const history=(await modelInteractions(env,session.session_id,owner)).filter(x=>x.kind==='candidate').slice(-3).map(x=>({question:x.input_summary.question,output:x.output}));
      const preparation={question_type:session.preparation.question_type,adoption_mode:session.preparation.adoption_mode,effective_date:session.preparation.cards.effective_date?.value||'',sample_batch_note:session.preparation.sample_batch_note||''};
      return await proposeCandidate({ question: body.question, profile,preparation,blocker:didConflict(session),history }, env,{session_id:session.session_id,owner});
    } catch (cause) { return requestFault(cause); }
  }
  const example = /^\/api\/research\/examples\/(ols|panel_fe|did)$/.exec(path);
  if (example && request.method === 'GET') return resultJson(fixtures[example[1]]);
  const sessionRoute = /^\/api\/sessions\/([a-z0-9]{12})\/research\/(inspect|plan|jobs)$/.exec(path);
  if (sessionRoute) {
    const session = await loadOwnedSession(env, owner, sessionRoute[1]);
    if (session === 'expired') return fault('�Ự�ѵ��ڡ�', 410);
    if (!session) return fault('�Ự�����ڻ����ڵ�ǰ�������', 404);
    try {
      const action = sessionRoute[2];
      if (action === 'jobs' && request.method === 'GET') {
        await touchSession(env,session);
        const rows = await env.DB.prepare('SELECT body FROM jobs WHERE session_id=? AND owner=? AND last_activity>? ORDER BY created_at DESC LIMIT 30')
          .bind(session.session_id, owner, Date.now() - RETENTION).all();
        return resultJson({ jobs: await Promise.all(rows.results.map(async row => publicJob(await getJob(env,owner,JSON.parse(row.body).id)))) });
      }
      if (request.method !== 'POST') return fault('������֧�֡�', 405);
      const body = await request.json();
      let identity=null;
      if(action==='jobs'){
        identity=await requestIdentity(body);
        const repeated=await repeatedTask(env,'jobs',owner,session.session_id,identity);
        if(repeated)return resultJson({...publicJob(repeated),execution_nonce:repeated.nonce,state_version:session.state_version},202);
      }
      let material=null;
      if(body.data_id){material=await loadResearchData(env,owner,session.session_id,body.data_id);body.text=material.text;body.filename=material.format==='dta'?'normalized.csv':material.filename;}
      if(action!=='inspect')requireSessionVersion(session,body);
      const data = parseCsv(body?.text, body?.filename || 'data.csv');
      if (action === 'inspect'){const metadata=await datasetMetadata(await sha256(body.text),data.profile,body.dictionary);return resultJson({...data.profile,metadata});}
      if (action === 'plan') {
        const { plan, missingLines } = validatePlan(body.candidate, data, session.project, session);
        if(material)validateDateRole(plan,material);
        session.pending_confirmation = { token: crypto.randomUUID(), input_sha256: material?.canonical_sha256||await sha256(body.text), data_id:material?.data_id||null, canonical_sha256:material?.canonical_sha256||null, plan_sha256: await sha256(JSON.stringify(plan)), research_revision: session.research_revision };
        session.pending_confirmation.plan=plan;
        if(env.EXECUTOR_URL&&env.EXECUTOR_SECRET){const preview=await nodeRequest(env,owner,'teaching',{plan:normalized(data,plan).plan,input_sha256:session.pending_confirmation.input_sha256,plan_sha256:session.pending_confirmation.plan_sha256});if(preview.sha256!==await digest(preview.code)||preview.executed!==false)throw Error('��ѧ����У��ʧ��');session.pending_confirmation.corresponding_code=preview;}
        await saveSession(env, session);
        return resultJson({ plan, state_version:session.state_version, confirmation: session.pending_confirmation, description: description(plan), profile: data.profile,
          note: `���˶Կ�����ǰ�ֶ������������������ģ���Ѻ�ʵ������ԭʼ ${data.rows.length} �У�ѡ������ȱʧ ${missingLines.length} �С���Դ����λ�ͷ�����������ѧ���˶ԡ�` });
      }
      if (action === 'jobs') {
        if (body?.confirmed !== true) throw new Error('ִ��ǰ����ȷ�Ϸ�����');
        const { plan, missingLines } = validatePlan(body.plan, data, session.project, session);
        const confirmation = session.pending_confirmation;
        if(material)validateDateRole(plan,material);
        if (!confirmation || body.confirmation_token !== confirmation.token || confirmation.research_revision !== session.research_revision || confirmation.input_sha256 !== (material?.canonical_sha256||await sha256(body.text)) || (confirmation.data_id||null)!==(material?.data_id||null) || confirmation.plan_sha256 !== await sha256(JSON.stringify(plan))) return fault('���ϡ�����򷽰��ѱ仯��������������ȷ�Ϸ�����',409);
        const count = await env.DB.prepare(env.ACCOUNT_ID?'SELECT ((SELECT COUNT(*) FROM jobs WHERE owner IN (SELECT owner FROM account_owners WHERE user_id=?) AND created_at>?)+(SELECT COUNT(*) FROM local_stata_tasks WHERE owner IN (SELECT owner FROM account_owners WHERE user_id=?) AND created_at>?)) AS n':'SELECT ((SELECT COUNT(*) FROM jobs WHERE owner=? AND created_at>?)+(SELECT COUNT(*) FROM local_stata_tasks WHERE owner=? AND created_at>?)) AS n').bind(env.ACCOUNT_ID||owner, Date.now() - 86400000,env.ACCOUNT_ID||owner,Date.now()-86400000).first();
        if (count.n >= 30) return fault('���շ��������ﵽ���ޡ�', 429);
        if(plan.engine_id!=='browser_webr' && !(await engineCapabilities(env,owner))[plan.engine_id].ready) throw new Error((await engineCapabilities(env,owner))[plan.engine_id].reason);
        const id = crypto.randomUUID(), key = `jobs/${owner}/${id}/input.csv`;
        const inputHash = material?.canonical_sha256||await sha256(body.text), planHash = await sha256(JSON.stringify(plan));
        const submittedDictionary = body.dictionary && typeof body.dictionary === 'object' && !Array.isArray(body.dictionary) ? body.dictionary : {};
        const metadata=material?.metadata||await datasetMetadata(inputHash,data.profile);
        if(session.demo_fixture?.input_sha256===inputHash)Object.assign(metadata,{fixture_id:session.demo_fixture.fixture_id,fixture_version:session.demo_fixture.fixture_version});
        const dictionary = {...metadata.dictionary,...Object.fromEntries(Object.entries(submittedDictionary)
          .filter(([name, value]) => data.headers.includes(name) && typeof value === 'string')
          .slice(0, 60).map(([name, value]) => [name, value.slice(0, 300)]))};
        metadata.provenance={...(metadata.provenance||{}),...Object.fromEntries(Object.entries(dictionary).filter(([k,v])=>v!==metadata.dictionary?.[k]).map(([k])=>[k,'user_edited']))};
        const job = { id, owner, session_id: session.session_id, request_id:identity.id,status: 'running', created: Date.now() / 1000,
          last_activity: Date.now(), execution_location: plan.execution_location, software:plan.software, engine_id:plan.engine_id, nonce: crypto.randomUUID(),
          input_key: key, input_sha256: inputHash, plan_sha256: planHash, n_rows: data.rows.length,
          filename: String(body.filename || 'data.csv').slice(0, 200), corresponding_code:confirmation.corresponding_code||null, data_id:material?.data_id||null, source_filename:material?.filename||null, source_sha256:material?.source_sha256||inputHash, canonical_sha256:material?.canonical_sha256||null, import_version:material?.import_version||null, plan, description: description(plan),
          dictionary, metadata, interpretation_warnings:interpretationWarnings(plan,dictionary), csv_lines:data.lines, research_revision:session.research_revision, evidence_snapshot:{...evidenceSnapshot(session),dictionary}, record_version:1,
          source: String(body.source || '�û��ṩ�����ݣ���Դδ��ʵ').slice(0, 1000), question: String(body.question || '').slice(0, 1000),
          simulated: body.simulated === true, missing_lines: missingLines, result: null, reflections: [],
          tool_trace: [{ transport: plan.execution_location, tool: plan.software==='python'?(plan.method==='ols'?'statspai.regress':'statspai.fast.feols'):plan.software==='stata'?'Stata regress/xtreg':'fixest::feols' }],
        };
        await env.FILES.put(key, body.text);
        try {
          const persisted=JSON.stringify(job);
          const inserted=await env.DB.prepare('INSERT INTO jobs(id,session_id,owner,body,status,input_key,created_at,last_activity,lease_until,request_id,request_sha256) SELECT ?,?,?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM sessions WHERE id=? AND owner=? AND state_version=?)')
            .bind(id,session.session_id,owner,persisted,'running',key,Date.now(),Date.now(),Date.now()+30000,identity.id,identity.sha256,session.session_id,owner,session.state_version).run();
          if(!inserted.meta.changes){const error=Error('�������ύ�ڼ��ѱ仯�����ȡ�������ϲ�����ȷ�ϡ�');error.status=409;throw error;}
          jobSnapshots.set(job,persisted);
        } catch (cause) { await env.FILES.delete(key);const repeated=await repeatedTask(env,'jobs',owner,session.session_id,identity);if(repeated)return resultJson({...publicJob(repeated),execution_nonce:repeated.nonce,state_version:session.state_version},202);throw cause; }
        if(job.execution_location==='cloud_native') await submitCloudJob(env,job,body.text,session);
        await touchSession(env, session);
        return resultJson({ ...publicJob(job), execution_nonce: job.nonce,state_version:session.state_version }, 202);
      }
    } catch (cause) { return requestFault(cause); }
  }
  const jobRoute = /^\/api\/research\/jobs\/([0-9a-f-]{36})(?:\/(.*))?$/.exec(path);
  if (!jobRoute) return null;
  const job = await getJob(env, owner, jobRoute[1],true);
  if (!job) return fault('���񲻴��ڡ��ѵ��ڻ����ڵ�ǰ�������', 404);
  const expectedVersion=new URL(request.url).searchParams.get('record_version');if(expectedVersion!==null&&String(job.record_version||1)!==expectedVersion)return fault('����汾�ѱ仯�������µ�����',409);
  const tail = jobRoute[2] || '';
  try {
    if (!tail && request.method === 'GET') return resultJson(publicJob(job));
    if (tail === 'stata-code' && request.method === 'GET') {
      if(job.corresponding_code)return resultJson({task_id:job.id,record_version:job.record_version,plan_sha256:job.plan_sha256,...job.corresponding_code});
      if(job.engine_id!=='statspai_cloud'||job.status!=='succeeded')return fault('���������޿��õĶ�Ӧ���롣',409);
      const code=job.node_artifacts?.['stata-corresponding.do'],manifest=job.node_artifacts?.['stata-corresponding.json'];
      if(!code||!manifest)return fault('��Ӧ������δͬ����',409);
      const metadata=JSON.parse(manifest);
      if(metadata.executed!==false||metadata.sha256!==await digest(code))return fault('��Ӧ����У��ʧ�ܡ�',409);
      return resultJson({task_id:job.id,plan_sha256:job.plan_sha256,record_version:job.record_version,code,...metadata});
    }
    if (tail === 'input' && request.method === 'GET') {
      const object = await env.FILES.get(job.input_key);
      if (!object) return fault('�����ļ��Ѷ�ʧ��', 404);
      const text = await object.text();
      const data = parseCsv(text, job.filename);
      return resultJson({ ...normalized(data, job.plan), original_text: text, filename: job.filename,
        input_sha256: job.input_sha256, plan_sha256: job.plan_sha256, nonce: job.nonce, n_rows: job.n_rows });
    }
    if (job.execution_location==='cloud_native' && ['complete','fail','heartbeat'].includes(tail)) return fault('�ƶ����������ǩ��ִ�нڵ�Ľ����',409);
    if (tail === 'heartbeat' && request.method === 'POST') {
      if (job.status !== 'running') return fault('�����ѽ�����', 409);
      const now=Date.now(),renewed=await env.DB.prepare("UPDATE jobs SET last_activity=?,lease_until=? WHERE id=? AND owner=? AND status='running' AND lease_until>=?").bind(now,now+30000,job.id,owner,now).run();
      if(!renewed.meta.changes)return fault('�����ѽ�����ִ��������ʧЧ�����ȡ����״̬��',409);
      return resultJson({ ok: true });
    }
    if (tail === 'interrupt' && request.method === 'POST') {
      if(job.execution_location==='cloud_native'){job.cancel_requested=true;await saveJob(env,job);await syncCloudJob(env,job);return resultJson(publicJob(job));}
      if (job.status === 'running') { job.status = 'interrupted'; job.error = '�����ִ�����жϣ����������С�'; await saveJob(env, job, true); }
      return resultJson(publicJob(job));
    }
    if (tail === 'complete' && request.method === 'POST') {
      const body = await request.json();
      if (job.status !== 'running' || body?.nonce !== job.nonce) return fault('����״̬��ִ��ƾ֤��ʧЧ��', 409);
      if (Array.isArray(body.result?.used_indices) && (new Set(body.result.used_indices).size !== body.result.n_used || body.result.used_indices.length !== body.result.n_used || body.result.used_indices.some(i=>!Number.isInteger(i)||i<1||i>job.n_rows))) throw new Error('R ����������Ч��');
      job.result = validateSubmittedResult(body.result, job);
      job.status = 'succeeded'; job.completed = Date.now() / 1000;
      job.result_origin = '������ύ����������У���ʽ��δ���¹�����ֵ';
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
      if (job.status !== 'running' || body?.nonce !== job.nonce) return fault('����״̬��ִ��ƾ֤��ʧЧ��', 409);
      job.status = 'failed'; job.error = String(body.error || '�����ִ��ʧ�ܡ�').slice(0, 500);
      await saveJob(env, job, true); return resultJson(publicJob(job));
    }
    if (tail === 'reflection' && request.method === 'POST') {
      if (job.status !== 'succeeded') return fault('������ɷ�����', 409);
      const body = await request.json(), text = String(body?.answer || '').trim();
      if(body.answer_version!==undefined&&body.answer_version!==job.reflections.length)return fault('���ͼ�¼������һ��ǩҳ�޶����ݸ屣�������ȡ���·��������ύ��',409);
      const previousVersion=job.record_version||1;
      if (!text || text.length > 2000) throw new Error('������Ϊ 1 �� 2000 �֡�');
      if (modelCapabilities(env).reflection !== 'unconfigured') await reserveModelCall(env, owner);
      const {audit,used_indices,...summaryResult}=job.result;
      summaryResult.sample_changes={missing_removed:audit.missing_removed_csv_lines.length,model_removed:audit.model_removed_count};
      const result = await modelFeedback('reflection', { answer:text, materials:[{id:'executed_result',content:summaryResult},{id:'confirmed_plan',content:{plan:job.plan,dictionary:job.dictionary,checks:job.description.checks}}] },env,{session_id:job.session_id,owner,task_id:job.id});
      const item = { task_id:job.id,answer: text, feedback: `${result.warning}\n${result.answer}`, assessment:result.assessment, mode:result.mode, model:result.actual_model||result.model,prompt_version:result.prompt_version, interaction_id:result.interaction_id||null,created: Date.now() / 1000, answer_version:job.reflections.length+1 };
      job.reflections.push(item); job.reflection = item;
      job.record_version=(job.record_version||1)+1;
      job.last_activity=Date.now();
      const saved=await env.DB.prepare("UPDATE jobs SET body=?,last_activity=? WHERE id=? AND owner=? AND COALESCE(json_extract(body,'$.record_version'),1)=?")
        .bind(JSON.stringify(job),job.last_activity,job.id,job.owner,previousVersion).run();
      if(!saved.meta.changes)return fault('�����¼�ѱ仯�����Ͳݸ屣�������ȡ���¼�¼�����ύ��',409);
      return resultJson(item);
    }
    if (tail === 'rerun' && request.method === 'POST') {
      if (job.status !== 'succeeded') return fault('����ɵ�����ɶ����˶ԡ�',409);
      const body=await request.json();
      const identity=await requestIdentity({...body,original_job_id:job.id,input_sha256:job.input_sha256,plan_sha256:job.plan_sha256});
      if(!identity.id)return fault('������Ҫ�����ţ���ˢ�º����ԡ�',422);
      const repeated=await repeatedTask(env,'jobs',owner,job.session_id,identity);
      if(repeated)return resultJson({...publicJob(repeated),execution_nonce:repeated.nonce},202);
      const count=await env.DB.prepare(env.ACCOUNT_ID?'SELECT ((SELECT COUNT(*) FROM jobs WHERE owner IN (SELECT owner FROM account_owners WHERE user_id=?) AND created_at>?)+(SELECT COUNT(*) FROM local_stata_tasks WHERE owner IN (SELECT owner FROM account_owners WHERE user_id=?) AND created_at>?)) AS n':'SELECT ((SELECT COUNT(*) FROM jobs WHERE owner=? AND created_at>?)+(SELECT COUNT(*) FROM local_stata_tasks WHERE owner=? AND created_at>?)) AS n').bind(env.ACCOUNT_ID||owner,Date.now()-86400000,env.ACCOUNT_ID||owner,Date.now()-86400000).first();
      if(count.n>=30)return fault('���շ��������ﵽ���ޡ�',429);
      const object=await env.FILES.get(job.input_key);if(!object)return fault('ԭʼ���붪ʧ��',404);
      const originalText=await object.text();
      const id=crypto.randomUUID(),key=`jobs/${owner}/${id}/input.csv`;
      const clone={...job,id,input_key:key,nonce:crypto.randomUUID(),status:'running',created:Date.now()/1000,result:null,reflections:[],reflection:null,verification:null,verification_of_job_id:job.id,record_version:1};
      delete clone.completed;delete clone.error;delete clone.node_artifacts;delete clone.remote_submitted;delete clone.remote_synced;delete clone.cancel_requested;clone.execution_location=job.execution_location||'browser_webr';clone.engine_id=job.engine_id||'browser_webr';
      await env.FILES.put(key,originalText);
      clone.request_id=identity.id;
      try {const persisted=JSON.stringify(clone);await env.DB.prepare('INSERT INTO jobs(id,session_id,owner,body,status,input_key,created_at,last_activity,lease_until,request_id,request_sha256) VALUES(?,?,?,?,?,?,?,?,?,?,?)').bind(id,job.session_id,owner,persisted,'running',key,Date.now(),Date.now(),Date.now()+30000,identity.id,identity.sha256).run();jobSnapshots.set(clone,persisted);}
      catch(cause){await env.FILES.delete(key);const repeated=await repeatedTask(env,'jobs',owner,job.session_id,identity);if(repeated)return resultJson({...publicJob(repeated),execution_nonce:repeated.nonce},202);throw cause;}
      if(clone.execution_location==='cloud_native')await submitCloudJob(env,clone,originalText);
      return resultJson({...publicJob(clone),execution_nonce:clone.nonce},202);
    }
    if (tail === 'report' && request.method === 'GET'){const interactions=await exportInteractions(env,job,owner);await requireExportVersion(env,job);return new Response(reportMarkdown(job)+'\n'+modelEvidenceMarkdown(interactions,false),{headers:{'Content-Type':'text/markdown; charset=utf-8','Content-Disposition':'attachment; filename="analysis-report.md"'}});}
    if (tail === 'package' && request.method === 'GET') {
      const object = await env.FILES.get(job.input_key);
      if (!object) return fault('�����ļ��Ѷ�ʧ��', 404);
      const original = await object.text();
      const prepared = normalized(parseCsv(original, job.filename), job.plan);
      const interactions=await exportInteractions(env,job,owner);
      const files = {
        'README.md': `# ʵ֤ѧͽ���ְ�\n\n���� SHA-256��${job.input_sha256}\n���� SHA-256��${job.plan_sha256}\nִ��λ�ã�${locationLabel(job)}��${job.result_origin||'����δ���'}\n\n${job.software==='python'?'ʹ�ü�¼�� Python 3.11 �� StatsPAI �������汾���ڵ�ǰĿ¼���� python estimate.py .��Stata ��Ӧ���������ѧ��δ�ɱ�����ִ�С�':job.software==='stata'?'ʹ�ü�¼�� Stata �汾���ڵ�ǰĿ¼������ estimate.do���������������������������� full-coefficients.csv��':job.execution_location==='cloud_native'?'ʹ�� R 4.6.1��fixest 0.14.2 �� jsonlite 2.0.0������ Rscript --vanilla estimate.R .�����д�� result.json��':'ʹ�ü�¼�� R/fixest���ڱ�Ŀ¼���� reproduce.R��'}\n�� results.json �˶Ա�����ʵ��������ϵ������׼�����估�ƶϿھ���ԭʼ��Դ��ʹ����������ѧ�����к�ʵ��\n`,
        'input.csv': original, 'normalized.csv': prepared.csv,
        'plan.json': JSON.stringify(job.plan, null, 2),
        'variable_dictionary.json': JSON.stringify(job.dictionary || {}, null, 2),
        'evidence_snapshot.json': JSON.stringify(job.evidence_snapshot || {},null,2),
        'verification.json': JSON.stringify(job.verification || {status:'not_checked'},null,2),
        'export_version.json':JSON.stringify({task_id:job.id,research_revision:job.research_revision,record_version:job.record_version||1,execution_location:job.execution_location||'browser_webr',engine_id:job.engine_id||'browser_webr',software:job.software||'r',data_id:job.data_id||null,source_sha256:job.source_sha256||null,canonical_sha256:job.canonical_sha256||null,plan_sha256:job.plan_sha256,code_sha256:job.corresponding_code?.sha256||null}),
        'reflections.json':JSON.stringify({record_version:job.record_version||1,reflections:job.reflections||[],reflection:job.reflection||null}),
        'results.json': JSON.stringify(job.result || { status: job.status, error: job.error || '' }, null, 2),
        'report.md': reportMarkdown(job)+'\n'+modelEvidenceMarkdown(interactions,false), 'agent_interactions.json':JSON.stringify(interactions,null,2),...(job.node_artifacts||{'reproduce.R': reproductionScript(prepared.plan)}),
        'execution.log': job.node_artifacts?.['execution.log'] || `created=${new Date(job.created * 1000).toISOString()}\nstatus=${job.status}\nlocation=${job.execution_location||'browser_webr'}\nR=${job.result?.r_version || 'not completed'}\nfixest=${job.result?.package_versions?.fixest || 'not completed'}\n`,
      };
      if(job.data_id){const d=await loadResearchData(env,owner,job.session_id,job.data_id),source=await env.FILES.get(d.source_key),sidecar=await env.FILES.get(d.metadata_key);if(!source||!sidecar)throw Error('ԭʼ���ϻ����¼��ʧ��δ�������������ְ���');files['original.'+d.format]=new Uint8Array(await source.arrayBuffer());files['import_metadata.json']=await sidecar.text();files['data_identity.json']=JSON.stringify({data_id:d.id,source_sha256:d.source_sha256,canonical_sha256:d.canonical_sha256,import_version:d.import_version,labels:d.labels});}
      if(job.result){files['coefficients.svg']=coefficientsSvg(job);if(job.plan.method==='did')files['group_trends.svg']=groupTrendsSvg(job,parseCsv(original,job.filename));}
      await requireExportVersion(env,job);
      return new Response(zipFiles(files), { headers: { 'Content-Type': 'application/zip', 'Content-Disposition': 'attachment; filename="analysis-reproduction.zip"' } });
    }
    if (/^artifacts\/(coefficients\.svg|group_trends\.svg|coefficients\.csv|execution\.log)$/.test(tail) && request.method === 'GET') {
      if (!job.result) return fault('��������ִ�н����', 409);
      const name = tail.split('/')[1];
      if (name === 'coefficients.svg') return new Response(coefficientsSvg(job), { headers: { 'Content-Type': 'image/svg+xml; charset=utf-8' } });
      if (name === 'coefficients.csv') return new Response('term,estimate,std_error,p_value,ci_low,ci_high\n' + job.result.coefficients.map((row) => [row.term, row.estimate, row.std_error, row.p_value, row.ci_low, row.ci_high].map(quoteCsv).join(',')).join('\n'), { headers: { 'Content-Type': 'text/csv; charset=utf-8' } });
      if (name === 'execution.log') return new Response(job.node_artifacts?.['execution.log'] || `location=${job.execution_location||'browser_webr'}\nstatus=${job.status}\nR=${job.result.r_version}\nfixest=${job.result.package_versions.fixest}\n`, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
      const object = await env.FILES.get(job.input_key);
      if (!object) return fault('�����ļ��Ѷ�ʧ��', 404);
      return new Response(groupTrendsSvg(job, parseCsv(await object.text(), job.filename)), { headers: { 'Content-Type': 'image/svg+xml; charset=utf-8' } });
    }
    return null;
  } catch (cause) { return requestFault(cause); }
}

export function reportMarkdown(job) {
  const lines = [`# �����븴�ֱ���`, '', `> ${job.result_origin || '������δ��ɣ��޿��ù��ƽ����'}`, '',
    `- �о����⣺${job.question || 'δ�ṩ'}`, `- ������Դ��ѧ���ṩ��δ�Զ���ʵ����${job.source || 'δ�ṩ'}`,
    `- �ļ���${job.filename}`, `- ԭʼ������${job.n_rows}`, `- ѡ����ȱʧ�У�${job.missing_lines.join(', ') || '��'}`,
    `- ������${job.description.label}`, `- ��ʽ��${job.description.formula}`,
    `- ���� SHA-256��${job.input_sha256}`, `- ���� SHA-256��${job.plan_sha256}`,
    `- ִ��λ�ã�${locationLabel(job)}`, `- ����ȷ�ϣ�ѧ��ִ��ǰȷ��`];
  lines.push(`- ִ�����ϰ汾��${job.research_revision ?? '��ʷδ��¼'}�������汾��${job.record_version || 1}`,`- ���ܺ˶ԣ�${job.verification?.status || 'not_checked'}`);
  lines.push(`- ԭʼ�ļ� SHA-256��${job.source_sha256||'��ʷδ��¼'}`,`- �淶������ SHA-256��${job.canonical_sha256||job.input_sha256}`,`- ����汾��${job.import_version||'��ʷδ��¼'}`,`- ��Ӧ���� SHA-256��${job.corresponding_code?.sha256||'��ʷδ��¼'}`);
  if(job.stale)lines.push('> ��ǰ�о��������޸ģ�����Ϊ��ʷ������ִ�н����');
  lines.push('', '## ִ��ǰ��������Դ״̬');
  const snapshot=job.evidence_snapshot||{},cards=snapshot.preparation?.cards||{};
  const sourceStatuses={verified:'ѧ���Ѻ˶ԣ�ϵͳδ��֤��',filled:'����д�����˶�',to_find:'������'};
  const labels={question:'�о�����',sample:'������ʱ��',outcome:'����뵥λ',predictor:'���ͱ���',data_source:'������Դ',access:'��ȡ����',policy_doc:'����ԭ��',release_date:'��������',effective_date:'ʵʩ����',expansion_date:'��Χ��Ϣ',treated_list:'��������',comparison:'�Ƚ϶���'};
  if(!Object.keys(cards).length)lines.push('- δ��д׼�������Ϸ���Դ�����������к˶ԡ�');
  for(const [key,card]of Object.entries(cards))lines.push(`- ${labels[key]||key}��${card.value||'������'}��${sourceStatuses[card.status]||'������'}����Դ��${card.source_title||'δ�ṩ'}�����ӣ�${card.source_url||'δ�ṩ'}�����ģ�${card.accessed_on||'δ�ṩ'}`);
  for(const [key,field]of Object.entries(snapshot.blueprint||{}))if(field.value)lines.push(`- ��ͼ ${key}��${field.value}����Դ�˶�״̬��${field.verification}`);
  lines.push('- ����ִ�п��ռ����ְ� evidence_snapshot.json��');
  lines.push('', '## ���������뵥λ��������Դ��δ������ʵ��');
  const names = [job.plan.outcome, ...job.plan.predictors, job.plan.unit, job.plan.time, job.plan.treated, job.plan.cluster].filter(Boolean);
  for (const name of new Set(names)) lines.push(`- ${name}��${job.dictionary?.[name] || 'δ�ṩ�����뵥λ����˶�'}��������${job.metadata?.provenance?.[name]||'��ʷδ��¼'}`);
  lines.push('', '## ��ִ�н��');
  if (job.result) {
    lines.push(`- ������${job.result.software_version||job.result.r_version}`, `- ����${JSON.stringify(job.result.package_versions)}`,`- �ƶϿھ���${JSON.stringify(job.result.inference||{vcov:job.plan.vcov})}`, `- ����������${job.result.n_used}`, '', '| ���� | ϵ�� | ��׼�� | p ֵ | 95% ���� |', '|---|---:|---:|---:|---:|');
    for (const row of job.result.coefficients) lines.push(`| ${row.term} | ${row.estimate} | ${row.std_error} | ${row.p_value} | [${row.ci_low}, ${row.ci_high}] |`);
    lines.push('', sampleEvidenceText(job),
      `- ģ���ų�ԭʼ CSV �У�${job.result.audit?.model_removed_csv_lines?.join(', ') || (job.result.audit?.used_indices ? '��' : '��ʷִ��δ��¼')}`,
      '## ���������', ...job.result.warnings.map((item) => `- ${item}`), `- ${job.description.checks}`);
  } else lines.push(`״̬��${job.status}��${job.error || '����ִ�н����'}`);
  lines.push('', '## ѧ���������޶�');
  if(!job.reflections.length)lines.push('- ������ϰ����ɣ���������������أ�ѧϰ�ɹ���δ�ύ��');
  for (const [index, item] of job.reflections.entries()) lines.push(`### �� ${index + 1} ��`, item.answer, '', `������${item.feedback}`);
  lines.push('', '## ����������˶�', '- ���ز���ѹ��������������ְ�������ԭʼ���롢��������ϣ��汾��¼��', '- ʹ�ü��������¼�������������汾���ڽ�ѹĿ¼���ж�Ӧ���ֽű����˶�������������ϵ������׼������䡣', '- Ҳ����ҳ��������ԭʼ����������ܺ˶ԡ���ʹ����ͬ������������㣬�����ݲ�1e-8������ݲ�1e-6��pֵ�����ݲ�1e-6��', '- ���������һ���Բ�������������ֵ��֤��������������㡣');
  if(job.verification?.differences?.length)for(const difference of job.verification.differences)lines.push(`- ���죺${difference.term||''} ${difference.field}��${difference.reason||`������� ${difference.absolute_difference}`}`);
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
  const a=original?.result,b=rerun?.result,tolerance={absolute:1e-8,relative:1e-6,p_absolute:1e-6},differences=[];
  if(!a||!b)return {status:'not_checked',tolerance};
  for(const key of ['input_sha256','plan_sha256'])if(original[key]!==rerun[key])differences.push({field:key,reason:'��ϣ��ͬ'});
  if(a.n_used!==b.n_used||a.r_version!==b.r_version||a.software_version!==b.software_version||JSON.stringify(a.package_versions)!==JSON.stringify(b.package_versions)||JSON.stringify(a.audit?.used_indices)!==JSON.stringify(b.audit?.used_indices)||JSON.stringify(a.inference)!==JSON.stringify(b.inference)||original.engine_id!==rerun.engine_id)differences.push({field:'sample_or_version',reason:'������汾��ͬ'});
  const terms=new Map(b.coefficients.map(r=>[r.term,r]));
  if(terms.size!==a.coefficients.length)differences.push({field:'terms',reason:'ϵ�����ϲ�ͬ'});
  for(const row of a.coefficients)for(const key of ['estimate','std_error','p_value','ci_low','ci_high']){
    const delta=terms.has(row.term)?Math.abs(row[key]-terms.get(row.term)[key]):null;
    const allowed=key==='p_value'?tolerance.p_absolute:tolerance.absolute+tolerance.relative*Math.max(Math.abs(row[key]),Math.abs(terms.get(row.term)?.[key]||0));
    if(delta===null||!Number.isFinite(delta)||delta>allowed)differences.push({term:row.term,field:key,absolute_difference:delta});
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
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="ϵ����95%����"><rect width="100%" height="100%" fill="#fff"/><line x1="${x(0)}" y1="25" x2="${x(0)}" y2="${height - 25}" stroke="#a0aaa7" stroke-dasharray="4 4"/>${marks}<text x="8" y="${height - 10}" font-size="11" fill="#586765">${xml(locationLabel(job))} �������Դ���������δ��֤</text></svg>`;
}

function groupTrendsSvg(job, data) {
  if (job.plan.method !== 'did') return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 80"><text x="12" y="40">�� DID �ṩ���ֵͼ</text></svg>`;
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
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 260" role="img" aria-label="������������������Ծ�ֵ"><rect width="100%" height="100%" fill="#fff"/>${lines}${years.map((year) => `<text x="${x(year)}" y="230" text-anchor="middle" font-size="11">${year}</text>`).join('')}<text x="55" y="20" font-size="12">������</text><text x="145" y="20" font-size="12" fill="#c57442">������</text><text x="55" y="252" font-size="11">������ͼ������֤��ƽ������</text></svg>`;
}

export function locationLabel(job){return job.execution_location==='cloud_native'?`�ƶ�ԭ�� ${job.software==='stata'?'Stata':job.software==='python'?'Python / StatsPAI':'R'}`:'����� webR';}
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
  if(!jobSnapshots.has(job))jobSnapshots.set(job,JSON.stringify(job));
  if(job.remote_synced && ['succeeded','failed','interrupted','cancelled'].includes(job.status))return;
  try {
    if(job.cancel_requested){
      try{await nodeRequest(env,job.owner,`jobs/${job.id}/cancel`,{});job.remote_submitted=true;}
      catch(e){if(e.status===404){job.status='cancelled';job.error='ȡ�������ѱ��棬�ڵ�û�пɷ�������';job.remote_synced=true;job.sync_error=null;await saveJob(env,job);return;}throw e;}
    }
    if(!job.remote_submitted){const object=await env.FILES.get(job.input_key+'.node.json');if(!object)throw new Error('�ƶ��ύ���ն�ʧ��');const remote=await nodeRequest(env,job.owner,'jobs',JSON.parse(await object.text()));job.remote_submitted=true;job.status=remote.status;}
    if(job.remote_synced && ['succeeded','failed','interrupted','cancelled'].includes(job.status))return;
    const remote=await nodeRequest(env,job.owner,`jobs/${job.id}`);
    if(remote.input_sha256!==job.input_sha256||remote.plan_sha256!==job.plan_sha256||remote.engine_id!==job.engine_id)throw new Error('ִ�нڵ㷵�ص�������ղ�ƥ�䡣');
    if(remote.status==='succeeded'&&!remote.result)throw new Error('ִ�нڵ�δ�ṩ���������Ľ����');
    if(remote.result){
      const r=remote.result;
      if(job.corresponding_code&&remote.artifacts?.['stata-corresponding.do']!==job.corresponding_code.code)throw new Error('�����Ľ�ѧ������˶Է���ʱ��һ�¡�');
      if(!Number.isInteger(r.n_used)||r.n_used<1||r.n_used>job.n_rows||!Array.isArray(r.coefficients)||!r.coefficients.length||r.coefficients.length>15||r.coefficients.some(c=>!['estimate','std_error','p_value','ci_low','ci_high'].every(k=>Number.isFinite(c[k]))))throw new Error('ִ�нڵ�����ʽ��Ч��');
      if(!Array.isArray(r.used_indices)||r.used_indices.length!==r.n_used||new Set(r.used_indices).size!==r.n_used||r.used_indices.some(i=>!Number.isInteger(i)||i<1||i>job.n_rows))throw new Error('ִ�нڵ�����������Ч��');
      r.audit={missing_removed_csv_lines:job.missing_lines,used_indices:r.used_indices,model_removed_count:job.n_rows-job.missing_lines.length-r.n_used,model_removed_csv_lines:job.csv_lines.filter((line,i)=>!r.used_indices.includes(i+1)&&!job.missing_lines.includes(line))};
      job.result=r;job.completed=remote.completed;job.node_artifacts=Object.fromEntries(Object.entries(remote.artifacts||{}).filter(([k,v])=>/^(estimate\.(R|do|py)|stata-corresponding\.(do|json)|parameters\.json|execution\.log|session-info\.txt|full-coefficients\.csv|sample\.csv)$/.test(k)&&typeof v==='string'));
      job.result_origin=`${locationLabel(job)}ִ�нڵ㷵�أ���վУ��������������ʽ��δ���и��㡣`;
      if(job.verification_of_job_id){const original=await getJob(env,job.owner,job.verification_of_job_id);job.verification=compareResults(original,job);if(original){original.verification={...job.verification,rerun_job_id:job.id};original.record_version=(original.record_version||1)+1;await saveJob(env,original);}}
    }
    job.status=remote.status;job.error=remote.error;job.sync_error=null;
    job.remote_synced=['succeeded','failed','interrupted','cancelled'].includes(remote.status);
    await saveJob(env,job);
  } catch(e){if(e.status===409){const row=await env.DB.prepare('SELECT body FROM jobs WHERE id=? AND owner=?').bind(job.id,job.owner).first();if(row){Object.assign(job,JSON.parse(row.body));jobSnapshots.set(job,row.body);}}else job.sync_error=e.message;} // Keep running cloud jobs recoverable during connectivity loss.
}
