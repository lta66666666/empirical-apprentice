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
    if plan['method'] not in ('ols', 'panel_fe', 'did', 'staggered_did', 'event_study', 'iv_2sls'): raise ValueError('方法未开放')
    if plan['vcov'] not in ('iid','hetero','cluster') or plan['missing'] not in ('block','drop'): raise ValueError('方差或缺失值处理参数无效')
    panel = plan['method'] in ('panel_fe','did','staggered_did','event_study')
    if panel and plan['vcov']!='cluster':raise ValueError('面板方法仅开放单向聚类')
    if plan['method']=='iv_2sls' and plan.get('unit') and plan['vcov']!='cluster':raise ValueError('带固定效应的工具变量需聚类')
    # Read strings first, exactly as the Stata template does. No patsy formulas
    # containing user-supplied names: all columns are locally generated aliases.
    frame = pd.read_csv(directory/'normalized.csv', dtype=str, keep_default_na=False)
    frame.index = np.arange(1, len(frame)+1)
    panel_cols = [plan.get('unit'), plan.get('time')] if panel or (plan['method']=='iv_2sls' and plan.get('unit')) else []
    selected = list(dict.fromkeys(v for v in [plan['outcome'], *plan['predictors'], *panel_cols,
        plan.get('treated') if plan['method'] in ('did','event_study') else '',
        plan.get('first_treat') if plan['method']=='staggered_did' else '',
        plan.get('endogenous') if plan['method']=='iv_2sls' else '',
        *(plan.get('instruments') or []),
        plan.get('cluster') if plan['vcov']=='cluster' else ''] if v))
    # 个体编号与聚类列可以是字符串（如 C00），只按组别使用，不强制转为数值。
    numeric = list(dict.fromkeys([plan['outcome'], *plan['predictors'], *([plan['time']] if panel_cols else []),
        *([plan['treated']] if plan['method'] in ('did','event_study') else []),
        *([plan['first_treat']] if plan['method']=='staggered_did' else []),
        *([plan['endogenous']] if plan['method']=='iv_2sls' else []),
        *(plan.get('instruments') or [])]))
    frame[selected] = frame[selected].replace({'': np.nan, 'NA': np.nan, 'N/A': np.nan, 'null': np.nan, 'NaN': np.nan})
    for name in numeric:
        frame[name] = pd.to_numeric(frame[name], errors='raise')
        if not np.isfinite(frame[name].dropna()).all(): raise ValueError('非有限输入')
    missing = frame[selected].isna().any(axis=1)
    if plan['missing'] == 'block' and missing.any(): raise ValueError('存在缺失值，需要先核对删除规则')
    data = frame.loc[~missing].copy()
    def finite(value):
        value = float(value)
        return round(value, 6) if math.isfinite(value) else None
    descriptives = []
    for name in numeric:
        series = data[name].dropna()
        if series.empty: continue
        quant = series.quantile([.25, .5, .75])
        descriptives.append({'variable': plan['labels'].get(name, name), 'n': int(series.count()),
            'mean': finite(series.mean()), 'sd': finite(series.std(ddof=1)) if len(series) > 1 else None,
            'min': finite(series.min()), 'p25': finite(quant.loc[.25]), 'median': finite(quant.loc[.5]),
            'p75': finite(quant.loc[.75]), 'max': finite(series.max()), 'missing': int(frame[name].isna().sum())})
    balance = []
    robustness = []
    if plan['method'] in ('did', 'event_study'):
        before = data[data[plan['time']] < plan['policy_year']]
        for name in [plan['outcome'], *plan['predictors']]:
            treated, control = before.loc[before[plan['treated']] == 1, name].dropna(), before.loc[before[plan['treated']] == 0, name].dropna()
            if treated.empty or control.empty: continue
            diff = float(treated.mean() - control.mean())
            var_t = float(treated.var(ddof=1)) if len(treated) > 1 else 0.0
            var_c = float(control.var(ddof=1)) if len(control) > 1 else 0.0
            denom = math.sqrt((var_t + var_c) / 2)
            balance.append({'variable': plan['labels'].get(name, name), 'treated_mean': finite(treated.mean()),
                'control_mean': finite(control.mean()), 'difference': finite(diff),
                'std_diff': finite(diff / denom) if denom > 0 else None,
                'n_treated': int(treated.count()), 'n_control': int(control.count())})
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
    if plan['method'] == 'staggered_did':
        if plan.get('absorbing_confirmed') is not True: raise ValueError('分批 DID 需先确认处理一旦开始不会撤销')
        if plan.get('control_group') not in ('nevertreated', 'notyettreated'): raise ValueError('对照组设置无效')
        cohort = plan['first_treat']
        if (data.groupby(plan['unit'])[cohort].nunique() != 1).any(): raise ValueError('首次处理年份随时期改变')
        first = data.groupby(plan['unit'])[cohort].first()
        if (first < 0).any() or not (first == np.floor(first)).all(): raise ValueError('首次处理年份须为非负整数，始终未处理记 0')
        cohorts = sorted(int(value) for value in first[first > 0].unique())
        if not cohorts: raise ValueError('没有识别到已开始处理的单位')
        if len(cohorts) < 2: raise ValueError('只识别到一个处理批次，请改用同批 DID')
        if cohorts[0] < data[plan['time']].min() or cohorts[-1] > data[plan['time']].max(): raise ValueError('首次处理年份超出样本时间范围')
        if plan['control_group'] == 'nevertreated' and not (first == 0).any(): raise ValueError('没有始终未处理的对照单位，请改用尚未处理对照')
        for group in cohorts:
            units = first[(first > 0) & (first.astype(int) == group)].index
            if data[(data[plan['unit']].isin(units)) & (data[plan['time']] == group - 1)].empty: raise ValueError(f'队列 {group} 缺少政策前一期（{group-1}）观测')
            if data[(data[plan['unit']].isin(units)) & (data[plan['time']] >= group)].empty: raise ValueError(f'队列 {group} 缺少政策后观测')
    if plan['method'] == 'event_study':
        result = event_study_compute(directory, plan, data, frame, versions, sp, np)
        result['descriptives'] = descriptives
        result['balance'] = balance
        return result
    if plan['method'] == 'staggered_did':
        result = staggered_compute(directory, plan, data, frame, versions, sp, np)
        result['descriptives'] = descriptives
        return result
    if plan['method'] == 'iv_2sls':
        result = iv_compute(directory, plan, data, frame, versions, sp, np)
        result['descriptives'] = descriptives
        result['balance'] = balance
        return result
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
    if plan['method'] == 'did':
        def variant_fit(d, cluster_name, label):
            try:
                formula_v = plan['outcome'] + ' ~ policy_effect' + ((' + ' + ' + '.join(plan['predictors'])) if plan['predictors'] else '') + ' | ' + plan['unit'] + ' + ' + plan['time']
                fit_v = sp.fast.feols(formula_v, data=d, vcov='cr1', cluster=cluster_name, ssc='fixest', drop_singletons=False)
                coef = float(fit_v.coef()['policy_effect']); se = float(fit_v.se()['policy_effect'])
                df_v = float(d[cluster_name].nunique() - 1)
                if df_v <= 0 or se <= 0 or not math.isfinite(coef): raise ValueError('推断自由度或标准误无效')
                crit = float(t.ppf(.975, df_v))
                return {'name': label, 'status': 'ok', 'estimate': coef, 'std_error': se,
                        'p_value': float(2*t.sf(abs(coef/se), df_v)), 'ci_low': coef-crit*se, 'ci_high': coef+crit*se,
                        'n_used': len(d), 'cluster': plan['labels'].get(cluster_name, cluster_name)}
            except Exception as error:
                return {'name': label, 'status': 'failed', 'note': str(error)[:160]}
        def did_data(d, year):
            d = d.copy()
            post = (d[plan['time']] >= year).astype(int)
            d['policy_effect'] = d[plan['treated']] * post
            if not d[plan['treated']].isin([0, 1]).all(): raise ValueError('组别无效')
            if (d.groupby(plan['unit'])[plan['treated']].nunique() != 1).any(): raise ValueError('组别随时期改变')
            if (post.groupby(d[plan['unit']]).nunique() != 2).any(): raise ValueError('个体缺少前期或后期')
            if any(not ((d[plan['treated']] == g) & (post == p)).any() for g in (0,1) for p in (0,1)): raise ValueError('四格样本不完整')
            return d
        base = next((c for c in coefficients if c['term'] == 'DID effect'), None)
        if base: robustness.append({'name': '基准（当前方案）', 'status': 'ok', 'estimate': base['estimate'],
            'std_error': base['std_error'], 'p_value': base['p_value'], 'ci_low': base['ci_low'], 'ci_high': base['ci_high'],
            'n_used': len(used), 'cluster': plan['labels'].get(plan['cluster'], plan['cluster'])})
        try:
            robustness.append(variant_fit(did_data(data, plan['policy_year'] - 1), plan['cluster'], '安慰剂：政策提前 1 年'))
        except Exception as error:
            robustness.append({'name': '安慰剂：政策提前 1 年', 'status': 'failed', 'note': str(error)[:160]})
        robustness.append(variant_fit(data, plan['unit'], '聚类：按个体编号'))
        try:
            d = data.copy(); lo, hi = d[plan['outcome']].quantile([.01, .99]); d[plan['outcome']] = d[plan['outcome']].clip(lo, hi)
            robustness.append(variant_fit(d, plan['cluster'], '缩尾：结果变量 1%/99%'))
        except Exception as error:
            robustness.append({'name': '缩尾：结果变量 1%/99%', 'status': 'failed', 'note': str(error)[:160]})
        try:
            d = data[data[plan['time']] < data[plan['time']].max()].copy()
            robustness.append(variant_fit(did_data(d, plan['policy_year']), plan['cluster'], '剔除最后一年'))
        except Exception as error:
            robustness.append({'name': '剔除最后一年', 'status': 'failed', 'note': str(error)[:160]})
    # Full native result is a local artifact only; it may contain observations.
    (directory/'statspai-native.json').write_text(json.dumps(native, default=lambda x: x.tolist() if hasattr(x,'tolist') else str(x), ensure_ascii=False), encoding='utf-8')
    result = {'summary':'StatsPAI 云端计算；对应 Stata 代码仅供教学。', 'software_version':'StatsPAI '+versions['statspai'],
            'package_versions':versions,'python_version':platform.python_version(), 'n_used':len(used), 'used_indices':used,
            'coefficients':coefficients,'deleted_count':len(frame)-len(used),'omitted_terms':None,'omitted_status':'未分项记录；奇异或不可识别模型停止计算',
            'covariance':{'terms':[str(n) for n in covariance.index],'matrix':covariance.to_numpy().tolist()},'model_dimensions':dimensions,
            'inference':{'vcov':plan['vcov'],'cluster':plan['labels'].get(plan['cluster'],plan['cluster']),'df':df,'confidence':.95,'correction':correction},
            'validation_scope':'当前受控配置；数值对照、来源和识别条件分别核验'}
    result['descriptives'] = descriptives
    result['balance'] = balance
    result['robustness'] = robustness
    return result

