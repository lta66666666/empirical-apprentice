export async function storeModelInteraction(env,audit,record){
  if(!env.DB||!audit?.session_id||!audit?.owner)return null;
  const entry={id:crypto.randomUUID(),record_version:1,...record,session_id:audit.session_id,task_id:audit.task_id||null,created_at:new Date().toISOString()};
  // Only controlled prompt messages and validated outputs; never provider headers/body or runtime secrets.
  await env.DB.prepare('INSERT INTO model_interactions(id,session_id,owner,kind,task_id,body,created_at) VALUES(?,?,?,?,?,?,?)')
    .bind(entry.id,audit.session_id,audit.owner,entry.kind,entry.task_id,JSON.stringify(entry),Date.now()).run();
  return entry.id;
}
export async function modelInteractions(env,sessionId,owner,taskId=null){
  const sql=taskId?'SELECT body FROM model_interactions WHERE session_id=? AND owner=? AND task_id=? ORDER BY created_at DESC LIMIT 200':'SELECT body FROM model_interactions WHERE session_id=? AND owner=? ORDER BY created_at DESC LIMIT 200';
  const query=env.DB.prepare(sql);const rows=await (taskId?query.bind(sessionId,owner,taskId):query.bind(sessionId,owner)).all();
  return rows.results.map(x=>JSON.parse(x.body)).reverse();
}
export function modelEvidenceMarkdown(records,full=true){
  const lines=['## Agent 交互记录（最近 200 条）','', '> 真实接口有效响应、固定自查与失败分别标识；有效响应不代表结论或来源已认证。'];
  if(!records.length)lines.push('- 暂无已保存交互记录。');
  for(const record of records){
    lines.push('',`### ${record.kind} · ${record.created_at}`,`- 记录：${record.id}；版本：${record.record_version}；任务：${record.task_id||'研究准备或课程'}`,`- 状态：${record.status}；模式：${record.mode}；模型：${record.model||'未配置'}；提示词：${record.prompt_version}；耗时：${record.duration_ms} ms`);
    if(record.failure_reason)lines.push(`- 失败或受阻原因：${record.failure_reason}`);
    if(record.diagnostics){const d=record.diagnostics;lines.push(`- 请求诊断：阶段 ${d.stage||'未知'}；尝试 ${d.attempts??0} 次；HTTP ${d.http_status??'无'}；结束原因 ${d.finish_reason||'无'}；输出长度 ${d.output_length??0} 字符；字段校验 ${(d.validation_errors||[]).join('、')||'通过或未进入'}`);}
    if(full)lines.push('','#### 输入摘要','```json',JSON.stringify(record.input_summary,null,2),'```','#### 实际提示词','```json',JSON.stringify(record.messages,null,2),'```','#### 输出','```json',JSON.stringify(record.output,null,2),'```');
    else lines.push(`- 问题／作答：${String(record.input_summary.question||record.input_summary.answer||'').slice(0,300)}`,`- 输出摘要：${String(record.output.reason||record.output.answer||record.output.detail||'').slice(0,400)}`,'- 完整提示词与输入输出见同一练习的 Agent 交互证据下载；任务反馈另见复现包 agent_interactions.json。');
  }
  return lines.join('\n')+'\n';
}
