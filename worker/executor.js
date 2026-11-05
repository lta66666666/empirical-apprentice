export const engineMetadata = {
  statspai_cloud:{software:'python',execution_location:'cloud_native',label:'云端计算'},
  r_native:{software:'r',execution_location:'cloud_native',label:'云端原生 R'},
  browser_webr:{software:'r',execution_location:'browser_webr',label:'浏览器 webR'},
  stata_native:{software:'stata',execution_location:'cloud_native',label:'云端 Stata'},
};
export async function digest(value){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(b=>b.toString(16).padStart(2,'0')).join('');}
export async function nodeRequest(env,owner,path,body,method=body===undefined?'GET':'POST') {
  if(!env.EXECUTOR_URL||!env.EXECUTOR_SECRET)throw new Error('云端执行节点尚未配置；可明确选择浏览器 webR 后重新确认。');
  const url=new URL(env.EXECUTOR_URL);
  const internal=url.protocol==='http:'&&url.port==='8000'&&!url.username&&!url.password&&((env.EXECUTOR_INTERNAL_HOST==='executor'&&url.hostname==='executor')||(env.EXECUTOR_INTERNAL_HOST==='loopback'&&url.hostname==='127.0.0.1'&&url.pathname==='/'&&!url.search&&!url.hash));
  if(url.protocol!=='https:'&&!internal&&!(env.EXECUTOR_LOCAL_TEST==='true'&&url.hostname==='127.0.0.1'))throw new Error('执行节点必须使用 HTTPS 或部署中受限的内部网络。');
  const route='/v1/'+path,raw=body===undefined?'':JSON.stringify(body),stamp=String(Math.floor(Date.now()/1000)),id=crypto.randomUUID();
  const canonical=[method,route,stamp,id,owner,await digest(raw)].join('\n');
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(env.EXECUTOR_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const signature=[...new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(canonical)))].map(b=>b.toString(16).padStart(2,'0')).join('');
  const response=await fetch(new URL(route,url),{method,headers:{'Content-Type':'application/json','X-EA-Time':stamp,'X-EA-Request':id,'X-EA-Owner':owner,'X-EA-Signature':signature},...(body!==undefined?{body:raw}:{}),signal:AbortSignal.timeout(15000)});
  const result=await response.json();if(!response.ok){const e=new Error(String(result.detail||'执行节点请求失败').slice(0,500));e.status=response.status;throw e;}return result;
}
export async function engineCapabilities(env,owner){
  const unavailable={ready:false,status:'未配置',reason:'云端执行节点尚未配置'};
  let remote={statspai_cloud:unavailable,r_native:unavailable,stata_native:{ready:false,status:'授权待确认',reason:'网站授权与 Linux 运行尚未验收'},eviews_native:{ready:false,status:'未接入',reason:'尚无适用的网站集成方案'}};
  if(env.EXECUTOR_URL&&env.EXECUTOR_SECRET)try{remote={...remote,...await nodeRequest(env,owner,'capabilities')};}catch(e){remote.statspai_cloud=remote.r_native={ready:false,status:'暂时不可用',reason:e.message};}
  return {...remote,browser_webr:{ready:true,status:'需在本机初始化',reason:'浏览器 webR；关闭页面会中断当前计算'}};
}
export async function syncSessionNodes(env,state){
  if(!env.EXECUTOR_URL||!env.EXECUTOR_SECRET)return;
  try{await nodeRequest(env,state.owner_id,'sessions/activity',{session_id:state.session_id,expires_at:state.last_activity+7*86400});}catch{} // Expiry failures do not extend remote retention.
}
export async function deleteSessionNodes(env,state){
  const row=await env.DB.prepare('SELECT id FROM jobs WHERE session_id=? AND owner=? AND body LIKE ? LIMIT 1').bind(state.session_id,state.owner_id,'%cloud_native%').first();
  if(row)await nodeRequest(env,state.owner_id,'sessions/delete',{session_id:state.session_id});
}
