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

$qaName='qa_intake_'+[DateTimeOffset]::UtcNow.ToUnixTimeSeconds();$qaPassword=[guid]::NewGuid().ToString()+'Aa12!'
Check '真实注册' (CallApi '/api/auth/register' 'POST' @{username=$qaName;password=$qaPassword;password_confirmation=$qaPassword})
$r=CallApi '/analysis';Check '新版对话入口' $r
if($r.value -notmatch 'conversation-workspace.js'){throw 'minimal controller absent'}
$r=CallApi '/api/sessions' 'POST' @{};Check '创建验收练习' $r;$sid=$r.value.session_id;$ver=$r.value.state_version;$rev=$r.value.research_revision
try{
 $replies=[System.Collections.Generic.List[object]]::new()
 foreach($text in @('我想评估一项就业政策的影响。','政策是就业扶持政策，研究对象是某地区企业，观察2010到2020年，就业人数单位人。','政策原文暂未找到，实施日期是2015年1月1日，所有处理企业同一天实施。比较对象是未实施企业，数据来自我获得授权的企业调查，解释变量为扶持政策处理与实施后的交互项。')){
  $r=CallApi '/api/research/chat' 'POST' @{session_id=$sid;state_version=$ver;research_revision=$rev;request_id=[guid]::NewGuid().ToString();message=$text;profile=@{row_count=0;columns=@()}}
  Check '真实模型逐项补问' $r
  if($text -ne '我想评估一项就业政策的影响。' -and $r.value.message.content -match '哪项政策|政策名称'){throw ('repeated policy name question: '+$r.value.message.content+' context='+($r.value.message.context.unconfirmed_preparation|ConvertTo-Json -Depth 8 -Compress))}
  if($r.value.message.output.mode -in @('rules','manual')){throw ('actual model unavailable: '+($r.value.message.output|Select-Object mode,error_type,detail,reason|ConvertTo-Json -Compress))}
  if($r.value.message.content.Length -gt 220 -or $r.value.message.content -match 'row_count|method|请补充：'){throw 'reply is redundant'}
  $replies.Add(@{reply=$r.value.message.content;pending_keys=@($r.value.message.context.unconfirmed_preparation.cards.PSObject.Properties.Name)})
 }
 $r=CallApi "/api/sessions/$sid";Check '对话不自动修改正式资料' $r
 if($r.value.preparation.cards.question){throw 'chat silently applied preparation'}
 $actual=$r.value.model_interactions|Where-Object kind -eq 'candidate'|Select-Object -First 1
 if(!$actual.actual_model -or $actual.prompt_version -ne 'ea-candidate-v5-intake'){throw 'new actual model evidence missing'}
 $checks.Add(@{name='持久模型标识';result='recorded';model=$actual.actual_model;prompt_version=$actual.prompt_version})
 $j=CallApi "/api/sessions/$sid/learning-report/json";Check '持久报告保留对话' $j
 if($j.value.practical_messages.Count -ne 6){throw 'report messages mismatch'}
 @{date=[DateTimeOffset]::UtcNow.ToString('o');version=29;scope='Actual public HTTP/model intake, not browser/device or numerical execution';checks=$checks;turns=$replies}|ConvertTo-Json -Depth 10|Set-Content outputs/public-conversation-first.json -Encoding utf8
}finally{
 Check '清理测试练习' (CallApi "/api/sessions/$sid" 'DELETE')
 Check '退出测试会话' (CallApi '/api/auth/logout' 'POST' @{})
}
