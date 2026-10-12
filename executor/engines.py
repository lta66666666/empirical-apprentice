import asyncio
import csv
import json
import math
import os
import re
import shutil
import signal
from pathlib import Path

TEMPLATES=Path(__file__).parent/'templates'

def child_env():
    allowed=('PATH','SYSTEMROOT','WINDIR','LD_LIBRARY_PATH','R_HOME','R_LIBS','R_LIBS_USER','LANG','LC_ALL','TMPDIR','HOME')
    return {**{k:os.environ[k] for k in allowed if k in os.environ},'OMP_NUM_THREADS':'1','OPENBLAS_NUM_THREADS':'1'}

async def process(args,cwd=None,timeout=120,on_start=None):
    proc=await asyncio.create_subprocess_exec(*map(str,args),cwd=cwd,env=child_env(),stdout=asyncio.subprocess.PIPE,stderr=asyncio.subprocess.PIPE,start_new_session=os.name!='nt')
    if on_start:on_start(proc.pid)
    try:
        out,err=await asyncio.wait_for(proc.communicate(),timeout)
    except (asyncio.TimeoutError,asyncio.CancelledError):
        if proc.returncode is None:
            if os.name=='nt':
                killer=await asyncio.create_subprocess_exec('taskkill','/PID',str(proc.pid),'/T','/F',stdout=asyncio.subprocess.DEVNULL,stderr=asyncio.subprocess.DEVNULL)
                await killer.wait()
            else:
                try: os.killpg(proc.pid,signal.SIGKILL)
                except ProcessLookupError: pass
        await proc.communicate()
        raise
    return proc.returncode,(out+err).decode('utf-8',errors='replace')

async def capabilities():
    r={'ready':False,'status':'未配置','reason':'尚未安装原生 R'}
    executable=os.getenv('EA_RSCRIPT') or shutil.which('Rscript')
    if executable:
        try:
            code,out=await process([executable,'--vanilla','-e',"cat(jsonlite::toJSON(list(r=as.character(getRversion()),fixest=as.character(packageVersion('fixest'))),auto_unbox=TRUE))"],timeout=15)
            match=re.search(r'\{"r":"[^"]+","fixest":"[^"]+"\}',out)
            versions=json.loads(match.group()) if code==0 and match else {}
            ready=versions=={'r':'4.6.1','fixest':'0.14.2'}
            r={'ready':ready,'status':'可执行' if ready else '环境待验收','reason':'原生 R 4.6.1 / fixest 0.14.2' if ready else '必须安装 R 4.6.1 与 fixest 0.14.2','versions':versions}
        except Exception: r={'ready':False,'status':'环境待验收','reason':'原生 R 运行检查失败'}
    stata_path=os.getenv('EA_STATA_EXECUTABLE','')
    licensed=os.getenv('EA_STATA_WEB_AUTHORIZED')=='true'
    accepted=os.getenv('EA_STATA_RUNTIME_ACCEPTED')=='true'
    stata={'ready':licensed and accepted and Path(stata_path).is_file(),'status':'授权待确认' if not licensed else '环境待验收','reason':'需确认网站用途授权、Linux 安装与真实运行验收'}
    if stata['ready']: stata.update(status='可执行',reason='已配置授权声明与运行验收声明；每次任务仍检查实际版本')
    return {'r_native':r,'stata_native':stata,'eviews_native':{'ready':False,'status':'未接入','reason':'尚无适用的网站集成方案'}}

