function canonical(value){
  if(Array.isArray(value))return value.map(canonical);
  if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])]));
  return value;
}
export async function requestIdentity(body){
  const id=body.request_id??null;
  if(id!==null&&(typeof id!=='string'||!/^[A-Za-z0-9_-]{8,80}$/.test(id))){const error=Error('请求编号无效，请重新发起操作。');error.status=422;throw error;}
  const {state_version,request_id,...content}=body;
  const raw=JSON.stringify(canonical(content));
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(raw));
  return {id,sha256:[...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join('')};
}
export async function repeatedTask(env,table,owner,session,identity){
  if(!identity.id)return null;
  const row=await env.DB.prepare(`SELECT body,request_sha256 FROM ${table} WHERE owner=? AND session_id=? AND request_id=?`).bind(owner,session,identity.id).first();
  if(!row)return null;
  if(row.request_sha256!==identity.sha256){const error=Error('同一请求编号的内容已变化，请重新核对并提交。');error.status=409;throw error;}
  return JSON.parse(row.body);
}
