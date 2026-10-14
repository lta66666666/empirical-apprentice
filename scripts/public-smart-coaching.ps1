$ErrorActionPreference='Stop'
$origin='https://empirical-apprentice-webr-trial.liskyler9.chatgpt.site'
$qaSession=New-Object Microsoft.PowerShell.Commands.WebRequestSession
$checks=[System.Collections.Generic.List[object]]::new()
function CallApi($path,$method='GET',$body=$null){
 $a=@{Uri=$origin+$path;Method=$method;WebSession=$qaSession;Headers=@{Origin=$origin};SkipHttpErrorCheck=$true;TimeoutSec=35}
 if($null -ne $body){$a.ContentType='application/json';$a.Body=($body|ConvertTo-Json -Depth 30 -Compress)}
 $sw=[Diagnostics.Stopwatch]::StartNew();$r=Invoke-WebRequest @a;$sw.Stop()
 $v=if($r.Headers.'Content-Type' -match 'json'){$r.Content|ConvertFrom-Json -Depth 70}else{$r.Content}
 return @{status=[int]$r.StatusCode;value=$v;ms=$sw.ElapsedMilliseconds}
}
function Check($name,$r,$expected=200){if($r.status -ne $expected){throw ($name+' status='+$r.status+' '+($r.value|ConvertTo-Json -Compress -Depth 6))};$checks.Add(@{name=$name;result='pass';status=$r.status;ms=$r.ms});Write-Output ('PASS '+$name)}
$name='qa_short_'+[DateTimeOffset]::UtcNow.ToUnixTimeSeconds();$password=[guid]::NewGuid().ToString()+'Aa12!'
Check '真实注册' (CallApi '/api/auth/register' 'POST' @{username=$name;password=$password;password_confirmation=$password})
$r=CallApi '/api/sessions' 'POST' @{};Check '创建隔离验收练习' $r;$sid=$r.value.session_id;$ver=$r.value.state_version;$rev=$r.value.research_revision
$turns=[System.Collections.Generic.List[object]]::new()
try{
 foreach($text in @('我想研究教育与工资的关系','个人，2010至2020年','主要是工资这些吧？还有别的指标吗？','具体指标有哪些？')){
  $r=CallApi '/api/research/chat' 'POST' @{session_id=$sid;state_version=$ver;research_revision=$rev;request_id=[guid]::NewGuid().ToString();message=$text;method_explicit=$false;profile=@{row_count=0;columns=@()}}
  Check '真实模型多轮研究辅导' $r;$ver=$r.value.state_version;$rev=$r.value.research_revision
  if($r.value.message.output.mode -in @('rules','manual','checklist') -or $r.value.message.output.error_type){throw ('真实模型失败 '+($r.value.message.output|Select-Object mode,error_type,diagnostics|ConvertTo-Json -Depth 8 -Compress))}
  if($r.value.message.content -match 'lesson_\d|analysis_context|回答错误|需修订'){throw '内部编号或批改口吻进入普通辅导'}
  if($r.value.message.content.Length -gt 380){throw '当前回复超出短回复范围'}
  if($text -match '全部时期' -and $r.value.research_summary.fields.period.status -ne 'awaiting_data'){throw '时期被虚构明确'}
  if($text -match '不知道单位' -and ($r.value.research_summary.fields.unit.status -ne 'unknown' -or $r.value.message.dialogue.choices.Count -lt 2)){throw '未知单位未解释并给选项'}
  if($text -match '指标'){if($r.value.message.dialogue.choices.Count -ne 3 -or $r.value.message.content -notmatch '月工资|年度劳动收入|小时工资'){throw '没有先回答指标建议或未给三项选择'};if($r.value.research_summary.fields.outcome.value -match '哪些|别的|吗|[？?]'){throw '咨询问题误写成指标'}}
  $turns.Add(@{input=$text;reply=$r.value.message.content;question=$r.value.message.dialogue.current_question.field;summary=$r.value.research_summary;model=$r.value.message.output.model;mode=$r.value.message.output.mode})
 }
 $q=$r.value.message.dialogue.current_question.id;$choice=$r.value.message.dialogue.choices|Where-Object id -eq 'wage_hourly';
 $r=CallApi '/api/research/chat' 'POST' @{session_id=$sid;state_version=$ver;research_revision=$rev;request_id=[guid]::NewGuid().ToString();question_id=$q;choice_id=$choice.id;message=$choice.answer;profile=@{row_count=0;columns=@()}};Check '真实点选小时工资' $r;$ver=$r.value.state_version;$rev=$r.value.research_revision;
 if($r.value.research_summary.fields.outcome.value -ne '小时工资'){throw '选定指标不一致'};if($r.value.message.output.error_type){throw '点选后的模型失败'}
 $turns.Add(@{input='点选小时工资';reply=$r.value.message.content;summary=$r.value.research_summary})
 if($r.value.research_summary.fields.unit.status -eq 'provided'){throw '真实单位被猜测'}
 $r=CallApi ('/api/sessions/'+$sid);Check '刷新持久统一摘要' $r
 if($r.value.research_summary.fields.outcome.value -ne '小时工资'){throw '刷新摘要不同'}
 $r=CallApi ('/api/sessions/'+$sid+'/learning-report/json');Check '报告读取持久对话' $r
 if($r.value.practical_messages.Count -ne 10){throw '真实对话记录计数不一致'}
 @{date=[DateTimeOffset]::UtcNow.ToString('o');scope='Actual published HTTP and real provider; not browser or numerical acceptance';checks=$checks;turns=$turns}|ConvertTo-Json -Depth 30|Set-Content outputs/public-smart-coaching.json -Encoding utf8
}catch{ @{date=[DateTimeOffset]::UtcNow.ToString('o');result='failed';failure=$_.Exception.Message;checks=$checks;turns=$turns}|ConvertTo-Json -Depth 30|Set-Content outputs/public-smart-coaching-failure.json -Encoding utf8;throw }finally{Check '仅清理本次测试练习' (CallApi ('/api/sessions/'+$sid) 'DELETE')}
