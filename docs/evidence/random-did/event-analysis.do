version 18.0
clear all
set more off
set varabbrev off
set processors 1
capture log close _all
log using event.log, text replace
import delimited using did.csv, varnames(1) stringcols(_all) clear
destring year emissions treated investment, replace
egen long panel = group(city)
xtset panel year
generate int rel = year - 2018
generate byte e_m4 = treated == 1 & rel == -4
generate byte e_m3 = treated == 1 & rel == -3
generate byte e_m2 = treated == 1 & rel == -2
generate byte e_p0 = treated == 1 & rel == 0
generate byte e_p1 = treated == 1 & rel == 1
generate byte e_p2 = treated == 1 & rel == 2
generate byte e_p3 = treated == 1 & rel == 3
preserve
collapse (mean) emissions, by(treated year)
export delimited using trends.csv, replace
restore
xtreg emissions e_m4 e_m3 e_m2 e_p0 e_p1 e_p2 e_p3 i.year, fe vce(cluster panel)
matrix ea_b = e(b)
matrix ea_v = e(V)
scalar ea_df = e(df_r)
scalar ea_n = e(N)
test e_m4 e_m3 e_m2
scalar ea_pretrend_p = r(p)
file open results using event-coefficients.csv, write replace
file write results "term,estimate,std_error,p_value,ci_low,ci_high" _n
local names : colnames ea_b
forvalues j = 1/`=colsof(ea_b)' {
local name : word `j' of `names'
if "`name'" == "e_m4" | "`name'" == "e_m3" | "`name'" == "e_m2" | "`name'" == "e_p0" | "`name'" == "e_p1" | "`name'" == "e_p2" | "`name'" == "e_p3" {
scalar ea_est = ea_b[1,`j']
scalar ea_se = sqrt(ea_v[`j',`j'])
scalar ea_p = 2*ttail(scalar(ea_df),abs(scalar(ea_est)/scalar(ea_se)))
scalar ea_crit = invttail(scalar(ea_df),.025)
file write results "`name'," %24.17g (scalar(ea_est)) "," %24.17g (scalar(ea_se)) "," %24.17g (scalar(ea_p)) "," %24.17g (scalar(ea_est)-scalar(ea_crit)*scalar(ea_se)) "," %24.17g (scalar(ea_est)+scalar(ea_crit)*scalar(ea_se)) _n
}
}
file close results
file open meta using event-meta.csv, write replace
file write meta "n_used,df,pretrend_p" _n
file write meta (scalar(ea_n)) "," (scalar(ea_df)) "," (scalar(ea_pretrend_p)) _n
file close meta
log close _all
