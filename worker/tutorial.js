import { tutorialSteps, tutorialCsv, tutorialBroken } from './content.js';
import { loadOwnedSession, saveSession, sessionPayload, requireSessionVersion } from './sessions.js';
import {ensureLearningContext} from './course.js';
import { zipFiles } from './zip.js';

const publicCase = {
  id: 'energy-intro-v1', title: '独立手算小练习：8 行模拟数据', simulation: true,
  steps: tutorialSteps.map(({ correct, feedback, ...step }, index) => index === 0
    ? { ...step, body: '【案例切换】这里使用独立的 8 行手算数据，DID 为 −2 个指标单位；八阶段课程主线使用另一份数据，数值不可混用。\n\n' + step.body }
    : step),
  csv: tutorialCsv, broken_csv: tutorialBroken, animation:teachingAnalysis().endpoints,
  data_source: '本项目手工构造的教学数据；无真实政策来源，不可用于真实研究结论。',
};

function teachingAnalysis() {
  const rows = tutorialCsv.trim().split('\n').slice(1).map((line) => {
    const [city, year, outcome, treated] = line.split(',');
    return { city, year: Number(year), outcome: Number(outcome), treated: Number(treated) };
  });
  const mean = (group, year) => {
    const values = rows.filter((row) => row.treated === group && row.year === year).map((row) => row.outcome);
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  };
  const t0 = mean(1, 2014), t1 = mean(1, 2015), c0 = mean(0, 2014), c1 = mean(0, 2015);
  const estimate = (t1 - t0) - (c1 - c0);
  return { estimate, endpoints:{t0,t1,c0,c1}, report_markdown: `# 模拟案例手算核对\n\n- 数据：固定教学 CSV，8 行；4 城市 × 2 年。\n- 处理组均值：${t0} → ${t1}，变化 ${t1 - t0}。\n- 对照组均值：${c0} → ${c1}，变化 ${c1 - c0}。\n- DID：(${t1}−${t0})−(${c1}−${c0})=${estimate} 个指标单位。\n\n这是教学数据的描述性手算，不是政策因果证明；两期数据不足以核对政策前趋势。\n` };
}

export async function handleTutorial(request, env, owner, path) {
  if (path === '/api/tutorial' && request.method === 'GET') return Response.json(publicCase);
  if (path === '/api/tutorial/data/clean' && request.method === 'GET') return new Response(tutorialCsv, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="synthetic-energy-clean.csv"' } });
  if (path === '/api/tutorial/data/broken' && request.method === 'GET') return new Response(tutorialBroken, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="synthetic-energy-broken.csv"' } });
  if (path === '/api/tutorial/package' && request.method === 'GET') {
    const script = `import csv\nfrom collections import defaultdict\nfrom pathlib import Path\ncells=defaultdict(list)\nwith (Path(__file__).parent/'clean.csv').open(encoding='utf-8') as f:\n    for row in csv.DictReader(f): cells[int(row['treated']),int(row['year'])].append(float(row['outcome']))\nmeans={key:sum(values)/len(values) for key,values in cells.items()}\nvalue=(means[1,2015]-means[1,2014])-(means[0,2015]-means[0,2014])\nprint('Descriptive DID:',value)\nassert abs(value-(-2))<1e-10\n`;
    return new Response(zipFiles({ 'clean.csv': tutorialCsv, 'broken.csv': tutorialBroken, 'reproduce.py': script,
      'README.md': '# 虚构节能案例\n教学模拟数据；DID=-2 个指标单位，不能证明因果。\n', 'case.json': JSON.stringify(publicCase, null, 2) }),
    { headers: { 'Content-Type': 'application/zip', 'Content-Disposition': 'attachment; filename="synthetic-energy-lab.zip"' } });
  }
  const match = /^\/api\/sessions\/([a-z0-9]{12})\/tutorial\/answer$/.exec(path);
  if (!match || request.method !== 'POST') return null;
  const state = await loadOwnedSession(env, owner, match[1]);
  if (state === 'expired') return Response.json({ detail: '会话已到期。' }, { status: 410 });
  if (!state) return Response.json({ detail: '会话不存在或不属于当前浏览器。' }, { status: 404 });
  try{
  const body = await request.json().catch(() => null);
  requireSessionVersion(state,body);
  const step = body?.step, choice = body?.choice;
  if (!Number.isInteger(step) || !Number.isInteger(choice) || step < 0 || step >= tutorialSteps.length || choice < 0 || choice >= tutorialSteps[step].options.length) return Response.json({ detail: '无效的练习选项。' }, { status: 422 });
  const progress = state.tutorial, records = progress.records ||= {};
  if (Array.from({ length: step }, (_, index) => index).some((index) => !records[index]?.passed)) return Response.json({ detail: '请先完成前面的练习。' }, { status: 422 });
  const selected = tutorialSteps[step], old = records[step] || {};
  records[step] = { choice, attempts: (old.attempts || 0) + 1,
    passed: old.passed || choice === selected.correct,
    last_correct: choice === selected.correct, feedback: selected.feedback };
  if (step === 3 && choice === selected.correct) progress.analysis = teachingAnalysis();
  progress.complete = tutorialSteps.every((_, index) => records[index]?.passed);
  ensureLearningContext(state).tutorial_step=step;
  await saveSession(env, state);
  return Response.json(await sessionPayload(env, state));
  }catch(e){return Response.json({detail:e.message,state_version:e.state_version},{status:e.status||422});}
}
