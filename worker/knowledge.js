import { curriculum } from './content.js';
import {textbookCards} from './textbook-cards.js';
import {guideKnowledgeChunks} from './stata-guide.js';
export const knowledgeVersion='ea-kb-20261019-operations';
export const knowledgeChunks=[
  {id:'data_import_formats',title:'���� CSV��TSV �� DTA',topic:'software_operation',task_stages:['data','health'],content:'����ύ���ϣ�ѡ�������ļ���DTA������ֵ���룬��ǩ����˵��������ת����Ԥ����ȷ�ϡ��ļ��ϴ���˶��ֶΣ�δ֪��λ�ɺ󲹡����2MB��20,000�С�60�С�',source:'��Ʒ��ǰ����淶',version:'20261029'},
  ...guideKnowledgeChunks,
  ...textbookCards,
  ...curriculum.lessons.map(lesson=>({id:`lesson_${lesson.id}`,title:lesson.title,section:`�˽׶ογ̡���${lesson.id}�׶�`,source:'/static/teaching/handbook.html',version:curriculum.curriculum_id,review_status:'���пγ̣���������У',content:[lesson.intro,lesson.goal,lesson.guide,...(lesson.pitfalls||[])].filter(Boolean).join('\n').slice(0,2200)})),
  {id:'fixest_formula',title:'R/fixest ��ʽ��̶�ЧӦ',section:'feols �� fml / vcov',source:'https://lrberge.github.io/fixest/reference/feols.html',version:'fixest 0.14.2',review_status:'�ٷ������ĵ�ժҪ����ѧ��Ǵ���У',content:'feols ���չ�ʽ�����ݺͷ���������á���ʽ y ~ x1 + x2 ��ʾOLS�����ߺ�ĵ�λ��ʱ���ֶ�ָ���̶�ЧӦ������ y ~ x | city + year��vcov ����ָ�� iid��hetero �� cluster�����ƹ̶�ЧӦ���Զ�������ʶ�𣻱���Ŀ�Ժ˶����Ρ������������λ��'},
  {id:'fixest_sample',title:'ʵ���������޳����ƶϿھ�',section:'feols �� fixef.rm / ssc',source:'https://lrberge.github.io/fixest/reference/feols.html',version:'fixest 0.14.2',review_status:'�ٷ������ĵ�ժҪ����ѧ��Ǵ���У',content:'fixef.rm ���ƹ̶�ЧӦ����ǰ�������ų���Ĭ�� perfect_fit �漰�����ȹ۲��ų���Ӧ��ȡ��ʵ��������������������������ʵ��������ssc ����С������������׼�������Ƚϻ���˶Ծ��ࡢ���ɶȺ���������������'},
  {id:'stata_mcp_operation',title:'���� Stata MCP ����',section:'���ӡ��Ự��ִ��',source:'https://github.com/hanlulong/stata-mcp',version:'DeepEcon 0.5.3',review_status:'�Ѻ˶԰�װԴ��',content:'���� MCP Streamable HTTP ��ַΪ localhost:4000/mcp-streamable��stata_run_selection ִ�д���Ƭ�Σ�stata_run_file ִ�б���do�ļ���stata_session �����Ự��ԭʼ����Ĭ�����ڱ���������������Ժ����մ����ڱ���Ԥ����׼�������С�MCP�����Ա����˺�Ȩ�����У������ļ�Ȩ��ɳ�䡣'},
].map(c=>({...c,topic:c.topic||(/sample|units/.test(c.id)?'data_check':/regress|formula|variance/.test(c.id)?'command_syntax':c.id==='textbook_interpret'?'result_reading':'research_concept'),engine:c.engine||(c.id.startsWith('fixest_')?'r':c.id.startsWith('stata_')?'stata':null),accessed_at:c.id.startsWith('stata_guide_')?'2026-10-19':c.id.startsWith('textbook_')?'2026-10-16':'2026-10-09',knowledge_version:knowledgeVersion}));
function tokens(text){const value=String(text||'').toLowerCase();return [...new Set([...(value.match(/[a-z_][a-z0-9_]+/g)||[]),...(value.match(/[\u3400-\u9fff]{2,}/g)||[]).flatMap(word=>Array.from({length:Math.max(0,word.length-1)},(_,i)=>word.slice(i,i+2)))])];}
export function knowledgeOptions(value={}){
 const allowed={engine:['stata','r','python'],method:['ols','panel_fe','did'],stage:['prepare','data','health','plan','execute','explain','reports','stata_code'],teaching_software:['stata','r','python','generic'],topic:['software_operation','command_syntax','result_reading','data_check','research_concept']},out={};
 for(const [key,values]of Object.entries(allowed))if(value[key]!=null&&value[key]!==''){if(!values.includes(value[key]))throw Object.assign(Error('��ѧ����������Ч��'+key),{status:422});out[key]=value[key];}return out;
}
export function retrieveKnowledge(query,limit=3,context={}){
 if(typeof limit==='object'){context=limit;limit=3;}const q=String(query||''),options=knowledgeOptions(context),keys=tokens(q);if(!keys.length&&!Object.keys(options).length)return [];
 const engine=options.teaching_software==='generic'?null:options.teaching_software||(/stata|\bxtreg\b|\bxtset\b|\bregress\b/i.test(q)?'stata':null)||options.engine||(/stata|do-file|do�ļ�|�����|�������|\bregress\b|\bxtreg\b|\bxtset\b|vce\(/i.test(q)?'stata':/fixest|webR|feols/i.test(q)?'r':null);
 const topic=options.topic||(/ȱʧ|�ų�|�޳�|����|ɾ��|ɾ��.*��|��λ|����/.test(q)?'data_check':/����|����|�ļ���|��־|do.file|do�ļ�|����|����|����|�Ҳ���|����������|type mismatch|repeated time/i.test(q)?'software_operation':/����|�﷨|regress|xtset|xtreg|vce\(|����/i.test(q)?'command_syntax':/ϵ��|��׼��|����|���.*����/.test(q)?'result_reading':'research_concept');
 const preparationOnly=options.stage==='prepare'&&!options.method&&!engine;
 return knowledgeChunks.filter(c=>(!c.engine||c.engine===engine)&&(!options.method||!c.methods?.length||c.methods.includes(options.method))&&(!preparationOnly||c.id.startsWith('lesson_')||c.task_stages?.includes('prepare')||/ȱʧ|����/.test(q)&&c.id==='textbook_sample'))
 .map(chunk=>{const title=(chunk.title+' '+chunk.section).toLowerCase(),text=chunk.content.toLowerCase();let score=keys.reduce((sum,key)=>sum+(title.includes(key)?3:0)+(text.includes(key)?1:0),0)/Math.sqrt(Math.max(text.length,200));
 if(chunk.topic===topic)score+=1.5;if(options.stage&&chunk.task_stages?.includes(options.stage))score+=.3;if(options.method&&chunk.methods?.includes(options.method))score+=.25;if(engine&&chunk.engine===engine)score+=.2;
 if(/����|�ϴ�|dta|csv|tsv/i.test(q)&&chunk.id==='data_import_formats')score+=8;
 if(/��λ|����/.test(q)&&chunk.id==='textbook_units')score+=3;if(/ȱʧ|�ų�|�޳�|����|ɾ��|ɾ��.*��/.test(q)&&chunk.id==='textbook_sample')score+=3;
 const operation= /�ظ�.*(���|���|��)|repeated time/i.test(q)?'data_panel-key':/����������|�Ҳ�������|type mismatch|��ֵ����/i.test(q)?'data_inspect':/�ļ�.*(�Ҳ���|������)|����|r\(\d+\)/i.test(q)?'files_error':/��־|log using/i.test(q)?'files_log':/do-file|do�ļ�|doedit/i.test(q)?'do-files_open':/����|import delimited/i.test(q)?'data_import':/����|�����|�������/.test(q)?'interface_locate':null;
 if(engine==='stata'&&operation&&chunk.id==='stata_guide_'+operation)score+=5;
 if(keys.length&&!keys.some(key=>title.includes(key)||text.includes(key))&&!(/ɾ��|ɾ��.*��/.test(q)&&chunk.id==='textbook_sample'))score=0;
 return {...chunk,score};}).filter(c=>c.score>0).sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id)).slice(0,Math.max(1,Math.min(Number(limit)||3,3)));
}
export async function knowledgeContext(query,context={}){return Promise.all(retrieveKnowledge(query,3,context).map(async c=>{const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(c.content)))].map(x=>x.toString(16).padStart(2,'0')).join('');return {...c,content_hash:hash};}));}
