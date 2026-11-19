// 部署后冒烟检查：只读探测，不创建账号、不提交计算。
// 用法：node scripts/post-deploy-smoke.mjs https://ea-demo.duckdns.org:8000
// 可选：EA_SMOKE_USERNAME / EA_SMOKE_PASSWORD 提供时，额外核对已登录的研究状态接口。
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

const base = (process.env.EA_SMOKE_URL || process.argv[2] || 'http://127.0.0.1:18000').replace(/\/$/, '');
const origin = new URL(base).origin;
const REAL_DATA_HASH = '504602230ad052d9fd24a5db10b8f3524bce9011fa96f7c59eea0173b3b0542e';
const checks = [];
let cookie = '';

async function step(name, fn) {
  try { await fn(); checks.push({ check: name, pass: true }); }
  catch (error) { checks.push({ check: name, pass: false, detail: String(error?.message || error).slice(0, 200) }); }
}

await step('healthz 200', async () => {
  const response = await fetch(base + '/healthz');
  assert.equal(response.status, 200);
  const body = await response.json().catch(() => null);
  assert.equal(body?.status, 'ok');
  assert.notEqual(body?.executor, 'down', '执行器不可达');
});

await step('登录页 200 且带 X-Request-Id', async () => {
  const response = await fetch(base + '/login');
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type') || '', /text\/html/);
  assert.ok(response.headers.get('x-request-id'), '缺少 X-Request-Id（非 standalone 部署可豁免）');
  assert.equal(response.headers.get('x-frame-options'), 'DENY');
  assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
  assert.match(response.headers.get('content-security-policy-report-only') || '', /report-uri \/api\/csp-report/);
});

await step('CSP 上报端点返回 204', async () => {
  const response = await fetch(base + '/api/csp-report', {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/csp-report' },
    body: JSON.stringify({ 'csp-report': { 'document-uri': origin + '/login', 'violated-directive': 'script-src', 'blocked-uri': 'inline' } }),
  });
  assert.equal(response.status, 204);
});

await step('静态资源可访问', async () => {
  const response = await fetch(base + '/static/app.js');
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type') || '', /javascript/);
});

await step('比赛证据页面可访问', async () => {
  for (const [path, marker] of [
    ['/static/judge-guide.html', '验收指南'],
    ['/static/random-did-demo.html', '随机 DID'],
    ['/static/local-assistant-guide.html', '本机'],
    ['/static/random-did-data.csv', 'city,year,treated,investment,emissions'],
    ['/static/real-data-demo.html', 'World Bank'],
    ['/static/real-data-actions.js', 'copyHash'],
    ['/static/beginner-demo.html', '3 分钟零基础体验'],
    ['/static/beginner-demo.js', 'revealResult'],
    ['/static/real-data/world-bank-china-2000-2023.csv', 'year,internet_users_pct,gdp_per_person_employed_ppp,gross_capital_formation_pct'],
  ]) {
    const response = await fetch(base + path);
    assert.equal(response.status, 200, path);
    const text = await response.text();
    assert.ok(text.includes(marker), path);
    if (path.endsWith('.csv')) assert.equal(text.trim().split('\n').length, path.includes('world-bank') ? 25 : 481, path);
  }
});

await step('真实数据哈希与证据页一致', async () => {
  const csv = await (await fetch(base + '/static/real-data/world-bank-china-2000-2023.csv')).text();
  assert.equal(createHash('sha256').update(csv, 'utf8').digest('hex'), REAL_DATA_HASH);
  const page = await (await fetch(base + '/static/real-data-demo.html')).text();
  assert.ok(page.includes(REAL_DATA_HASH));
  assert.ok(page.includes('id="copyHash"'));
});

await step('畸形 JSON 返回 400 且带请求 ID', async () => {
  const response = await fetch(base + '/api/auth/login', {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: '{bad',
  });
  assert.equal(response.status, 400);
  assert.ok(response.headers.get('x-request-id'));
});

if (process.env.EA_SMOKE_USERNAME && process.env.EA_SMOKE_PASSWORD) {
  await step('已登录研究状态仅两种执行方式', async () => {
    const login = await fetch(base + '/api/auth/login', {
      method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: process.env.EA_SMOKE_USERNAME, password: process.env.EA_SMOKE_PASSWORD }),
    });
    assert.equal(login.status, 200);
    cookie = (login.headers.getSetCookie?.() || []).map((value) => value.split(';')[0]).join('; ');
    const status = await fetch(base + '/api/research/status', { headers: { Origin: origin, Cookie: cookie } });
    assert.equal(status.status, 200);
    const body = await status.json();
    assert.deepEqual(body.software.map((item) => item.id), ['statspai_cloud', 'browser_webr']);
    assert.ok(body.methods.includes('staggered_did'));
    assert.equal(body.method_registry.engines?.ols?.includes('r_native') ?? false, false);
  });
}

const failed = checks.filter((item) => !item.pass);
console.log(JSON.stringify({ url: base, checks, failed: failed.length }, null, 2));
if (failed.length) process.exit(1);
