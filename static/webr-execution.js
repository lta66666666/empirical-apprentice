/* Browser-only R execution. The server validates format and ownership, not estimates. */
let eaWebR = null;
let eaWebRPromise = null;
let eaActiveJob = null;
let eaRuntimeGeneration=0,eaInitializingRuntime=null,eaRunEpoch=0,eaExecution=null;
const eaBrowserPending=new Map();
function eaAbort(message='本次浏览器执行已停止。'){const error=Error(message);error.name='AbortError';return error;}
function eaCheckExecution(context){if(context&&(context.cancelled||context.epoch!==eaRunEpoch||context.session!==sessionId))throw eaAbort();}
async function eaLoadWebR(){return import('https://webr.r-wasm.org/v0.6.0/webr.mjs');}
function eaResetWebR(){eaRuntimeGeneration++;const instances=new Set([eaWebR,eaInitializingRuntime].filter(Boolean));eaWebR=null;eaInitializingRuntime=null;eaWebRPromise=null;for(const runtime of instances){try{runtime.interrupt?.();Promise.resolve(runtime.close()).catch(()=>{});}catch{}}}
async function eaDeadline(work,limit,message,stop){let timer;try{return await Promise.race([work,new Promise((_,reject)=>{timer=setTimeout(()=>{stop?.();const error=Error(message);error.code='execution_timeout';reject(error);},limit);})]);}finally{clearTimeout(timer);}}
function eaPersistPending(){try{storageSet('ea_browser_pending',JSON.stringify([...eaBrowserPending.values()]));}catch{}}
function eaQueueExecutionSync(context,event,body){const {nonce,...safe}=body||{};eaBrowserPending.set(context.job,{job:context.job,session:context.session,event,body:safe});eaPersistPending();}

async function eaInitWebR(context=null) {
  eaCheckExecution(context);
  if (eaWebR) return eaWebR;
  if (eaWebRPromise) return eaWebRPromise;
  const generation=eaRuntimeGeneration;
  const initialize=(async () => {
    if (!window.crossOriginIsolated || typeof SharedArrayBuffer === 'undefined') {
      throw new Error('浏览器未启用跨源隔离，无法可靠运行或中断 webR。');
    }
    researchNotice('正在初始化浏览器 webR，并安装已核对的 fixest 0.14.2…');
    const { WebR } = await eaLoadWebR();
    if(generation!==eaRuntimeGeneration)throw eaAbort();
    const runtime = new WebR();
    eaInitializingRuntime=runtime;
    await runtime.init();
    if(generation!==eaRuntimeGeneration){runtime.close();throw eaAbort();}
    const version = await runtime.evalRString("tryCatch({webr::install('fixest', repos=c('https://lrberge.r-universe.dev','https://repo.r-wasm.org')); as.character(packageVersion('fixest'))},error=function(e)paste('ERROR',conditionMessage(e)))");
    if(generation!==eaRuntimeGeneration){runtime.close();throw eaAbort();}
    if (version !== '0.14.2') throw new Error(version.startsWith('ERROR') ? version : `fixest 版本不符：${version}`);
    eaWebR = runtime;
    eaInitializingRuntime=null;
    return runtime;
  })();
  const promise=eaDeadline(initialize,180000,'浏览器 R 初始化超过 180 秒，已停止。请检查网络后重新初始化。',eaResetWebR);eaWebRPromise=promise;
  try {const runtime=await promise;eaCheckExecution(context);return runtime;}
  catch (error) {if(eaWebRPromise===promise)eaResetWebR();throw error;}
}

function eaRFormula(plan) {
  const rhs = [...(plan.method === 'did' ? ['policy_effect'] : []), ...plan.predictors].join(' + ');
  return `${plan.outcome} ~ ${rhs}${plan.method === 'ols' ? '' : ` | ${plan.unit} + ${plan.time}`}`;
}

