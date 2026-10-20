/* Server-owned drafts never replace submitted learning evidence. */
const eaDraftSessions=new Map(),eaResearchInputCache=new Map();
window.eaRememberResearchInput=()=>{if(!researchData||!eaInputHash||!sessionId)return;const key=(window.EA_ACCOUNT?.id||'')+':'+sessionId;eaResearchInputCache.set(key,{hash:eaInputHash,data:structuredClone(researchData)});if(eaResearchInputCache.size>5)eaResearchInputCache.delete(eaResearchInputCache.keys().next().value);};
let eaDraftRestoreEpoch=0,eaInputHash='';
function eaDraftStore(id=sessionId){if(!eaDraftSessions.has(id))eaDraftSessions.set(id,new Map());return eaDraftSessions.get(id);}
function eaDraftEntry(key,id=sessionId){const store=eaDraftStore(id);if(!store.has(key)){let cached=null;try{cached=JSON.parse(storageGet('ea_draft_cache:'+id+':'+key)||'null');}catch{}store.set(key,{key,id,version:cached?.version||0,value:cached?.value||{},dirty:!!cached,serial:0,timer:null,inflight:null});}return store.get(key);}
function eaCacheDraft(entry){if(entry.dirty)storageSet('ea_draft_cache:'+entry.id+':'+entry.key,JSON.stringify({version:entry.version,value:entry.value}));else storageRemove('ea_draft_cache:'+entry.id+':'+entry.key);}
window.eaFlushAllDrafts=async(id=sessionId)=>{const results=await Promise.all([...eaDraftStore(id).values()].map(entry=>eaFlushDraft(entry.key,id)));return results.every(Boolean);};
function eaDraftMessage(entry,node){if(node){node.textContent=entry.error|| (entry.dirty?'草稿待保存…':entry.value.submitted?'已提交解释的副本已保存；继续编辑会形成新草稿':entry.version?'草稿已保存到当前练习；尚未提交':'填写后自动保存草稿');node.classList.toggle('is-error',Boolean(entry.error));if(entry.error)node.append(button(entry.conflict?'检查草稿冲突':'重试保存','text-btn',()=>entry.conflict?eaResolveDraft(entry):eaFlushDraft(entry.key,entry.id)));}}
async function eaResolveDraft(entry){
  try{
    const records=await api(`/api/sessions/${entry.id}/drafts`),saved=records.drafts[entry.key];if(!saved)throw Error('服务器草稿不存在，请先导出本页文字。');
    const dialog=el('dialog','ea-draft-conflict');dialog.setAttribute('aria-label','核对草稿冲突');dialog.append(el('h2','','另一标签页修改了草稿'),el('p','','核对两份文字后选择保留版本；本页文字不会被自动覆盖。'));
    for(const [label,value]of [['本页未保存内容',entry.value],['服务器最新草稿',saved.value]]){const section=el('details');section.open=true;section.append(el('summary','',label),el('pre','',JSON.stringify(value.dictionary||value.answer||value,null,2)));dialog.append(section);}
    const close=()=>{dialog.close();dialog.remove();};dialog.addEventListener('cancel',close);
    dialog.append(button('暂不处理，保留本页文字','btn-secondary',close),button('读取服务器版本并刷新','btn-secondary',()=>{entry.dirty=false;entry.conflict=false;close();location.reload();}),button('确认用本页草稿更新服务器','btn-primary',async()=>{entry.version=saved.version;entry.conflict=false;entry.error='';close();await eaFlushDraft(entry.key,entry.id);}));document.body.append(dialog);dialog.showModal();
  }catch(e){entry.error=e.message;eaDraftMessage(entry,entry.node);}
}
function eaQueueDraft(key,value,node,id=sessionId){
  if(!id)return;
  const entry=eaDraftEntry(key,id);
  entry.node=node;if(JSON.stringify(entry.value)===JSON.stringify(value)){eaDraftMessage(entry,node);return;}
  entry.value=value;entry.dirty=true;entry.serial++;eaCacheDraft(entry);if(!entry.conflict)entry.error='';eaDraftMessage(entry,node);
  clearTimeout(entry.timer);entry.timer=setTimeout(()=>eaFlushDraft(key,id),750);
}
async function eaFlushDraft(key,id=sessionId){
  const entry=eaDraftEntry(key,id);clearTimeout(entry.timer);
  // All callers share one drain. Waiting on a previous write must not create
  // several successors with the same optimistic version.
  if(entry.inflight)return entry.inflight;
  if(!entry.dirty||entry.conflict)return !entry.error&&!entry.conflict;
  entry.inflight=(async()=>{
    while(entry.dirty&&!entry.conflict){
      const serial=entry.serial,value=structuredClone(entry.value);entry.error='';
      try{
        let saved;
        try{saved=await api(`/api/sessions/${id}/drafts/${key}`,{method:'PUT',body:{version:entry.version,value}});}
        catch(error){
          // A timed-out successful write or an identical remote draft is
          // recoverable. Different content remains an explicit conflict.
          if(error.status===409||error.uncertain){
            const records=await api(`/api/sessions/${id}/drafts`),remote=records.drafts[key];
            if(remote&&JSON.stringify(remote.value)===JSON.stringify(value))saved=remote;
            else{entry.remote=remote||null;throw error;}
          }else throw error;
        }
        entry.version=saved.version;entry.updated_at=saved.updated_at;entry.error='';entry.lastSaved=structuredClone(value);
        if(serial===entry.serial)entry.dirty=false;
      }catch(error){entry.error=`草稿未保存：${error.message}`;entry.conflict=error.status===409;break;}
      finally{eaCacheDraft(entry);eaDraftMessage(entry,entry.node);}
    }
    return !entry.error&&!entry.conflict;
  })();
  try{return await entry.inflight;}finally{entry.inflight=null;eaDraftMessage(entry,entry.node);}
}
function eaHydrateDrafts(data){
  for(const [key,saved]of Object.entries(data.research_drafts||{})){
    const entry=eaDraftEntry(key,data.session_id);
    if(!entry.dirty&&!entry.inflight){entry.version=saved.version;entry.value=saved.value;entry.updated_at=saved.updated_at;}
  }
}
function eaWorkbenchSnapshot(){
  const prior=eaDraftEntry('workbench').value;
  return {ui_view:window.eaCurrentAnalysisView||'data',filename:researchData?.filename||prior.filename||'',input_sha256:eaInputHash,simulated:researchData?Boolean(researchData.simulated):Boolean(prior.simulated),fixture_method:researchData?researchData.fixture_method||null:prior.fixture_method||null,
    profile:researchProfileCache?{row_count:researchProfileCache.row_count,columns:researchProfileCache.columns.map(c=>({name:c.name,numeric:c.numeric,missing:c.missing}))}:null,
    dictionary:eaDictionaryValues(),question:$('researchInstruction').value,source:$('researchSource').value,candidate:researchCandidate()};
}
function eaDictionaryValues(){
  const draft=eaDraftEntry('workbench').value;
  const dict={...(researchData?.dictionary||latestState?.variable_dictionary||{}),...(draft.input_sha256===eaInputHash?draft.dictionary||{}:{})};
  if($('eaDictionaryEditor')?.dataset.inputHash===eaInputHash)for(const input of document.querySelectorAll('#eaDictionaryEditor input[data-column]'))dict[input.dataset.column]=input.value;
  return dict;
}
function eaSaveWorkbenchDraft(){if(sessionId&&researchProfileCache&&eaInputHash)eaQueueDraft('workbench',eaWorkbenchSnapshot(),$('eaDraftStatus'));}
async function eaCaptureInput(){
  const epoch=++eaDraftRestoreEpoch,id=sessionId,text=researchData?.text;if(!text)return;
  const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));
  if(epoch!==eaDraftRestoreEpoch||id!==sessionId)return;
  eaInputHash=Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
  const draft=eaDraftEntry('workbench').value;
  if(draft.input_sha256===eaInputHash){
    researchData.dictionary={...(researchData.dictionary||{}),...(latestState.variable_dictionary||{})};
    $('researchInstruction').value=draft.question||'';$('researchSource').value=draft.source||'';
    researchSetFields(researchProfileCache,draft.candidate||{});
    researchNotice('已恢复该数据的方案与字典草稿。草稿未提交，执行前需重新核对。');
  }else eaQueueDraft('workbench',eaWorkbenchSnapshot(),$('eaDraftStatus'));
  if(typeof eaRenderDictionary==='function')eaRenderDictionary();
}
async function eaRestoreWorkbench(data){
  eaHydrateDrafts(data);const draft=eaDraftEntry('workbench',data.session_id).value;
  if(!draft.profile||researchData)return;
  const epoch=++eaDraftRestoreEpoch,id=data.session_id;eaInputHash=draft.input_sha256||'';
  researchProfileCache=draft.profile;
  $('researchInstruction').value=draft.question||'';$('researchSource').value=draft.source||'';
  researchSetFields(draft.profile,draft.candidate||{});
  const remembered=eaResearchInputCache.get((window.EA_ACCOUNT?.id||'')+':'+id);
  if(remembered?.hash===draft.input_sha256){researchData=structuredClone(remembered.data);researchData.dictionary={...researchData.dictionary,...draft.dictionary};eaRenderDictionary();}
  else if(draft.simulated&&draft.fixture_method){
    try{const example=await api(`/api/research/examples/${draft.fixture_method}`);
      if(epoch!==eaDraftRestoreEpoch||sessionId!==id||researchData)return;
      const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(example.text));
      const hash=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
      if(hash!==draft.input_sha256)throw Error('模拟输入已变化，请重新载入并核对。');
      researchData={...example,dictionary:{...example.dictionary,...data.variable_dictionary},fixture_method:draft.fixture_method};eaRenderDictionary();
      researchNotice('已恢复模拟数据与未提交草稿，请重新核对方案。');
    }catch(e){researchNotice(e.message,true);}
  }else researchNotice('已恢复字段、研究文字与字典草稿。原始上传文件未保存为草稿；执行前请重新上传同一文件。');
  eaDraftMessage(eaDraftEntry('workbench'),$('eaDraftStatus'));
}
document.querySelector('.research-input').addEventListener('input',eaSaveWorkbenchDraft);
document.querySelector('.research-input').addEventListener('change',eaSaveWorkbenchDraft);
document.addEventListener('visibilitychange',()=>{if(document.hidden)for(const [id,store]of eaDraftSessions)for(const [key,entry]of store)if(entry.dirty)eaFlushDraft(key,id);});
window.addEventListener('beforeunload',e=>{if([...eaDraftSessions.values()].some(store=>[...store.values()].some(x=>x.dirty||x.inflight))){e.preventDefault();e.returnValue='';}});
