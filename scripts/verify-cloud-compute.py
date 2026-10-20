"""Real numerical regression for the initial cloud release, not a deployment acceptance."""
import asyncio,csv,io,json,tempfile,time
from pathlib import Path
import numpy as np
import pandas as pd
import statsmodels.api as sm
from scipy.stats import t
from executor.engines import execute

root=Path(__file__).resolve().parents[1]
fixtures=json.loads((root/'outputs/cloud-fixtures.json').read_text(encoding='utf-8'))
report={'scope':'local Python 3.11; JoyCode and Linux container not accepted','checks':[],'results':{}}

def prepare(f):
    rows=list(csv.reader(io.StringIO(f['text'])));aliases={h:'v'+str(i) for i,h in enumerate(rows[0])}
    p={'unit':'','time':'','treated':'','cluster':'','missing':'block',**f['plan']}
    p['predictors']=[aliases[n] for n in p['predictors']]
    for k in ('outcome','unit','time','treated','cluster'):p[k]=aliases.get(p.get(k),'')
    p['labels']={v:k for k,v in aliases.items()}
    out=io.StringIO();w=csv.writer(out,lineterminator='\n');w.writerow(aliases.values());w.writerows(rows[1:])
    return p,out.getvalue()

async def run(p,text):
    with tempfile.TemporaryDirectory(dir=root/'outputs') as folder:
        directory=Path(folder);(directory/'normalized.csv').write_text(text,encoding='utf-8')
        (directory/'parameters.json').write_text(json.dumps(p),encoding='utf-8')
        start=time.monotonic()
        result,artifacts=await execute({'engine_id':'statspai_cloud','software':'python','plan':p},directory)
        assert result['software']=='python' and result['engine_id']=='statspai_cloud'
        manifest=json.loads(artifacts['stata-corresponding.json']);assert manifest['executed'] is False
        assert manifest['core_command'] in artifacts['stata-corresponding.do']
        assert all(k not in artifacts['session-info.txt'] for k in ('MODEL_API_KEY','EXECUTOR_SECRET'))
        return result,time.monotonic()-start

async def main():
    for method in fixtures:
        p,text=prepare(fixtures[method]);result,elapsed=await run(p,text)
        data=pd.read_csv(io.StringIO(text));rhs=p['predictors'].copy()
        if method=='did':
            data['policy_effect']=data[p['treated']]*(data[p['time']]>=p['policy_year']);rhs=['policy_effect']+rhs
        X=data[rhs].astype(float)
        if method!='ols':
            X=pd.concat([X,pd.get_dummies(data[p['unit']],drop_first=True,dtype=float),pd.get_dummies(data[p['time']],drop_first=True,dtype=float)],axis=1)
        fit=sm.OLS(data[p['outcome']],sm.add_constant(X)).fit(cov_type='HC1' if method=='ols' else 'nonrobust')
        # Full dummy OLS independently checks the absorbed model coefficients.
        for alias in rhs:
            label='DID effect' if alias=='policy_effect' else p['labels'][alias]
            c=next(c for c in result['coefficients'] if c['term']==label)
            assert np.isclose(c['estimate'],fit.params[alias],atol=1e-8,rtol=1e-6),(method,c,fit.params[alias])
            df=result['inference']['df']
            assert np.isclose(c['p_value'],2*t.sf(abs(c['estimate']/c['std_error']),df),atol=1e-12)
            if method=='ols':assert np.isclose(c['std_error'],fit.bse[alias],atol=1e-8,rtol=1e-6)
        if method!='ols':assert result['inference']['df']==data[p['cluster']].nunique()-1
        assert result['n_used']==len(data) and len(set(result['used_indices']))==len(data)
        report['results'][method]={'seconds':elapsed,'result':result}
        report['checks'].append(method+': real execution, coefficient reference, inference formula, sample and teaching artifact')
    p,text=prepare(fixtures['ols']);baseline,_=await run(p,text)
    p.update(unit='v99',time='v98',treated='v97',cluster='v96')
    residual,_=await run(p,text)
    assert residual['coefficients']==baseline['coefficients'] and residual['used_indices']==baseline['used_indices']
    report['checks'].append('irrelevant OLS panel/DID/cluster roles do not change sample')
    for invalid in ('text', 'nan', 'inf'):
        p,text=prepare(fixtures['ols']);rows=text.splitlines();items=rows[1].split(',');items[0]=invalid;rows[1]=','.join(items)
        try:await run(p,'\n'.join(rows)+'\n')
        except ValueError:pass
        else:raise AssertionError('Invalid numeric input accepted: '+invalid)
    report['checks'].append('non-numeric/non-finite input rejected')
    (root/'outputs/cloud-compute-acceptance.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps({'checks':report['checks'],'seconds':{k:v['seconds'] for k,v in report['results'].items()}},ensure_ascii=False))

asyncio.run(main())
