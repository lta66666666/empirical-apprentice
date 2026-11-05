import http from 'node:http';
import {isIP} from 'node:net';
import { appendFile, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openStorage } from './storage.mjs';
import worker from '../dist/server/index.js';
import { cleanupExpired } from '../dist/server/retention.js';
import {startInterpretationDispatcher} from './interpretation-dispatcher.mjs';

const port=Number(process.env.PORT||8766),origin=new URL(process.env.PUBLIC_ORIGIN||`http://127.0.0.1:${port}`);
if(!['https:','http:'].includes(origin.protocol)||origin.pathname!=='/')throw Error('PUBLIC_ORIGIN must be an origin');
if(process.env.NODE_ENV==='production'&&origin.protocol!=='https:'&&process.env.EA_ALLOW_INSECURE_HTTP!=='true')throw Error('Production requires HTTPS PUBLIC_ORIGIN');
const storage=await openStorage(process.env.EA_DATA_DIR||fileURLToPath(new URL('../outputs/standalone/',import.meta.url)));
const WEBR_DIR=fileURLToPath(new URL('../static/webr/',import.meta.url));
const env={...process.env,DB:storage.DB,FILES:storage.FILES};let cleaning=false;
async function clean(){if(cleaning)return;cleaning=true;try{const result=await cleanupExpired(env);await appendFile(join(storage.root,'cleanup.jsonl'),JSON.stringify(result)+'\n');}catch{console.error('Retention cleanup failed; retry scheduled.');}finally{cleaning=false;}}
const timer=setInterval(clean,15*60*1000);timer.unref();
const stopInterpretations=startInterpretationDispatcher(env);
const server=http.createServer(async(req,res)=>{
  try{
    if(req.url==='/healthz'&&['GET','HEAD'].includes(req.method)){try{await storage.DB.prepare('SELECT 1').first();res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(req.method==='HEAD'?'':JSON.stringify({status:'ok'}));}catch{res.writeHead(503);res.end();}return;}
    // webR 运行时（含 18 MB wasm）直接从磁盘流式返回：正确 MIME + 不经过 base64 解码。
    if(req.url.startsWith('/static/webr/')&&['GET','HEAD'].includes(req.method)){
      const name=req.url.slice('/static/webr/'.length).split('?')[0];
      if(!/^[A-Za-z0-9._-]+(\/[A-Za-z0-9._-]+)*$/.test(name)){res.writeHead(404);res.end();return;}
      const file=resolve(WEBR_DIR,name);
      if(!file.startsWith(WEBR_DIR)){res.writeHead(404);res.end();return;}
      let served=file,encoding=null;
      if(name.endsWith('.wasm')&&(req.headers['accept-encoding']||'').includes('gzip')){
        try{const info=await stat(file+'.gz');if(info.isFile()){served=file+'.gz';encoding='gzip';}}catch{}
      }
      try{
        const info=await stat(served);if(!info.isFile())throw Error('not a file');
        const type=name.endsWith('.mjs')||name.endsWith('.js')?'text/javascript':name.endsWith('.wasm')?'application/wasm':'application/octet-stream';
        const headers={'Content-Type':type,'Content-Length':info.size,'Cache-Control':'public, max-age=86400',
          'Cross-Origin-Opener-Policy':'same-origin','Cross-Origin-Embedder-Policy':'require-corp',
          'Cross-Origin-Resource-Policy':'same-origin','X-Content-Type-Options':'nosniff'};
        if(encoding){headers['Content-Encoding']='gzip';headers['Vary']='Accept-Encoding';}
        res.writeHead(200,headers);
        if(req.method==='HEAD'){res.end();return;}
        createReadStream(served).pipe(res);return;
      }catch{res.writeHead(404);res.end();return;}
    }
    if(!req.url?.startsWith('/')){res.writeHead(400);res.end();return;}
    const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>4_500_000){res.writeHead(413);res.end('Request too large');return;}chunks.push(chunk);}
    const headers=new Headers();for(const [key,value]of Object.entries(req.headers)){if(value!==undefined)headers.set(key,Array.isArray(value)?value.join(','):value);}
    headers.delete('CF-Connecting-IP');
    // Forwarded identities are accepted only from explicitly verified proxy peers.
    const peer=req.socket.remoteAddress||'unknown',trusted=(process.env.EA_TRUSTED_PROXY_ADDRESSES||'').split(',').map(x=>x.trim());
    const ipHeader=process.env.EA_CLIENT_IP_HEADER?.toLowerCase(),forwarded=ipHeader?req.headers[ipHeader]:null;
    const client=trusted.includes(peer)&&typeof forwarded==='string'&&isIP(forwarded.trim())?forwarded.trim():peer;
    headers.set('X-EA-Client-IP',client);
    const request=new Request(new URL(req.url,origin),{method:req.method,headers,...(!['GET','HEAD'].includes(req.method)?{body:Buffer.concat(chunks)}:{})});
    const response=await worker.fetch(request,env);
    for(const [key,value]of response.headers)if(key!=='set-cookie')res.setHeader(key,value);
    const cookies=response.headers.getSetCookie();if(cookies.length)res.setHeader('Set-Cookie',cookies);
    res.writeHead(response.status);res.end(req.method==='HEAD'?undefined:Buffer.from(await response.arrayBuffer()));
  }catch(error){const malformed=error instanceof SyntaxError;if(!res.headersSent)res.writeHead(malformed?400:500,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({detail:malformed?'请求格式无效':'Request failed; consult local server log'}));}
});
server.listen(port,process.env.BIND_ADDRESS||'127.0.0.1',()=>console.log(`Local: ${origin.origin} · persistent data enabled`));
if(process.env.EA_CLEANUP_ON_START==='true')await clean();
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{clearInterval(timer);server.close(async()=>{await stopInterpretations();storage.close();process.exit(0);});});
