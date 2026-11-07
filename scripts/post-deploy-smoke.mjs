// 部署后冒烟检查：只读探测，不创建账号、不提交计算。
// 用法：node scripts/post-deploy-smoke.mjs https://ea-demo.duckdns.org:8000
// 可选：EA_SMOKE_USERNAME / EA_SMOKE_PASSWORD 提供时，额外核对已登录的研究状态接口。
import assert from 'node:assert/strict';

const base = (process.env.EA_SMOKE_URL || process.argv[2] || 'http://127.0.0.1:18000').replace(/\/$/, '');
const origin = new URL(base).origin;
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
});

await step('登录页 200 且带 X-Request-Id', async () => {
  const response = await fetch(base + '/login');
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type') || '', /text\/html/);
  assert.ok(response.headers.get('x-request-id'), '缺少 X-Request-Id（非 standalone 部署可豁免）');
});

await step('静态资源可访问', async () => {
  const response = await fetch(base + '/static/app.js');
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type') || '', /javascript/);
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
