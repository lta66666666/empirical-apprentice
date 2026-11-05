$ErrorActionPreference='Stop'
$origin='https://empirical-apprentice-webr-trial.liskyler9.chatgpt.site'
$qaSession=New-Object Microsoft.PowerShell.Commands.WebRequestSession
$checks=[System.Collections.Generic.List[object]]::new()
function CallApi($path,$method='GET',$body=$null){
 $args=@{Uri=$origin+$path;Method=$method;WebSession=$qaSession;Headers=@{Origin=$origin};SkipHttpErrorCheck=$true;TimeoutSec=30}
 if($null -ne $body){$args.ContentType='application/json';$args.Body=($body|ConvertTo-Json -Depth 15 -Compress)}
 $sw=[Diagnostics.Stopwatch]::StartNew();$r=Invoke-WebRequest @args;$sw.Stop()
 $v=if($r.Headers.'Content-Type' -match 'json'){$r.Content|ConvertFrom-Json -Depth 30}else{$r.Content}
 return @{status=[int]$r.StatusCode;value=$v;ms=$sw.ElapsedMilliseconds}
}
function Check($name,$r,$expected=200){if($r.status -ne $expected){throw "$name status=$($r.status) $($r.value|ConvertTo-Json -Compress -Depth 4)"};$checks.Add(@{name=$name;result='pass';status=$r.status;ms=$r.ms});Write-Output "PASS $name"}
Check '匿名个人API拒绝' (CallApi '/api/sessions') 401
$qaName='qa_flow_'+[DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
$qaPassword=[guid]::NewGuid().ToString()+'Aa12!'
Check '真实注册' (CallApi '/api/auth/register' 'POST' @{username=$qaName;password=$qaPassword;password_confirmation=$qaPassword})
$r=CallApi '/home';Check '双入口首页' $r
if(([regex]::Matches($r.value,'<a ')).Count -ne 2){throw 'home anchors !=2'}
Check '导学HTML读取' (CallApi '/learn')
$r=CallApi '/api/sessions' 'POST' @{};Check '创建练习与版本迁移' $r;$sid=$r.value.session_id;$ver=$r.value.state_version
$r=CallApi "/api/sessions/$sid/course";Check '八阶段目录' $r
if($r.value.lessons.Count -ne 8){throw 'course count !=8'}
$r=CallApi "/api/sessions/$sid/course/open" 'POST' @{lesson_id=8;mode='preview';state_version=$ver};Check '后续预览' $r;$ver=$r.value.state_version
$r=CallApi "/api/sessions/$sid/course/open" 'POST' @{lesson_id=1;mode='continue';state_version=$ver};Check '进入第一阶段' $r;$ver=$r.value.state_version
$course=Get-Content outputs/public-course-fixture.json -Raw|ConvertFrom-Json -Depth 40
foreach($lesson in $course.lessons){
 foreach($step in $lesson.steps){
 $answer=if($step.type -in @('choice','calc')){[string]$step.answer}else{'模拟验收：研究问题、单位与因果条件需要核对。'}
 $r=CallApi "/api/sessions/$sid/lesson_action" 'POST' @{message=$answer;state_version=$ver}
 if($r.status -ne 200){throw "lesson $($lesson.id) failed: $($r.value|ConvertTo-Json -Compress -Depth 5)"};$ver=$r.value.state_version
 }
 $r=CallApi "/api/sessions/$sid/lesson_action" 'POST' @{message='稍后补写，继续';state_version=$ver}
 Check "阶段$($lesson.id)完成" $r;$ver=$r.value.state_version
}
$r=CallApi "/api/sessions/$sid";Check '全部课程持久恢复' $r
if($r.value.lesson_records.Count -ne 8 -or $r.value.learning_context.status -ne 'completed'){throw 'course incomplete'}
Check '旧客户端无版本写入拒绝' (CallApi "/api/sessions/$sid/variable-dictionary" 'PUT' @{dictionary=@{}}) 409
$j=CallApi "/api/sessions/$sid/learning-report/json";Check 'JSON学习报告' $j
$m=CallApi "/api/sessions/$sid/learning-report/md";Check 'MD学习报告' $m
if($j.value.lesson_records.Count -ne 8 -or $m.value -notmatch '导学位置与对话'){throw 'report inconsistent'}
Check '退出' (CallApi '/api/auth/logout' 'POST' @{})
Check '会话撤销' (CallApi '/api/auth/me') 401
Check '重新登录' (CallApi '/api/auth/login' 'POST' @{username=$qaName;password=$qaPassword})
$r=CallApi "/api/sessions/$sid";Check '重登课程恢复' $r
if($r.value.lesson_records.Count -ne 8){throw 'lost records'}
Check '删除验收练习' (CallApi "/api/sessions/$sid" 'DELETE')
Check '结束会话' (CallApi '/api/auth/logout' 'POST' @{})
@{date=[DateTimeOffset]::UtcNow.ToString('o');site=$origin;version=24;scope='Actual public HTTP API and HTML; not browser clicks, viewport or numerical execution';checks=$checks}|ConvertTo-Json -Depth 10|Set-Content outputs/public-interaction-acceptance.json -Encoding utf8
