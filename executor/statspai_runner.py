"""Controlled StatsPAI cloud entry. Inputs are validated aliases, never executable user code."""
import csv
import importlib.metadata
import json
import math
import platform
import sys
from pathlib import Path

PIN_VERSION='1.39.5'
PIN_COMMIT='9f12d999d23a5bc2f2fa5fca38fe498aeea38752'

def pinned_versions():
    distribution=importlib.metadata.distribution('statspai')
    direct=json.loads(distribution.read_text('direct_url.json') or '{}')
    if distribution.version!=PIN_VERSION or PIN_COMMIT not in direct.get('url',''):
        raise ValueError('Audited StatsPAI source is not installed')
    return {name:importlib.metadata.version(name) for name in ('statspai','numpy','pandas','scipy','statsmodels','numba')}

def stats_compute(directory, plan):
    import numpy as np
    import pandas as pd
    import statspai as sp
    from scipy.stats import t
    versions = pinned_versions()
    if platform.python_version_tuple()[:2] != ('3', '11'): raise ValueError('需要 Python 3.11')
    if plan['method'] not in ('ols', 'panel_fe', 'did'): raise ValueError('方法未开放')
    if plan['vcov'] not in ('iid','hetero','cluster') or plan['missing'] not in ('block','drop'): raise ValueError('方差或缺失值处理参数无效')
    if plan['method']!='ols' and plan['vcov']!='cluster':raise ValueError('面板方法仅开放单向聚类')
    # Read strings first, exactly as the Stata template does. No patsy formulas
    # containing user-supplied names: all columns are locally generated aliases.
    frame = pd.read_csv(directory/'normalized.csv', dtype=str, keep_default_na=False)
    frame.index = np.arange(1, len(frame)+1)
    selected = list(dict.fromkeys(v for v in [plan['outcome'], *plan['predictors'], plan.get('unit') if plan['method']!='ols' else '', plan.get('time') if plan['method']!='ols' else '', plan.get('treated') if plan['method']=='did' else '', plan.get('cluster') if plan['vcov']=='cluster' else ''] if v))
    numeric = list(dict.fromkeys([plan['outcome'], *plan['predictors']] + ([plan['time']] if plan['method'] != 'ols' else []) + ([plan['treated']] if plan['method'] == 'did' else [])))
    frame[selected] = frame[selected].replace({'': np.nan, 'NA': np.nan, 'N/A': np.nan, 'null': np.nan, 'NaN': np.nan})
    for name in numeric:
        frame[name] = pd.to_numeric(frame[name], errors='raise')
        if not np.isfinite(frame[name].dropna()).all(): raise ValueError('非有限输入')
    missing = frame[selected].isna().any(axis=1)
    if plan['missing'] == 'block' and missing.any(): raise ValueError('存在缺失值，需要先核对删除规则')
    data = frame.loc[~missing].copy()
    minimum=max(8,len(plan['predictors'])+(1 if plan['method']=='did' else 0)+2)
    if len(data)<minimum:raise ValueError('完整样本不足，需要至少'+str(minimum)+'行')
    if plan['method'] != 'ols':
        if data.duplicated([plan['unit'], plan['time']]).any(): raise ValueError('个体年份重复')
        if not (data[plan['time']] == np.floor(data[plan['time']])).all(): raise ValueError('年份必须为整数')
    if plan['vcov']=='cluster' and data[plan['cluster']].nunique()<2:raise ValueError('至少需要两个聚类组')
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
        covariance=fit.vcov()
        dimensions={'parameters':len(params),'residual_df':float(fit.data_info['df_resid'])}
        df = float(fit.data_info.get('df_inference', fit.data_info['df_resid']))
        used = [int(x) for x in fit.data_info['sample_index']]
        correction = 'StatsPAI regress; explicit HC1 or one-way cluster; t inference'
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
        covariance=fit.vcov()
        dimensions={'parameters':len(params),'residual_df':int(fit.df_resid),'fe_cardinality':list(fit.fe_cardinality),'ssc':fit.ssc,'drop_singletons':False}
        df = float(data[plan['cluster']].nunique()-1) if plan['vcov']=='cluster' else float(fit.df_resid)
        used = [int(x) for x in data.index]
        correction = 'StatsPAI native feols ssc=fixest; cluster t(G-1), otherwise t(df_resid)'
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
    return {'summary':'StatsPAI 云端计算；对应 Stata 代码仅供教学。', 'software_version':'StatsPAI '+versions['statspai'],
            'package_versions':versions,'python_version':platform.python_version(), 'n_used':len(used), 'used_indices':used,
            'coefficients':coefficients,'deleted_count':len(frame)-len(used),'omitted_terms':None,'omitted_status':'未分项记录；奇异或不可识别模型停止计算',
            'covariance':{'terms':[str(n) for n in covariance.index],'matrix':covariance.to_numpy().tolist()},'model_dimensions':dimensions,
            'inference':{'vcov':plan['vcov'],'cluster':plan['labels'].get(plan['cluster'],plan['cluster']),'df':df,'confidence':.95,'correction':correction},
            'validation_scope':'当前受控配置；数值对照、来源和识别条件分别核验'}

if __name__=='__main__':
    directory=Path(sys.argv[1]).resolve()
    plan=json.loads((directory/'parameters.json').read_text(encoding='utf-8'))
    result=stats_compute(directory,plan)
    result.update(status='succeeded',software='python',engine_id='statspai_cloud',execution_location='cloud_native')
    (directory/'result.json').write_text(json.dumps(result,ensure_ascii=False,allow_nan=False),encoding='utf-8')
