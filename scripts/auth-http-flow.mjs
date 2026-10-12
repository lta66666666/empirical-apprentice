import assert from 'node:assert/strict';
const origin=process.env.EA_TEST_URL||'http://127.0.0.1:8788';let cookie='';const password='Flow-password-12!',username='flow_'+Date.now();
async function call(path,body,method=body?'POST':'GET',credentials=cookie){const r=await fetch(origin+path,{method,headers:{Origin:origin,Cookie:credentials,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});if(r.headers.get('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];return {status:r.status,body:r.headers.get('content-type')?.includes('json')?await r.json():await r.text()};}
assert.equal((await call('/api/auth/register',{username,password})).status,422);
assert.equal((await call('/api/auth/register',{username,password,password_confirmation:'Different-password-12!'})).status,422);
assert.equal((await call('/api/auth/register',{username,password,password_confirmation:password})).status,200);
assert.equal((await call('/api/auth/me')).status,200);assert.equal((await call('/home')).status,200);
assert.equal((await call('/api/auth/register',{username:username.toUpperCase(),password,password_confirmation:password})).status,409);
const before=cookie;assert.equal((await call('/api/auth/logout',{})).status,200);assert.equal((await call('/api/auth/me',null,'GET',before)).status,401);
assert.equal((await call('/api/auth/login',{username,password:'Incorrect-password12!'})).status,401);
assert.equal((await call('/api/auth/login',{username:username.toUpperCase(),password})).status,200);
assert.equal((await call('/learn')).status,200);assert.equal((await call('/analysis')).status,200);assert.equal((await call('/api/auth/logout',{})).status,200);console.log('PASS real HTTP missing/mismatched confirmation, signup, duplicate username, login failure/success, module entry and logout revocation.');
