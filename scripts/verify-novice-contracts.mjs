import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {correspondingReference} from '../worker/corresponding-teaching.js';
import {digest} from '../worker/executor.js';
const code='regress v0 v1, vce(robust)';
const preview={executed:false,sha256:await digest(code),code,commands:[{id:'estimate',topic:'estimate',text:code}],mapping:[{alias:'v0',name:'cost'},{alias:'v1',name:'education'}],differences:[],template_version:'test'};
const checks=[];
for(const engine of ['statspai_cloud','browser_webr'])for(const status of [null,'running','failed','succeeded']){
 const plan={method:'ols',outcome:'cost',predictors:['education'],vcov:'hetero',engine_id:engine};
 const task={id:'owned-task',plan,status,corresponding_code:preview,dictionary:{cost:'费用（元）'},result:{n_used:10,coefficients:[{term:'education',estimate:2,std_error:0.1,ci_low:1.8,ci_high:2.2}]}};
 const state={session_id:'owned-session',research_revision:1,variable_dictionary:{cost:'费用（元）'},pending_confirmation:{token:'confirm',research_revision:1,plan,corresponding_code:preview}};
 const env={DB:{prepare(){return {bind(){return {first:async()=>({body:JSON.stringify(task)})};}};}}};
 const ref={preview_hash:preview.sha256,command_id:'estimate',...(status?{task_id:task.id}:{confirmation_token:'confirm'})};
 const reply=await correspondingReference(env,'owner',state,ref);
 assert.match(reply.card.reminder,engine==='browser_webr'?/浏览器 R/:/StatsPAI/);
 if(status==='succeeded'){
  assert.match(reply.card.reminder,/完成计算/);
  const result=await correspondingReference(env,'owner',state,{...ref,focus:'estimate',term:'education'});assert.match(result.card.summary,/费用（元）/);
 }else{assert.doesNotMatch(reply.card.reminder,/完成计算/);await assert.rejects(correspondingReference(env,'owner',state,{...ref,focus:'estimate',term:'education'}));}
 await assert.rejects(correspondingReference(env,'owner',state,{...ref,preview_hash:'stale'}),e=>e.status===409);
 checks.push(engine+':'+(status||'plan'));
}
await writeFile('outputs/novice-contracts.json',JSON.stringify({scope:'controlled persisted teaching-reference validation, no model/browser evidence',checks},null,2));
console.log(JSON.stringify({checks}));
