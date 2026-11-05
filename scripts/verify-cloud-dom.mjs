// Simulated DOM only. This does not replace a real browser or mobile acceptance.
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {writeFile} from 'node:fs/promises';
import {webcrypto} from 'node:crypto';
import {openStorage} from '../standalone/storage.mjs';
import worker from '../dist/server/index.js';
const modulePath=process.env.EA_JSDOM_MODULE||'../empirical_apprentice_sites/outputs/ui-qa/node_modules/jsdom/lib/api.js';
const {JSDOM,ResourceLoader,VirtualConsole}=await import(pathToFileURL(resolve(modulePath)).href);
const store=await openStorage('outputs/cloud-dom-'+Date.now()),origin='https://cloud-dom.test';
const env={DB:store.DB,FILES:store.FILES,EXECUTOR_URL:'https://executor.test/',EXECUTOR_SECRET:'test-signing-key-which-is-not-a-secret'};
let cookie='',dom;const errors=[],checks=[];
const nativeFetch=globalThis.fetch;globalThis.fetch=async url=>{
 assert.match(String(url),/^https:\/\/executor\.test\/v1\/capabilities$/);
 return Response.json({statspai_cloud:{ready:true,status:'可执行',reason:'模拟能力响应；非计算验收'}});
};
async function call(url,options={}){return worker.fetch(new Request(new URL(url,origin),{...options,headers:{Origin:origin,Cookie:cookie,...options.headers}}),env);}
class Loader extends ResourceLoader{fetch(url){return call(url).then(async r=>Buffer.from(await r.arrayBuffer()));}}
async function until(test,label){const limit=Date.now()+8000;while(Date.now()<limit){if(test())return;await new Promise(r=>setTimeout(r,15));}throw Error('DOM timeout: '+label);}
try{
 const signup=await call('/api/auth/register',{method:'POST',body:JSON.stringify({username:'cloud_dom',password:'Cloud-DOM-password-12!',password_confirmation:'Cloud-DOM-password-12!'})});
 assert.equal(signup.status,200);cookie=signup.headers.get('set-cookie').split(';')[0];
 const session=await (await call('/api/sessions',{method:'POST',body:JSON.stringify({fixture_id:'did',fixture_version:'teaching-fixtures-v1',request_id:crypto.randomUUID()})})).json();
 const draft=await call(`/api/sessions/${session.session_id}/drafts/analysis-context`,{method:'PUT',body:JSON.stringify({value:{engine_id:'statspai_cloud'},version:0})});assert.equal(draft.status,200,await draft.clone().text());
 checks.push('cloud engine draft accepted and persistent');
 const response=await call('/analysis'),html=await response.text(),console=new VirtualConsole();console.on('jsdomError',e=>errors.push(e.message));
 dom=new JSDOM(html,{url:origin+'/analysis',resources:new Loader(),runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:console,beforeParse(w){
  w.fetch=call;w.structuredClone=structuredClone;w.TextEncoder=TextEncoder;w.TextDecoder=TextDecoder;w.AbortSignal=AbortSignal;Object.defineProperty(w,'crypto',{value:webcrypto});
  w.matchMedia=()=>({matches:true,addEventListener(){},removeEventListener(){}});w.ResizeObserver=class{observe(){}disconnect(){}};
  w.HTMLElement.prototype.scrollIntoView=function(){};w.HTMLElement.prototype.scrollTo=function(){};
  w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};w.confirm=()=>true;
 }});
 await new Promise(r=>dom.window.addEventListener('load',()=>setTimeout(r,200)));
 const w=dom.window,d=w.document;
 await until(()=>w.eval('!!latestState&&!busy&&!!researchRuntime'),'loaded');
 assert.equal(d.getElementById('researchEngine').value,'statspai_cloud');
 assert.equal(w.eaAnalysisEngine,'statspai_cloud');assert.equal(d.querySelectorAll('.analysis-shell>aside').length,2);
 assert.equal(d.querySelectorAll('.coach-center').length,1);
 assert.equal(d.querySelector('.coach-current-operation').tagName,'SECTION');assert.ok(d.querySelector('.coach-center>.coach-stream>.coach-current-operation'));
 checks.push('default cloud execution and compact three-column shell');
 const uploaded={text:'x,y\n1,2\n2,3\n',filename:'normalized.csv',labels:{value_labels:{x:{1:'first'}},date_formats:{y:'%tm'}},dictionary:{x:'来自文件的标签'},data_id:crypto.randomUUID()};
 await w.eaLoadResearchInput(uploaded,{row_count:2,columns:[{name:'x',numeric:true,missing:0},{name:'y',numeric:true,missing:0}]},{});
 assert.ok(d.getElementById('eaImportDetails'));assert.ok(d.getElementById('eaImportDetails').textContent.includes('提取年度'));w.eaRenderDictionary();assert.ok(d.getElementById('eaImportDetails'));
 checks.push('import labels and date conversion entry survive dictionary redraw; no background model call');
 const retained=d.getElementById('researchFile');w.eaWorkspaceOpen('health','核对字段');assert.equal(d.querySelector('.coach-current-operation').hidden,false);
 d.querySelector('.coach-current-operation>button').click();assert.equal(d.querySelector('.coach-current-operation').hidden,true);
 d.querySelector('.coach-operation-summary button').click();assert.equal(d.querySelector('.coach-current-operation').hidden,false);assert.equal(d.getElementById('researchFile'),retained);
 w.eaWorkspaceOpen('prepare','研究准备');assert.equal(d.getElementById('pane-preparation').hidden,false);
 w.eaWorkspaceOpen('plan','核对方案');assert.equal(d.getElementById('researchConfirm').closest('label').hidden,true);
 assert.equal(await w.eaFlushAllDrafts(),true);const activeId=w.eval('sessionId');const display=await (await call(`/api/sessions/${activeId}/drafts`)).json();assert.equal(display.drafts['workspace-view'].value.collapsed,false);assert.equal(display.drafts['workspace-view'].value.view,'plan');
 checks.push('single stream retains file control, collapse/reopen persists, preparation route and checkbox-free confirmation');


 const report=await (await call(`/api/sessions/${session.session_id}`)).json();assert.equal(report.research_drafts['analysis-context'].value.engine_id,'statspai_cloud');
 assert.ok(!errors.some(e=>!e.includes('Not implemented:')) ,JSON.stringify(errors));
 await writeFile('outputs/cloud-dom-acceptance.json',JSON.stringify({scope:'DOM simulation, controlled capability only; no browser acceptance',checks,errors},null,2));
 process.stdout.write(JSON.stringify({checks,errors})+'\n');
}finally{dom?.window.close();store.close();globalThis.fetch=nativeFetch;}
