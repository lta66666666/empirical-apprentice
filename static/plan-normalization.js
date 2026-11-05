// Generated from server method-role normalization.
(()=>{// Method roles are semantic: irrelevant columns must never affect the sample.
window.eaNormalizeMethodPlan=function(input={}) {
 const plan={...input,predictors:Array.isArray(input.predictors)?[...input.predictors]:[]};
 if(plan.method==='ols'){plan.unit='';plan.time='';}
 if(plan.method!=='did'){plan.treated='';plan.policy_year=null;plan.same_batch=false;}
 if(plan.vcov!=='cluster')plan.cluster='';
 return plan;
}
})();
