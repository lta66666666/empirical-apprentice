import assert from 'node:assert/strict';
import { requestModel, proposeCandidate, modelFeedback } from '../worker/model.js';

const env={MODEL_API_KEY:'regression-key-not-real',MODEL_NAME:'mock-coach',MODEL_BASE_URL:'https://model.example/v1'};
const messages=[{role:'user',content:'单位是什么意思？'}];
const nativeFetch=globalThis.fetch,nativeNow=Date.now;
const provider=(raw,extra={})=>Response.json({id:'provider-test-1',model:'actual-test-model',choices:[{finish_reason:'stop',message:{content:JSON.stringify(raw)}}],...extra});
const count=[];const check=(name)=>{count.push(name);console.log('PASS: '+name);};
const audit={session_id:'isolated-model-test',owner:'isolated-owner'};
const records=[];const db={prepare(){return {bind(...values){records.push(JSON.parse(values[5]));return this;},async run(){return {meta:{changes:1}};}};}};
try{
  for(const status of [408,429,500,501,502,503,504,599]){
    let calls=0;globalThis.fetch=async()=>++calls===1?new Response('private-provider-error-body',{status}):provider({answer:'单位是数值的计量方式。'});
    const value=await requestModel(env,messages);assert.equal(calls,2);assert.equal(value.diagnostics.attempts,2);assert.equal(value.diagnostics.attempt_history[0].type,'http');assert.equal(value.diagnostics.attempt_history[0].http_status,status);
  }
  let calls=0;globalThis.fetch=async()=>{calls++;throw Error('network error contains secret');};
  await assert.rejects(requestModel(env,messages),e=>e.model_error_type==='network'&&e.diagnostics.attempts===2);assert.equal(calls,2);
  calls=0;globalThis.fetch=async()=>++calls===1?Promise.reject(Error('network once')):provider({answer:'恢复了。'});
  assert.equal((await requestModel(env,messages)).diagnostics.attempts,2);
  calls=0;globalThis.fetch=async()=>++calls===1?{ok:true,status:200,json:async()=>{throw new TypeError('stream transport private message');}}:provider({answer:'流恢复了。'});const streamRecovered=await requestModel(env,messages);assert.equal(streamRecovered.diagnostics.attempts,2);assert.equal(streamRecovered.diagnostics.attempt_history[0].type,'network');assert.equal(streamRecovered.diagnostics.attempt_history[0].stage,'provider_envelope');
  check('network and 408/429/all 5xx retry at most once, successful recovery recorded');

  for(const [status,type]of[[401,'http'],[403,'http'],[404,'http']]){
    let n=0;globalThis.fetch=async()=>{n++;return new Response('do-not-read-provider-body',{status});};
    await assert.rejects(requestModel(env,messages),e=>e.model_error_type===type&&e.diagnostics.http_status===status);assert.equal(n,1);
  }
  for(const [mock,type,stage]of[
    [()=>{throw new DOMException('private timeout text','AbortError');},'timeout','request'],
    [()=>Response.json({model:'actual-test-model',id:'truncated-id',choices:[{finish_reason:'length',message:{content:'private-truncated-content'}}]}),'truncated_output','structured_output'],
    [()=>new Response('private-invalid-envelope'),'invalid_json','provider_envelope'],
    [()=>Response.json({choices:[{finish_reason:'stop',message:{content:'private-invalid-json'}}]}),'invalid_json','structured_output'],
    [()=>provider([]),'invalid_fields','structured_output'],
    [()=>Response.json({choices:[{message:{content:null}}]}),'invalid_fields','structured_output']
  ]){
    let n=0;globalThis.fetch=async()=>{n++;return mock();};
    await assert.rejects(requestModel(env,messages),e=>e.model_error_type===type&&e.diagnostics.stage===stage&&Number.isInteger(e.diagnostics.duration_ms));assert.equal(n,1);
  }
  check('timeout, HTTP, truncation, envelope JSON, content JSON and field shape classified without structure retries');

  let clock=0,n=0;Date.now=()=>clock;globalThis.fetch=async()=>{n++;clock=15001;throw Error('slow network');};
  await assert.rejects(requestModel(env,messages),e=>e.model_error_type==='network'&&e.diagnostics.duration_ms===15001);assert.equal(n,1);Date.now=nativeNow;
  check('no retry when the next 12-second attempt would exceed the 26-second request budget');

  globalThis.fetch=async()=>provider({answer:32,summary:'unvalidated-private-marker',details:'unvalidated-private-marker'});
  const invalid=await modelFeedback('tutor',{question:'什么是单位？'},{...env,DB:db},audit);
  assert.equal(invalid.error_type,'invalid_fields');assert.equal(invalid.diagnostics.stage,'validation');assert.deepEqual(invalid.diagnostics.validation_errors,['answer']);assert.equal(invalid.mode,'checklist');assert.equal(records.at(-1).status,'failed');assert.equal(JSON.stringify(records.at(-1)).includes('unvalidated-private-marker'),false);assert.equal(JSON.stringify(invalid).includes(env.MODEL_API_KEY),false);
  globalThis.fetch=async()=>Response.json({id:'json-failure-id',choices:[{finish_reason:'stop',message:{content:'unvalidated-raw-secret-marker'}}]});
  await modelFeedback('tutor',{question:'解释指标'},{...env,DB:db},audit);assert.equal(records.at(-1).error_type,'invalid_json');assert.equal(JSON.stringify(records.at(-1)).includes('unvalidated-raw-secret-marker'),false);
  check('failed output and provider errors never enter public fallback or stored model evidence');

  let tutorPrompt,reflectionPrompt;globalThis.fetch=async(_url,init)=>{const content=JSON.parse(init.body).messages[0].content;if(content.includes('初学者研究辅导'))tutorPrompt=content;else reflectionPrompt=content;return provider({answer:'单位说明数值按什么尺度记录。可以先查数据说明。',summary:'先查数据说明。',details:'完整阅读内容。',references:['current_lesson','invented']});};
  const context={question:'我不知道单位是什么',coaching:{kind:'research_tutor'},research_understanding:{outcome:{value:'城市年度碳排放总量'},unit:{status:'unknown'}},current_question:{field:'outcome_unit'},materials:[{id:'current_lesson',content:'单位依据数据说明。'}]};
  const tutor=await modelFeedback('tutor',context,env);assert.match(tutorPrompt,/不是在批改作答/);assert.match(tutorPrompt,/不要说回答错误/);assert.match(tutorPrompt,/current_question/);assert.equal(tutor.summary,'先查数据说明。');assert.equal(tutor.details,'完整阅读内容。');assert.deepEqual(tutor.references,['current_lesson']);
  await modelFeedback('reflection',{answer:'系数意味着正相关',materials:[{id:'executed_result',content:{coefficients:[{estimate:2}]}}]},env);assert.match(reflectionPrompt,/正式结果解释反馈/);assert.match(reflectionPrompt,/required_corrections/);assert.match(reflectionPrompt,/同义措辞/);
  check('tutor coaching and formal reflection use separate prompts; short and full readings are validated');

  const input={question:'教育与收入的关联',profile:{row_count:100,columns:[{name:'income',numeric:true,missing:0},{name:'education',numeric:true,missing:0}]},context:{dictionary:{}}};
  globalThis.fetch=async()=>provider({method:'ols',outcome:'income',predictors:['education'],reason:'关联分析',questions:[],proposed_cards:{},proposed_dictionary:{}});
  const response=await proposeCandidate(input,{...env,DB:db},audit),body=await response.json();assert.equal(response.status,200);assert.equal(body.ready,true);assert.equal(body.mode,'candidate');assert.equal(records.at(-1).mode,'candidate');assert.equal(records.at(-1).status,'response_valid');assert.match(body.interpretation_warnings[0],/不阻止计算/);
  for(const unknown of ['unknown','awaiting_data']){const knownDictionary={income:'年收入，元',education:'受教育年数，年'},understanding={fields:{unit:{value:unknown==='unknown'?'':'待数据说明确认',status:unknown,label:'指标单位',source:{message_id:'real-user-message'}}}};const unresolved=await (await proposeCandidate({...input,context:{dictionary:knownDictionary,research_understanding:understanding}},{...env,DB:db},audit)).json();assert.equal(unresolved.ready,true);assert.equal(unresolved.mode,'candidate');assert.equal(records.at(-1).status,'response_valid');}
  globalThis.fetch=async()=>provider({method:'ols',predictors:'education'});const invalidCandidate=await (await proposeCandidate(input,env)).json();assert.equal(invalidCandidate.error_type,'invalid_fields');assert.equal(invalidCandidate.ready,false);assert.equal(invalidCandidate.candidate,null);assert.deepEqual(invalidCandidate.diagnostics.validation_errors,['predictors']);
  check('optional units preserve candidate readiness with interpretation warnings; schema failures still reject');
  globalThis.fetch=async()=>provider({method:'ols',outcome:'income',predictors:['education'],unit:null,time:null,treated:null,cluster:null,reason:'先核对OLS',coaching:{answer:'单位可后补，先核对列与模型。',follow_up:null}});
  const nullRoles=await (await proposeCandidate(input,env)).json();assert.equal(nullRoles.ready,true);assert.equal(nullRoles.candidate.unit,'');assert.equal(nullRoles.candidate.time,'');assert.equal(nullRoles.coach.follow_up,null);
  globalThis.fetch=async()=>provider({method:'ols',outcome:'income',predictors:['education'],proposed_dictionary:{income:null,education:{meaning:'unvalidated-private-marker',unit:'guessed'}}});const discarded=await (await proposeCandidate(input,env)).json();assert.equal(discarded.ready,true);assert.deepEqual(discarded.proposed_dictionary,{});assert.match(discarded.metadata_warning,/未采纳/);assert.doesNotMatch(JSON.stringify(discarded),/unvalidated-private-marker|guessed/);
  globalThis.fetch=async()=>provider({method:'ols',outcome:'income',predictors:['education'],coaching:{answer:'核对',follow_up:{field:'execute_now',prompt:'执行'}}});const badCoach=await (await proposeCandidate(input,env)).json();assert.deepEqual(badCoach.diagnostics.validation_errors,['coaching_contract']);assert.equal(badCoach.ready,false);
  check('null optional role fields remain absent; invalid coaching actions rejected with safe diagnostics');

  globalThis.fetch=async()=>provider({method:null,reason:'需补资料',proposed_cards:{policy_name:{value:'低碳城市试点政策',status:'verified'},outcome:null,unit:{value:'待查',status:'unknown'}}});
  const cards=await (await proposeCandidate(input,env)).json();assert.equal(cards.error_type,undefined);assert.deepEqual(cards.proposed_cards,{policy_name:'低碳城市试点政策'});assert.equal(cards.ready,false);
  globalThis.fetch=async()=>provider({method:null,proposed_cards:{policy_name:{value:'x',execute:true}}});assert.equal((await (await proposeCandidate(input,env)).json()).error_type,'invalid_fields');
  check('bounded card records normalize to unverified strings; unknowns omitted and arbitrary nested fields rejected');
  let sent;globalThis.fetch=async(_url,init)=>{sent=JSON.parse(JSON.parse(init.body).messages[1].content);return provider({method:null,reason:'需要数据',questions:['请提交数据。']});};
  await proposeCandidate({...input,preparation:{adoption_mode:'unknown',cards:{question:{value:'x'.repeat(20000)},policy_doc:{value:'y'.repeat(20000)}}},context:{dictionary:{income:'z'.repeat(20000)},unrelated_private_payload:'excluded'},history:Array.from({length:20},()=>({role:'user',content:'a'.repeat(20000)}))},env);
  assert.equal(sent.preparation.cards.question.value.length,500);assert.equal(sent.previous_dialogue.length,6);assert.equal(sent.previous_dialogue[0].content.length,700);assert.equal(sent.analysis_context.unrelated_private_payload,undefined);assert.ok(JSON.stringify(sent).length<18000);
  check('candidate context keeps only bounded research summaries and six recent turns');
}finally{globalThis.fetch=nativeFetch;Date.now=nativeNow;}
console.log(`PASS: ${count.length} model recovery regression groups (controlled provider; no live-model claim).`);
