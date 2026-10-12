import assert from 'node:assert/strict';

const root = 'http://127.0.0.1:8788';
let cookie = '';
async function call(path, method = 'GET', body, useCookie = true) {
  if(body?.candidate && !body.candidate.engine_id)body.candidate={...body.candidate,engine_id:'browser_webr'}; // This suite explicitly exercises the browser fallback.
  const headers = { Origin: root };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (useCookie && cookie) headers.Cookie = cookie;
  const response = await fetch(root + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const setCookie = response.headers.get('set-cookie');
  if (useCookie && setCookie) cookie = setCookie.split(';')[0];
  const type = response.headers.get('content-type') || '';
  const value = type.includes('json') ? await response.json() : await response.text();
  return { response, value };
}

const app = await call('/app');
assert.equal(app.response.status, 200);
assert.match(app.value, /八阶段|学习工作台/);
assert.match((await call('/')).value, /学习工作台/);
assert.match((await call('/trial')).value, /Sites 技术试验/);
assert.equal((await call('/static/research.js')).response.status, 200);
const tutorial = await call('/api/tutorial');
assert.equal(tutorial.value.steps.length, 6);
assert.equal((await call('/api/tutorial/data/clean')).response.status, 200);

const created = await call('/api/sessions', 'POST');
assert.equal(created.response.status, 200);
assert.equal(created.value.stage, 'entry');
assert.equal(created.value.outline.length, 8);
const id = created.value.session_id;
assert.equal((await call(`/api/sessions/${id}`, 'GET', undefined, false)).response.status, 404);
assert.equal((await call('/api/sessions')).value.sessions.length, 1);

const entered = await call(`/api/sessions/${id}/entry`, 'POST', { path: 'zero' });
assert.equal(entered.value.stage, 'lesson');
assert.equal(entered.value.lesson_ui.lesson_id, 1);
const answered = await call(`/api/sessions/${id}/lesson_action`, 'POST', { message: 'A' });
assert.equal(answered.response.status, 200);
assert.equal(answered.value.lesson_records.length, 1);
const tutorialAnswer = await call(`/api/sessions/${id}/tutorial/answer`, 'POST', { step: 0, choice: 1 });
assert.equal(tutorialAnswer.value.tutorial.records['0'].passed, true);
const cases = await call('/api/cases');
assert.equal(cases.value.length, 5);
assert.equal((await call('/api/cases/case_001')).value.case_id, 'case_001');
const handInput = 'city,year,outcome,treated\nA,2014,10,1\nA,2015,7,1\nB,2014,12,1\nB,2015,9,1\nC,2014,8,0\nC,2015,7,0\nD,2014,10,0\nD,2015,9,0\n';
const hand = await call(`/api/sessions/${id}/analysis/run`, 'POST', { filename: 'synthetic.csv', text: handInput,
  mapping: {}, policy_year: 2015, confirmed: true, outcome_definition: '模拟能耗指标单位' });
assert.equal(hand.value.analysis.status, 'computed');
assert.equal(hand.value.analysis.estimate.did, -2);
assert.match((await call(`/api/sessions/${id}/analysis/report`)).value, /描述性 DID/);
const badHand = await call(`/api/sessions/${id}/analysis/run`, 'POST', { filename: 'synthetic.csv',
  text: handInput + 'A,2014,10,1\n', mapping: {}, policy_year: 2015, confirmed: true });
assert.equal(badHand.value.analysis.status, 'blocked');
assert.match(badHand.value.analysis.errors.join(' '), /重复/);
const practice = await call(`/api/sessions/${id}/cases/start`, 'POST', { case_id: 'case_001' });
assert.equal(practice.value.stage, 'case_practice');
assert.equal(practice.value.current_case_id, 'case_001');
const firstCaseAnswer = await call(`/api/sessions/${id}/chat`, 'POST', { message: '事前系数逐步下降，不能仅凭不显著证明平行趋势。' });
assert.equal(firstCaseAnswer.value.case_answers.length, 1);
const revisedCaseAnswer = await call(`/api/sessions/${id}/chat`, 'POST', { message: '修订：还要看置信区间宽度与经济意义。' });
assert.equal(revisedCaseAnswer.value.case_answers[1].revision, true);
assert.match((await call(`/api/sessions/${id}/learning-report/md`)).value, /置信区间宽度/);

const prepSession = await call('/api/sessions', 'POST');
const prepId = prepSession.value.session_id;
await call(`/api/sessions/${prepId}/entry`, 'POST', { path: 'prepare' });
const prep = await call(`/api/sessions/${prepId}/preparation/cards/question`, 'PUT', { value: '教育与收入的关联', source_title: '研究设想', verify: true });
assert.equal(prep.value.preparation.cards.question.status, 'verified');
const forbiddenPolicyCard = await call(`/api/sessions/${prepId}/preparation/cards/effective_date`, 'PUT', { value: '2020' });
assert.equal(forbiddenPolicyCard.response.status, 422);

const example = (await call('/api/research/examples/ols')).value;
const inspected = await call(`/api/sessions/${prepId}/research/inspect`, 'POST', { filename: example.filename, text: example.text });
assert.equal(inspected.value.row_count, 160);
const planned = await call(`/api/sessions/${prepId}/research/plan`, 'POST', { filename: example.filename, text: example.text, candidate: example.plan });
assert.equal(planned.value.plan.method, 'ols');
const noModel = await call('/api/research/candidate', 'POST', { session_id: prepId, filename: example.filename,
  text: example.text, question: '教育与收入有关吗？' });
assert.equal(noModel.response.status, 503);
const missingCsv = 'income,education,experience\n10,8,1\n11,9,2\n12,N/A,3\n13,11,4\n14,12,5\n';
const missingBlocked = await call(`/api/sessions/${prepId}/research/plan`, 'POST', { filename: 'missing.csv',
  text: missingCsv, candidate: example.plan });
assert.equal(missingBlocked.response.status, 422);
const missingAllowed = await call(`/api/sessions/${prepId}/research/plan`, 'POST', { filename: 'missing.csv',
  text: missingCsv, candidate: { ...example.plan, missing: 'drop' } });
assert.equal(missingAllowed.response.status, 200);
const tooLarge = await call(`/api/sessions/${prepId}/research/inspect`, 'POST', { filename: 'large.csv', text: 'y,x\n' + '1,2\n'.repeat(500001) });
assert.equal(tooLarge.response.status, 422);
const tooManyRows = await call(`/api/sessions/${prepId}/research/inspect`, 'POST', { filename: 'long.csv', text: 'y,x\n' + '1,2\n'.repeat(20001) });
assert.equal(tooManyRows.response.status, 422);
for (const method of ['panel_fe', 'did']) {
  const fixture = (await call(`/api/research/examples/${method}`)).value;
  const valid = await call(`/api/sessions/${prepId}/research/plan`, 'POST', {
    filename: fixture.filename, text: fixture.text, candidate: fixture.plan });
  assert.equal(valid.response.status, 200);
  const rows = fixture.text.trimEnd().split('\n');
  const duplicate = await call(`/api/sessions/${prepId}/research/plan`, 'POST', {
    filename: fixture.filename, text: fixture.text + rows[1] + '\n', candidate: fixture.plan });
  assert.equal(duplicate.response.status, 422);
  assert.match(duplicate.value.detail, /重复/);
}
const didFixture = (await call('/api/research/examples/did')).value;
await call(`/api/sessions/${prepId}/fields/policy_batches`, 'PATCH', { value: '2018 年首批，2019 年第二批，分批实施' });
const staggered = await call(`/api/sessions/${prepId}/research/plan`, 'POST', {
  filename: didFixture.filename, text: didFixture.text, candidate: didFixture.plan });
assert.equal(staggered.response.status, 422);
assert.match(staggered.value.detail, /分批/);
const outdated = await call(`/api/sessions/${prepId}/research/jobs`, 'POST', { filename:example.filename,text:example.text,plan:planned.value.plan,confirmation_token:planned.value.confirmation.token,confirmed:true,source:example.source });
assert.equal(outdated.response.status,409);
const latestPlan = await call(`/api/sessions/${prepId}/research/plan`, 'POST', { filename:example.filename,text:example.text,candidate:example.plan });
const submitted = await call(`/api/sessions/${prepId}/research/jobs`, 'POST', { filename: example.filename, text: example.text, plan: latestPlan.value.plan, confirmation_token:latestPlan.value.confirmation.token, confirmed: true, source: example.source, simulated: true });
assert.equal(submitted.response.status, 202);
assert.equal(submitted.value.execution_location, 'browser_webr');
const jobId = submitted.value.id;
assert.equal((await call(`/api/research/jobs/${jobId}`, 'GET', undefined, false)).response.status, 404);
const input = await call(`/api/research/jobs/${jobId}/input`);
assert.equal(input.value.n_rows, 160);
assert.match(input.value.csv, /^v0,v1,v2/);
const finished = await call(`/api/research/jobs/${jobId}/complete`, 'POST', {
  nonce: input.value.nonce,
  result: { r_version: 'R 4.6.0', package_versions: { fixest: '0.14.2' }, n_used: 160,
    coefficients: [{ term: 'education', estimate: .773997, std_error: .0322823, p_value: .001, ci_low: .710233, ci_high: .837761 }],
    warnings: ['Local API test only; this value was supplied by the test client.'] },
});
assert.equal(finished.value.status, 'succeeded');
for (const path of [`/api/sessions/${prepId}`, `/api/research/jobs/${jobId}`,
  `/api/research/jobs/${jobId}/input`, `/api/research/jobs/${jobId}/report`,
  `/api/research/jobs/${jobId}/package`, `/api/research/jobs/${jobId}/artifacts/coefficients.svg`]) {
  const outsider = await fetch(root + path, { headers: { Cookie: `ea_owner=${crypto.randomUUID()}` } });
  assert.equal(outsider.status, 404, path);
}
await call(`/api/research/jobs/${jobId}/reflection`, 'POST', { answer: '教育增加一年与收入增加约 0.77 千元相关，尚不能证明因果。' });
await call(`/api/research/jobs/${jobId}/reflection`, 'POST', { answer: '修订：还需核查混杂与变量口径。' });
const report = await call(`/api/research/jobs/${jobId}/report`);
assert.match(report.value, /服务器仅校验格式，未重新估计数值/);
assert.match(report.value, /修订：还需核查/);
const learning = await call(`/api/sessions/${prepId}/learning-report/md`);
assert.match(learning.value, /修订：还需核查/);
const archive = await fetch(`${root}/api/research/jobs/${jobId}/package`, { headers: { Cookie: cookie } });
assert.equal(archive.status, 200);
const magic = new Uint8Array(await archive.arrayBuffer()).slice(0, 4);
assert.deepEqual([...magic], [80, 75, 3, 4]);
const figure = await call(`/api/research/jobs/${jobId}/artifacts/coefficients.svg`);
assert.match(figure.value, /浏览器 webR 结果/);
const skipped = await call(`/api/sessions/${prepId}/method-learning/ols`,'POST',{choice:'skip'});
assert.equal(skipped.value.method_learning.ols.at(-1).skipped,true);
const tutorReply=await call(`/api/sessions/${prepId}/tutor`,'POST',{question:'关联与因果有什么区别？'});
assert.equal(tutorReply.value.tutor_records.at(-1).mode,'checklist');
const beforeRevision=tutorReply.value.research_revision;
const dictionary=await call(`/api/sessions/${prepId}/variable-dictionary`,'PUT',{dictionary:{income:'收入；千元',education:'教育；年'}});
assert.equal(dictionary.value.research_revision,beforeRevision+1);
assert.equal((await call(`/api/research/jobs/${jobId}`)).value.stale,true);
const repeated=await call(`/api/research/jobs/${jobId}/rerun`,'POST');
assert.equal(repeated.response.status,202);
assert.equal(repeated.value.research_revision,submitted.value.research_revision);
const originalResult=finished.value.result;
const checked=await call(`/api/research/jobs/${repeated.value.id}/complete`,'POST',{nonce:repeated.value.execution_nonce,result:originalResult});
assert.equal(checked.value.verification.status,'consistent');
const different=await call(`/api/research/jobs/${jobId}/rerun`,'POST');
const altered=structuredClone(originalResult);altered.coefficients[0].estimate+=0.01;
const difference=await call(`/api/research/jobs/${different.value.id}/complete`,'POST',{nonce:different.value.execution_nonce,result:altered});
assert.equal(difference.value.verification.status,'inconsistent');
assert.equal(difference.value.verification.differences[0].field,'estimate');
const jsonReport=await call(`/api/sessions/${prepId}/learning-report/json`);
assert.equal(jsonReport.value.research_jobs.find(j=>j.id===jobId).reflections.length,2);
assert.equal(jsonReport.value.variable_dictionary.income,'收入；千元');
assert.equal(jsonReport.value.research_jobs.some(j=>'owner' in j||'nonce' in j||'input_key' in j),false);
const updatedMarkdown=(await call(`/api/sessions/${prepId}/learning-report/md`)).value;
assert.match(updatedMarkdown,/已跳过/);assert.match(updatedMarkdown,/课程辅助问答/);
assert.equal((await call(`/api/sessions/${prepId}/learning-report/json`,'GET',undefined,false)).response.status,404);
assert.equal((await call(`/api/research/jobs/${jobId}/rerun`,'POST',{},false)).response.status,404);
const policy=await call('/api/sessions','POST');const policyId=policy.value.session_id;
await call(`/api/sessions/${policyId}/preparation/type`,'PUT',{question_type:'policy_evaluation'});
assert.equal((await call(`/api/sessions/${policyId}/research/plan`,'POST',{filename:didFixture.filename,text:didFixture.text,candidate:didFixture.plan})).response.status,422);
await call(`/api/sessions/${policyId}/preparation/design`,'PUT',{adoption_mode:'single_batch'});
assert.equal((await call(`/api/sessions/${policyId}/research/plan`,'POST',{filename:didFixture.filename,text:didFixture.text,candidate:didFixture.plan})).response.status,200);
await call(`/api/sessions/${policyId}/fields/policy_batches`,'PATCH',{value:'分批实施'});
const suitability=await call(`/api/sessions/${policyId}/actions`,'POST',{action:'check_suitability'});
assert.match(suitability.value.suitability.blockers.join(' '),/分批/);
assert.equal((await call(`/api/sessions/${policyId}/research/plan`,'POST',{filename:didFixture.filename,text:didFixture.text,candidate:didFixture.plan})).response.status,422);
await call(`/api/sessions/${policyId}`,'DELETE');
const removed = await call(`/api/sessions/${prepId}`, 'DELETE');
assert.equal(removed.value.ok, true);
assert.equal((await call(`/api/sessions/${prepId}`)).response.status, 404);
console.log('PASS: copied assets/cases, 8 lessons, hand-DID audit/tutorial, isolation, preparation, OLS plan, D1/R2 job, reflection revisions, reports, ZIP, chart, deletion.');
