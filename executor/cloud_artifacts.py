"""Teaching examples are derived from the confirmed aliases, never marked executed."""
import hashlib
import json

def teaching(plan):
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

def artifacts(plan,script,result,log):
    text,manifest=teaching(plan)
    return {'estimate.py':script,'stata-corresponding.do':text,'stata-corresponding.json':json.dumps(manifest,ensure_ascii=False),
            'parameters.json':json.dumps(plan,ensure_ascii=False),'execution.log':log,
            'session-info.txt':json.dumps({'software':'python','python':result['python_version'],
               'packages':result['package_versions'],'inference':result['inference']},ensure_ascii=False)}
