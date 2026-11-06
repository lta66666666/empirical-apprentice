"""Teaching examples are derived from the confirmed aliases, never marked executed."""
import hashlib
import json

def specialty_teaching(plan):
    method=plan['method']; outcome=plan['outcome']; rhs=' '.join(plan['predictors'])
    packages='csdid/bacondecomp' if method=='staggered_did' else ('reghdfe/ivreghdfe' if method=='iv_2sls' else 'reghdfe')
    lines=['version 18.0',f'* 对应代码模板：本脚本未在 Stata 中实际运行；复现前需安装 {packages}。',
           '* 输入为复现包 normalized.csv；字段映射见对应代码说明。',
           'clear all','set more off','set varabbrev off','capture log close _all','log using stata-replay.log, text replace',
           'import delimited using normalized.csv, varnames(1) stringcols(_all) clear','generate long ea_row = _n']
    sample_line='generate byte ea_sample = e(sample)'
    if method=='event_study':
        selected=[outcome,*plan['predictors'],plan['unit'],plan['time'],plan['treated'],plan['cluster']]
        numeric=[outcome,*plan['predictors'],plan['time'],plan['treated']]
    elif method=='staggered_did':
        selected=[outcome,*plan['predictors'],plan['unit'],plan['time'],plan['first_treat'],plan['cluster']]
        numeric=[outcome,*plan['predictors'],plan['time'],plan['first_treat']]
        sample_line='generate byte ea_sample = 1'
    else:
        selected=[outcome,*plan['predictors'],plan['endogenous'],*plan['instruments']]
        if plan.get('unit'):selected += [plan['unit'],plan['time']]
        if plan['vcov']=='cluster':selected.append(plan['cluster'])
        numeric=[outcome,*plan['predictors'],plan['endogenous'],*plan['instruments']]+([plan['time']] if plan.get('unit') else [])
    selected=list(dict.fromkeys(v for v in selected if v));numeric=list(dict.fromkeys(v for v in numeric if v))
    for name in selected:lines.append(f'replace {name} = "" if inlist({name},"NA","N/A","null","NaN")')
    for name in numeric:lines.append(f'destring {name}, replace')
    lines.append('assert !missing('+','.join(selected)+')' if plan['missing']=='block' else 'drop if missing('+','.join(selected)+')')
    lines.append('assert _N >= 8')
    if method=='event_study':
        lines += [f'assert {plan["time"]} == floor({plan["time"]})',f'isid {plan["unit"]} {plan["time"]}',f'egen long ea_panel = group({plan["unit"]})',f'xtset ea_panel {plan["time"]}',f'egen long ea_cluster = group({plan["cluster"]})',f'generate int ea_event = {plan["time"]} - {plan["policy_year"]}']
        pre,post=plan['window'];reference=plan['reference_period'];dummies=[]
        for period in range(-pre,post+1):
            if period==reference:continue
            name=f'ea_m{-period}' if period<0 else ('ea_0' if period==0 else f'ea_p{period}')
            lines.append(f'generate byte {name} = ({plan["treated"]} == 1 & ea_event == {period})');dummies.append(name)
        command=(f'reghdfe {outcome} {" ".join(dummies)} {rhs}, absorb(ea_panel {plan["time"]}) vce(cluster ea_cluster)').replace('  ',' ').strip()
        lines.append(command)
        pre_dummies=[f'ea_m{-period}' for period in range(-pre,0) if period!=reference]
        if pre_dummies:lines.append('test '+' '.join(pre_dummies))
    elif method=='staggered_did':
        control='notyet' if plan['control_group']=='notyettreated' else ''
        lines += [f'assert {plan["time"]} == floor({plan["time"]})',f'isid {plan["unit"]} {plan["time"]}',
                  f'egen long ea_panel = group({plan["unit"]})',f'xtset ea_panel {plan["time"]}',
                  f'egen long ea_cluster = group({plan["cluster"]})',f'generate long ea_first = {plan["first_treat"]}',
                  f'assert ea_first == floor(ea_first) & ea_first >= 0','bysort ea_panel: assert ea_first == ea_first[1]',
                  'bysort ea_panel: egen byte ea_cohort_tag = tag(ea_first)','count if ea_cohort_tag & ea_first > 0','assert r(N) >= 2']
        command=(f'csdid {outcome} {rhs}, ivar(ea_panel) gvar(ea_first) cluster(ea_cluster) {control}').replace('  ',' ').replace(' ,',',').strip()
        lines.append(command)
        lines += ['estat simple','estat event',f'generate byte ea_treat = (ea_first > 0 & {plan["time"]} >= ea_first)',
                  ('bacondecomp '+' '.join([outcome,*plan['predictors']])+', ddetail').replace('  ',' ').replace(' ,',',')]
    else:
        if plan.get('unit'):
            lines += [f'assert {plan["time"]} == floor({plan["time"]})',f'isid {plan["unit"]} {plan["time"]}',f'egen long ea_panel = group({plan["unit"]})',f'xtset ea_panel {plan["time"]}']
        if plan['vcov']=='cluster':lines += [f'egen long ea_cluster = group({plan["cluster"]})']
        instruments=' '.join(plan['instruments'])
        if plan.get('unit'):
            command=f'ivreghdfe {outcome} {rhs} ({plan["endogenous"]} = {instruments}), absorb(ea_panel {plan["time"]}) cluster(ea_cluster)'
        else:
            command=f'ivreg2 {outcome} {rhs} ({plan["endogenous"]} = {instruments}), robust'+(' cluster(ea_cluster)' if plan['vcov']=='cluster' else '')
        lines.append(command.replace('  ',' ').strip())
        lines.append('estat firststage')
        if len(plan['instruments'])>1:lines.append('estat overid')
    lines += [sample_line,'preserve','keep if ea_sample','keep ea_row','export delimited using stata-sample.csv, replace','restore','log close _all']
    main_line=next(index for index,line in enumerate(lines,1) if line.startswith(('reghdfe ','ivreghdfe ','ivreg2 ','csdid ')))
    def topic(index,line):
        if index==main_line:return 'estimate'
        if line.startswith('import '):return 'import'
        if line.startswith('destring '):return 'numeric'
        if line.startswith(('drop if missing','assert !missing','replace ')):return 'missing'
        if line.startswith(('xtset ','isid ','egen long ea_panel')):return 'panel'
        if line.startswith('egen long ea_cluster'):return 'cluster'
        if line.startswith('generate int ea_event'):return 'post'
        if line.startswith('estat event'):return 'event'
        if line.startswith('estat simple'):return 'simple'
        if line.startswith('bacondecomp '):return 'comparison'
        if line.startswith('generate byte ea_treat'):return 'interaction'
        if line.startswith(('assert _N','assert r(N)')):return 'sample'
        return None
    commands=[{'id':'line-'+str(index),'line':index,'text':line,'topic':topic(index,line)} for index,line in enumerate(lines,1) if topic(index,line)]
    differences=['对应模型结构；云端内核与 Stata 的有限样本、聚类与缺失处理必须分别核对。','本模板未在 Stata 中实际运行；需要 reghdfe/ivreghdfe，数值不承诺逐位相同。']
    if method=='iv_2sls':differences.append('工具外生性不可由数据自动检验；弱工具诊断需在 Stata 端重新核对。')
    if method=='staggered_did':differences += ['队列 ATT 由 csdid（Callaway–Sant\'Anna）估计；bacondecomp 只用于展示 TWFE 负权重，两者数值不保证逐位一致。','需要安装 csdid、drdid 与 bacondecomp；csdid 的 gvar 以 0 表示始终未处理。']
    text='\n'.join(lines)+'\n'
    return text,{'schema_version':1,'artifact_kind':'stata_corresponding_code','executed':False,'template_version':'joycode-linear-4',
                 'sha256':hashlib.sha256(text.encode()).hexdigest(),'labels':plan['labels'],
                 'commands':commands,'mapping':[{'alias':k,'name':v} for k,v in plan['labels'].items()],
                 'derived':[{'alias':'ea_first','sources':[plan['first_treat']]},{'alias':'ea_treat','sources':[plan['first_treat'],plan['time']]}] if method=='staggered_did' else [],
                 'core_command_id':'line-'+str(main_line),'core_command':lines[main_line-1],'differences':differences}


