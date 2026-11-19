version 18.0
clear all
set more off
set varabbrev off
set processors 1
capture log close _all
log using placebo.log, text replace
import delimited using did.csv, varnames(1) stringcols(_all) clear
destring year emissions treated investment, replace
egen long panel = group(city)
xtset panel year
keep if year <= 2017
generate byte placebo_post = year >= 2016
generate byte placebo_effect = treated * placebo_post
xtreg emissions placebo_effect investment i.year, fe vce(cluster panel)
matrix ea_b = e(b)
matrix ea_v = e(V)
scalar ea_df = e(df_r)
scalar ea_n = e(N)
file open results using placebo-coefficients.csv, write replace
file write results "term,estimate,std_error,p_value,ci_low,ci_high" _n
local names : colnames ea_b
forvalues j = 1/`=colsof(ea_b)' {
local name : word `j' of `names'
if "`name'" == "placebo_effect" {
scalar ea_est = ea_b[1,`j']
scalar ea_se = sqrt(ea_v[`j',`j'])
scalar ea_p = 2*ttail(scalar(ea_df),abs(scalar(ea_est)/scalar(ea_se)))
scalar ea_crit = invttail(scalar(ea_df),.025)
file write results "`name'," %24.17g (scalar(ea_est)) "," %24.17g (scalar(ea_se)) "," %24.17g (scalar(ea_p)) "," %24.17g (scalar(ea_est)-scalar(ea_crit)*scalar(ea_se)) "," %24.17g (scalar(ea_est)+scalar(ea_crit)*scalar(ea_se)) _n
}
}
file close results
file open meta using placebo-meta.csv, write replace
file write meta "n_used,df" _n
file write meta (scalar(ea_n)) "," (scalar(ea_df)) _n
file close meta
log close _all
