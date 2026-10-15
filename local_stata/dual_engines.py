"""Local-only, three-method adapters. Never interpret remote Python code."""
import csv
import hashlib
import importlib.metadata
import json
import math
import platform
from pathlib import Path

PINS = {'statspai': ('1.39.5', '9f12d999d23a5bc2f2fa5fca38fe498aeea38752'),
        'stata-code': ('0.17.0', 'f75aa7c7ec7270cedc7e91ebbf433a5384a575d5')}


def pinned_versions():
    versions = {}
    for name, (version, commit) in PINS.items():
        actual = importlib.metadata.version(name)
        if actual != version:
            raise ValueError(f'{name}: expected {version}, installed {actual}')
        distribution = importlib.metadata.distribution(name)
        direct = json.loads(distribution.read_text('direct_url.json') or '{}')
        # Our installer uses immutable source archives; an unrelated PyPI wheel
        # with the same version is not evidence of the audited source.
        if commit not in direct.get('url', ''):
            raise ValueError(f'{name}: audited source commit is not installed')
        versions[name] = actual
    return versions


def comparison(left, right):
    """A failed prerequisite is not numeric agreement, nor causal evidence."""
    tolerance = {'absolute': 1e-8, 'relative': 1e-6, 'p_absolute': 1e-6}
    reasons = []
    if not left or not right:
        return {'status': 'unable_to_compare', 'reasons': ['一个引擎没有成功结果'], 'tolerance': tolerance}
    if any(not isinstance(r.get('inference',{}).get('df'),(int,float)) or not math.isfinite(r['inference']['df']) or r['inference']['df']<=0 for r in (left,right)): reasons.append('实际推断自由度缺失或无效')
    for key in ('input_sha256', 'plan_sha256', 'n_used'):
        if not left.get(key) or left.get(key) != right.get(key): reasons.append(key + '不一致或缺失')
    if sorted(left.get('used_indices', [])) != sorted(right.get('used_indices', [])): reasons.append('实际估计样本不一致')
    for key in ('vcov', 'cluster', 'df', 'confidence', 'correction'):
        if left.get('inference', {}).get(key) != right.get('inference', {}).get(key): reasons.append('推断设置 ' + key + ' 不一致')
    a = {r['term']: r for r in left.get('coefficients', [])}
    b = {r['term']: r for r in right.get('coefficients', [])}
    if not a or set(a) != set(b): reasons.append('估计项不一致或缺失')
    if reasons: return {'status': 'unable_to_compare', 'reasons': reasons, 'tolerance': tolerance}
    differences = []
    for term in a:
        for key in ('estimate', 'std_error', 'p_value', 'ci_low', 'ci_high'):
            x, y = a[term].get(key), b[term].get(key)
            if not isinstance(x, (float, int)) or not isinstance(y, (float, int)) or not math.isfinite(x) or not math.isfinite(y):
                return {'status': 'unable_to_compare', 'reasons': ['统计量缺失'], 'tolerance': tolerance}
            allowed = 1e-6 if key == 'p_value' else 1e-8 + 1e-6 * max(abs(x), abs(y))
            if abs(x-y) > allowed: differences.append({'term': term, 'field': key, 'absolute_difference': abs(x-y)})
    return {'status': 'different' if differences else 'passed', 'differences': differences,
            'tolerance': tolerance, 'meaning': '仅核对当前配置的数值，不证明因果识别成立'}


