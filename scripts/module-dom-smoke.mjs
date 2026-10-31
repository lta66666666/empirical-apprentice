import assert from 'node:assert/strict';
import {JSDOM,ResourceLoader,VirtualConsole} from '../../empirical_apprentice_sites/outputs/ui-qa/node_modules/jsdom/lib/api.js';
import {webcrypto} from 'node:crypto';
import {openStorage} from '../standalone/storage.mjs';
import worker from '../dist/server/index.js';
const store=await openStorage('outputs/module-dom-'+Date.now()),env={DB:store.DB,FILES:store.FILES};let auth='',errors=[];const origin='https://test.example';
const call=async(url,opts={})=>worker.fetch(new Request(new URL(url,origin),{...opts,headers:{Origin:origin,Cookie:auth,...opts.headers}}),env);
const registered=await call('/api/auth/register',{method:'POST',body:JSON.stringify({username:'dom_student',password:'DOM-test-password12!',password_confirmation:'DOM-test-password12!'})});auth=registered.headers.get('set-cookie').split(';')[0];
class Loader extends ResourceLoader{fetch(url){return call(url).then(async r=>Buffer.from(await r.arrayBuffer()));}}
try{
  for(const route of ['/home','/learn','/analysis']){
    const response=await call(route),html=await response.text(),console=new VirtualConsole();console.on('jsdomError',e=>{if(!e.message.includes('Not implemented'))errors.push(e.message);});
    const dom=new JSDOM(html,{url:origin+route,runScripts:'dangerously',resources:new Loader(),pretendToBeVisual:true,virtualConsole:console,beforeParse(w){w.fetch=(url,opts)=>call(url,opts);w.TextEncoder=TextEncoder;w.TextDecoder=TextDecoder;w.AbortSignal=AbortSignal;Object.defineProperty(w,'crypto',{value:webcrypto});w.matchMedia=()=>({matches:true,addEventListener(){},removeEventListener(){}});w.ResizeObserver=class{observe(){} disconnect(){}};w.HTMLElement.prototype.scrollIntoView=function(){};w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};w.confirm=()=>true;}});
    await new Promise(r=>dom.window.addEventListener('load',()=>setTimeout(r,800)));
    const document=dom.window.document;
    if(route==='/home'){assert.equal(document.querySelectorAll('a,button,input,select,textarea,[tabindex]').length,2);assert.equal(document.querySelectorAll('script').length,0);}
    else{assert.ok(document.querySelector('.module-toolbar'));if(route==='/analysis'){assert.ok(document.querySelector('.analysis-shell'));assert.ok(document.querySelector('.analysis-dock textarea'));assert.equal(document.querySelector('.analysis-top').dataset.mode,'analysis');assert.ok(document.querySelector('.coach-center .coach-feed'));assert.ok(document.querySelector('.coach-knowledge'));assert.ok(document.querySelector('.coach-materials'));assert.equal(document.querySelector('.coach-review').hidden,true);}}
    dom.window.close();
  }
  assert.deepEqual(errors,[]);globalThis.console.log('PASS home exact DOM controls, complete module scripts, conversation-first columns and closed detail dialog. DOM-only; real viewport/phone pending.');
}finally{store.close();}