def _stata_teaching(plan):
    if plan['method'] in ('event_study','iv_2sls','staggered_did'):
        return specialty_teaching(plan)
    method=plan['method']; rhs=' '.join(plan['predictors'])
    vce={'iid':'','hetero':'vce(robust)','cluster':f"vce(cluster {plan.get('cluster','')})"}[plan['vcov']]
    lines=['version 18.0','* 对应代码：本任务已由云端计算执行；本脚本本身未在云端运行。',
           '* 输入为复现包 normalized.csv；字段映射见对应代码说明。',
           'clear all','set more off','set varabbrev off','capture log close _all','log using stata-replay.log, text replace',
           'import delimited using normalized.csv, varnames(1) stringcols(_all) clear','generate long ea_row = _n']
    selected=[plan['outcome'],*plan['predictors']]
    if method!='ols':selected += [plan['unit'],plan['time']]
    if method=='did':selected.append(plan['treated'])
    if plan['vcov']=='cluster':selected.append(plan['cluster'])
    selected=list(dict.fromkeys(selected))
    numeric=[plan['outcome'],*plan['predictors']]+([plan['time']] if method!='ols' else [])+([plan['treated']] if method=='did' else [])
    for name in selected:lines.append(f'replace {name} = "" if inlist({name},"NA","N/A","null","NaN")')
    for name in dict.fromkeys(numeric):lines.append(f'destring {name}, replace')
    lines += [('assert !missing(' if plan.get('missing')=='block' else 'drop if missing(')+','.join(selected)+')',f"assert _N >= {max(8,len(plan['predictors'])+(1 if method=='did' else 0)+2)}"]
    if plan['vcov']=='cluster':
        lines += [f"egen long ea_cluster = group({plan['cluster']})",'egen byte ea_cluster_tag = tag(ea_cluster)','count if ea_cluster_tag','assert r(N) >= 2']
        vce='vce(cluster ea_cluster)'
    if method=='ols':
        command=f"regress {plan['outcome']} {rhs}"+(f', {vce}' if vce else '')
    else:
        lines += [f"assert {plan['time']} == floor({plan['time']})",f"isid {plan['unit']} {plan['time']}",f"egen long ea_panel = group({plan['unit']})",f"xtset ea_panel {plan['time']}"]
        if method=='did':
            lines += [f"assert inlist({plan['treated']},0,1)",f"bysort ea_panel: assert {plan['treated']} == {plan['treated']}[1]",f"generate byte policy_post = {plan['time']} >= {plan['policy_year']}",f"generate byte policy_effect = {plan['treated']} * policy_post",'bysort ea_panel: egen byte ea_minpost = min(policy_post)','bysort ea_panel: egen byte ea_maxpost = max(policy_post)','assert ea_minpost == 0 & ea_maxpost == 1']
            for g in (0,1):
                for period in (0,1):lines += [f"count if {plan['treated']}=={g} & policy_post=={period}",'assert r(N)>0']
            rhs='policy_effect '+rhs
        command=f"xtreg {plan['outcome']} {rhs} i.{plan['time']}, fe {vce}".rstrip()
    lines.append(command)
    main_line=len(lines)
    lines += ['generate byte ea_sample = e(sample)','preserve','keep if ea_sample','keep ea_row','export delimited using stata-sample.csv, replace','restore','log close _all']
    text='\n'.join(lines)+'\n'
    def topic(line):
        if line==command:return 'estimate'
        if line.startswith('import '):return 'import'
        if line.startswith('destring '):return 'numeric'
        if line.startswith(('drop if missing','assert !missing','replace ')):return 'missing'
        if line.startswith('assert _N'):return 'sample'
        if line.startswith('xtset '):return 'xtset'
        if line.startswith('generate byte policy_post'):return 'post'
        if line.startswith('generate byte policy_effect'):return 'interaction'
        if line.startswith('egen long ea_panel'):return 'panel'
        if line.startswith('egen long ea_cluster'):return 'cluster'
    commands=[{'id':'line-'+str(i),'line':i,'text':line,'topic':topic(line)} for i,line in enumerate(lines,1) if topic(line)]
    return text,{'schema_version':1,'artifact_kind':'stata_corresponding_code','executed':False,'template_version':'joycode-linear-2',
                 'sha256':hashlib.sha256(text.encode()).hexdigest(),'labels':plan['labels'],
                 'commands':commands,'mapping':[{'alias':k,'name':v} for k,v in plan['labels'].items()],
                 'derived':[{'alias':'policy_post','sources':[plan.get('time')]},{'alias':'policy_effect','sources':[plan.get('treated'),'policy_post']}] if method=='did' else [],
                 'core_command_id':'line-'+str(main_line),'core_command':command,'differences':['对应模型结构；云端内核与 Stata 的有限样本调整、共线项及缺失处理必须分别核对。',
                   '固定效应聚类推断采用 t(G−1) 自由度；与 xtreg 可能存在的细微差异需在报告中对核。']}