def staggered_compute(directory, plan, data, frame, versions, sp, np):
    import re
    from scipy.stats import t
    unit, time, cohort, cluster = plan['unit'], plan['time'], plan['first_treat'], plan['cluster']
    control_group = plan['control_group']
    def finite(value):
        value = float(value)
        if not math.isfinite(value): raise ValueError('估计或推断数值无效')
        return value
    def row_of(result):
        tidy = result.tidy()
        main = tidy[tidy['type'] == 'main']
        if not len(main): raise ValueError('原生结果未返回 ATT')
        row = main.iloc[0]
        return {'estimate': finite(row['estimate']), 'std_error': finite(row['std_error']),
                'p_value': finite(row['p_value']), 'ci_low': finite(row['conf_low']), 'ci_high': finite(row['conf_high'])}
    clusters = int(data[cluster].nunique())
    df = float(clusters - 1)
    if df <= 0: raise ValueError('推断自由度不足')
    # TWFE 基准：与分批估计同一样本，用于展示负权重风险下的差异。
    d = data.copy()
    d['ea_treat'] = ((d[cohort] > 0) & (d[time] >= d[cohort])).astype(int)
    controls = ' + '.join(plan['predictors'])
    formula = plan['outcome'] + ' ~ ea_treat' + ((' + ' + controls) if controls else '') + ' | ' + unit + ' + ' + time
    fit = sp.fast.feols(formula, data=d, vcov='cr1', cluster=cluster, ssc='fixest', drop_singletons=False)
    if fit.n_kept != len(d) or fit.n_dropped_singletons: raise ValueError('原生结果未提供足够的实际样本证据')
    twfe = {'estimate': finite(fit.coef()['ea_treat']), 'std_error': finite(fit.se()['ea_treat'])}
    crit = float(t.ppf(.975, df))
    twfe.update({'p_value': finite(2*t.sf(abs(twfe['estimate']/twfe['std_error']), df)),
                 'ci_low': twfe['estimate']-crit*twfe['std_error'], 'ci_high': twfe['estimate']+crit*twfe['std_error'],
                 'n_used': len(d)})
    # 主结果：Callaway–Sant'Anna 队列 ATT，基期统一为政策前一期。
    result = sp.did(data, y=plan['outcome'], treat=cohort, time=time, id=unit,
                    covariates=list(plan['predictors']) or None, method='cs', control_group=control_group,
                    base_period='universal', cluster=cluster, alpha=.05)
    if result.nobs is not None and int(result.nobs) != len(data): raise ValueError('原生结果未提供足够的实际样本证据')
    n_used = int(result.nobs) if result.nobs is not None else len(data)
    att = row_of(result)
    tidy = result.tidy()
    coefficients, periods = [], []
    for _, row in tidy.iterrows():
        if str(row.get('type')) != 'event_study': continue
        match = re.fullmatch(r'event_([+-]?\d+)', str(row['term']))
        if not match: continue
        period = int(match.group(1))
        if not -5 <= period <= 5: continue
        periods.append(period)
        coefficients.append({'term': f'事件期 {period:+d}' if period else '事件期 0',
            'estimate': finite(row['estimate']), 'std_error': finite(row['std_error']),
            'p_value': finite(row['p_value']), 'ci_low': finite(row['conf_low']), 'ci_high': finite(row['conf_high'])})
    if len(coefficients) > 14:
        keep = sorted(sorted(range(len(coefficients)), key=lambda i: (abs(periods[i]), periods[i]))[:14])
        coefficients = [coefficients[i] for i in keep]
        periods = [periods[i] for i in keep]
    group_time = []
    for _, row in tidy.iterrows():
        if str(row.get('type')) != 'group_time': continue
        match = re.fullmatch(r'att\(g=([-0-9.eE+]+),t=([-0-9.eE+]+)\)', str(row['term']))
        if not match: continue
        group, period = float(match.group(1)), float(match.group(2))
        group_time.append({'cohort': int(group) if group == int(group) else group, 'time': int(period) if period == int(period) else period,
            'relative_time': int(period-group) if (period-group) == int(period-group) else period-group,
            'estimate': finite(row['estimate']), 'std_error': finite(row['std_error']),
            'p_value': finite(row['p_value']), 'ci_low': finite(row['conf_low']), 'ci_high': finite(row['conf_high'])})
    try:
        pretrend = result.pretrend_test()
        pretrend = {'statistic': finite(pretrend.get('statistic')), 'p_value': finite(pretrend.get('pvalue')), 'df': pretrend.get('df')}
    except Exception:
        pretrend = None
    comparison = [{'name': 'TWFE（双向固定效应）', 'status': 'ok', **twfe},
                  {'name': 'Callaway–Sant\'Anna（主结果）', 'status': 'ok', 'n_used': n_used, **att}]
    def variant(label, runner):
        try:
            main = row_of(runner())
            comparison.append({'name': label, 'status': 'ok', 'n_used': n_used, **main})
        except Exception as error:
            comparison.append({'name': label, 'status': 'failed', 'note': str(error)[:160]})
    if control_group == 'notyettreated':
        comparison.append({'name': 'Sun–Abraham（2021）', 'status': 'failed',
                           'note': 'Sun–Abraham 仅支持始终未处理或最后处理队列作对照；本方案以 CS 与 BJS 对比为主'})
    else:
        variant('Sun–Abraham（2021）', lambda: sp.sun_abraham(data, y=plan['outcome'], g=cohort, t=time, i=unit,
                                                             control_group=control_group, cluster=cluster))
    variant('Borusyak–Jaravel–Spiess（2024）', lambda: sp.did_imputation(data, y=plan['outcome'], group=unit, time=time,
                                                                        first_treat=cohort, controls=list(plan['predictors']) or None, cluster=cluster))
    weights = {'status': 'unavailable'}
    try:
        decomposition = sp.twfe_decomposition(data, y=plan['outcome'], group=unit, time=time, first_treat=cohort)
        info = decomposition.model_info
        weights = {'status': 'ok', 'bacon_components': int(info.get('n_comparisons', 0)),
                   'negative_bacon': int(info.get('n_negative_weights_bacon', 0)),
                   'negative_dcdh': int(info.get('n_negative_weights_dcdh', 0)),
                   'sum_negative_dcdh': finite(info.get('sum_negative_weights_dcdh', 0))}
    except Exception as error:
        weights = {'status': 'unavailable', 'reason': str(error)[:160]}
    warnings = ['分批 DID 的 ATT 是各队列与相对时期的加权平均；平行趋势需按队列分别成立，不能只看总体均值。',
                '处理一旦开始不可撤销由用户确认，数据未自动验证。']
    if control_group == 'notyettreated': warnings.append('对照组使用尚未处理的单位；需核实这些单位在本队列比较期内未提前受政策影响。')
    if weights.get('status') == 'ok':
        if weights['negative_dcdh'] > 0: warnings.append(f"TWFE 对 {weights['negative_dcdh']} 个单元×时期取了负权重（合计 {weights['sum_negative_dcdh']:.2f}）；TWFE 与队列估计不一致时不要用 TWFE 作主结果。")
        if weights['negative_bacon'] > 0: warnings.append('Goodman–Bacon 分解中存在负权重比较（已处理组被当作对照）；TWFE 系数不能直接解释为处理效应。')
    used = [int(index) for index in data.index]
    native = result.to_dict()
    (directory/'statspai-native.json').write_text(json.dumps(native, default=lambda x: x.tolist() if hasattr(x, 'tolist') else str(x), ensure_ascii=False), encoding='utf-8')
    return {'summary': '分批 DID：队列 ATT、事件研究与 TWFE 对比；对应 Stata 代码仅供教学。',
            'software_version': 'StatsPAI ' + versions['statspai'], 'package_versions': versions,
            'python_version': platform.python_version(), 'n_used': len(used), 'used_indices': used,
            'coefficients': [{'term': '分批 DID ATT（Callaway–Sant\'Anna）', **att}, *coefficients], 'att': att,
            'event_study': {'window': [min(periods), max(periods)] if periods else [-1, 1], 'reference_period': -1,
                            'pretrend': pretrend, 'periods': periods, 'control_group': control_group},
            'group_time': group_time, 'twfe': twfe, 'twfe_weights': weights, 'warnings': warnings,
            'robustness': comparison, 'deleted_count': len(frame) - len(used), 'omitted_terms': None,
            'omitted_status': '不可识别的队列×时期单元由原生估计丢弃',
            'inference': {'vcov': plan['vcov'], 'cluster': plan['labels'].get(cluster, cluster), 'df': df, 'confidence': .95,
                          'correction': 'Callaway–Sant’Anna 队列估计与 TWFE 均按单元聚类；t(G-1) 推断'},
            'validation_scope': '当前受控配置；预趋势检验与负权重提示只是识别证据，不自动证明平行趋势'}


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


