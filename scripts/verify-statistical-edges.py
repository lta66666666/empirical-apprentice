import io,csv,json,sys,tempfile
from pathlib import Path
root=Path(__file__).resolve().parents[1];sys.path.insert(0,str(root))
import numpy as np,pandas as pd,statsmodels.api as sm
from scipy.stats import t
from executor.statspai_runner import stats_compute
fixtures=json.loads((root/'outputs/cloud-fixtures.json').read_text(encoding='utf-8'));checks=[]
def prepare(method):
 f=fixtures[method];data=pd.read_csv(io.StringIO(f['text']));mapping={name:'v'+str(i) for i,name in enumerate(data.columns)};p={'unit':'','time':'','treated':'','cluster':'','missing':'block',**f['plan']};p['predictors']=[mapping[n] for n in p['predictors']]
 for key in ['outcome','unit','time','treated','cluster']:p[key]=mapping.get(p.get(key),'')
 p['labels']={alias:name for name,alias in mapping.items()};data.columns=list(mapping.values());return data,p
def run(data,plan):
 with tempfile.TemporaryDirectory(dir=root/'outputs') as folder:
  directory=Path(folder);data.to_csv(directory/'normalized.csv',index=False);return stats_compute(directory,plan)
for vcov in ['iid','hetero','cluster']:
 data,p=prepare('ols');p['vcov']=vcov
 if vcov=='cluster':data['v3']=['g'+str(i//16) for i in range(len(data))];p['cluster']='v3';p['labels']['v3']='cluster'
 result=run(data,p);x=sm.add_constant(data[p['predictors']]);model=sm.OLS(data[p['outcome']],x)
 reference=model.fit() if vcov=='iid' else model.fit(cov_type='HC1') if vcov=='hetero' else model.fit(cov_type='cluster',cov_kwds={'groups':data.v3,'use_correction':True},use_t=True)
 assert np.allclose(result['covariance']['matrix'],reference.cov_params(),atol=1e-8,rtol=1e-6)
 df=len(data)-x.shape[1] if vcov!='cluster' else data.v3.nunique()-1;assert result['inference']['df']==df
 for i,c in enumerate(result['coefficients']):
  assert abs(c['p_value']-2*t.sf(abs(c['estimate']/c['std_error']),df))<1e-6
 checks.append('OLS '+vcov+': full covariance, SE, df and p match independent reference')
data,p=prepare('ols');data.loc[0,p['outcome']]=np.nan;data.loc[0,p['predictors'][0]]=np.nan;data.loc[1,p['predictors'][1]]=np.nan;p['missing']='drop';result=run(data,p);assert result['n_used']==158 and result['deleted_count']==2 and result['used_indices'][0]==3;checks.append('overlapping missing observations counted once; original row indices retained')
for method in ['panel_fe','did']:
 data,p=prepare(method);p['missing']='drop';data.loc[0,p['outcome']]=np.nan;result=run(data,p);assert result['n_used']==383;checks.append(method+': unbalanced panel after missing removal retains 383 actual rows')
data,p=prepare('panel_fe');unit=data[p['unit']].iloc[0];data=data.loc[(data[p['unit']]!=unit)|(data[p['time']]==data[p['time']].min())];result=run(data,p);assert result['n_used']==len(data);checks.append('FE singleton retained explicitly; row count checked against native fit')
data,p=prepare('panel_fe');data[p['predictors'][0]]=data[p['unit']]
try:run(data,p)
except Exception:checks.append('FE within-invariant regressor rejected rather than fabricated')
else:raise AssertionError('Unidentified FE model accepted')
data,p=prepare('ols');data[p['predictors'][1]]=data[p['predictors'][0]]
try:run(data,p)
except Exception:checks.append('OLS collinear regressor rejected')
else:raise AssertionError('Collinear model accepted')
(root/'outputs/statistical-edges.json').write_text(json.dumps({'checks':checks},indent=2),encoding='utf-8');print(json.dumps({'checks':checks}))
