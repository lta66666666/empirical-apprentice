import assert from 'node:assert/strict';
import { proposeCandidate, modelFeedback, modelCapabilities } from '../worker/model.js';

const input = { question: '教育年限与收入是否相关？', profile: { row_count: 100, columns: [
  { name: 'income', numeric: true, missing: 0 }, { name: 'education', numeric: true, missing: 0 },
] } };
const env = { MODEL_API_KEY: 'test-only', MODEL_NAME: 'mock-model', MODEL_BASE_URL: 'https://model.example/v1' };
assert.equal((await proposeCandidate(input, {})).status, 503);
const original = globalThis.fetch;
assert.deepEqual(modelCapabilities({}),{candidate:'unconfigured',tutor:'unconfigured',reflection:'unconfigured'});
assert.equal((await modelFeedback('tutor',{question:'什么是固定效应？'},{})).mode,'checklist');
try {
  globalThis.fetch = async (_url, init) => {
    const sent = JSON.parse(init.body);
    assert.equal(sent.messages[1].content.includes('income'), true);
    assert.equal(sent.messages[1].content.includes('逐行'), false);
    return Response.json({ choices: [{ message: { content: JSON.stringify({ method: 'ols', outcome: 'income',
      predictors: ['education', 'invented'], reason: '候选关联分析', questions: ['单位是什么？'] }) } }] });
  };
  const ok = await proposeCandidate(input, env);
  const proposed = await ok.json();
  assert.equal(ok.status, 200);
  assert.deepEqual(proposed.candidate.predictors, ['education']);
  assert.equal(proposed.candidate.same_batch, false);
  const blockedOls=await (await proposeCandidate({...input,blocker:'分批实施不能同批 DID'},env)).json();
  assert.equal(blockedOls.candidate.method,'ols');
  globalThis.fetch=async()=>Response.json({choices:[{message:{content:'{"method":"did","reason":"政策评估"}'}}]});
  const blockedDid=await (await proposeCandidate({...input,blocker:'分批实施不能同批 DID'},env)).json();
  assert.equal(blockedDid.candidate,null);assert.match(blockedDid.reason,/分批/);

  globalThis.fetch = async () => Response.json({ choices: [{ message: { content: '{"method":"iv"}' } }] });
  assert.equal((await proposeCandidate(input, env)).status, 422);
  globalThis.fetch = async () => Response.json({ choices: [{ message: { content: '{"method":"ols","questions":["请先说明结果变量"]}' } }] });
  const insufficient = await (await proposeCandidate(input, env)).json();
  assert.equal(insufficient.candidate.outcome, '');
  assert.equal(insufficient.ready,false);assert.ok(insufficient.questions.includes('请先说明结果变量'));
  globalThis.fetch = async () => { throw new DOMException('timed out', 'AbortError'); };
  assert.match((await (await proposeCandidate(input, env)).json()).detail, /超时/);
  globalThis.fetch = async () => { throw new Error('network unavailable'); };
  assert.equal((await proposeCandidate(input, env)).status, 502);
  for(const kind of ['tutor','reflection']){
    globalThis.fetch=async(_url,init)=>{
      const sent=JSON.parse(init.body);assert.match(sent.messages[0].content,/不编造数值/);
      return Response.json({choices:[{message:{content:JSON.stringify({answer:'对照给定材料解释单位，并保留因果局限。',references:['current_lesson','invented']})}}]});
    };
    const feedback=await modelFeedback(kind,{question:'帮我把结果调显著',materials:[{id:'current_lesson',content:'关联不代表因果'}]},env);
    assert.equal(feedback.mode,'ai_advice');assert.deepEqual(feedback.references,['current_lesson']);
    assert.match(feedback.prompt_version,new RegExp(kind));
    globalThis.fetch=async()=>Response.json({choices:[{message:{content:'invalid-json'}}]});
    assert.equal((await modelFeedback(kind,{},env)).mode,'checklist');
    globalThis.fetch=async()=>{throw new DOMException('timed out','AbortError');};
    assert.match((await modelFeedback(kind,{},env)).warning,/超时/);
    globalThis.fetch=async()=>new Response('error',{status:500});
    assert.equal((await modelFeedback(kind,{},env)).mode,'checklist');
  }
} finally { globalThis.fetch = original; }
console.log('PASS: model omitted, constrained candidate, unsupported method, and interface failure.');