def _num(value):
    value = float(value)
    return value if math.isfinite(value) else None


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
        if not all(math.isfinite(float(row[k])) for k in ('estimate', 'std_error', 'p_value', 'conf_low', 'conf_high')):
            raise ValueError('工具变量系数或推断数值无效')
        coefficients.append({'term': label, 'estimate': float(row['estimate']), 'std_error': float(row['std_error']),
                             'p_value': float(row['p_value']), 'ci_low': float(row['conf_low']), 'ci_high': float(row['conf_high'])})
    diagnostics = {}
    try:
        bundle = sp.iv_diag(data, y=plan['outcome'], endog=endog, instruments=instruments, exog=exog or None,
                            absorb=absorb, cluster=plan['cluster'] if plan['vcov'] == 'cluster' else None, n_boot=200)
        diagnostics = {'first_stage_f': _num(bundle.first_stage_F) if bundle.first_stage_F is not None else None,
                       'effective_f': _num(bundle.effective_F) if bundle.effective_F is not None else None,
                       'kp_rk_lm': _num(bundle.kp_rk_lm) if bundle.kp_rk_lm is not None else None,
                       'kp_rk_lm_p': _num(bundle.kp_rk_lm_pvalue) if bundle.kp_rk_lm_pvalue is not None else None,
                       'kp_rk_f': _num(bundle.kp_rk_f) if bundle.kp_rk_f is not None else None,
                       'ar_stat': _num(bundle.ar_stat) if bundle.ar_stat is not None else None,
                       'ar_p': _num(bundle.ar_pvalue) if bundle.ar_pvalue is not None else None,
                       'ar_ci': [_num(x) for x in bundle.ar_ci] if bundle.ar_ci is not None else None,
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
