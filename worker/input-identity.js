// One active identity shared by conversation, suggestions and teaching.
export function inputIdentity(state){
 const engine=state.research_drafts?.['analysis-context']?.value?.engine_id;
 const local=['stata_local_mcp','statspai_local'].includes(engine);
 const work=state.research_drafts?.workbench?.value,pair=state._local_input;
 if(local&&pair?.input_sha256)return {kind:'local',sha256:pair.input_sha256,pairing_id:pair.id||null};
 if(work?.input_sha256)return {kind:work.data_id?'material':'browser',sha256:work.input_sha256,data_id:work.data_id||null};
 if(pair?.input_sha256)return {kind:'local',sha256:pair.input_sha256,pairing_id:pair.id||null};
 return {kind:'none',sha256:''};
}
