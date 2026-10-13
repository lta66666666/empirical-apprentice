import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile,writeFile} from 'node:fs/promises';
const source=await readFile('static/webr-execution.js','utf8'),checks=[];
function harness(mode){
  const instances=[],deadlines=[],saved=new Map(),events=[],notices=[];let offline=false,confirm=true;
  class Runtime{
    constructor(){this.closed=false;instances.push(this);this.FS={writeFile:async()=>{events.push('input-written');}};}
    init(){if(mode==='init')return new Promise((resolve,reject)=>this.stopInit=reject);return Promise.resolve();}
    async evalRString(code){if(code.includes("webr::install"))return '0.14.2';if(code.includes('fit <-')){events.push('estimate-start');if(mode==='estimate')return new Promise((resolve,reject)=>this.stopEstimate=reject);return 'estimated';}if(code.includes('nobs(fit)'))return 'R 4.5.2\t0.14.2\t3';if(code.includes('coeftable'))return 'education\t1\t0.1\t10\t0.01\t0.8\t1.2';if(code.includes('obs(fit)'))return '1,2,3';throw Error('Unexpected mock command');}
    interrupt(){events.push('interrupt');}
    close(){this.closed=true;this.stopInit?.(Error('closed'));this.stopEstimate?.(Error('closed'));return Promise.resolve();}
  }
  const payload={nonce:'test-execution-nonce',csv:'income,education\n1,1\n2,2\n3,3',plan:{method:'ols',outcome:'income',predictors:['education'],vcov:'hetero',missing:'drop',labels:{},unit:'',time:'',treated:'',cluster:''}};
  const context=vm.createContext({console,TextEncoder,AbortSignal,SharedArrayBuffer,sessionId:'123456abcdef',setInterval:()=>1,clearInterval(){},setTimeout(fn,ms){deadlines.push(ms);return setTimeout(fn,ms>=120000?15:ms);},clearTimeout,storageGet:key=>saved.get(key),storageSet:(key,value)=>saved.set(key,value),researchNotice:message=>notices.push(message),researchWatch:async()=>{},api:async(path,opts)=>{if(path.endsWith('/input'))return payload;if(offline){const e=Error('offline');e.uncertain=true;throw e;}events.push(path.split('/').at(-1));return {status:path.endsWith('/interrupt')?'interrupted':'running'};},fetch:async()=>Response.json({}),confirm:()=>confirm,window:{crossOriginIsolated:true,addEventListener(){}}});
  vm.runInContext(source,context);context.Runtime=Runtime;vm.runInContext('eaLoadWebR=async()=>({WebR:Runtime})',context);
  return {context,instances,deadlines,saved,events,notices,setOffline:v=>offline=v,setConfirm:v=>confirm=v,run:code=>vm.runInContext(code,context)};
}
for(const mode of ['init','estimate']){
  const h=harness(mode);await h.run("browserRunJob({id:'test-job'})");assert.ok(h.instances[0].closed);assert.ok(h.deadlines.includes(180000));if(mode==='init')assert.equal(h.events.includes('estimate-start'),false);else assert.ok(h.deadlines.includes(120000));assert.ok(h.notices.some(n=>n.includes(mode==='init'?'180 秒':'120 秒')));checks.push({name:mode+' deadline closes runtime and excludes later work',result:'pass'});
}
const h=harness('init');const running=h.run("browserRunJob({id:'cancel-job'})");await new Promise(r=>setTimeout(r,1));h.setConfirm(false);assert.equal(await h.context.window.eaBeforeLeave(),false);assert.equal(h.instances[0].closed,false);h.setConfirm(true);h.setOffline(true);assert.equal(await h.context.window.eaBeforeLeave(),true);await running;assert.equal(h.instances[0].closed,true);assert.equal(h.events.includes('estimate-start'),false);assert.ok(h.notices.some(n=>n.includes('待同步')));assert.match(h.saved.get('ea_browser_pending'),/interrupt/);assert.equal(h.saved.get('ea_browser_pending').includes('test-execution-nonce'),false);checks.push({name:'leave confirmation, cancel during init, offline pending sync without nonce',result:'pass'});
const fresh=harness('success');const first=await fresh.run('eaInitWebR()');fresh.run('eaResetWebR()');const second=await fresh.run('eaInitWebR()');assert.notEqual(first,second);assert.equal(first.closed,true);checks.push({name:'retry uses a fresh closed-over runtime',result:'pass'});fresh.run('eaResetWebR()');
await writeFile('outputs/webr-lifecycle-regression.json',JSON.stringify({scope:'Mock runtime with accelerated clock: checks cancellation/deadline control flow, not numerical R computation',checks},null,2));for(const c of checks)console.log('PASS',c.name);
