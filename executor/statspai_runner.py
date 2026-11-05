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
    if plan['method'] not in ('ols', 'panel_fe', 'did', 'event_study', 'iv_2sls'): raise ValueError('方法未开放')
    if plan['vcov'] not in ('iid','hetero','cluster') or plan['missing'] not in ('block','drop'): raise ValueError('方差或缺失值处理参数无效')
    panel = plan['method'] in ('panel_fe','did','event_study')
    if panel and plan['vcov']!='cluster':raise ValueError('面板方法仅开放单向聚类')
    if plan['method']=='iv_2sls' and plan.get('unit') and plan['vcov']!='cluster':raise ValueError('带固定效应的工具变量需聚类')
    # Read strings first, exactly as the Stata template does. No patsy formulas
    # containing user-supplied names: all columns are locally generated aliases.
    frame = pd.read_csv(directory/'normalized.csv', dtype=str, keep_default_na=False)
    frame.index = np.arange(1, len(frame)+1)
    panel_cols = [plan.get('unit'), plan.get('time')] if panel or (plan['method']=='iv_2sls' and plan.get('unit')) else []
    selected = list(dict.fromkeys(v for v in [plan['outcome'], *plan['predictors'], *panel_cols,
        plan.get('treated') if plan['method'] in ('did','event_study') else '',
        plan.get('endogenous') if plan['method']=='iv_2sls' else '',
        *(plan.get('instruments') or []),
        plan.get('cluster') if plan['vcov']=='cluster' else ''] if v))
    numeric = list(dict.fromkeys([plan['outcome'], *plan['predictors'], *panel_cols,
        *([plan['treated']] if plan['method'] in ('did','event_study') else []),
        *([plan['endogenous']] if plan['method']=='iv_2sls' else []),
        *(plan.get('instruments') or [])]))
    frame[selected] = frame[selected].replace({'': np.nan, 'NA': np.nan, 'N/A': np.nan, 'null': np.nan, 'NaN': np.nan})
    for name in numeric:
        frame[name] = pd.to_numeric(frame[name], errors='raise')
        if not np.isfinite(frame[name].dropna()).all(): raise ValueError('非有限输入')
    missing = frame[selected].isna().any(axis=1)
    if plan['missing'] == 'block' and missing.any(): raise ValueError('存在缺失值，需要先核对删除规则')
    data = frame.loc[~missing].copy()
    minimum=max(8,len(plan['predictors'])+(1 if plan['method']=='did' else 0)+len(plan.get('instruments') or [])+2)
    if len(data)<minimum:raise ValueError('完整样本不足，需要至少'+str(minimum)+'行')
    if panel or (plan['method']=='iv_2sls' and plan.get('unit')):
        if data.duplicated([plan['unit'], plan['time']]).any(): raise ValueError('个体年份重复')
        if not (data[plan['time']] == np.floor(data[plan['time']])).all(): raise ValueError('年份必须为整数')
        if plan['method']=='iv_2sls':
            unit_years = data.groupby(plan['unit'])[plan['time']].nunique()
            year_units = data.groupby(plan['time'])[plan['unit']].nunique()
            if (unit_years < 2).any() or (year_units < 2).any(): raise ValueError('固定效应会吸收单例观测，请调整样本')
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
    if plan['method'] == 'event_study':
        return event_study_compute(directory, plan, data, frame, versions, sp, np)
    if plan['method'] == 'iv_2sls':
        return iv_compute(directory, plan, data, frame, versions, sp, np)
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