def stats_compute(directory, plan):
    import numpy as np
    import pandas as pd
    import statspai as sp
    from scipy.stats import t
    versions = pinned_versions()
    if platform.python_version_tuple()[:2] != ('3', '11'): raise ValueError('需要 Python 3.11')
    if plan['method'] not in ('ols', 'panel_fe', 'did'): raise ValueError('方法未开放')
    if plan['vcov'] not in ('iid','hetero','cluster') or plan['missing'] not in ('block','drop'): raise ValueError('方差或缺失值处理参数无效')
    # Read strings first, exactly as the Stata template does. No patsy formulas
    # containing user-supplied names: all columns are locally generated aliases.
    frame = pd.read_csv(directory/'normalized.csv', dtype=str, keep_default_na=False)
    frame.index = np.arange(1, len(frame)+1)
    selected = list(dict.fromkeys(v for v in [plan['outcome'], *plan['predictors'], plan.get('unit'), plan.get('time'), plan.get('treated'), plan.get('cluster')] if v))
    numeric = list(dict.fromkeys([plan['outcome'], *plan['predictors']] + ([plan['time']] if plan['method'] != 'ols' else []) + ([plan['treated']] if plan['method'] == 'did' else [])))
    frame[selected] = frame[selected].replace({'': np.nan, 'NA': np.nan, 'N/A': np.nan, 'null': np.nan, 'NaN': np.nan})
    for name in numeric:
        frame[name] = pd.to_numeric(frame[name], errors='raise')
        if not np.isfinite(frame[name].dropna()).all(): raise ValueError('非有限输入')
    missing = frame[selected].isna().any(axis=1)
    if plan['missing'] == 'block' and missing.any(): raise ValueError('存在缺失值，需要先核对删除规则')
    # The current Stata template checks panel IDs before deleting missing rows.
    if plan['method'] != 'ols':
        if frame[[plan['unit'], plan['time']]].isna().any().any(): raise ValueError('个体或年份缺失')
        if frame.duplicated([plan['unit'], plan['time']]).any(): raise ValueError('个体年份重复')
        if not (frame[plan['time']] == np.floor(frame[plan['time']])).all(): raise ValueError('年份必须为整数')
    data = frame.loc[~missing].copy()
    if len(data) < 8: raise ValueError('完整样本少于8行')
    rhs = list(plan['predictors'])
    if plan['method'] == 'did':
        if not plan.get('same_batch') or not data[plan['treated']].isin([0, 1]).all(): raise ValueError('同批DID组别无效')
        if (data.groupby(plan['unit'])[plan['treated']].nunique() != 1).any(): raise ValueError('组别随时期改变')
        post = (data[plan['time']] >= plan['policy_year']).astype(int)
        data['policy_effect'] = data[plan['treated']] * post
        if (post.groupby(data[plan['unit']]).nunique() != 2).any(): raise ValueError('个体缺少前期或后期')
        if any(not ((data[plan['treated']] == g) & (post == p)).any() for g in (0,1) for p in (0,1)): raise ValueError('DID四格样本不完整')
        rhs = ['policy_effect'] + rhs
    formula = plan['outcome'] + ' ~ ' + ' + '.join(rhs)
    if plan['method'] == 'ols':
        opts = {'robust': False if plan['vcov'] == 'iid' else 'HC1'}
        if plan['vcov'] == 'cluster': opts = {'cluster': plan['cluster']}
        fit = sp.regress(formula, data=data, collinear='raise', **opts)
        params, errors = fit.params, fit.std_errors
        df = float(fit.data_info.get('df_inference', fit.data_info['df_resid']))
        used = [int(x) for x in fit.data_info['sample_index']]
        correction = 'Stata regress/xtreg finite sample correction'
        native = fit.to_dict()
    else:
        formula += ' | ' + plan['unit'] + ' + ' + plan['time']
        # xtreg retains singleton rows. Set this explicitly and verify the
        # returned count before claiming these preprocessed indices were used.
        fit = sp.fast.feols(formula, data=data, vcov={'iid':'iid','hetero':'hc1','cluster':'cr1'}[plan['vcov']],
                            cluster=plan['cluster'] if plan['vcov']=='cluster' else None,
                            ssc='fixest', drop_singletons=False)
        if fit.n_kept != len(data) or fit.n_dropped_singletons: raise ValueError('原生结果未提供足够的实际样本证据')
        params, errors = fit.coef(), fit.se()
        df = float(fit.df_resid)
        used = [int(x) for x in data.index]
        correction = 'StatsPAI native feols ssc=fixest; t(df_resid)'
        native = fit.to_dict()
    if df <= 0: raise ValueError('推断自由度不足')
    coefficients = []
    for name, value in params.items():
        se = float(errors[name]); value = float(value)
        if se <= 0 or not math.isfinite(value): raise ValueError('系数无法识别或标准误无效')
        label = '(Intercept)' if name in ('Intercept','const','_cons') else 'DID effect' if name=='policy_effect' else plan['labels'].get(name, name)
        if name not in rhs and label != '(Intercept)': continue
        crit = float(t.ppf(.975, df))
        coefficients.append({'term':label,'estimate':value,'std_error':se,'p_value':float(2*t.sf(abs(value/se),df)), 'ci_low':value-crit*se,'ci_high':value+crit*se})
    # Full native result is a local artifact only; it may contain observations.
    (directory/'statspai-native.json').write_text(json.dumps(native, default=lambda x: x.tolist() if hasattr(x,'tolist') else str(x), ensure_ascii=False), encoding='utf-8')
    return {'summary':'StatsPAI Python 在本机实际计算；没有调用 Stata。网站未独立复算。', 'software_version':'StatsPAI '+versions['statspai'],
            'package_versions':versions,'python_version':platform.python_version(), 'n_used':len(used), 'used_indices':used,
            'coefficients':coefficients,'deleted_count':len(frame)-len(used),'omitted_terms':[],
            'inference':{'vcov':plan['vcov'],'cluster':plan['labels'].get(plan['cluster'],plan['cluster']),'df':df,'confidence':.95,'correction':correction},
            'validation_scope':'当前本机配置；不继承上游方法名称的 certified 标签'}


def bridge_compute(directory, session):
    import stata_code
    pinned_versions()
    try:
        result = stata_code.run((directory/'estimate.do').read_text(encoding='utf-8'), session_id=session,
                               working_dir=str(directory), timeout_ms=120000, include_full_log=True,
                               include_results='full', include_graphs='none')
        (directory/'stata-code-response.json').write_text(result.model_dump_json(indent=2), encoding='utf-8')
        if not result.ok: raise RuntimeError('stata-code: '+str(result.error))
    finally:
        stata_code.shutdown_default_pool()


if __name__ == '__main__':
    import sys
    directory = Path(sys.argv[1]).resolve()
    payload = json.loads((directory/'adapter-request.json').read_text(encoding='utf-8'))
    if payload['adapter'] == 'statspai_local':
        result = stats_compute(directory, payload['plan'])
        (directory/'adapter-result.json').write_text(json.dumps(result, ensure_ascii=False, allow_nan=False, indent=2), encoding='utf-8')
    elif payload['adapter'] == 'stata_code': bridge_compute(directory, payload['session'])
    else: raise ValueError('Adapter not allowed')
