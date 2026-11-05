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
try{
 $r=CallApi ('/api/sessions/'+$sid+'/drafts/workbench') 'PUT' @{version=0;state_version=$ver;value=@{question='隔离保存测试'}};Check '线上草稿保存' $r;$ver=$r.value.state_version
 $r=CallApi ('/api/sessions/'+$sid+'/drafts');Check '线上草稿读取' $r;if($r.value.drafts.workbench.value.question -ne '隔离保存测试'){throw '保存值不一致'}
 $r=CallApi ('/api/sessions/'+$sid+'/drafts/workbench') 'PUT' @{version=0;state_version=$ver;value=@{question='错误旧版本'}};Check '旧版本拒绝覆盖' $r 409
 @{date=[DateTimeOffset]::UtcNow.ToString('o');checks=$checks}|ConvertTo-Json -Depth 8|Set-Content outputs/public-draft-check.json -Encoding utf8
}finally{Check '清理测试练习' (CallApi ('/api/sessions/'+$sid) 'DELETE')}
