import assert from 'node:assert/strict';
import {openStorage} from '../standalone/storage.mjs';
import worker from '../dist/server/index.js';
import {newSession,saveSession} from '../worker/sessions.js';
const storage=await openStorage('outputs/auth-acceptance-'+Date.now()),env={DB:storage.DB,FILES:storage.FILES};
const origin='https://example.test';let credentials='';
async function call(path,method='GET',body,cookie=credentials,ip='192.0.2.1'){
  const response=await worker.fetch(new Request(origin+path,{method,headers:{Origin:origin,'CF-Connecting-IP':ip,...(cookie?{Cookie:cookie}:{}),...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})}),env);
  const type=response.headers.get('content-type')||'',value=type.includes('json')?await response.json():await response.text();return {status:response.status,value,cookie:response.headers.get('set-cookie')?.split(';')[0],headers:response.headers};
}
try{
  assert.equal((await call('/home')).status,303);assert.equal((await call('/api/sessions')).status,401);
  assert.equal((await call('/api/auth/register','POST',{username:'student_a',password:'short'})).status,422);
  const started=performance.now(),a=await call('/api/auth/register','POST',{username:'Student_A',password:'Test-password-12!'});assert.equal(a.status,200);credentials=a.cookie;const accountA=a.value.user.id;
  assert.match(a.headers.get('set-cookie'),/HttpOnly/);assert.match(a.headers.get('set-cookie'),/Secure/);assert.match(a.headers.get('set-cookie'),/SameSite=Lax/);
  const home=await call('/home');assert.equal(home.status,200);assert.equal((home.value.match(/<a /g)||[]).length,2);assert.equal(/<script|<button|<nav|<header/.test(home.value),false);
  const session=(await call('/api/sessions','POST')).value;assert.ok(session.session_id);
  const b=await call('/api/auth/register','POST',{username:'student_b',password:'Another-password-12!'},'', '192.0.2.2');assert.equal(b.status,200);
  assert.equal((await call('/api/sessions/'+session.session_id,'GET',undefined,b.cookie)).status,404);
  assert.equal((await call('/api/auth/register','POST',{username:'STUDENT_A',password:'Test-password-12!'},'', '192.0.2.3')).status,409);
  assert.equal((await call('/api/auth/login','POST',{username:'student_a',password:'Wrong-password-12!'},'', '192.0.2.3')).status,401);
  const legacyOwner=crypto.randomUUID(),legacy=newSession(legacyOwner);await saveSession(env,legacy);
  const before=await env.DB.prepare('SELECT last_activity FROM sessions WHERE id=?').bind(legacy.session_id).first();
  const claimCookie=credentials+'; ea_owner='+legacyOwner;
  assert.equal((await call('/api/auth/legacy-claim','GET',undefined,claimCookie)).value.count,1);
  assert.equal((await call('/api/auth/legacy-claim','POST',{confirmed:true},claimCookie)).status,200);
  assert.deepEqual(await env.DB.prepare('SELECT last_activity FROM sessions WHERE id=?').bind(legacy.session_id).first(),before);
  assert.equal((await call('/api/auth/legacy-claim','GET',undefined,b.cookie+'; ea_owner='+legacyOwner)).value.count,0);
  assert.equal((await call('/api/sessions/'+legacy.session_id)).status,200);
  assert.equal((await call('/api/sessions')).value.sessions.length,2);
  // Claim itself must not refresh the prior activity timestamp.
  const preserved=await env.DB.prepare('SELECT claimed_at FROM account_owners WHERE owner=?').bind(legacyOwner).first();assert.ok(preserved);
  for(const intent of ['analysis','knowledge','guided','reflection']){const fresh=(await call('/api/sessions/'+session.session_id)).value;const response=await call('/api/research/chat','POST',{session_id:session.session_id,research_revision:fresh.research_revision,message:'请解释OLS',intent,profile:{row_count:0,columns:[]}});assert.equal(response.status,200);assert.ok(['analysis','knowledge','guided'].includes(response.value.display_mode));}
  const secret=await env.DB.prepare('SELECT password_hash FROM accounts WHERE id=?').bind(accountA).first();assert.match(secret.password_hash,/^\$2[ab]\$12\$/);assert.equal(secret.password_hash.includes('Test-password'),false);
  assert.equal((await worker.fetch(new Request(origin+'/api/auth/logout',{method:'POST',headers:{Cookie:credentials,Origin:'https://elsewhere.test'}}),env)).status,403);
  assert.equal((await call('/static/home.html','GET',undefined,'')).status,303);
  const concurrentOwner=crypto.randomUUID(),concurrentLegacy=newSession(concurrentOwner);await saveSession(env,concurrentLegacy);
  const claims=await Promise.all([call('/api/auth/legacy-claim','POST',{confirmed:true},credentials+'; ea_owner='+concurrentOwner),call('/api/auth/legacy-claim','POST',{confirmed:true},b.cookie+'; ea_owner='+concurrentOwner)]);assert.equal(claims.filter(r=>r.status===200).length,1);
  await env.DB.prepare("INSERT INTO auth_attempts VALUES('rate-test','register',?, '',?)").bind(await (await import('../worker/auth.js')).digest('192.0.2.90'),Date.now()).run();
  for(let i=0;i<4;i++)await env.DB.prepare("INSERT INTO auth_attempts VALUES(?,'register',?,'',?)").bind('rate-'+i,await (await import('../worker/auth.js')).digest('192.0.2.90'),Date.now()).run();
  assert.equal((await call('/api/auth/register','POST',{username:'rate_test',password:'Another-password-12!'},'','192.0.2.90')).status,429);
  const loggedOut=await call('/api/auth/logout','POST',{});assert.equal(loggedOut.status,200);assert.equal((await call('/api/auth/me')).status,401);
  const login=await call('/api/auth/login','POST',{username:'STUDENT_A',password:'Test-password-12!'},'', '192.0.2.4');assert.equal(login.status,200);credentials=login.cookie;
  assert.equal((await call('/learn')).status,200);assert.equal((await call('/analysis')).status,200);
  await env.DB.prepare('UPDATE auth_sessions SET expires_at=0').run();assert.equal((await call('/api/sessions')).status,401);
  console.log('PASS actual cost12 hashing, login/logout/expiry, private API isolation, two-only home, legacy ownership and chat modes. Total ms:',Math.round(performance.now()-started));
}finally{storage.close();}
