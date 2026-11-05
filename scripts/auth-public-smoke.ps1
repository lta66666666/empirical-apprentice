param([string]$Base='https://empirical-apprentice-webr-trial.liskyler9.chatgpt.site',[switch]$Enforced,[switch]$SingleAccount)
$ErrorActionPreference='Stop'
$headers=@{Origin=$Base}
$ua='EmpiricalApprenticeAcceptance/1.0'
$jarA=New-Object Microsoft.PowerShell.Commands.WebRequestSession
$jarB=New-Object Microsoft.PowerShell.Commands.WebRequestSession
$nonce=[Guid]::NewGuid().ToString('N').Substring(0,12)
$password='Test!'+[Guid]::NewGuid().ToString('N')
function Request([string]$Path,[string]$Method='GET',$Body=$null,$Jar=$jarA){
  $parameters=@{Uri=$Base+$Path;Method=$Method;WebSession=$Jar;Headers=$headers;UserAgent=$ua;TimeoutSec=45;SkipHttpErrorCheck=$true}
  if($null-ne$Body){$parameters.Body=($Body|ConvertTo-Json -Compress);$parameters.ContentType='application/json'}
  Invoke-WebRequest @parameters
}
function Expect($Response,[int]$Status,[string]$Name){if($Response.StatusCode-ne$Status){throw ($Name+' status '+$Response.StatusCode+' '+$Response.Content.Substring(0,[Math]::Min(250,$Response.Content.Length)))};Write-Output ('PASS '+$Name)}
Expect (Request '/api/auth/register' 'POST' @{username='qa_mismatch_'+$nonce;password=$password;password_confirmation='Different-password-12!'}) 422 'mismatched confirmation rejected'
$clock=[Diagnostics.Stopwatch]::StartNew()
$a=Request '/api/auth/register' 'POST' @{username='qa_a_'+$nonce;password=$password;password_confirmation=$password}
Expect $a 200 'actual register'
Write-Output ('register_elapsed_ms='+$clock.ElapsedMilliseconds)
Expect (Request '/api/auth/me') 200 'auth me'
$homepageResponse=Request '/home';Expect $homepageResponse 200 'home';Write-Output ('home_anchor_count='+([regex]::Matches($homepageResponse.Content,'<a ')).Count);Write-Output ('home_script_count='+([regex]::Matches($homepageResponse.Content,'<script')).Count);if(([regex]::Matches($homepageResponse.Content,'<a ')).Count-ne2 -or $homepageResponse.Content-match '<button|<header|<nav'){throw 'home has extra controls'};Write-Output 'PASS two-only homepage'
$session=Request '/api/sessions' 'POST' @{};Expect $session 200 'create practice';$sid=($session.Content|ConvertFrom-Json).session_id
if(-not $SingleAccount){Expect (Request '/api/auth/register' 'POST' @{username='qa_b_'+$nonce;password=$password} $jarB) 200 'second account'
Expect (Request ('/api/sessions/'+$sid) 'GET' $null $jarB) 404 'other account blocked'}
Expect (Request '/api/auth/logout' 'POST' @{}) 200 'logout'
Expect (Request '/api/auth/me') 401 'revoked session'
$clock.Restart();Expect (Request '/api/auth/login' 'POST' @{username='QA_A_'+$nonce;password=$password}) 200 'actual login';Write-Output ('login_elapsed_ms='+$clock.ElapsedMilliseconds)
Expect (Request '/learn') 200 'learn module'
Expect (Request '/analysis') 200 'analysis module'
if($Enforced){$anon=New-Object Microsoft.PowerShell.Commands.WebRequestSession;Expect (Request '/api/sessions' 'GET' $null $anon) 401 'anonymous API blocked'}
Expect (Request ('/api/sessions/'+$sid) 'DELETE') 200 'remove QA practice'
Expect (Request '/api/auth/logout' 'POST' @{}) 200 'QA logout A'
if(-not $SingleAccount){Expect (Request '/api/auth/logout' 'POST' @{} $jarB) 200 'QA logout B'}
Write-Output 'PASS actual Sites auth gate; test accounts remain, no password or token output.'
