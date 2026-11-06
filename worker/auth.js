import {hash,compare} from './bcryptjs-3.0.3.js';
const WEEK=604800000,enc=new TextEncoder();
const json=(body,status=200,headers={})=>Response.json(body,{status,headers:{'Cache-Control':'no-store',...headers}});
const schemaReady=new WeakMap();
export async function ensureAuthSchema(env){
  if(!env.DB)return;
  if(!schemaReady.has(env.DB))schemaReady.set(env.DB,(async()=>{
    for(const statement of [
      'CREATE TABLE IF NOT EXISTS accounts(id TEXT PRIMARY KEY,username TEXT NOT NULL UNIQUE,password_hash TEXT NOT NULL,primary_owner TEXT NOT NULL UNIQUE,created_at INTEGER NOT NULL)',
      'CREATE TABLE IF NOT EXISTS account_owners(owner TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES accounts(id),kind TEXT NOT NULL,claimed_at INTEGER NOT NULL)',
      'CREATE INDEX IF NOT EXISTS account_owners_user ON account_owners(user_id)',
      'CREATE TABLE IF NOT EXISTS auth_sessions(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES accounts(id),expires_at INTEGER NOT NULL)',
      'CREATE INDEX IF NOT EXISTS auth_sessions_expiry ON auth_sessions(expires_at)',
      'CREATE TABLE IF NOT EXISTS auth_attempts(id TEXT PRIMARY KEY,kind TEXT NOT NULL,source TEXT NOT NULL,username TEXT NOT NULL,created_at INTEGER NOT NULL)',
      'CREATE INDEX IF NOT EXISTS auth_attempts_window ON auth_attempts(kind,created_at,source,username)'
    ])await env.DB.prepare(statement).run();
  })().catch(e=>{schemaReady.delete(env.DB);throw e;}));
  await schemaReady.get(env.DB);
}
export async function digest(value){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode(value)))].map(x=>x.toString(16).padStart(2,'0')).join('');}
export function cookie(request,name){return (request.headers.get('Cookie')||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(name+'='))?.slice(name.length+1)||'';}
function authCookie(request,value,seconds=604800){return `ea_auth=${value}; HttpOnly; ${new URL(request.url).protocol==='https:'?'Secure; ':''}SameSite=Lax; Path=/; Max-Age=${seconds}`;}
export async function identity(request,env){
  await ensureAuthSchema(env);
  const token=cookie(request,'ea_auth');if(!/^[a-f0-9]{64}$/.test(token))return null;
  const row=await env.DB.prepare('SELECT a.id,a.username,a.primary_owner FROM auth_sessions s JOIN accounts a ON a.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?').bind(await digest(token),Date.now()).first();
  if(!row)return null;
  const owners=await env.DB.prepare('SELECT owner FROM account_owners WHERE user_id=?').bind(row.id).all();return {...row,owners:owners.results.map(x=>x.owner)};
}
async function loginSession(request,env,user){const token=[...crypto.getRandomValues(new Uint8Array(32))].map(x=>x.toString(16).padStart(2,'0')).join('');await env.DB.prepare('INSERT INTO auth_sessions VALUES(?,?,?)').bind(await digest(token),user.id,Date.now()+WEEK).run();return json({user:{id:user.id,username:user.username},redirect:'/home'},200,{'Set-Cookie':authCookie(request,token)});}
export async function authEndpoint(request,env,path){
  if(!env.DB)return json({detail:'账号存储暂时不可用'},503);
  if(!['GET','HEAD'].includes(request.method)&&request.headers.get('Origin')!==new URL(request.url).origin)return json({detail:'请求来源不允许'},403);
  const user=await identity(request,env);
  if(path==='/api/auth/me')return user?json({user:{id:user.id,username:user.username},retention_days:7}):json({detail:'请先登录'},401);
  if(path==='/api/auth/logout'&&request.method==='POST'){const token=cookie(request,'ea_auth');if(token)await env.DB.prepare('DELETE FROM auth_sessions WHERE token_hash=?').bind(await digest(token)).run();return json({logged_out:true},200,{'Set-Cookie':authCookie(request,'',0)});}
  if(path==='/api/auth/legacy-claim'){
    if(!user)return json({detail:'请先登录'},401);
    const legacy=cookie(request,'ea_owner');if(!/^[0-9a-f-]{36}$/.test(legacy))return json({count:0});
    const bound=await env.DB.prepare('SELECT user_id FROM account_owners WHERE owner=?').bind(legacy).first();
    if(bound&&bound.user_id!==user.id)return json({count:0,detail:'无法认领'},request.method==='GET'?200:409);
    const count=(await env.DB.prepare('SELECT COUNT(*) AS n FROM sessions WHERE owner=? AND last_activity>?').bind(legacy,Date.now()-WEEK).first()).n;
    if(request.method==='GET')return json({count,already_claimed:!!bound,retention_days:7});
    const body=await request.json().catch(()=>null);if(request.method!=='POST'||body?.confirmed!==true)return json({detail:'请明确确认认领'},422);
    if(!count&&!bound)return json({detail:'没有可认领的有效记录'},409);
    try{await env.DB.prepare("INSERT INTO account_owners(owner,user_id,kind,claimed_at) SELECT ?,?,'legacy',? WHERE NOT EXISTS(SELECT 1 FROM account_owners WHERE owner=?) AND EXISTS(SELECT 1 FROM sessions WHERE owner=? AND last_activity>?)").bind(legacy,user.id,Date.now(),legacy,legacy,Date.now()-WEEK).run();}catch{}
    const claimed=await env.DB.prepare('SELECT user_id FROM account_owners WHERE owner=?').bind(legacy).first();if(claimed?.user_id!==user.id)return json({detail:'无法认领'},409);
    return json({claimed:true,count},200,{'Set-Cookie':'ea_owner=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0'});
  }
  if(!['/api/auth/register','/api/auth/login'].includes(path)||request.method!=='POST')return json({detail:'接口不存在'},404);
  const raw=await request.text();if(raw.length>2048)return json({detail:'请求过大'},413);
  let body;try{body=JSON.parse(raw);}catch{return json({detail:'请求格式无效'},400);}
  const username=String(body.username||'').toLowerCase(),password=body.password;
  if(!/^[a-z0-9_]{3,32}$/.test(username)||typeof password!=='string'||[...password].length<12||enc.encode(password).length>72)return json({detail:'用户名为3–32位字母、数字或下划线；密码至少12个字符且不超过72个UTF-8字节。'},422);
  if(path.endsWith('/register')&&(typeof body.password_confirmation!=='string'||body.password_confirmation!==password))return json({detail:'两次输入的密码不一致，请重新输入。'},422);
  const now=Date.now(),source=await digest(request.headers.get('CF-Connecting-IP')||request.headers.get('X-EA-Client-IP')||request.headers.get('X-Real-IP')||'unknown');
  await env.DB.prepare('DELETE FROM auth_attempts WHERE created_at<?').bind(now-3600000).run();await env.DB.prepare('DELETE FROM auth_sessions WHERE expires_at<=?').bind(now).run();
  const register=path.endsWith('/register'),kind=register?'register':'login';
  const attempts=(await env.DB.prepare('SELECT COUNT(*) AS n FROM auth_attempts WHERE kind=? AND created_at>? AND (source=? OR (?=\'login\' AND username=?))').bind(kind,now-(register?3600000:900000),source,kind,username).first()).n;
  if(attempts>=(register?5:10))return json({detail:'尝试次数过多，请稍后再试。'},429);
  // Reserve before password computation to enforce concurrency limits.
  const reservation=crypto.randomUUID();const reserved=await env.DB.prepare('INSERT INTO auth_attempts SELECT ?,?,?,?,? WHERE (SELECT COUNT(*) FROM auth_attempts WHERE kind=? AND created_at>? AND (source=? OR (?=\'login\' AND username=?)))<?').bind(reservation,kind,source,username,now,kind,now-(register?3600000:900000),source,kind,username,register?5:10).run();
  if(!reserved.meta.changes)return json({detail:'尝试次数过多，请稍后再试。'},429);
  if(register){
    if(await env.DB.prepare('SELECT id FROM accounts WHERE username=?').bind(username).first())return json({detail:'用户名已使用'},409);
    const id=crypto.randomUUID(),owner=crypto.randomUUID(),passwordHash=await hash(password,12);
    try{await env.DB.batch([env.DB.prepare('INSERT INTO accounts VALUES(?,?,?,?,?)').bind(id,username,passwordHash,owner,now),env.DB.prepare("INSERT INTO account_owners VALUES(?,?,'primary',?)").bind(owner,id,now)]);}catch{if(await env.DB.prepare('SELECT id FROM accounts WHERE username=?').bind(username).first())return json({detail:'用户名已使用'},409);return json({detail:'账号存储暂时不可用'},503);}
    return loginSession(request,env,{id,username});
  }
  const found=await env.DB.prepare('SELECT id,username,password_hash FROM accounts WHERE username=?').bind(username).first();
  // Same cost for nonexistent usernames; no account existence disclosure.
  const valid=found?await compare(password,found.password_hash):(await hash(password,12),false);
  if(!valid)return json({detail:'账号或密码错误'},401);
  await env.DB.prepare('DELETE FROM auth_attempts WHERE id=?').bind(reservation).run();return loginSession(request,env,found);
}
export async function requestOwner(request,env,user,path){
  const url=new URL(request.url);let session=path.match(/^\/api\/(?:sessions|tutorial)\/([a-f0-9]{12})(?:\/|$)/)?.[1]||url.searchParams.get('session_id'),job=path.match(/^\/api\/research\/jobs\/([^/]+)/)?.[1];
  if(!['GET','HEAD'].includes(request.method)){const body=await request.clone().json().catch(()=>null);session ||= body?.session_id;job ||= body?.job_id;}
  let row;if(job)row=await env.DB.prepare('SELECT owner FROM jobs WHERE id=?').bind(job).first();else if(session)row=await env.DB.prepare('SELECT owner FROM sessions WHERE id=?').bind(session).first();
  if((session||job)&&(!row||!user.owners.includes(row.owner)))return null;
  return row?.owner||user.primary_owner;
}
