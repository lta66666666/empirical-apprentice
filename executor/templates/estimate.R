# Mature-package execution only. Run: Rscript --vanilla estimate.R job-directory
args <- commandArgs(trailingOnly=TRUE)
if (length(args)!=1) stop('Expected one job directory')
job_dir <- normalizePath(args[[1]], mustWork=TRUE)
if (!requireNamespace('jsonlite',quietly=TRUE)) stop('Install jsonlite first')
output <- file.path(job_dir,'result.json')
warnings_seen <- character()
main <- function() {
  if (!requireNamespace('fixest',quietly=TRUE)) stop('Install fixest first')
  if(as.character(getRversion()) != '4.6.1' || as.character(packageVersion('fixest')) != '0.14.2') stop('Runtime version mismatch')
  p <- jsonlite::fromJSON(file.path(job_dir,'parameters.json'),simplifyVector=TRUE)
  p$predictors <- as.character(unlist(p$predictors))
  method <- p$method
  if (!method %in% c('ols','panel_fe','did')) stop('Unsupported method')
  d <- read.csv(file.path(job_dir,'normalized.csv'),check.names=FALSE,stringsAsFactors=FALSE,
                na.strings=c('','NA','N/A','null','NaN'),fileEncoding='UTF-8')
  vars <- unique(c(p$outcome,p$predictors,p$unit,p$time,p$treated,p$cluster)); vars<-vars[nzchar(vars)]
  if (!all(grepl('^v[0-9]+$',vars)) || !all(vars %in% names(d))) stop('Invalid column identifiers')
  n_input <- nrow(d)
  numeric_vars <- unique(c(p$outcome,p$predictors,if(method!='ols')p$time,if(method=='did')p$treated))
  for (v in numeric_vars) {
    raw <- d[[v]]; converted <- suppressWarnings(as.numeric(raw))
    if (any(!is.na(raw) & (is.na(converted) | !is.finite(converted)))) stop(paste('Non-numeric or infinite values in',p$labels[[v]]))
    d[[v]] <- converted
  }
  if (method!='ols') {
    if (any(is.na(d[[p$unit]])) || any(is.na(d[[p$time]]))) stop('Panel identifier/year cannot be missing')
    if (any(d[[p$time]]!=floor(d[[p$time]]))) stop('Year must be an integer')
    if (any(duplicated(d[c(p$unit,p$time)]))) stop('Duplicate unit-year keys; verify source instead of automatic deletion')
  }
  complete <- complete.cases(d[vars]); removed <- which(!complete)
  if (length(removed)>0 && p$missing!='drop') stop('Selected variables contain missing values; explicitly confirm complete-case deletion or repair source data')
  d <- d[complete,,drop=FALSE]; original_rows<-which(complete)
  if (nrow(d)<8) stop('This research executor requires at least 8 usable observations; use teaching arithmetic for tiny examples')
  if (length(unique(d[[p$outcome]]))<2) stop('Outcome has no variation')
  if (length(removed)) warnings_seen <<- c(warnings_seen,'Complete-case deletion may change sample composition; it does not resolve missing-data bias.')
  for (v in p$predictors) if(length(unique(d[[v]]))<2) stop(paste('Predictor has no variation:',p$labels[[v]]))
  if(method!='ols' && (length(unique(d[[p$unit]]))<2 || length(unique(d[[p$time]]))<2)) stop('Panel needs at least two units and two years')
  rhs <- if(length(p$predictors))paste(p$predictors,collapse=' + ') else '1'
  trends <- NULL
  if(method=='did') {
    if(!isTRUE(p$same_batch)) stop('Staggered adoption is not supported')
    t <- d[[p$treated]]
    if(!all(t %in% c(0,1)) || length(unique(t))!=2) stop('Treatment must contain both 0 and 1')
    stable<-tapply(t,d[[p$unit]],function(v)length(unique(v)))
    if(any(stable!=1)) stop('Treatment-group identity must be fixed over time; this tool does not accept adoption-status columns')
    d$policy_post <- as.integer(d[[p$time]]>=p$policy_year)
    d$policy_effect <- t*d$policy_post
    cells<-table(t,d$policy_post)
    if(any(cells==0)) stop('Both groups must have observations before and after policy')
    coverage<-tapply(d$policy_post,d[[p$unit]],function(v)length(unique(v)))
    if(any(coverage!=2)) stop('Every included unit must be observed before and after policy')
    rhs<-paste(c('policy_effect',p$predictors),collapse=' + ')
    trends<-aggregate(d[[p$outcome]],list(year=d[[p$time]],treated=t),mean)
    names(trends)[3]<-'mean_outcome'
    preyears<-length(unique(d[[p$time]][d$policy_post==0]))
    if(preyears<3) warnings_seen <<- c(warnings_seen,'Fewer than three pre-policy periods: descriptive pretrend information is limited.')
    warnings_seen <<- c(warnings_seen,'The group-mean plot is descriptive, not an event-study regression or proof of parallel trends. Causal claims require design evidence.')
  }
  f <- paste(p$outcome,'~',rhs)
  if(method!='ols') f<-paste(f,'|',p$unit,'+',p$time)
  vc<-if(p$vcov=='cluster')as.formula(paste('~',p$cluster)) else p$vcov
  clusters<-NULL
  if(p$vcov=='cluster') {
    clusters<-length(unique(d[[p$cluster]]))
    if(clusters<2)stop('At least two clusters are required')
    if(clusters<30)warnings_seen <<- c(warnings_seen,'Fewer than 30 clusters; conventional cluster-robust inference can be fragile. This threshold is a teaching reminder, not a guarantee.')
  }
  fit <- withCallingHandlers(fixest::feols(as.formula(f),data=d,vcov=vc,nthreads=1,notes=FALSE),
     warning=function(w){warnings_seen<<-c(warnings_seen,conditionMessage(w));invokeRestart('muffleWarning')})
  if(length(fit$collin.var)) warnings_seen <<- c(warnings_seen,paste('Collinear regressors removed by fixest:',paste(fit$collin.var,collapse=', ')))
  if(method=='did' && !'policy_effect' %in% names(coef(fit)))stop('DID coefficient not identified in this sample')
  ct<-fixest::coeftable(fit); ci<-as.matrix(confint(fit,level=0.95))
  if(any(!is.finite(ct)) || any(!is.finite(ci)))stop('Non-finite inference output; inspect sample size, collinearity and residual variation')
  labels<-rownames(ct)
  for(i in seq_along(labels)) {
    if(labels[i]=='policy_effect')labels[i]<-'DID effect'
    else if(labels[i] %in% names(p$labels))labels[i]<-p$labels[[labels[i]]]
  }
  tab<-data.frame(term=labels,estimate=ct[,1],std_error=ct[,2],statistic=ct[,3],p_value=ct[,4],ci_low=ci[,1],ci_high=ci[,2],row.names=NULL)
  write.csv(tab,file.path(job_dir,'coefficients.csv'),row.names=FALSE,fileEncoding='UTF-8')
  used<-fixest::obs(fit);model_removed<-setdiff(seq_len(nrow(d)),used)
  warnings_seen <<- c(warnings_seen,'The displayed p-values do not establish causality. Model selection must not target statistical significance.')
  svg(file.path(job_dir,'coefficients.svg'),width=7,height=max(3,0.55*nrow(tab)+1.8))
  par(mar=c(4,8,2,1)); xx<-range(c(tab$ci_low,tab$ci_high,0)); if(diff(xx)==0)xx<-xx+c(-1,1)
  plot(tab$estimate,seq_len(nrow(tab)),xlim=xx,ylim=c(0.5,nrow(tab)+0.5),yaxt='n',ylab='',xlab='Estimate with 95% confidence interval',pch=19,col='#087e75')
  axis(2,at=seq_len(nrow(tab)),labels=tab$term,las=1,cex.axis=0.85);abline(v=0,lty=2,col='grey70')
  segments(tab$ci_low,seq_len(nrow(tab)),tab$ci_high,seq_len(nrow(tab)),col='#087e75',lwd=2);dev.off()
  artifacts<-c('coefficients.csv','coefficients.svg')
  if(method=='did') {
    write.csv(trends,file.path(job_dir,'group_trends.csv'),row.names=FALSE)
    svg(file.path(job_dir,'group_trends.svg'),width=7,height=4)
    par(mar=c(4,4,2,1)); plot(range(trends$year),range(trends$mean_outcome),type='n',xlab='Year',ylab='Mean outcome')
    for(g in c(0,1)){q<-trends[trends$treated==g,];q<-q[order(q$year),];lines(q$year,q$mean_outcome,type='b',pch=19,col=if(g==1)'#087e75' else '#d98738')}
    abline(v=p$policy_year,lty=2,col='grey50');legend('topright',c('Treated','Control'),col=c('#087e75','#d98738'),lty=1,bty='n');dev.off()
    artifacts<-c(artifacts,'group_trends.csv','group_trends.svg')
  } else {
    svg(file.path(job_dir,'residuals.svg'),width=7,height=4)
    plot(fitted(fit),residuals(fit),pch=19,col='#087e7580',xlab='Fitted outcome',ylab='Residual');abline(h=0,lty=2);dev.off()
    artifacts<-c(artifacts,'residuals.svg')
  }
  saveRDS(fit,file.path(job_dir,'model.rds'));writeLines(capture.output(sessionInfo()),file.path(job_dir,'session-info.txt'))
  list(status='succeeded',engine='R',package='fixest::feols',r_version=R.version.string,
       package_versions=list(fixest=as.character(packageVersion('fixest')),jsonlite=as.character(packageVersion('jsonlite'))),
       formula=f,used_indices=I(original_rows[used]),df_t=fixest::degrees_freedom(fit,type='t'),n_input=n_input,n_complete=nrow(d),n_used=nobs(fit),clusters=clusters,
       audit=list(missing_removed_csv_lines=I(removed+1),model_removed_csv_lines=I(original_rows[model_removed]+1),
                  missing_policy=p$missing,collinear_removed=fit$collin.var),
       vcov=p$vcov,cluster_label=if(nzchar(p$cluster))p$labels[[p$cluster]] else NULL,
       coefficients=tab,group_trends=trends,warnings=I(unique(warnings_seen)),artifacts=I(artifacts),
       assumptions_verified=FALSE)
}
result<-tryCatch(main(),error=function(e)list(status='failed',error=conditionMessage(e),warnings=I(unique(warnings_seen))))
jsonlite::write_json(result,output,auto_unbox=TRUE,pretty=TRUE,na='null',null='null',digits=15)
if(result$status=='failed')quit(status=1)
