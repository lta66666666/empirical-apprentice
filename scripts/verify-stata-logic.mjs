import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const { openStorage } = await import('../standalone/storage.mjs');
const { localTasks, handleLocalStata } = await import('../worker/local-stata.js');
const { handleSessions, loadOwnedSession } = await import('../worker/sessions.js');

const dir = await mkdtemp(join(tmpdir(), 'stata-check-'));
const store = await openStorage(dir);
store.sqlite.exec('PRAGMA foreign_keys=OFF');
const sha = (text) => createHash('sha256').update(text).digest('hex');
const now = Date.now();
const env = { DB: store.DB, FILES: store.FILES, STATA_MCP_VERSIONS: '1.4.0' };
const insertPair = (id, code, owner, session, lastSeen = now) => store.DB.prepare(
  'INSERT INTO local_pairings(id,code,token_hash,owner,session_id,created_at,expires_at,last_seen,revoked,body) VALUES(?,?,?,?,?,?,?,?,?,?)'
).bind(id, code, sha('a'.repeat(64)), owner, session, now - 600000, now + 86400000, lastSeen, 0, '{}').run();

const pairId = randomUUID(), taskId = randomUUID();
await insertPair(pairId, '123456', 'owner1', 'sess1', now - 120000);
await store.DB.prepare(
  'INSERT INTO local_stata_tasks(id,pairing_id,session_id,owner,status,body,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)'
).bind(taskId, pairId, 'sess1', 'owner1', 'running', JSON.stringify({
  id: taskId, pairing_id: pairId, session_id: 'sess1', owner: 'owner1', status: 'running',
  plan: { method: 'ols', predictors: [] }, input_sha256: sha('input'), plan_sha256: sha('plan'),
  research_revision: 1, created_at: now - 120000,
}), now - 120000, now - 120000).run();
const tasks = await localTasks(env, 'owner1', 'sess1');
assert.equal(tasks[0].status, 'interrupted');
assert.match(tasks[0].error, /90 秒无心跳/);

const pair2 = randomUUID();
await insertPair(pair2, '654321', null, null);
async function heartbeat(version) {
  const response = await handleLocalStata(
    new Request(`http://localhost/api/local-stata/agent/${pair2}/heartbeat`, {
      method: 'POST', headers: { Authorization: 'Bearer ' + 'a'.repeat(64), 'Content-Type': 'application/json' },
      body: JSON.stringify({ mcp_version: version, mcp_available: true }),
    }), env, null, `/api/local-stata/agent/${pair2}/heartbeat`,
  );
  const row = await store.DB.prepare('SELECT body FROM local_pairings WHERE id=?').bind(pair2).first();
  return { status: response.status, body: JSON.parse(row.body) };
}
assert.equal((await heartbeat('1.4.0')).body.mcp_supported, true);
assert.equal((await heartbeat('0.9.0')).body.mcp_supported, false);

const teachingOnly = await handleLocalStata(
  new Request(`http://localhost/api/local-stata/agent/${pair2}/heartbeat`, {
    method: 'POST', headers: { Authorization: 'Bearer ' + 'a'.repeat(64), 'Content-Type': 'application/json' },
    body: JSON.stringify({ mcp_version: '1.4.0', mcp_available: true }),
  }), { ...env, STATA_TEACHING_ONLY: 'true' }, null, `/api/local-stata/agent/${pair2}/heartbeat`,
);
assert.equal(teachingOnly.status, 403, '教学专用模式应关闭助手执行入口');

const created = await (await handleSessions(
  new Request('http://localhost/api/sessions', { method: 'POST' }),
  env, 'owner3', '/api/sessions',
)).json();
const state = await loadOwnedSession(env, 'owner3', created.session_id);
const pair3 = randomUUID(), task3 = randomUUID();
await insertPair(pair3, '777777', 'owner3', created.session_id);
await store.DB.prepare(
  'INSERT INTO local_stata_tasks(id,pairing_id,session_id,owner,status,body,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)'
).bind(task3, pair3, created.session_id, 'owner3', 'awaiting_approval', JSON.stringify({
  id: task3, pairing_id: pair3, session_id: created.session_id, owner: 'owner3', status: 'awaiting_approval',
  plan: { method: 'ols', predictors: [] }, input_sha256: sha('input'), plan_sha256: sha('plan'),
  research_revision: state.research_revision, created_at: now,
}), now, now).run();
const blocked = await handleLocalStata(
  new Request(`http://localhost/api/local-stata/agent/${pair3}/event`, {
    method: 'POST', headers: { Authorization: 'Bearer ' + 'a'.repeat(64), 'Content-Type': 'application/json' },
    body: JSON.stringify({ task_id: task3, status: 'running', code_sha256: sha('code'), input_sha256: sha('input'), mcp_version: '1.4.0' }),
  }), env, 'owner3', `/api/local-stata/agent/${pair3}/event`,
);
const payload = await blocked.json();
assert.equal(blocked.status, 409, '没有教学预览不得启动执行');
assert.match(payload.detail, /教学预览/, '应提示先确认教学预览');

store.close();
console.log(JSON.stringify({ checks: ['stale_running_interrupted', 'mcp_allowed_true', 'mcp_blocked_false', 'preview_required_409'] }));
