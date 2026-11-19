clear all
set more off
capture log close
log using "worldbank-analysis.log", replace text

import delimited "world-bank-china-2000-2023.csv", clear varnames(1) case(lower)
tsset year

gen double ln_gdp = ln(gdp_per_person_employed_ppp)
label variable internet_users_pct "互联网使用率（%）"
label variable gdp_per_person_employed_ppp "人均产出（2021 PPP 美元）"
label variable gross_capital_formation_pct "资本形成（% GDP）"

summarize year internet_users_pct gdp_per_person_employed_ppp gross_capital_formation_pct, detail
corr internet_users_pct gdp_per_person_employed_ppp gross_capital_formation_pct

quietly regress ln_gdp internet_users_pct gross_capital_formation_pct year
local r2_levels = e(r2)
newey ln_gdp internet_users_pct gross_capital_formation_pct year, lag(2)
local n_levels = e(N)
local df_levels = e(df_r)

tempname fh
file open `fh' using "worldbank-results.csv", write replace
file write `fh' "model,term,coef,se,t,p" _n
foreach v in internet_users_pct gross_capital_formation_pct year _cons {
  local t = _b[`v']/_se[`v']
  local p = 2*ttail(`df_levels',abs(`t'))
  file write `fh' "levels,`v'," (_b[`v']) "," (_se[`v']) "," (`t') "," (`p') _n
}
file write `fh' "levels,meta_N," (`n_levels') _n
file write `fh' "levels,meta_r2," (`r2_levels') _n
file close `fh'

quietly regress D.ln_gdp D.internet_users_pct D.gross_capital_formation_pct
local r2_diff = e(r2)
newey D.ln_gdp D.internet_users_pct D.gross_capital_formation_pct, lag(1)
local n_diff = e(N)
local df_diff = e(df_r)

file open `fh' using "worldbank-results.csv", write append
foreach v in D.internet_users_pct D.gross_capital_formation_pct _cons {
  local t = _b[`v']/_se[`v']
  local p = 2*ttail(`df_diff',abs(`t'))
  file write `fh' "diff,`v'," (_b[`v']) "," (_se[`v']) "," (`t') "," (`p') _n
}
file write `fh' "diff,meta_N," (`n_diff') _n
file write `fh' "diff,meta_r2," (`r2_diff') _n
file close `fh'

log close
