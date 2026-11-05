// Generated from server method-role normalization.
(()=>{// Method roles are semantic: irrelevant columns must never affect the sample.
window.eaNormalizeMethodPlan=function(input={}) {
 const plan={...input,predictors:Array.isArray(input.predictors)?[...input.predictors]:[],instruments:Array.isArray(input.instruments)?[...input.instruments]:[]};
 if(plan.method==='ols'){plan.unit='';plan.time='';}
 if(!['did','event_study'].includes(plan.method)){plan.treated='';plan.policy_year=null;plan.same_batch=false;}
 if(plan.method!=='event_study'){plan.window=null;plan.reference_period=null;}
 if(plan.method!=='iv_2sls'){plan.endogenous='';plan.instruments=[];}
 if(plan.vcov!=='cluster')plan.cluster='';
 return plan;
}
})();
