version 18.0
clear all
set more off
set varabbrev off
set processors 1
capture log close _all
log using execution.log, text replace
assert c(stata_version) >= 18 & c(stata_version) < 19
import delimited using normalized.csv, varnames(1) stringcols(_all) clear
generate long ea_row = _n
replace v4 = "" if inlist(v4,"NA","N/A","null","NaN")
destring v4, replace
replace v3 = "" if inlist(v3,"NA","N/A","null","NaN")
destring v3, replace
replace v1 = "" if inlist(v1,"NA","N/A","null","NaN")
destring v1, replace
replace v2 = "" if inlist(v2,"NA","N/A","null","NaN")
destring v2, replace
capture confirm string variable v4
if !_rc replace v4 = "" if inlist(v4,"NA","N/A","null","NaN")
capture confirm string variable v3
if !_rc replace v3 = "" if inlist(v3,"NA","N/A","null","NaN")
capture confirm string variable v0
if !_rc replace v0 = "" if inlist(v0,"NA","N/A","null","NaN")
capture confirm string variable v1
if !_rc replace v1 = "" if inlist(v1,"NA","N/A","null","NaN")
capture confirm string variable v2
if !_rc replace v2 = "" if inlist(v2,"NA","N/A","null","NaN")
generate byte ea_missing = 0
replace ea_missing = 1 if missing(v4)
replace ea_missing = 1 if missing(v3)
replace ea_missing = 1 if missing(v0)
replace ea_missing = 1 if missing(v1)
replace ea_missing = 1 if missing(v2)
assert ea_missing == 0
assert !missing(v0) & !missing(v1)
assert v1 == floor(v1)
isid v0 v1
drop if ea_missing
assert _N >= 8
egen long ea_cluster = group(v0)
egen long ea_panel = group(v0)
xtset ea_panel v1
assert inlist(v2,0,1)
bysort ea_panel: assert v2 == v2[1]
generate byte policy_post = v1 >= 2018
generate byte policy_effect = v2 * policy_post
bysort ea_panel: egen byte ea_minpost = min(policy_post)
bysort ea_panel: egen byte ea_maxpost = max(policy_post)
assert ea_minpost == 0 & ea_maxpost == 1
count if v2==0 & policy_post==0
assert r(N)>0
count if v2==0 & policy_post==1
assert r(N)>0
count if v2==1 & policy_post==0
assert r(N)>0
count if v2==1 & policy_post==1
assert r(N)>0
xtreg v4 policy_effect v3 i.v1, fe vce(cluster ea_cluster)
matrix ea_b = e(b)
matrix ea_v = e(V)
scalar ea_df = e(df_r)
scalar ea_n = e(N)
generate byte ea_sample = e(sample)
preserve
keep if ea_sample
keep ea_row
export delimited using sample.csv, replace
restore
file open meta using metadata.csv, write replace
file write meta "version,n_used,df" _n
file write meta (c(stata_version)) "," (scalar(ea_n)) "," (scalar(ea_df)) _n
file close meta
file open results using coefficients.csv, write replace
file write results "term,estimate,std_error,p_value,ci_low,ci_high" _n
local names : colnames ea_b
forvalues j=1/`=colsof(ea_b)' {
local name : word `j' of `names'
scalar ea_est = ea_b[1,`j']
scalar ea_se = sqrt(ea_v[`j',`j'])
scalar ea_p = 2*ttail(scalar(ea_df),abs(scalar(ea_est)/scalar(ea_se)))
scalar ea_crit = invttail(scalar(ea_df),.025)
file write results "`name'," %24.17g (scalar(ea_est)) "," %24.17g (scalar(ea_se)) "," %24.17g (scalar(ea_p)) "," %24.17g (scalar(ea_est)-scalar(ea_crit)*scalar(ea_se)) "," %24.17g (scalar(ea_est)+scalar(ea_crit)*scalar(ea_se)) _n
}
file close results
log close _all