async function eaEstimate(payload,context=null) {
  const runtime = await eaInitWebR(context);eaCheckExecution(context);
  researchNotice('webR 已就绪；正在准备本次确认的数据与公式。');
  const p = payload.plan;
  await runtime.FS.writeFile('/home/web_user/ea-input.csv', new TextEncoder().encode(payload.csv));
  eaCheckExecution(context);
  const formula = eaRFormula(p);
  const vcov = p.vcov === 'cluster' ? `~${p.cluster}` : JSON.stringify(p.vcov);
  const did = p.method === 'did' ? `d$policy_effect <- as.numeric(d[[${JSON.stringify(p.treated)}]]) * as.integer(as.numeric(d[[${JSON.stringify(p.time)}]]) >= ${p.policy_year});` : '';
  const usedColumns = [...new Set([p.outcome, ...p.predictors, p.unit, p.time, p.treated, p.cluster].filter(Boolean))];
  const missing = p.missing === 'drop' ? '' : `if (anyNA(d[c(${usedColumns.map((name) => JSON.stringify(name)).join(',')})])) stop('选定变量有缺失');`;
  const code = `d <- read.csv('/home/web_user/ea-input.csv', check.names=FALSE, na.strings=c('', 'NA', 'N/A', 'null', 'NaN')); ${did} ${missing} fit <- fixest::feols(as.formula(${JSON.stringify(formula)}), data=d, vcov=${vcov}, nthreads=1, notes=FALSE); 'estimated'`;
  researchNotice('正在由浏览器 R/fixest 估计模型，可中断当前计算。');
  await runtime.evalRString(code);
  eaCheckExecution(context);
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
  if(eaExecution&&!eaExecution.cancelled){researchNotice('已有浏览器计算正在进行，请先完成或中断当前任务。',true);return;}
  if(fresh)eaResetWebR();
  const context={job:job.id,session:sessionId,epoch:++eaRunEpoch,cancelled:false,stage:'preparing',heartbeatBusy:false};eaExecution=context;
  eaActiveJob = job.id;
  const keepAlive = setInterval(async () => {
    if(context.heartbeatBusy||context.cancelled)return;context.heartbeatBusy=true;
    try{const response=await fetch(`/api/research/jobs/${job.id}/heartbeat`,{method:'POST',credentials:'same-origin',signal:AbortSignal.timeout(8000)});if(response.status===409){context.cancelled=true;eaRunEpoch++;eaResetWebR();if(context.session===sessionId)researchNotice('服务器任务已结束，浏览器计算已停止。请读取最新状态。',true);}}
    catch{if(context.session===sessionId)researchNotice('网络暂时不可用；本机计算状态与服务器尚未同步，请保持页面打开。',true);}
    finally{context.heartbeatBusy=false;}
  }, 10000);
  try {
    researchNotice('正在本机浏览器中运行 webR/fixest；关闭或刷新会中断本次计算。');
    const payload = await api(`/api/research/jobs/${job.id}/input`);
    context.nonce=payload.nonce;eaCheckExecution(context);context.stage='initializing';
    await eaInitWebR(context);eaCheckExecution(context);context.stage='estimating';
    const result = await eaDeadline(eaEstimate(payload,context),120000,'本次 R 估计超过 120 秒，已停止。输入已保存，可重新核对后运行。',eaResetWebR);
    eaCheckExecution(context);context.stage='saving';
    researchNotice('R 已返回结果；正在保存结果、实际样本和执行版本。');
    try{await api(`/api/research/jobs/${job.id}/complete`,{method:'POST',body:{nonce:payload.nonce,result}});}catch(error){if(error.uncertain||error.name==='TypeError'){eaQueueExecutionSync(context,'complete',{result});if(context.session===sessionId)researchNotice('R 已完成，但结果保存尚未确认。结果摘要已保留在此账号的浏览器中，恢复网络后同步。',true);return;}throw error;}
    researchNotice('浏览器 R 执行完成。结果已保存；可独立复算核对。');
  } catch (error) {
    if(context.session===sessionId)researchNotice(context.cancelled?'本机计算已停止，正在核对服务器任务状态。':`浏览器 R 执行失败：${error.message}`,true);
    if(!context.cancelled){try{await api(`/api/research/jobs/${job.id}/fail`,{method:'POST',body:{nonce:context.nonce||job.execution_nonce,error:error.message}});}catch(syncError){if(syncError.uncertain)eaQueueExecutionSync(context,'fail',{error:error.message});}}
  } finally {
    clearInterval(keepAlive);
    if(eaExecution===context){eaExecution=null;eaActiveJob=null;}
    if(context.session===sessionId)researchWatch(job.id);
  }
}

async function browserInterruptJob(id) {
  if (eaActiveJob !== id) return;
  const context=eaExecution;context.cancelled=true;eaRunEpoch++;eaResetWebR();
  try{await api(`/api/research/jobs/${id}/interrupt`,{method:'POST'});if(context.session===sessionId)researchNotice('本机已停止，服务器已确认中断。输入仍保存在任务中，可重新核对后运行。');}
  catch(error){eaQueueExecutionSync(context,'interrupt',{});if(context.session===sessionId)researchNotice('本机已停止，服务器中断状态待同步。恢复网络后会再次核对。',true);}
  if(context.session===sessionId)await researchWatch(id);
}

async function eaSyncBrowserPending(){for(const pending of [...eaBrowserPending.values()]){try{const job=await api(`/api/research/jobs/${pending.job}`);if(job.status==='running'){let body=pending.body;if(pending.event!=='interrupt'){const input=await api(`/api/research/jobs/${pending.job}/input`);body={...body,nonce:input.nonce};}await api(`/api/research/jobs/${pending.job}/${pending.event}`,{method:'POST',body});}else if(pending.event==='complete'&&job.status!=='succeeded'){if(pending.session===sessionId)researchNotice('保存时执行凭证已经结束。本机结果摘要保留，请从保存输入重新核对后运行。',true);continue;}eaBrowserPending.delete(pending.job);eaPersistPending();if(pending.session===sessionId){await researchWatch(pending.job);researchNotice('待同步的浏览器任务状态已确认。');}}catch{/* Keep summaries for the same signed-in account; never rerun estimates automatically. */}}}
try{for(const pending of JSON.parse(storageGet('ea_browser_pending')||'[]'))if(pending&&typeof pending.job==='string')eaBrowserPending.set(pending.job,pending);}catch{}
window.eaBeforeLeave=async()=>{if(eaExecution&&!eaExecution.cancelled){if(!confirm('浏览器 R 正在运行。离开会停止本次计算；确认中断并离开？'))return false;await browserInterruptJob(eaExecution.job);}else if(eaBrowserPending.size&&!confirm('有浏览器任务的保存状态尚未确认。摘要已保留，确认离开？'))return false;return true;};
window.eaSyncBrowserPending=eaSyncBrowserPending;
window.addEventListener('online',eaSyncBrowserPending);
window.addEventListener('beforeunload',event=>{if(eaExecution&&!eaExecution.cancelled){event.preventDefault();event.returnValue='';}});

window.addEventListener('pagehide', () => {
  if (eaActiveJob) {
    if(eaExecution){eaExecution.cancelled=true;eaRunEpoch++;eaResetWebR();eaQueueExecutionSync(eaExecution,'interrupt',{});}
    fetch(`/api/research/jobs/${eaActiveJob}/interrupt`, { method: 'POST', credentials: 'same-origin', keepalive: true }).catch(() => {});
  }
});