def event_study_compute(directory, plan, data, frame, versions, sp, np):
    import re
    if plan.get('same_batch') is not True: raise ValueError('事件研究仅支持同批实施')
    if not data[plan['treated']].isin([0, 1]).all(): raise ValueError('事件研究组别须为 0/1')
    if (data.groupby(plan['unit'])[plan['treated']].nunique() != 1).any(): raise ValueError('组别随时期改变')
    pre, post = plan['window']; reference = plan['reference_period']
    data['ea_treat_time'] = np.where(data[plan['treated']] == 1, plan['policy_year'], np.nan)
    data['ea_event'] = data[plan['time']] - plan['policy_year']
    for period in range(-pre, post + 1):
        if period == reference: continue
        if not ((data[plan['treated']] == 1) & (data['ea_event'] == period)).any(): raise ValueError(f'事件期 {period} 没有处理组观测，请缩小窗口')
    if not ((data[plan['treated']] == 1) & (data['ea_event'] == reference)).any(): raise ValueError('处理组缺少基期观测')
    event = sp.event_study(data, y=plan['outcome'], treat_time='ea_treat_time', time=plan['time'], unit=plan['unit'],
                           window=(-pre, post), ref_period=reference, covariates=list(plan['predictors']) or None,
                           cluster=plan['cluster'], alpha=.05)
    if int(event.nobs) != len(data): raise ValueError('原生结果未提供足够的实际样本证据')
    tidy = event.tidy()
    coefficients = []
    for _, row in tidy.iterrows():
        term = str(row['term'])
        if str(row.get('type')) != 'event_study': continue
        match = re.fullmatch(r'event_([+-]?\d+)', term)
        if not match: continue
        period = int(match.group(1))
        if period == reference: continue
        coefficients.append({'term': f'事件期 {period:+d}' if period else '事件期 0',
            'estimate': float(row['estimate']), 'std_error': float(row['std_error']),
            'p_value': float(row['p_value']), 'ci_low': float(row['conf_low']), 'ci_high': float(row['conf_high'])})
    main = tidy[tidy['type'] == 'main']
    if not len(main): raise ValueError('事件研究未返回 ATT')
    att_row = main.iloc[0]
    att = {'estimate': float(att_row['estimate']), 'std_error': float(att_row['std_error']),
           'p_value': float(att_row['p_value']), 'ci_low': float(att_row['conf_low']), 'ci_high': float(att_row['conf_high'])}
    pretrend = event.pretrend_test()
    used = [int(index) for index in data.index]
    native = event.to_dict()
    (directory/'statspai-native.json').write_text(json.dumps(native, default=lambda x: x.tolist() if hasattr(x, 'tolist') else str(x), ensure_ascii=False), encoding='utf-8')
    clusters = int(data[plan['cluster']].nunique()) if plan['vcov'] == 'cluster' else None
    df = float(clusters - 1) if clusters else float(max(1, int(event.nobs) - len(coefficients) - 1))
    return {'summary': '事件研究：相对基期的动态系数与 ATT；对应 Stata 代码仅供教学。', 'software_version': 'StatsPAI ' + versions['statspai'],
            'package_versions': versions, 'python_version': platform.python_version(), 'n_used': len(used), 'used_indices': used,
            'coefficients': coefficients, 'att': att,
            'event_study': {'window': [-pre, post], 'reference_period': reference,
                            'pretrend': {'statistic': float(pretrend.get('statistic')), 'p_value': float(pretrend.get('pvalue')), 'df': pretrend.get('df')},
                            'periods': [int(re.search(r'[+-]?\d+', str(row['term'])).group()) for _, row in tidy.iterrows() if str(row.get('type')) == 'event_study']},
            'deleted_count': len(frame) - len(used), 'omitted_terms': None, 'omitted_status': '基期不进入表中，其他不可识别期次停止计算',
            'inference': {'vcov': plan['vcov'], 'cluster': plan['labels'].get(plan['cluster'], plan['cluster']), 'df': df, 'confidence': .95,
                          'correction': 'StatsPAI OLS event study with entity and time fixed effects; cluster-robust inference'},
            'validation_scope': '当前受控配置；预趋势检验只是识别证据，不自动证明平行趋势'}


