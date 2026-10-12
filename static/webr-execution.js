/* Browser-only R execution. The server validates format and ownership, not estimates. */
let eaWebR = null;
let eaWebRPromise = null;
let eaActiveJob = null;

async function eaInitWebR() {
  if (eaWebR) return eaWebR;
  if (eaWebRPromise) return eaWebRPromise;
  eaWebRPromise = (async () => {
    if (!window.crossOriginIsolated || typeof SharedArrayBuffer === 'undefined') {
      throw new Error('浏览器未启用跨源隔离，无法可靠运行或中断 webR。');
    }
    researchNotice('正在初始化浏览器 webR，并安装已核对的 fixest 0.14.2…');
    const { WebR } = await import('https://webr.r-wasm.org/v0.6.0/webr.mjs');
    const runtime = new WebR();
    await runtime.init();
    const version = await runtime.evalRString("tryCatch({webr::install('fixest', repos=c('https://lrberge.r-universe.dev','https://repo.r-wasm.org')); as.character(packageVersion('fixest'))},error=function(e)paste('ERROR',conditionMessage(e)))");
    if (version !== '0.14.2') throw new Error(version.startsWith('ERROR') ? version : `fixest 版本不符：${version}`);
    eaWebR = runtime;
    return runtime;
  })();
  try { return await eaWebRPromise; }
  catch (error) { eaWebRPromise = null; throw error; }
}

function eaRFormula(plan) {
  const rhs = [...(plan.method === 'did' ? ['policy_effect'] : []), ...plan.predictors].join(' + ');
  return `${plan.outcome} ~ ${rhs}${plan.method === 'ols' ? '' : ` | ${plan.unit} + ${plan.time}`}`;
}

async function eaEstimate(payload) {
  const runtime = await eaInitWebR();
  researchNotice('webR 已就绪；正在准备本次确认的数据与公式。');
  const p = payload.plan;
  await runtime.FS.writeFile('/home/web_user/ea-input.csv', new TextEncoder().encode(payload.csv));
  const formula = eaRFormula(p);
  const vcov = p.vcov === 'cluster' ? `~${p.cluster}` : JSON.stringify(p.vcov);
  const did = p.method === 'did' ? `d$policy_effect <- as.numeric(d[[${JSON.stringify(p.treated)}]]) * as.integer(as.numeric(d[[${JSON.stringify(p.time)}]]) >= ${p.policy_year});` : '';
  const usedColumns = [...new Set([p.outcome, ...p.predictors, p.unit, p.time, p.treated, p.cluster].filter(Boolean))];
  const missing = p.missing === 'drop' ? '' : `if (anyNA(d[c(${usedColumns.map((name) => JSON.stringify(name)).join(',')})])) stop('选定变量有缺失');`;
  const code = `d <- read.csv('/home/web_user/ea-input.csv', check.names=FALSE, na.strings=c('', 'NA', 'N/A', 'null', 'NaN')); ${did} ${missing} fit <- fixest::feols(as.formula(${JSON.stringify(formula)}), data=d, vcov=${vcov}, nthreads=1, notes=FALSE); 'estimated'`;
  researchNotice('正在由浏览器 R/fixest 估计模型，可中断当前计算。');
  await runtime.evalRString(code);
  const meta = await runtime.evalRString("paste(paste('R',getRversion()),as.character(packageVersion('fixest')),nobs(fit),sep='\\t')");
  const rowText = await runtime.evalRString("tab <- fixest::coeftable(fit); ci <- confint(fit, level=.95); mat <- cbind(tab,ci); paste(vapply(seq_len(nrow(mat)),function(i)paste(c(rownames(mat)[i],sprintf('%.17g',as.numeric(mat[i,]))),collapse='\\t'),character(1)),collapse='\\n')");
  const [rVersion, fixestVersion, used] = meta.split('\t');
  const usedIndices=(await runtime.evalRString("paste(fixest::obs(fit),collapse=',')")).split(',').filter(Boolean).map(Number);
  const clusters=p.vcov==='cluster'?Number(await runtime.evalRString(`as.character(length(unique(d[[${JSON.stringify(p.cluster)}]][fixest::obs(fit)])))`)):null;
  if (fixestVersion !== '0.14.2') throw new Error('执行后 fixest 版本不符。');
  const coefficients = rowText.split('\n').filter(Boolean).map((line) => {
    const [alias, estimate, stdError, tValue, pValue, ciLow, ciHigh] = line.split('\t');
    const values = [estimate, stdError, pValue, ciLow, ciHigh].map(Number);
    if (values.some((value) => !Number.isFinite(value))) throw new Error('R 返回了无法解释的数值。');
    return { term: alias === 'policy_effect' ? 'DID effect' : p.labels[alias] || alias,
      estimate: values[0], std_error: values[1], p_value: values[2], ci_low: values[3], ci_high: values[4] };
  });
  return { r_version: rVersion, package_versions: { fixest: fixestVersion }, n_used: Number(used),
    coefficients, clusters, used_indices:usedIndices,
    warnings: [
      '浏览器提交结果；服务器未独立重新估计数值，请使用复现包核对。',
      'p 值和置信区间不自动证明因果关系；模型选择不应以显著性为目标。',
      ...(p.method === 'did' ? ['组均值图是描述性信息，不是平行趋势证明。'] : []),
    ] };
}

async function browserRunJob(job, fresh=false) {
  if(fresh){if(eaWebR)await eaWebR.close();eaWebR=null;eaWebRPromise=null;}
  eaActiveJob = job.id;
  const keepAlive = setInterval(() => {
    fetch(`/api/research/jobs/${job.id}/heartbeat`, { method: 'POST', credentials: 'same-origin' }).catch(() => {});
  }, 10000);
  try {
    researchNotice('正在本机浏览器中运行 webR/fixest；关闭或刷新会中断本次计算。');
    const payload = await api(`/api/research/jobs/${job.id}/input`);
    const result = await eaEstimate(payload);
    researchNotice('R 已返回结果；正在保存结果、实际样本和执行版本。');
    await api(`/api/research/jobs/${job.id}/complete`, { method: 'POST', body: { nonce: payload.nonce, result } });
    researchNotice('浏览器 R 执行完成。结果已保存；可独立复算核对。');
  } catch (error) {
    researchNotice(`浏览器 R 执行失败：${error.message}`, true);
    try { await api(`/api/research/jobs/${job.id}/fail`, { method: 'POST', body: { nonce: job.execution_nonce, error: error.message } }); } catch {}
  } finally {
    clearInterval(keepAlive);
    eaActiveJob = null;
    researchWatch(job.id);
  }
}

async function browserInterruptJob(id) {
  if (eaActiveJob !== id) return;
  eaWebR?.interrupt();
  await api(`/api/research/jobs/${id}/interrupt`, { method: 'POST' });
  researchNotice('已请求中断；输入仍保存在当前任务中，可重新核对后运行。');
  await researchWatch(id);
}

window.addEventListener('pagehide', () => {
  if (eaActiveJob) {
    eaWebR?.interrupt();
    fetch(`/api/research/jobs/${eaActiveJob}/interrupt`, { method: 'POST', credentials: 'same-origin', keepalive: true }).catch(() => {});
  }
});
