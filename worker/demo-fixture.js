import {fixtures} from './fixtures.js';
import {parseCsv} from './research.js';
export const fixtureVersion='teaching-fixtures-v1';
export async function fixtureDescriptor(id,version=fixtureVersion){
 if(!Object.hasOwn(fixtures,id)||version!==fixtureVersion)throw Object.assign(Error('示范案例版本无效，请刷新页面或更新助手。'),{status:422});
 const fixture=fixtures[id],input_sha256=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(fixture.text)))].map(v=>v.toString(16).padStart(2,'0')).join('');
 return {...fixture,fixture_id:id,fixture_version:version,input_sha256,profile:parseCsv(fixture.text,fixture.filename).profile};
}
export function seedFixture(state,f){
 const values={question:f.question,sample:f.fixture_id==='ols'?'160个模拟观察对象':'48个模拟城市，2014–2021年',outcome:f.dictionary[f.plan.outcome],predictor:f.plan.predictors.map(x=>x+'：'+f.dictionary[x]).join('；'),data_source:f.source,access:'项目内置教学模拟数据，可用于本次示范'};
 if(f.plan.method==='did')Object.assign(values,{policy_doc:'低碳城市试点政策（教学模拟，非真实名单）',effective_date:'2018年低碳城市试点政策同批实施（模拟设定）',treated_list:'treated=1为模拟处理组，treated=0为模拟对照组',comparison:'同批政策前后，处理组与对照组比较'});
 state.entry_path='data';state.stage='free_chat';state.research_revision=1;state.variable_dictionary=f.dictionary;
 state.preparation={question_type:f.plan.method==='did'?'policy_evaluation':'association',adoption_mode:f.plan.method==='did'?'single_batch':'unknown',cards:Object.fromEntries(Object.entries(values).filter(([,v])=>v).map(([k,value])=>[k,{value,status:'filled',source_title:'内置模拟案例',source_url:'',verification:'unverified'}]))};
 const field=(value)=>({value,status:'provided',source:{kind:'fixture',text:value},history:[]});
 state.research_understanding={schema_version:1,revision:1,active_question:null,fields:{goal:field(f.question),object:field(f.fixture_id==='ols'?'模拟观察对象':'模拟城市'),period:field(f.fixture_id==='ols'?'模拟横截面':'2014–2021年'),outcome:field(f.dictionary[f.plan.outcome]),data_source:field(f.source),...(f.plan.method==='did'?{adoption_mode:field('single_batch'),effective_date:field('2018年低碳城市试点政策同批实施（模拟设定）'),policy_name:field('低碳城市试点政策（教学模拟）')}:{})}};
 for(const [key,item]of Object.entries(state.research_understanding.fields))item.label=({goal:'研究目标',object:'研究对象',period:'观察时期',outcome:'结果指标',data_source:'数据来源',adoption_mode:'实施批次',effective_date:'实施时间',policy_name:'政策名称'})[key]||'研究资料';
 state.demo_fixture={fixture_id:f.fixture_id,fixture_version:f.fixture_version,input_sha256:f.input_sha256};
 state.analysis_workspace={view:'plan',display_mode:'analysis',applied:[]};
 return {ui_view:'plan',filename:f.filename,input_sha256:f.input_sha256,simulated:true,fixture_method:f.fixture_id,fixture_id:f.fixture_id,fixture_version:f.fixture_version,profile:f.profile,dictionary:f.dictionary,question:f.question,source:f.source,candidate:{...f.plan,engine_id:'statspai_cloud',missing:'block'}};
}