def iv_compute(directory, plan, data, frame, versions, sp, np):
    endog = plan['endogenous']; instruments = list(plan['instruments']); exog = list(plan['predictors'])
    absorb = [plan['unit'], plan['time']] if plan.get('unit') else None
    formula = plan['outcome'] + ' ~ (' + endog + ' ~ ' + ' + '.join(instruments) + ')' + (' + ' + ' + '.join(exog) if exog else '')
    kwargs = {}
    if absorb: kwargs['absorb'] = absorb
    if plan['vcov'] == 'cluster': kwargs['cluster'] = plan['cluster']
    elif plan['vcov'] == 'hetero': kwargs['robust'] = 'HC1'
    fit = sp.iv(formula, data=data, method='2sls', **kwargs)
    if int(fit.nobs) != len(data): raise ValueError('原生结果未提供足够的实际样本证据')
    tidy = fit.tidy()
    coefficients = []
    for _, row in tidy.iterrows():
        name = str(row['term'])
        if name in ('Intercept', 'const', '_cons'): label = '(Intercept)'
        elif name == endog or name in exog: label = plan['labels'].get(name, name)
        else: continue
        coefficients.append({'term': label, 'estimate': float(row['estimate']), 'std_error': float(row['std_error']),
                             'p_value': float(row['p_value']), 'ci_low': float(row['conf_low']), 'ci_high': float(row['conf_high'])})
    diagnostics = {}
    try:
        bundle = sp.iv_diag(data, y=plan['outcome'], endog=endog, instruments=instruments, exog=exog or None,
                            absorb=absorb, cluster=plan['cluster'] if plan['vcov'] == 'cluster' else None, n_boot=200)
        diagnostics = {'first_stage_f': float(bundle.first_stage_F) if bundle.first_stage_F is not None else None,
                       'effective_f': float(bundle.effective_F) if bundle.effective_F is not None else None,
                       'kp_rk_lm': float(bundle.kp_rk_lm) if bundle.kp_rk_lm is not None else None,
                       'kp_rk_lm_p': float(bundle.kp_rk_lm_pvalue) if bundle.kp_rk_lm_pvalue is not None else None,
                       'kp_rk_f': float(bundle.kp_rk_f) if bundle.kp_rk_f is not None else None,
                       'ar_stat': float(bundle.ar_stat) if bundle.ar_stat is not None else None,
                       'ar_p': float(bundle.ar_pvalue) if bundle.ar_pvalue is not None else None,
                       'ar_ci': [float(x) for x in bundle.ar_ci] if bundle.ar_ci is not None else None,
                       'n_instruments': int(bundle.n_instruments), 'n_endog': int(bundle.n_endog)}
    except Exception as error:
        diagnostics = {'status': 'unavailable', 'reason': str(error)[:200]}
    warnings = ['2SLS 系数是工具变量识别下的局部平均效应（LATE）；外生性不能由数据自动检验。']
    effective = diagnostics.get('effective_f')
    if effective is not None and effective < 10: warnings.append('第一阶段有效 F 小于 10，工具变量可能偏弱；不要据此作强因果解释。')
    if len(instruments) > 1: warnings.append('工具数多于内生变量时，仍需逐项论证每个工具的排除限制。')
    used = [int(index) for index in data.index]
    native = fit.to_dict()
    (directory/'statspai-native.json').write_text(json.dumps(native, default=lambda x: x.tolist() if hasattr(x, 'tolist') else str(x), ensure_ascii=False), encoding='utf-8')
    clusters = int(data[plan['cluster']].nunique()) if plan['vcov'] == 'cluster' else None
    df = float(clusters - 1) if clusters else float(fit.data_info.get('df_resid', max(1, len(used) - len(coefficients))))
    return {'summary': '工具变量 2SLS；工具外生性需由研究设计论证。', 'software_version': 'StatsPAI ' + versions['statspai'],
            'package_versions': versions, 'python_version': platform.python_version(), 'n_used': len(used), 'used_indices': used,
            'coefficients': coefficients, 'iv_diagnostics': diagnostics, 'warnings': warnings,
            'deleted_count': len(frame) - len(used), 'omitted_terms': None, 'omitted_status': '奇异或不可识别模型停止计算',
            'inference': {'vcov': plan['vcov'], 'cluster': plan['labels'].get(plan['cluster'], plan['cluster']), 'df': df, 'confidence': .95,
                          'correction': 'StatsPAI iv 2SLS; cluster-robust inference when selected'},
            'validation_scope': '当前受控配置；工具相关性可检验，排除限制不可由数据自动检验'}


if __name__=='__main__':
    directory=Path(sys.argv[1]).resolve()
    plan=json.loads((directory/'parameters.json').read_text(encoding='utf-8'))
    result=stats_compute(directory,plan)
    result.update(status='succeeded',software='python',engine_id='statspai_cloud',execution_location='cloud_native')
    (directory/'result.json').write_text(json.dumps(result,ensure_ascii=False,allow_nan=False),encoding='utf-8')
