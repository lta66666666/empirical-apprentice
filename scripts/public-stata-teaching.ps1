# Isolated synthetic acceptance. Never connect to the user's existing assistant.
$ErrorActionPreference='Stop'
$site='https://empirical-apprentice-webr-trial.liskyler9.chatgpt.site'
$local='http://127.0.0.1:18767'
$root=Split-Path $PSScriptRoot -Parent
$out=Join-Path $root ('outputs/public-stata-'+[DateTimeOffset]::UtcNow.ToUnixTimeSeconds())
New-Item -ItemType Directory -Path $out | Out-Null
$web=[Microsoft.PowerShell.Commands.WebRequestSession]::new()
$evidence=[Collections.Generic.List[object]]::new()
function SiteApi($path,$body=$null){
 if($body -and $body.session_id -and -not $body.ContainsKey('state_version')){$body.state_version=(SiteApi ('/api/sessions/'+$body.session_id)).state_version}
 $a=@{Uri=$site+$path;WebSession=$web;Headers=@{Origin=$site};TimeoutSec=35;SkipHttpErrorCheck=$true}
 if($null -ne $body){$a.Method='POST';$a.ContentType='application/json';$a.Body=$body|ConvertTo-Json -Depth 30 -Compress}
 try{$r=Invoke-WebRequest @a}catch{throw ('Website transport failure at '+$path+': '+$_.Exception.Message)}
 if([int]$r.StatusCode -notin @(200,202)){throw "Website HTTP $($r.StatusCode) at $path"}
 $r.Content|ConvertFrom-Json -Depth 70
}
function LocalApi($path,$body=$null){
 $a=@{Uri=$local+$path;Headers=@{Origin=$local;'X-Local-CSRF'=$script:csrf};TimeoutSec=30}
 if($null -ne $body){$a.Method='POST';$a.ContentType='application/json';$a.Body=$body|ConvertTo-Json -Depth 25 -Compress}
 (Invoke-WebRequest @a).Content|ConvertFrom-Json -Depth 70
}
function WaitLocal($condition){
 $deadline=[DateTime]::UtcNow.AddSeconds(150)
 while([DateTime]::UtcNow -lt $deadline){$value=LocalApi '/state';if(&$condition $value){return $value};if($value.task.status -eq 'failed'){throw $value.error};Start-Sleep -Milliseconds 500}
 throw ('Assistant deadline: '+$value.error)
}
$probe=[Net.Sockets.TcpClient]::new()
try{$probe.Connect('127.0.0.1',18767);throw 'Test port is occupied; refusing to take over'}catch [Net.Sockets.SocketException]{}finally{$probe.Dispose()}
$env:EA_LOCAL_PORT='18767';$env:EA_LOCAL_STATA_DIR=Join-Path $out 'assistant';$env:STATA_HOME='D:\Program Files\Stata18';$env:PYTHONPATH='D:\Program Files\Stata18\ado\base\py'
$proc=Start-Process -FilePath (Join-Path $root 'local_stata/.venv/Scripts/python.exe') -ArgumentList @((Join-Path $root 'local_stata/assistant.py')) -WorkingDirectory $root -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $out 'assistant.log') -RedirectStandardError (Join-Path $out 'assistant-error.log')
try{
 for($i=0;$i -lt 50;$i++){try{$html=(Invoke-WebRequest $local -TimeoutSec 2).Content;break}catch{Start-Sleep -Milliseconds 300}}
 $script:csrf=[regex]::Match($html,"const token='([a-f0-9]+)'").Groups[1].Value
 if(-not $csrf){throw 'Local approval page unavailable'}
 $password=[guid]::NewGuid().ToString()+'aA1!'
 $null=SiteApi '/api/auth/register' @{username=('stataqa_'+[DateTimeOffset]::UtcNow.ToUnixTimeSeconds());password=$password;password_confirmation=$password}
 $session=SiteApi '/api/sessions' @{};$sid=$session.session_id
 $pair=LocalApi '/pair' @{site=$site};$null=SiteApi '/api/local-stata/pairings/claim' @{session_id=$sid;code=$pair.code}
 foreach($method in @('ols','panel_fe','did')){
  $fixture=Get-Content (Join-Path $root "outputs/mcp-fixtures/$method.json") -Raw|ConvertFrom-Json -AsHashtable
  $file=Join-Path $out ($method+'.csv');[IO.File]::WriteAllText($file,$fixture.text,[Text.UTF8Encoding]::new($false))
  $hash=(Get-FileHash $file -Algorithm SHA256).Hash.ToLowerInvariant();$null=LocalApi '/input' @{path=$file}
  $null=WaitLocal {param($s) $s.paired -and $s.mcp_available}
  for($i=0;$i -lt 30;$i++){$info=SiteApi ('/api/local-stata/pairings?session_id='+$sid);if($info.pairing.input_sha256 -eq $hash){break};Start-Sleep -Seconds 1}
  if($info.pairing.input_sha256 -ne $hash){throw 'Website input summary did not synchronize'}
  $session=SiteApi ('/api/sessions/'+$sid);$plan=$fixture.plan;$plan.missing='drop';$plan.same_batch=$true
  $payload=@{session_id=$sid;kind='template';engine_id='stata_local_mcp';bridge_id='stata_mcp';compare=$false;request_id=[guid]::NewGuid().ToString();research_revision=$session.research_revision;input_sha256=$hash;confirmed=$true;plan=$plan}
  $task=(SiteApi '/api/local-stata/tasks' $payload).task
  if((SiteApi '/api/local-stata/tasks' $payload).task.id -ne $task.id){throw 'Duplicate task not idempotent'}
  $waiting=WaitLocal {param($s) $s.task.id -eq $task.id -and $s.task.status -eq 'awaiting_approval'}
  if($null -ne $waiting.result){throw 'Result available before execution approval'}
  for($i=0;$i -lt 30;$i++){$prepared=(SiteApi ('/api/local-stata/pairings?session_id='+$sid)).tasks|Where-Object id -eq $task.id;if($prepared.teaching_preview){break};Start-Sleep -Seconds 1}
  if(-not $prepared.teaching_preview){throw 'No frozen teaching preview'}
  $preview=$prepared.teaching_preview;$scriptFile=Join-Path $waiting.work_directory 'estimate.do'
  if((Get-FileHash $scriptFile -Algorithm SHA256).Hash.ToLowerInvariant() -ne $preview.script_sha256){throw 'Actual script differs from teaching preview'}
  $lines=[IO.File]::ReadAllLines($scriptFile);foreach($c in $preview.commands){if($lines[$c.line-1] -cne $c.text){throw 'Command text differs'}}
  $command=$preview.commands|Where-Object topic -eq 'estimate'|Select-Object -First 1
  $ref=@{session_id=$sid;task_id=$task.id;command_id=$command.id;preview_hash=$preview.preview_hash;intent='stata_explain';message='请说明这条实际命令的标准误设置，不假设单位或因果。';request_id=[guid]::NewGuid().ToString();research_revision=$session.research_revision}
  $reply=SiteApi '/api/research/chat' $ref
  if($reply.message.stata_reference.task_id -ne $task.id -or $reply.research_revision -ne $session.research_revision){throw 'Teaching task/version mismatch'}
  if($reply.message.output.error_type){throw ('Actual model explanation unavailable: '+$reply.message.output.error_type)}
  $null=LocalApi '/approve' @{};$ready=WaitLocal {param($s) $s.task.id -eq $task.id -and $s.task.status -eq 'awaiting_upload' -and -not $s.sync_pending}
  $before=(SiteApi ('/api/local-stata/pairings?session_id='+$sid)).tasks|Where-Object id -eq $task.id
  if($null -ne $before.result){throw 'Result published before upload approval'}
  $null=LocalApi '/upload' @{}
  $saved=(SiteApi ('/api/local-stata/pairings?session_id='+$sid)).tasks|Where-Object id -eq $task.id
  if($saved.status -ne 'succeeded' -or $saved.result.n_used -notin @(160,384)){throw 'Real estimate not saved'}
  $null=SiteApi '/api/local-stata/tasks/reflection' @{session_id=$sid;task_id=$task.id;record_version=$saved.record_version;answer='这是模拟数据分析。系数是在当前控制变量与样本条件下的关联，不能仅据显著性判断因果；单位和识别条件仍需核对。'}
  $report=SiteApi ('/api/sessions/'+$sid+'/learning-report/json');$reported=$report.local_stata_tasks|Where-Object id -eq $task.id
  if($reported.record_version -ne 3 -or $reported.result.n_used -ne $saved.result.n_used){throw 'Persistent report mismatch'}
  $evidence.Add(@{method=$method;status='passed';task_id=$task.id;n_used=$saved.result.n_used;teaching_reply=$reply.message.content;script_sha256=$preview.script_sha256;record_version=$reported.record_version})
  @{scope='Production API and real local Stata; not browser or phone acceptance';checks=$evidence}|ConvertTo-Json -Depth 20|Set-Content (Join-Path $out 'evidence.json') -Encoding utf8
  Write-Output ('PASS public Stata '+$method+' pair/preview/model/approval/execute/upload/reflection/report')
 }
}catch{
 @{status='failed';failure=$_.Exception.Message;checks=$evidence}|ConvertTo-Json -Depth 20|Set-Content (Join-Path $out 'failure.json') -Encoding utf8
 throw
}finally{
 if(-not $proc.HasExited){Stop-Process -Id $proc.Id; $proc.WaitForExit(10000)|Out-Null}
}
