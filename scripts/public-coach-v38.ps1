$ErrorActionPreference='Stop'
$origin='https://empirical-apprentice-webr-trial.liskyler9.chatgpt.site'
$qaSession=[Microsoft.PowerShell.Commands.WebRequestSession]::new()
$evidence=[Collections.Generic.List[object]]::new()
function Api($path,$body=$null){
 $argsMap=@{Uri=$origin+$path;WebSession=$qaSession;Headers=@{Origin=$origin};TimeoutSec=35;SkipHttpErrorCheck=$true}
 if($null -ne $body){$argsMap.Method='POST';$argsMap.ContentType='application/json';$argsMap.Body=$body|ConvertTo-Json -Depth 30 -Compress}
 $watch=[Diagnostics.Stopwatch]::StartNew();$r=Invoke-WebRequest @argsMap;$watch.Stop()
 if([int]$r.StatusCode -ne 200){throw "HTTP $($r.StatusCode) at $path"}
 @{data=($r.Content|ConvertFrom-Json -Depth 70);ms=$watch.ElapsedMilliseconds}
}
$password=[guid]::NewGuid().ToString()+'aA1!'
$null=Api '/api/auth/register' @{username=('coachqa_'+[DateTimeOffset]::UtcNow.ToUnixTimeSeconds());password=$password;password_confirmation=$password}
$session=(Api '/api/sessions' @{}).data
try{
 foreach($text in @('我想研究医院服务效率，具体指标有哪些？','研究医院，就诊等待时间，不知道单位，想先用数据全部时期','更正，我想研究每名医生接诊人数，单位还没查到','我想换个主题，研究公交服务效率，有哪些可用指标？','只跑回归：用income对education和experience做OLS，计量单位未知，请进入方案核对')){
  $profile=if($text -like '只跑回归*'){@{row_count=160;columns=@('income','education','experience')|ForEach-Object {@{name=$_;numeric=$true;missing=0}}}}else{@{row_count=0;columns=@()}}
  $response=Api '/api/research/chat' @{session_id=$session.session_id;state_version=$session.state_version;research_revision=$session.research_revision;request_id=[guid]::NewGuid().ToString();message=$text;profile=$profile;method_explicit=$false}
  $session=(Api ('/api/sessions/'+$session.session_id)).data
  $m=$response.data.message
  $evidence.Add(@{input=$text;reply=$m.content;ms=$response.ms;origin=$m.dialogue.response_origin;mode=$m.output.mode;error_type=$m.output.error_type;diagnostics=$m.output.diagnostics;summary=$session.research_summary})
  if($m.dialogue.response_origin -ne 'model'){throw ('Actual model not available: '+$m.output.error_type)}
  if($m.content -match 'lesson_\d|analysis_context|回答错误|需修订'){throw 'Internal labels or grading tone in coaching'}
  $followUp=$m.dialogue.current_question.prompt
  if($followUp -and (([regex]::Matches($m.content,[regex]::Escape($followUp))).Count -ne 1 -or $m.content.Replace($followUp,'') -match '[？?]')){throw 'Repeated follow-up questions outside the current question'}
  if($text -like '研究医院*' -and ($session.research_summary.fields.object.value -notmatch '医院' -or $session.research_summary.fields.outcome.value -notmatch '等待时间')){throw 'Multi-field statement not preserved in summary'}
  if($text -like '研究医院*' -and $session.research_summary.fields.period.status -ne 'awaiting_data'){throw 'All periods incorrectly marked confirmed'}
  if($text -like '更正*' -and $session.research_summary.fields.outcome.value -notmatch '接诊人数'){throw 'Corrected outcome not preserved'}
  if($text -like '只跑回归*' -and (-not $m.output.ready -or $m.output.candidate.method -ne 'ols' -or $null -ne $m.dialogue.current_question)){throw 'Ready OLS should enter review, not repeat intake questions'}
  if($text -match '指标有哪些' -and $m.content -notmatch '等待|接诊|床位|效率'){throw 'Indicator inquiry was not answered'}
  Write-Output ('PASS actual model turn '+$evidence.Count+' ('+$response.ms+'ms)')
 }
 $knowledge=(Api '/api/knowledge?q=未知单位数值回归').data
 if($knowledge.knowledge_version -ne 'ea-kb-20261016-2'){throw 'Old knowledge version'}
 if(-not ($knowledge.materials|Where-Object id -eq 'textbook_units')){throw 'Original units card missing'}
 @{status='passed';date=[DateTimeOffset]::UtcNow.ToString('o');scope='Actual production provider, isolated synthetic practice; no numerical or physical-phone claim';turns=$evidence}|ConvertTo-Json -Depth 35|Set-Content outputs/public-coach-v38.json -Encoding utf8
}catch{
 @{status='failed';failure=$_.Exception.Message;date=[DateTimeOffset]::UtcNow.ToString('o');turns=$evidence}|ConvertTo-Json -Depth 35|Set-Content outputs/public-coach-v38.json -Encoding utf8
 throw
}
