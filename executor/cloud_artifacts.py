"""Teaching examples are derived from the confirmed aliases, never marked executed."""
import hashlib
import json

def teaching(plan):
    method=plan['method']; rhs=' '.join(plan['predictors'])
    vce={'iid':'','hetero':'vce(robust)','cluster':f"vce(cluster {plan.get('cluster','')})"}[plan['vcov']]
    lines=['version 18.0','* Stata 对应代码：教学示例，本任务由 Python/StatsPAI 计算。',
           '* 请使用复现包中的 normalized.csv；原列名见 parameters.json 的 labels。',
           'clear all','set more off','import delimited using normalized.csv, clear']
    selected=[plan['outcome'],*plan['predictors']]
    if method!='ols':selected += [plan['unit'],plan['time']]
    if method=='did':selected.append(plan['treated'])
    if plan['vcov']=='cluster':selected.append(plan['cluster'])
    selected=list(dict.fromkeys(selected))
    lines += ['* 字符串 NA/N/A/null/NaN 与空值须先按数据说明统一为 Stata 缺失。',
              ('assert !missing(' if plan.get('missing')=='block' else 'drop if missing(')+','.join(selected)+')']
    if method=='ols':
        command=f"regress {plan['outcome']} {rhs}"+(f', {vce}' if vce else '')
    else:
        lines += [f"egen long ea_panel = group({plan['unit']})",f"xtset ea_panel {plan['time']}"]
        if method=='did':
            lines += [f"generate byte policy_post = {plan['time']} >= {plan['policy_year']}",f"generate byte policy_effect = {plan['treated']} * policy_post"]
            rhs='policy_effect '+rhs
        command=f"xtreg {plan['outcome']} {rhs} i.{plan['time']}, fe {vce}".rstrip()
    lines.append(command)
    text='\n'.join(lines)+'\n'
    return text,{'artifact_kind':'stata_corresponding_code','executed':False,'template_version':'joycode-linear-1',
                 'sha256':hashlib.sha256(text.encode()).hexdigest(),'labels':plan['labels'],
                 'core_command':command,'differences':['对应模型结构；Python 与 Stata 的有限样本调整、共线项及缺失处理必须分别核对。',
                   '固定效应使用 StatsPAI native feols ssc=fixest；聚类推断采用 t(G−1)，不承诺与 xtreg 数值完全相同。']}

def artifacts(plan,script,result,log):
    text,manifest=teaching(plan)
    return {'estimate.py':script,'stata-corresponding.do':text,'stata-corresponding.json':json.dumps(manifest,ensure_ascii=False),
            'parameters.json':json.dumps(plan,ensure_ascii=False),'execution.log':log,
            'session-info.txt':json.dumps({'software':'python','python':result['python_version'],
               'packages':result['package_versions'],'inference':result['inference']},ensure_ascii=False)}
