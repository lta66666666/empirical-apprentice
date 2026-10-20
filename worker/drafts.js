import {getStataGuide,stataGuideVersion} from './stata-guide.js';
export async function readDrafts(env, sessionId) {
  const rows = await env.DB.prepare('SELECT draft_key,body,version,updated_at FROM research_drafts WHERE session_id=?').bind(sessionId).all();
  return Object.fromEntries(rows.results.map(row => [row.draft_key, {value:JSON.parse(row.body),version:row.version,updated_at:row.updated_at}]));
}

export async function draftEndpoint(request,env,state,tail) {
  if(tail==='drafts'&&request.method==='GET') return Response.json({drafts:await readDrafts(env,state.session_id)});
  const key=tail.slice(7);
  if(!/^drafts\/(workbench|local-workbench|analysis-context|stata-reading|stata-guide|stata-guide-intro|practical-chat|analysis-formula|reflection:[a-z0-9-]{36}|local-reflection:[a-z0-9-]{36})$/.test(tail)||request.method!=='PUT')return null;
  if(key.startsWith('local-reflection:')){
    const task=await env.DB.prepare('SELECT id FROM local_stata_tasks WHERE id=? AND session_id=? AND owner=?').bind(key.slice('local-reflection:'.length),state.session_id,state.owner_id).first();
    if(!task)return Response.json({detail:'本机解释任务不存在。'},{status:404});
  }
  if(key.startsWith('reflection:')){
    const job=await env.DB.prepare('SELECT id FROM jobs WHERE id=? AND session_id=? AND owner=?').bind(key.slice(11),state.session_id,state.owner_id).first();
    if(!job)return Response.json({detail:'解释任务不存在。'},{status:404});
  }
  const {value,version}=await request.json();
  if(!Number.isInteger(version)||version<0||!value||typeof value!=='object'||Array.isArray(value))throw Error('草稿版本或内容无效。');
  if(key==='analysis-context'&&(Object.keys(value).some(k=>!['engine_id'].includes(k))||!['browser_webr','stata_local_mcp','statspai_local'].includes(value.engine_id)))throw Error('执行方式无效');
  if(key==='stata-guide'){
    if(Object.keys(value).some(k=>!['lesson_id','step_id','guide_version','view_only'].includes(k))||value.view_only!==true||value.guide_version!==stataGuideVersion)throw Error('操作指南阅读记录无效，请重新打开指南。');
    getStataGuide(value.lesson_id,value.step_id);
  }
  if(key==='stata-guide-intro'&&(Object.keys(value).length!==1||value.dismissed!==true))throw Error('指南提示记录无效。');
  if(key==='stata-reading'){
    if(Object.keys(value).some(k=>!['task_id','preview_hash','command_id','viewed','view_only'].includes(k))||value.view_only!==true||!Array.isArray(value.viewed)||value.viewed.length>100)throw Error('代码阅读记录无效。');
    const row=await env.DB.prepare('SELECT body FROM local_stata_tasks WHERE id=? AND session_id=? AND owner=?').bind(value.task_id,state.session_id,state.owner_id).first();
    const task=row&&JSON.parse(row.body),preview=task?.teaching_preview;
    if(!preview||value.preview_hash!==preview.preview_hash||!preview.commands.some(c=>c.id===value.command_id)||!value.viewed.every(id=>preview.commands.some(c=>c.id===id)))return Response.json({detail:'代码预览已变化，请重新选择。'},{status:409});
  }
  const body=JSON.stringify(value);
  if(body.length>30000)throw Error('草稿内容过长，请精简文字。');
  if(key.startsWith('reflection:')&&(typeof value.answer!=='string'||value.answer.length>2000))throw Error('解释草稿最多 2000 字。');
  if(key.startsWith('local-reflection:')&&(typeof value.answer!=='string'||value.answer.length>4000))throw Error('本机解释草稿最多4000字。');
  const now=Date.now();
  const update=version===0
    ? await env.DB.prepare('INSERT INTO research_drafts(session_id,draft_key,body,version,updated_at) VALUES(?,?,?,1,?) ON CONFLICT(session_id,draft_key) DO NOTHING').bind(state.session_id,key,body,now).run()
    : await env.DB.prepare('UPDATE research_drafts SET body=?,version=version+1,updated_at=? WHERE session_id=? AND draft_key=? AND version=?').bind(body,now,state.session_id,key,version).run();
  if(!update.meta.changes)return Response.json({detail:'另一标签页已修改此草稿。当前文字保留，请重新读取草稿后再保存。'},{status:409});
  return Response.json({value,version:version+1,updated_at:now});
}
