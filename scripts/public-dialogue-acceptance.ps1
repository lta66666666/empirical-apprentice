$ErrorActionPreference='Stop'
$origin='https://empirical-apprentice-webr-trial.liskyler9.chatgpt.site'
$qaSession=New-Object Microsoft.PowerShell.Commands.WebRequestSession
$checks=[System.Collections.Generic.List[object]]::new()
function CallApi($path,$method='GET',$body=$null){
 $args=@{Uri=$origin+$path;Method=$method;WebSession=$qaSession;Headers=@{Origin=$origin};SkipHttpErrorCheck=$true;TimeoutSec=35}
 if($null -ne $body){$args.ContentType='application/json';$args.Body=($body|ConvertTo-Json -Depth 20 -Compress)}
 $sw=[Diagnostics.Stopwatch]::StartNew();$r=Invoke-WebRequest @args;$sw.Stop()
 $v=if($r.Headers.'Content-Type' -match 'json'){$r.Content|ConvertFrom-Json -Depth 45}else{$r.Content}
 return @{status=[int]$r.StatusCode;value=$v;ms=$sw.ElapsedMilliseconds}
}
function Check($name,$r,$expected=200){if($r.status -ne $expected){throw "$name status=$($r.status) $($r.value|ConvertTo-Json -Compress -Depth 5)"};$checks.Add(@{name=$name;result='pass';status=$r.status;ms=$r.ms});Write-Output "PASS $name"}
$qaName='qa_dialogue_'+[DateTimeOffset]::UtcNow.ToUnixTimeSeconds();$qaPassword=[guid]::NewGuid().ToString()+'Aa12!'
Check '真实注册' (CallApi '/api/auth/register' 'POST' @{username=$qaName;password=$qaPassword;password_confirmation=$qaPassword})
$r=CallApi '/analysis';Check '分析HTML加载新版控制器' $r
if($r.value -notmatch 'analysis-dialogue.js'){throw 'new controller absent'}
$r=CallApi '/api/sessions' 'POST' @{};Check '创建验收练习' $r;$sid=$r.value.session_id;$ver=$r.value.state_version;$rev=$r.value.research_revision
$r=CallApi '/api/research/chat' 'POST' @{session_id=$sid;state_version=$ver;research_revision=$rev;request_id=[guid]::NewGuid().ToString();message='请帮我整理研究准备：研究问题为教育与收入的一般关联；研究对象是学生，时期2020年；结果变量是月收入，单位千元；解释变量是教育年限，单位年；数据来源为现有模拟教学数据；获取条件为教学练习使用。没有原始数据，请先补问而不要执行。';profile=@{row_count=0;columns=@()}}
Check '真实模型补问与持久行动' $r
$m=$r.value.message
if($m.output.mode -in @('rules','manual')){throw "actual model fallback: $($m.output.mode)"}
$apply=$m.actions|Where-Object id -eq 'apply'
if(!$apply){throw 'model did not return applicable preparation proposal'}
$checks.Add(@{name='模型标识';result='recorded';model=$m.output.actual_model;prompt_version=$m.output.prompt_version})
$r=CallApi "/api/sessions/$sid";$ver=$r.value.state_version
$p=@{message_id=$m.id;action_id='apply';state_version=$ver;request_id=[guid]::NewGuid().ToString()}
$r=CallApi "/api/sessions/$sid/analysis/actions" 'POST' $p;Check '预览后应用，来源未自动核实' $r;$ver=$r.value.state_version;$rev=$r.value.research_revision
if(($r.value.preparation.cards.PSObject.Properties.Value|Where-Object status -eq 'verified').Count -gt 0){throw 'auto verified'}
Check '同编号应用重试' (CallApi "/api/sessions/$sid/analysis/actions" 'POST' $p)
$r=CallApi '/api/research/chat' 'POST' @{session_id=$sid;state_version=$ver;research_revision=$rev;request_id=[guid]::NewGuid().ToString();message='带我一步步做，先核对研究准备';profile=@{row_count=0;columns=@()}}
Check '明确请求分步引导' $r
$m=$r.value.message
$r=CallApi "/api/sessions/$sid/analysis/actions" 'POST' @{message_id=$m.id;action_id='guide_start';state_version=$ver;request_id=[guid]::NewGuid().ToString()};Check '引导启动' $r;$ver=$r.value.state_version
$r=CallApi "/api/sessions/$sid/analysis/actions" 'POST' @{action_id='guide';command='pause';state_version=$ver;request_id=[guid]::NewGuid().ToString()};Check '引导暂停' $r;$ver=$r.value.state_version
$r=CallApi "/api/sessions/$sid";Check '暂停状态持久恢复' $r
if($r.value.analysis_workspace.guide.status -ne 'paused'){throw 'guide not paused'}
$r=CallApi '/api/research/chat' 'POST' @{session_id=$sid;state_version=$ver;research_revision=$rev;request_id=[guid]::NewGuid().ToString();message='讲解当前OLS的关联与因果区别';intent='knowledge';draft_plan=@{method='ols';predictors=@()};step='plan';profile=@{row_count=0;columns=@()}}
Check '真实上下文知识响应' $r
if($r.value.message.context.focus_method -ne 'ols' -or !$r.value.message.teaching){throw 'context knowledge missing'}
Check '未知行动拒绝' (CallApi "/api/sessions/$sid/analysis/actions" 'POST' @{action_id='run_arbitrary';state_version=$ver;request_id=[guid]::NewGuid().ToString()}) 422
$evidenceState=CallApi "/api/sessions/$sid"
$actual=$evidenceState.value.model_interactions|Where-Object kind -eq 'candidate'|Select-Object -First 1
if(!$actual.actual_model){throw 'provider model identifier missing in persistent evidence'}
$checks.Add(@{name='持久模型实际标识';result='recorded';model=$actual.actual_model;status=$actual.status;prompt_version=$actual.prompt_version})
$j=CallApi "/api/sessions/$sid/learning-report/json";Check '报告含持久对话' $j
if(!$j.value.practical_messages){throw 'dialogue absent in report'}
Check '删除测试练习' (CallApi "/api/sessions/$sid" 'DELETE')
Check '结束测试会话' (CallApi '/api/auth/logout' 'POST' @{})
@{date=[DateTimeOffset]::UtcNow.ToString('o');version=25;scope='Actual public HTTP and DeepSeek; not browser clicks or numerical execution';checks=$checks}|ConvertTo-Json -Depth 10|Set-Content outputs/public-dialogue-acceptance.json -Encoding utf8
