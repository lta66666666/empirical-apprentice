import {ensureAuthSchema} from './auth.js';
import {syncCloudJob} from './research.js';
import {cleanupResearchData} from './research-data.js';
const RETENTION = 7 * 86400000;

export async function cleanupExpired(env) {
  if (!env.DB || !env.FILES) throw new Error('Storage unavailable');
  const remote=await env.DB.prepare("SELECT body FROM jobs WHERE body LIKE '%cloud_native%' AND status IN ('running','queued','preparing','estimating','saving') LIMIT 100").all();
  for(const row of remote.results)await syncCloudJob(env,JSON.parse(row.body));
  const now = Date.now(), cutoff = now - RETENTION;
  await ensureAuthSchema(env);
  await env.DB.prepare('DELETE FROM auth_sessions WHERE expires_at<=?').bind(now).run();
  await env.DB.prepare('DELETE FROM auth_attempts WHERE created_at<?').bind(now-3600000).run();
  await env.DB.prepare('DELETE FROM local_pairings WHERE owner IS NULL AND expires_at<=?').bind(now).run();
  await env.DB.prepare('DELETE FROM local_pair_attempts WHERE created_at<=?').bind(now-300000).run();
  const staleRunning = await env.DB.prepare("SELECT id,body FROM jobs WHERE status='running' AND body NOT LIKE '%cloud_native%' AND lease_until<? LIMIT 100").bind(now).all();
  for (const row of staleRunning.results) {
    const job = JSON.parse(row.body);
    job.status = 'interrupted';
    job.error = '浏览器执行已中断，可重新核对后运行。';
    await env.DB.prepare("UPDATE jobs SET body=?,status='interrupted',lease_until=0 WHERE id=? AND status='running' AND body NOT LIKE '%cloud_native%' AND lease_until<?")
      .bind(JSON.stringify(job), row.id, now).run();
  }
  const expiredJobs = await env.DB.prepare("SELECT id,input_key FROM jobs WHERE last_activity<=? AND status NOT IN ('running','queued','preparing','estimating','saving') LIMIT 100").bind(cutoff).all();
  let jobs = 0;
  for (const row of expiredJobs.results) {
    await env.FILES.delete([row.input_key,row.input_key+'.node.json']);
    const result = await env.DB.prepare("DELETE FROM jobs WHERE id=? AND last_activity<=? AND status NOT IN ('running','queued','preparing','estimating','saving')").bind(row.id, cutoff).run();
    jobs += result.meta.changes;
  }
  const expiredSessions = await env.DB.prepare("SELECT id FROM sessions WHERE last_activity<=? AND id NOT IN (SELECT session_id FROM jobs WHERE status IN ('running','queued','preparing','estimating','saving')) AND id NOT IN (SELECT session_id FROM local_stata_tasks WHERE status IN ('running','cancel_requested')) LIMIT 100").bind(cutoff).all();
  let sessions = 0;
  for (const row of expiredSessions.results) {
    await cleanupResearchData(env,row.id);
    const remaining = await env.DB.prepare('SELECT id,input_key FROM jobs WHERE session_id=?').bind(row.id).all();
    for (const job of remaining.results) {
      await env.FILES.delete([job.input_key,job.input_key+'.node.json']);
      await env.DB.prepare("DELETE FROM jobs WHERE id=? AND status NOT IN ('running','queued','preparing','estimating','saving')").bind(job.id).run();
    }
    const result = await env.DB.prepare("DELETE FROM sessions WHERE id=? AND last_activity<=? AND id NOT IN (SELECT session_id FROM jobs WHERE status IN ('running','queued','preparing','estimating','saving')) AND id NOT IN (SELECT session_id FROM local_stata_tasks WHERE status IN ('running','cancel_requested'))").bind(row.id, cutoff).run();
    sessions += result.meta.changes;
  }
  const calls = await env.DB.prepare('DELETE FROM model_calls WHERE created_at<=?').bind(cutoff).run();
  return { interrupted: staleRunning.results.length, jobs, sessions, model_calls: calls.meta.changes, checked_at: now,
    more_possible: expiredJobs.results.length === 100 || expiredSessions.results.length === 100 };
}
