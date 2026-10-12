import http from 'node:http';
import { appendFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openStorage } from './storage.mjs';
import worker from '../dist/server/index.js';
import { cleanupExpired } from '../dist/server/retention.js';

const port=Number(process.env.PORT||8766),origin=new URL(process.env.PUBLIC_ORIGIN||`http://127.0.0.1:${port}`);
if(!['https:','http:'].includes(origin.protocol)||origin.pathname!=='/')throw Error('PUBLIC_ORIGIN must be an origin');
if(process.env.NODE_ENV==='production'&&origin.protocol!=='https:')throw Error('Production requires HTTPS PUBLIC_ORIGIN');
const storage=await openStorage(process.env.EA_DATA_DIR||fileURLToPath(new URL('../outputs/standalone/',import.meta.url)));
const env={...process.env,DB:storage.DB,FILES:storage.FILES};let cleaning=false;
async function clean(){if(cleaning)return;cleaning=true;try{const result=await cleanupExpired(env);await appendFile(join(storage.root,'cleanup.jsonl'),JSON.stringify(result)+'\n');}catch{console.error('Retention cleanup failed; retry scheduled.');}finally{cleaning=false;}}
const timer=setInterval(clean,15*60*1000);timer.unref();
const server=http.createServer(async(req,res)=>{
  try{
    if(!req.url?.startsWith('/')){res.writeHead(400);res.end();return;}
    const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>4_500_000){res.writeHead(413);res.end('Request too large');return;}chunks.push(chunk);}
    const headers=new Headers();for(const [key,value]of Object.entries(req.headers)){if(value!==undefined)headers.set(key,Array.isArray(value)?value.join(','):value);}
    const request=new Request(new URL(req.url,origin),{method:req.method,headers,...(!['GET','HEAD'].includes(req.method)?{body:Buffer.concat(chunks)}:{})});
    const response=await worker.fetch(request,env);
    for(const [key,value]of response.headers)if(key!=='set-cookie')res.setHeader(key,value);
    const cookies=response.headers.getSetCookie();if(cookies.length)res.setHeader('Set-Cookie',cookies);
    res.writeHead(response.status);res.end(req.method==='HEAD'?undefined:Buffer.from(await response.arrayBuffer()));
  }catch{if(!res.headersSent)res.writeHead(500,{'Content-Type':'application/json'});res.end('{"detail":"Request failed; consult local server log"}');}
});
server.listen(port,process.env.BIND_ADDRESS||'127.0.0.1',()=>console.log(`Local: ${origin.origin} · persistent data enabled`));
if(process.env.EA_CLEANUP_ON_START==='true')await clean();
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{clearInterval(timer);server.close(()=>{storage.close();process.exit(0);});});