def stata_script(p):
    rhs=' '.join((['policy_effect'] if p['method']=='did' else [])+p['predictors'])
    variables=list(dict.fromkeys(v for v in [p['outcome'],*p['predictors'],p.get('unit'),p.get('time'),p.get('treated'),p.get('cluster')] if v))
    numeric=list(dict.fromkeys([p['outcome'],*p['predictors']]+([p['time']] if p['method']!='ols' else [])+([p['treated']] if p['method']=='did' else [])))
    lines=['version 18.0','clear all','set more off','set processors 1','capture log close _all','log using execution.log, text replace','assert c(stata_version) >= 18 & c(stata_version) < 19','import delimited using normalized.csv, varnames(1) stringcols(_all) clear','generate long ea_row = _n']
    for v in numeric:
        lines += [f'replace {v} = "" if inlist({v},"NA","N/A","null","NaN")',f'destring {v}, replace']
    # All selected variables contribute to complete-case handling, including string IDs.
    for v in variables:
        lines += [f'capture confirm string variable {v}',f'if !_rc replace {v} = "" if inlist({v},"NA","N/A","null","NaN")']
    lines+=['generate byte ea_missing = 0']+[f'replace ea_missing = 1 if missing({v})' for v in variables]
    if p['missing']=='block':lines+=['assert ea_missing == 0']
    if p['method']!='ols':lines += [f'assert !missing({p["unit"]}) & !missing({p["time"]})',f'assert {p["time"]} == floor({p["time"]})',f'isid {p["unit"]} {p["time"]}']
    lines += ['drop if ea_missing','assert _N >= 8']
    if p['vcov']=='cluster':lines += [f'egen long ea_cluster = group({p["cluster"]})']
    vce={'iid':'','hetero':'vce(robust)','cluster':'vce(cluster ea_cluster)'}[p['vcov']]
    if p['method']!='ols':lines += [f'egen long ea_panel = group({p["unit"]})',f'xtset ea_panel {p["time"]}']
    if p['method']=='did':
        lines += [f'assert inlist({p["treated"]},0,1)',f'bysort ea_panel: assert {p["treated"]} == {p["treated"]}[1]',f'generate byte policy_post = {p["time"]} >= {p["policy_year"]}',f'generate byte policy_effect = {p["treated"]} * policy_post','bysort ea_panel: egen byte ea_minpost = min(policy_post)','bysort ea_panel: egen byte ea_maxpost = max(policy_post)','assert ea_minpost == 0 & ea_maxpost == 1']
        for g in (0,1):
            for t in (0,1):lines += [f'count if {p["treated"]}=={g} & policy_post=={t}','assert r(N)>0']
    command=f'regress {p["outcome"]} {rhs}'+(f', {vce}' if vce else '') if p['method']=='ols' else f'xtreg {p["outcome"]} {rhs} i.{p["time"]}, fe {vce}'
    lines += [command,'matrix ea_b = e(b)','matrix ea_v = e(V)','scalar ea_df = e(df_r)','scalar ea_n = e(N)','generate byte ea_sample = e(sample)','preserve','keep if ea_sample','keep ea_row','export delimited using sample.csv, replace','restore','file open meta using metadata.csv, write replace','file write meta "version,n_used,df" _n','file write meta (c(stata_version)) "," (ea_n) "," (ea_df) _n','file close meta','file open results using coefficients.csv, write replace','file write results "term,estimate,std_error,p_value,ci_low,ci_high" _n','local names : colnames ea_b','forvalues j=1/`=colsof(ea_b)\' {','local name : word `j\' of `names\'','scalar ea_est = ea_b[1,`j\']','scalar ea_se = sqrt(ea_v[`j\',`j\'])','scalar ea_p = 2*ttail(ea_df,abs(ea_est/ea_se))','scalar ea_crit = invttail(ea_df,.025)','file write results "`name\'," %24.17g (ea_est) "," %24.17g (ea_se) "," %24.17g (ea_p) "," %24.17g (ea_est-ea_crit*ea_se) "," %24.17g (ea_est+ea_crit*ea_se) _n','}','file close results','log close _all','exit, clear']
    return '\n'.join(lines)+'\n',command

