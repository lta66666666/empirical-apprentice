args <- commandArgs(trailingOnly=TRUE)
library(fixest, lib.loc=args[1]); library(jsonlite, lib.loc=args[1])
stopifnot(as.character(packageVersion('fixest'))=='0.14.2')
fixtures <- fromJSON('outputs/cloud-fixtures.json', simplifyVector=FALSE)
results <- list()
for (method in c('panel_fe','did')) {
 f <- fixtures[[method]]; d <- read.csv(text=f$text, check.names=FALSE)
 if(method=='did') d$policy_effect <- d[[f$plan$treated]]*as.integer(d[[f$plan$time]]>=f$plan$policy_year)
 rhs <- if(method=='did') c('policy_effect',unlist(f$plan$predictors)) else unlist(f$plan$predictors)
 formula <- as.formula(paste(f$plan$outcome,'~',paste(rhs,collapse='+'),'|',f$plan$unit,'+',f$plan$time))
 fit <- feols(formula,data=d,vcov=as.formula(paste('~',f$plan$cluster)),fixef.rm='none',nthreads=1,
   ssc=ssc(K.adj=TRUE,K.fixef='nonnested',G.adj=TRUE,G.df='min',t.df='min'))
 results[[method]] <- list(n_used=nobs(fit),coefficients=coeftable(fit),covariance=vcov(fit),interval=confint(fit),
    terms=names(coef(fit)),df=degrees_freedom(fit,'t'),fixest=as.character(packageVersion('fixest')))
}
write_json(results,'outputs/fixest-reference.json',auto_unbox=TRUE,pretty=TRUE,digits=16,matrix='rowmajor')
cat('Locked fixest reference complete\n')
