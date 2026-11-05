import { fixtures } from './fixtures.js';
import { assets } from './assets.js';
import { handleSessions } from './sessions.js';
import { handleResearch } from './research.js';
import { cleanupExpired } from './retention.js';
import { handleTutorial } from './tutorial.js';
import { practiceCases } from './content.js';
import { handlePractical } from './practical.js';
import { handleLocalStata } from './local-stata.js';
import {authEndpoint,identity,requestOwner,cookie} from './auth.js';

const headers = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Cache-Control': 'no-store',
};

function staticResponse(path) {
  const key = path === '/' || path === '/app' ? '/static/index.html' : path;
  const encoded = assets[key];
  if (!encoded) return null;
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.csv': 'text/csv', '.md': 'text/markdown', '.svg': 'image/svg+xml', '.zip': 'application/zip' };
  const ext = /\.[a-z0-9]+$/i.exec(key)?.[0] || '';
  const binary = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
  return new Response(binary, { headers: { ...headers, 'Content-Type': (types[ext] || 'application/octet-stream') + (['.html', '.js', '.css', '.json', '.csv', '.md', '.svg'].includes(ext) ? '; charset=utf-8' : '') } });
}

const page = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>实证学徒 · Sites 技术试验</title>
<style>body{font:16px/1.6 system-ui,sans-serif;background:#f7f7f5;color:#182329;margin:0}main{max-width:850px;margin:auto;padding:24px}h1{font-size:1.7rem}section{background:#fff;border:1px solid #d8dfde;border-radius:14px;padding:20px;margin:18px 0}button{border:0;background:#086d66;color:#fff;border-radius:8px;padding:10px 16px;margin:6px 8px 6px 0;font:inherit;cursor:pointer}button:disabled{opacity:.5}pre{white-space:pre-wrap;word-break:break-word;background:#102421;color:#e9f6f1;padding:16px;border-radius:8px;min-height:170px}small{color:#52615f}</style></head><body><main><h1>实证学徒 · Sites 技术试验</h1><p>本页仅验证运行条件。这里的 R/fixest 在访问者的浏览器中执行，输出不是服务器认证结果。</p><section><h2>运行环境</h2><p id="isolation">检查中…</p><p id="versions">尚未初始化 webR</p><button id="init">初始化 webR 并安装 fixest</button><button id="long" disabled>运行 30 秒中断测试</button><button id="interrupt" disabled>中断当前计算</button></section><section><h2>现有三份模拟数据</h2><small>沿用 V9 固定随机种子生成的数据；依次运行 OLS、双向固定效应、同批 DID。</small><div><button class="run" data-case="ols" disabled>运行 OLS</button><button class="run" data-case="panel_fe" disabled>运行固定效应</button><button class="run" data-case="did" disabled>运行同批 DID</button></div></section><section><h2>试验日志</h2><pre id="log"></pre></section></main>
<script type="module">
const out=document.querySelector('#log');let webR=null;let busy=false;
const log=(x)=>{out.textContent+='['+new Date().toLocaleTimeString()+'] '+x+'\\n';};
const isolated=window.crossOriginIsolated;
document.querySelector('#isolation').textContent='crossOriginIsolated = '+isolated+'；SharedArrayBuffer = '+(typeof SharedArrayBuffer!=='undefined');
log('页面隔离：'+isolated);
document.querySelector('#init').onclick=async()=>{
  const btn=document.querySelector('#init');btn.disabled=true;
  try{
    log('下载 webR 0.6.0…');const {WebR}=await import('https://webr.r-wasm.org/v0.6.0/webr.mjs');
    webR=new WebR();await webR.init();log('webR 已初始化，开始安装 fixest');
    const install=await webR.evalRString("tryCatch({webr::install('fixest', repos=c('https://lrberge.r-universe.dev','https://repo.r-wasm.org')); v <- as.character(packageVersion('fixest')); if (v != '0.14.2') stop(paste('需要 fixest 0.14.2，实际安装', v)); paste('R',getRversion(),'fixest',v)},error=function(e)paste('ERROR',conditionMessage(e)))");
    log(install);document.querySelector('#versions').textContent=install;
    if(install.startsWith('ERROR'))throw Error(install);
    document.querySelectorAll('.run').forEach(x=>x.disabled=false);
    document.querySelector('#long').disabled=false;
    document.querySelector('#interrupt').disabled=!isolated;
  }catch(e){log('初始化失败：'+(e?.message||String(e)));btn.disabled=false;}
};
document.querySelector('#interrupt').onclick=async()=>{if(!webR)return;try{webR.interrupt();log('已请求中断');}catch(e){log('中断失败：'+e.message);}};
document.querySelector('#long').onclick=async()=>{
  if(!webR||busy)return;busy=true;log('开始 30 秒中断测试');
  try { const result=await webR.evalRString("Sys.sleep(30); '30 秒测试自然完成'"); log(result); }
  catch(e){log('长计算被中断或失败：'+(e?.message||String(e)));}
  finally{busy=false;}
};
document.querySelectorAll('.run').forEach(btn=>btn.onclick=async()=>{
  if(!webR||busy)return;busy=true;document.querySelectorAll('.run').forEach(x=>x.disabled=true);
  const name=btn.dataset.case;try{
    const response=await fetch('/api/fixtures/'+name);if(!response.ok)throw Error('数据读取失败');
    const data=await response.json();await webR.FS.writeFile('/home/web_user/input.csv',new TextEncoder().encode(data.text));
    const p=data.plan;
    const rhs=name==='did'?'policy_effect':p.predictors.join(' + ');
    const formula=p.outcome+' ~ '+rhs+(name==='ols'?'':' | '+p.unit+' + '+p.time);
    const vcov=name==='ols'?"'hetero'":"~"+p.cluster;
    const code="d <- read.csv('/home/web_user/input.csv'); if ("+JSON.stringify(name)+" == 'did') { d$policy_effect <- d$treated * as.integer(d$year >= 2018) }; fit <- fixest::feols(as.formula("+JSON.stringify(formula)+"),data=d,vcov="+vcov+",nthreads=1,notes=FALSE); tab <- fixest::coeftable(fit); ci <- confint(fit,level=.95); paste(capture.output(print(cbind(tab,ci))),collapse='\\n')";
    log('开始浏览器执行 '+name+'，原始数据 '+(data.text.trimEnd().split('\\n').length-1)+' 行，公式 '+formula);
    const result=await webR.evalRString(code);log(name+' 执行结果：\\n'+result);
  }catch(e){log(name+' 执行失败：'+(e?.message||String(e)));}
  finally{busy=false;document.querySelectorAll('.run').forEach(x=>x.disabled=false);}
});
</script></body></html>`;

export default {
  async fetch(request, env) {
    const path = new URL(request.url).pathname;
    const preview=env.AUTH_ROLLOUT==='preview';
    if(preview&&['/','/app','/static/index.html'].includes(path))return staticResponse(path);
    if(preview&&path==='/trial')return new Response(page,{headers:{...headers,'Content-Type':'text/html; charset=utf-8'}});
    if(path.startsWith('/api/auth/'))return authEndpoint(request,env,path);
    if(['/','/app','/home','/login','/register','/learn','/analysis','/static/index.html','/static/home.html','/trial'].includes(path)){
      const user=env.DB?await identity(request,env):null;
      if(['/login','/register'].includes(path))return user?Response.redirect(new URL('/home',request.url),303):staticResponse('/static/auth.html');
      if(!user)return Response.redirect(new URL('/login?return_to='+encodeURIComponent(['/learn','/analysis'].includes(path)?path:'/home'),request.url),303);
      if(['/','/app','/static/index.html','/trial'].includes(path))return Response.redirect(new URL('/home',request.url),303);
      if(path==='/home'||path==='/static/home.html')return staticResponse('/static/home.html');
      const base=staticResponse('/static/index.html'),html=await base.text();
      const boot=`<script>window.EA_ACCOUNT=${JSON.stringify({id:user.id,username:user.username})};window.EA_MODULE=${JSON.stringify(path.slice(1))};</script><link rel="stylesheet" href="/static/module-layout.css?v=2"><link rel="stylesheet" href="/static/ui/theme.css">`;
      return new Response(html.replace('</head>',boot+'</head>').replace('</body>','<script defer src="/static/data-fragment.js?v=2"></script><script defer src="/static/module-layout.js?v=2"></script><script defer src="/static/analysis-dialogue.js?v=3"></script><script defer src="/static/conversation-workspace.js?v=2"></script><script defer src="/static/stata-learning.js?v=2"></script><script defer src="/static/stata-guide.js?v=2"></script><script defer src="/static/corresponding-learning.js?v=2"></script></body>'),{headers:{...headers,'Content-Type':'text/html; charset=utf-8'}});
    }
    if(path.startsWith('/api/local-stata/agent/'))return await handleLocalStata(request,env,null,path);
    if (path.startsWith('/api/sessions') || path.startsWith('/api/research') || path.startsWith('/api/tutorial') || path.startsWith('/api/local-stata/') || path==='/api/knowledge') {
      const isAgent=path.startsWith('/api/local-stata/agent/');
      if (!isAgent && !['GET', 'HEAD'].includes(request.method) && request.headers.get('Origin') !== new URL(request.url).origin) {
        return new Response('Forbidden', { status: 403, headers });
      }
      const user=isAgent?null:await identity(request,env);
      if(!isAgent&&!user&&!preview)return Response.json({detail:'请先登录'},{status:401,headers});
      const legacyCookie=cookie(request,'ea_owner'),legacyOwner=/^[0-9a-f-]{36}$/.test(legacyCookie)?legacyCookie:crypto.randomUUID();
      const owner=isAgent?'':user?await requestOwner(request,env,user,path):legacyOwner;
      if(!isAgent&&!owner)return Response.json({detail:'记录不存在'},{status:404,headers});
      if(user)env={...env,ACCOUNT_ID:user.id,ACCOUNT_OWNERS:user.owners};
      const response = (await handleLocalStata(request,env,owner,path)) ||
        (await handlePractical(request,env,owner,path)) ||
        (await handleTutorial(request, env, owner, path)) ||
        (await handleResearch(request, env, owner, path)) ||
        (path.startsWith('/api/sessions') ? await handleSessions(request, env, owner, path) : null);
      if (response) {
        const outputHeaders = new Headers(response.headers);
        for (const [key, value] of Object.entries(headers)) outputHeaders.set(key, value);
        if(preview&&!user&&!isAgent&&!/^[0-9a-f-]{36}$/.test(legacyCookie))outputHeaders.append('Set-Cookie',`ea_owner=${legacyOwner}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=604800`);
        return new Response(response.body, { status: response.status, headers: outputHeaders });
      }
    }
    if (path === '/trial') return new Response(page, { headers: { ...headers, 'Content-Type': 'text/html; charset=utf-8' } });
    if (path === '/' || path === '/app' || path.startsWith('/static/')) {
      const response = staticResponse(path);
      return response || new Response('Not found', { status: 404, headers });
    }
    if (path.startsWith('/api/fixtures/')) {
      const name = path.split('/').pop();
      if (!Object.hasOwn(fixtures, name)) return new Response('Not found', { status: 404, headers });
      return Response.json(fixtures[name], { headers });
    }
    if (path === '/api/health' && request.method === 'GET') {
      return Response.json({ status: 'ok', demo_mode: !env.MODEL_API_KEY,
        execution_location: 'browser_webr', storage: !!env.DB && !!env.FILES }, { headers });
    }
    if (path === '/api/cases' && request.method === 'GET') {
      return Response.json(Object.values(practiceCases).map((item) => ({ case_id: item.case_id,
        title: item.title, has_chart: !!item.event_study })), { headers });
    }
    if (/^\/api\/cases\/case_\d{3}$/.test(path) && request.method === 'GET') {
      const item = practiceCases[path.split('/').pop()];
      if (!item) return new Response('Not found', { status: 404, headers });
      return Response.json(Object.fromEntries(['case_id', 'title', 'data_source', 'data_description', 'event_study']
        .map((key) => [key, item[key] ?? null])), { headers });
    }
    if (path === '/api/environment') {
      const db = !!env.DB; const files = !!env.FILES;
      return Response.json({ db, files, execution_location: 'browser_webr', service_header_present: request.headers.has('OAI-Sites-Authorization') }, { headers });
    }
    if (path === '/api/retention/cleanup' && request.method === 'POST') {
      const token = env.CLEANUP_TOKEN;
      if (!token || request.headers.get('Authorization') !== 'Bearer ' + token) return new Response('Forbidden', { status: 403, headers });
      try { return Response.json(await cleanupExpired(env), { headers }); }
      catch { return new Response('Retention cleanup failed', { status: 503, headers }); }
    }
    if (path === '/api/probe' && request.method === 'POST') {
      if (request.headers.get('Origin') !== new URL(request.url).origin) return new Response('Forbidden', { status: 403, headers });
      if (!env.DB || !env.FILES) return new Response('Storage unavailable', { status: 503, headers });
      const id = crypto.randomUUID();
      const fileKey = 'retention-probe/' + id + '.txt';
      const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000;
      await env.FILES.put(fileKey, 'Sites retention feasibility probe; no student data.');
      try {
        await env.DB.prepare('INSERT INTO retention_probes (id,file_key,expires_at,running) VALUES (?,?,?,0)')
          .bind(id, fileKey, expiresAt).run();
      } catch (error) {
        await env.FILES.delete(fileKey);
        throw error;
      }
      return Response.json({ id, expires_at: expiresAt }, { headers });
    }
    if (path.startsWith('/api/probe/') && !path.startsWith('/api/probe/object/') && request.method === 'GET') {
      if (!env.DB || !env.FILES) return new Response('Storage unavailable', { status: 503, headers });
      const id = path.split('/').pop();
      const row = await env.DB.prepare('SELECT file_key,expires_at FROM retention_probes WHERE id=?').bind(id).first();
      if (!row) return new Response('Not found', { status: 404, headers });
      if (row.expires_at <= Date.now()) return new Response('Expired', { status: 410, headers });
      const obj = await env.FILES.get(row.file_key);
      if (!obj) return new Response('File missing', { status: 404, headers });
      return new Response(obj.body, { headers: { ...headers, 'Content-Type': 'text/plain; charset=utf-8' } });
    }
    if (path === '/api/probe/cleanup' && request.method === 'POST') {
      const token = env.CLEANUP_TOKEN;
      if (!token || request.headers.get('Authorization') !== 'Bearer ' + token) return new Response('Forbidden', { status: 403, headers });
      if (!env.DB || !env.FILES) return new Response('Storage unavailable', { status: 503, headers });
      const now = Date.now();
      const rows = await env.DB.prepare('SELECT id,file_key FROM retention_probes WHERE expires_at<=? AND running=0 LIMIT 100').bind(now).all();
      let removed = 0;
      for (const row of rows.results) {
        await env.FILES.delete(row.file_key);
        await env.DB.prepare('DELETE FROM retention_probes WHERE id=? AND expires_at<=? AND running=0').bind(row.id, now).run();
        removed++;
      }
      return Response.json({ removed, checked_at: now }, { headers });
    }
    if (path.startsWith('/api/probe/expire/') && request.method === 'POST') {
      const token = env.CLEANUP_TOKEN;
      if (!token || request.headers.get('Authorization') !== 'Bearer ' + token) return new Response('Forbidden', { status: 403, headers });
      if (!env.DB) return new Response('Storage unavailable', { status: 503, headers });
      const id = path.split('/').pop();
      const result = await env.DB.prepare('UPDATE retention_probes SET expires_at=? WHERE id=? AND running=0')
        .bind(Date.now() - 1, id).run();
      return Response.json({ updated: result.meta.changes }, { headers });
    }
    if (path.startsWith('/api/probe/running/') && request.method === 'POST') {
      const token = env.CLEANUP_TOKEN;
      if (!token || request.headers.get('Authorization') !== 'Bearer ' + token) return new Response('Forbidden', { status: 403, headers });
      if (!env.DB) return new Response('Storage unavailable', { status: 503, headers });
      const id = path.split('/').pop();
      const body = await request.json().catch(() => null);
      if (typeof body?.running !== 'boolean') return new Response('Invalid running flag', { status: 400, headers });
      const result = await env.DB.prepare('UPDATE retention_probes SET running=? WHERE id=?')
        .bind(body.running ? 1 : 0, id).run();
      return Response.json({ updated: result.meta.changes }, { headers });
    }
    if (path.startsWith('/api/probe/object/') && request.method === 'GET') {
      const token = env.CLEANUP_TOKEN;
      if (!token || request.headers.get('Authorization') !== 'Bearer ' + token) return new Response('Forbidden', { status: 403, headers });
      if (!env.FILES) return new Response('Storage unavailable', { status: 503, headers });
      const id = path.split('/').pop();
      if (!/^[0-9a-f-]{36}$/.test(id)) return new Response('Invalid ID', { status: 400, headers });
      const object = await env.FILES.head('retention-probe/' + id + '.txt');
      return Response.json({ exists: !!object }, { headers });
    }
    return new Response('Not found', { status: 404, headers });
  },
};
