// Public availability is an acceptance decision, not a claim based on upstream names.
export const methodRegistry=Object.freeze({
 ols:{label:'OLS',enabled:true,roles:['outcome','predictors'],engines:['statspai_cloud','browser_webr','r_native','stata_native']},
 panel_fe:{label:'个体与年份固定效应',enabled:true,roles:['outcome','predictors','unit','time','cluster'],engines:['statspai_cloud','browser_webr','r_native','stata_native']},
 did:{label:'同批 DID',enabled:true,roles:['outcome','predictors','unit','time','treated','policy_year','same_batch','cluster'],engines:['statspai_cloud','browser_webr','r_native','stata_native']},
 iv_2sls:{label:'工具变量 2SLS',enabled:false,roles:['outcome','endogenous','instruments','predictors'],reason:'待逐项完成计算、参考对照、网页和教学验收'},
 rdd_sharp:{label:'Sharp RDD',enabled:false,roles:['outcome','running','cutoff'],reason:'待 CCT 标准路径、局部样本与带宽验收'},
 rdd_fuzzy:{label:'Fuzzy RDD',enabled:false,roles:['outcome','running','cutoff','treatment'],reason:'待原生比率推断和弱处理跳跃验收'},
 staggered_did:{label:'分批 DID',enabled:false,roles:['outcome','unit','time','first_treat','control_group','absorbing_confirmed'],reason:'待逐比较配对样本与两类对照验收'},
 event_study:{label:'事件研究',enabled:false,roles:['outcome','unit','time','treated','policy_year','window','reference_period'],reason:'待动态效应及协方差验收'},
});
export const enabledMethods=Object.keys(methodRegistry).filter(key=>methodRegistry[key].enabled);