def r_teaching(plan):
    method=plan['method']; outcome=plan['outcome']; predictors=list(plan['predictors'])
    cluster=plan.get('cluster') if plan['vcov']=='cluster' else ''
    vcov='~ '+cluster if cluster else ('"hetero"' if plan['vcov']=='hetero' else '"iid"')
    lines=['# R 对应代码模板：本脚本未在 R 中实际运行，仅用于对照阅读。',
           '# 输入为复现包 normalized.csv；字段映射见对应代码说明。']
    lines += ['library(did)','library(fixest)'] if method=='staggered_did' else ['library(fixest)']
    lines.append('d <- read.csv("normalized.csv", stringsAsFactors = FALSE)')
    if method=='event_study':
        selected=[outcome,*predictors,plan['unit'],plan['time'],plan['treated'],plan['cluster']]
        numeric=[outcome,*predictors,plan['time'],plan['treated']]
    elif method=='staggered_did':
        selected=[outcome,*predictors,plan['unit'],plan['time'],plan['first_treat'],plan['cluster']]
        numeric=[outcome,*predictors,plan['time'],plan['first_treat']]
    elif method=='iv_2sls':
        selected=[outcome,*predictors,plan['endogenous'],*plan['instruments']]
        if plan.get('unit'):selected += [plan['unit'],plan['time']]
        if plan['vcov']=='cluster':selected.append(plan['cluster'])
        numeric=[outcome,*predictors,plan['endogenous'],*plan['instruments']]+([plan['time']] if plan.get('unit') else [])
    else:
        selected=[outcome,*predictors]
        if method!='ols':selected += [plan['unit'],plan['time']]
        if method=='did':selected.append(plan['treated'])
        if plan['vcov']=='cluster':selected.append(plan['cluster'])
        numeric=[outcome,*predictors]+([plan['time']] if method!='ols' else [])+([plan['treated']] if method=='did' else [])
    selected=list(dict.fromkeys(v for v in selected if v));numeric=list(dict.fromkeys(v for v in numeric if v))
    lines.append('numeric_cols <- c('+', '.join('"'+v+'"' for v in numeric)+')')
    lines.append('for (v in numeric_cols) d[[v]] <- suppressWarnings(as.numeric(d[[v]]))')
    used=', '.join('"'+v+'"' for v in selected)
    lines.append(f'stopifnot(!anyNA(d[, c({used})]))' if plan['missing']=='block' else f'd <- d[complete.cases(d[, c({used})]), ]')
    regs=' + '.join(predictors) or '1'
    if method=='ols':
        lines += [f'm <- feols({outcome} ~ {regs}, data = d, vcov = {vcov})','etable(m)']
    elif method=='panel_fe':
        lines += [f'm <- feols({outcome} ~ {regs} | {plan["unit"]} + {plan["time"]}, data = d, vcov = {vcov})','etable(m)']
    elif method=='did':
        extra=(' + '+regs) if predictors else ''
        lines += [f'd$policy_post <- as.integer(d${plan["time"]} >= {plan["policy_year"]})',
                  f'd$policy_effect <- d${plan["treated"]} * d$policy_post',
                  f'm <- feols({outcome} ~ policy_effect{extra} | {plan["unit"]} + {plan["time"]}, data = d, vcov = {vcov})','etable(m)']
    elif method=='event_study':
        pre,post=plan['window'];reference=plan['reference_period']
        lines.append(f'd$ea_event <- d${plan["time"]} - {plan["policy_year"]}')
        dummies=[]
        for period in range(-pre,post+1):
            if period==reference:continue
            name=f'ea_m{-period}' if period<0 else ('ea_0' if period==0 else f'ea_p{period}')
            lines.append(f'd${name} <- as.integer(d${plan["treated"]} == 1 & d$ea_event == {period})');dummies.append(name)
        extra=(' + '+regs) if predictors else ''
        lines += [f'm <- feols({outcome} ~ {" + ".join(dummies)}{extra} | {plan["unit"]} + {plan["time"]}, data = d, vcov = {vcov})','etable(m)']
        pre_dummies=[name for name in dummies if name.startswith('ea_m')]
        if pre_dummies:lines.append('wald(m, keep = "'+'|'.join(pre_dummies)+'")')
    elif method=='iv_2sls':
        instruments=' + '.join(plan['instruments'])
        block=f'{plan["unit"]} + {plan["time"]} | ' if plan.get('unit') else ''
        lines += [f'm <- feols({outcome} ~ {regs} | {block}{plan["endogenous"]} ~ {instruments}, data = d, vcov = {vcov})','summary(m, stage = 1)']
    elif method=='staggered_did':
        control=plan['control_group'];xformla=f'~ {" + ".join(predictors)}' if predictors else '~ 1'
        extra=(' + '+regs) if predictors else ''
        lines += [f'd$ea_first <- d${plan["first_treat"]}',
                  f'att <- att_gt(yname = "{outcome}", gname = "ea_first", idname = "{plan["unit"]}", tname = "{plan["time"]}",',
                  f'              data = d, xformla = {xformla}, control_group = "{control}",',
                  f'              base_period = "universal", clustervars = "{cluster}")',
                  'aggte(att, type = "simple")','aggte(att, type = "dynamic")',
                  f'd$ea_treat <- as.integer(d$ea_first > 0 & d${plan["time"]} >= d$ea_first)',
                  f'm_twfe <- feols({outcome} ~ ea_treat{extra} | {plan["unit"]} + {plan["time"]}, data = d, vcov = {vcov})']
    differences=['R 代码使用 fixest / did 接口；与 Stata 或云端内核的有限样本调整、聚类自由度与缺失处理可能不同，数值不承诺逐位一致。',
                 '两种语言的代码均为只读教学产物，不能替代本次实际执行的软件与版本记录。']
    if method=='staggered_did':
        differences.append('did::att_gt 的对照组口径与 csdid 对应；TWFE 系数仅用于与队列 ATT 对照，不应作为主结果。')
    text='\n'.join(lines)+'\n'
    return text,{'schema_version':1,'artifact_kind':'r_corresponding_code','executed':False,'template_version':'joycode-r-1',
                 'sha256':hashlib.sha256(text.encode()).hexdigest(),'labels':plan['labels'],'differences':differences}

def teaching(plan):
    text,manifest=_stata_teaching(plan)
    r_text,r_manifest=r_teaching(plan)
    manifest['r_code']=r_text
    manifest['r_sha256']=r_manifest['sha256']
    manifest['r_template_version']=r_manifest['template_version']
    manifest['r_differences']=r_manifest['differences']
    return text,manifest

def artifacts(plan,script,result,log):
    text,manifest=teaching(plan)
    return {'estimate.py':script,'stata-corresponding.do':text,'stata-corresponding.json':json.dumps(manifest,ensure_ascii=False),
            'r-corresponding.R':manifest['r_code'],
            'parameters.json':json.dumps(plan,ensure_ascii=False),'execution.log':log,
            'session-info.txt':json.dumps({'software':'python','python':result['python_version'],
               'packages':result['package_versions'],'inference':result['inference']},ensure_ascii=False)}