async def execute(payload,directory,development=False):
    engine=payload['engine_id'];p=payload['plan']
    if engine=='r_native':
        cap=(await capabilities())[engine]
        if not cap['ready']:raise ValueError(cap['reason'])
        script=(TEMPLATES/'estimate.R').read_text(encoding='utf-8')
        (directory/'estimate.R').write_text(script,encoding='utf-8')
        try:code,log=await process([os.getenv('EA_RSCRIPT') or shutil.which('Rscript'),'--vanilla',directory/'estimate.R',directory])
        except asyncio.TimeoutError:raise TimeoutError('R exceeded 120 seconds; process tree terminated')
        (directory/'execution.log').write_text(log,encoding='utf-8')
        result=json.loads((directory/'result.json').read_text(encoding='utf-8')) if (directory/'result.json').exists() else {}
        if code or result.get('status')!='succeeded':raise ValueError(result.get('error',log[-500:] or 'R did not produce output'))
        result['software_version']=result['r_version'];result['inference']={'vcov':p['vcov'],'cluster':p['cluster'],'confidence':.95,'correction':'fixest default ssc','df':result.get('df_t')}
        artifacts={'estimate.R':script,'parameters.json':json.dumps(p,ensure_ascii=False),'execution.log':log,'session-info.txt':(directory/'session-info.txt').read_text(encoding='utf-8')}
    elif engine=='stata_native':
        if not development and not (await capabilities())[engine]['ready']:raise ValueError('Stata web authorization and runtime acceptance required')
        script,command=stata_script(p)
        (directory/'estimate.do').write_text(script,encoding='utf-8')
        exe=os.getenv('EA_STATA_EXECUTABLE','')
        if not Path(exe).is_file():raise ValueError('Stata executable not configured')
        args=[exe,'/e','do','estimate.do'] if os.name=='nt' else [exe,'-b','do','estimate.do']
        try:code,out=await process(args,cwd=directory)
        except asyncio.TimeoutError:raise TimeoutError('Stata exceeded 120 seconds; process tree terminated')
        log=(directory/'execution.log').read_text(encoding='utf-8',errors='replace') if (directory/'execution.log').exists() else out
        if code or not (directory/'metadata.csv').exists() or not (directory/'coefficients.csv').exists():raise ValueError('Stata failed; inspect execution.log: '+log[-500:])
        meta=next(csv.DictReader((directory/'metadata.csv').open(encoding='utf-8')))
        full=list(csv.DictReader((directory/'coefficients.csv').open(encoding='utf-8')))
        coefficients=[]
        for row in full:
            alias=row['term']
            if alias not in p['predictors']+(['policy_effect'] if p['method']=='did' else [])+(['_cons'] if p['method']=='ols' else []):continue
            item={k:float(row[k]) for k in ('estimate','std_error','p_value','ci_low','ci_high')}
            if not all(math.isfinite(v) for v in item.values()):raise ValueError('Non-finite Stata inference')
            item['term']='(Intercept)' if alias=='_cons' else 'DID effect' if alias=='policy_effect' else p['labels'].get(alias,alias)
            coefficients.append(item)
        used=[int(row['ea_row']) for row in csv.DictReader((directory/'sample.csv').open(encoding='utf-8'))]
        result={'status':'succeeded','software_version':'Stata '+meta['version'],'package_versions':{},'n_used':int(float(meta['n_used'])),'coefficients':coefficients,'used_indices':used,'inference':{'command':command,'vcov':p['vcov'],'cluster':p['cluster'],'df':float(meta['df']),'confidence':.95,'correction':'Stata regress/xtreg finite sample correction'},'warnings':['Stata 与 fixest 的有限样本调整及自由度可能不同；标准误与区间不得直接判定跨软件一致。','显著性不能自动证明因果。']}
        artifacts={'estimate.do':script,'parameters.json':json.dumps(p,ensure_ascii=False),'execution.log':log,'full-coefficients.csv':(directory/'coefficients.csv').read_text(encoding='utf-8'),'sample.csv':(directory/'sample.csv').read_text(encoding='utf-8')}
    else:raise ValueError('EViews is not integrated')
    if not result['coefficients']:raise ValueError('No identified selected coefficients')
    result.update(engine_id=engine,execution_location='cloud_native',software=payload['software'])
    return result,artifacts
