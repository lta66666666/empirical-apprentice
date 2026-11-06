// Public availability is an acceptance decision, not a claim based on upstream names.
export const methodRegistry=Object.freeze({
 ols:{label:'OLS',enabled:true,roles:['outcome','predictors'],engines:['statspai_cloud','browser_webr','r_native','stata_native']},
 panel_fe:{label:'个体与年份固定效应',enabled:true,roles:['outcome','predictors','unit','time','cluster'],engines:['statspai_cloud','browser_webr','r_native','stata_native']},
 did:{label:'同批 DID',enabled:true,roles:['outcome','predictors','unit','time','treated','policy_year','same_batch','cluster'],engines:['statspai_cloud','browser_webr','r_native','stata_native']},
 iv_2sls:{label:'工具变量 2SLS',enabled:true,roles:['outcome','endogenous','instruments','predictors','unit','time','cluster'],engines:['statspai_cloud']},
 rdd_sharp:{label:'Sharp RDD',enabled:false,roles:['outcome','running','cutoff'],reason:'待 CCT 标准路径、局部样本与带宽验收'},
 rdd_fuzzy:{label:'Fuzzy RDD',enabled:false,roles:['outcome','running','cutoff','treatment'],reason:'待原生比率推断和弱处理跳跃验收'},
 staggered_did:{label:'分批 DID',enabled:true,roles:['outcome','predictors','unit','time','first_treat','control_group','absorbing_confirmed','cluster'],engines:['statspai_cloud']},
 event_study:{label:'事件研究（同批）',enabled:true,roles:['outcome','predictors','unit','time','treated','policy_year','same_batch','window','reference_period','cluster'],engines:['statspai_cloud']},
});
export const enabledMethods=Object.keys(methodRegistry).filter(key=>methodRegistry[key].enabled);
