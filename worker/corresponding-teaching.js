import {digest} from './executor.js';
const fail=(text,status=409)=>Object.assign(Error(text),{status});
export async function correspondingReference(env,owner,state,ref){
 let preview,plan,result=null,task=null;
 if(ref.task_id){const row=await env.DB.prepare('SELECT body FROM jobs WHERE id=? AND session_id=? AND owner=?').bind(ref.task_id,state.session_id,owner).first();if(!row)throw fail('��ѧ���񲻿ɶ�ȡ��',404);task=JSON.parse(row.body);preview=task.corresponding_code;plan=task.plan;result=task.status==='succeeded'?task.result:null;}
 else{const p=state.pending_confirmation;if(!p||p.token!==ref.confirmation_token||p.research_revision!==state.research_revision)throw fail('����Ԥ���ѱ仯�������º˶ԡ�');preview=p.corresponding_code;plan=p.plan;}
 if(!preview||preview.executed!==false||preview.sha256!==ref.preview_hash||await digest(preview.code)!==preview.sha256)throw fail('��Ӧ����������Ч���ѱ仯��');
 const command=preview.commands.find(c=>c.id===ref.command_id);if(!command)throw fail('��ѧ������Ч��',422);
 const part=ref.part||'command',focus=ref.focus||'command';
 if(!['command','variables','comma','year','fe','vce'].includes(part)||!['command','sample','estimate','std_error','interval'].includes(focus))throw fail('����Ŀ����Ч��',422);
 if(part!=='command'&&command.topic!=='estimate')throw fail('�﷨Ƭ���������Ӧ��',422);
 const c=result?.coefficients?.find(c=>c.term===ref.term);
 if(focus!=='command'&&(!result||focus!=='sample'&&!c))throw fail('���޶�Ӧ����ɽ����');
 const mapping=preview.mapping.map(m=>m.alias+' = '+m.name).join('��'),definitions={
  variables:'��������ĵ�һ�������ǽ������������ǽ��ͱ���������ձ��о����ֶ�ӳ���Ķ���',comma:'����ǰ����ģ�ͣ����ź����ù��ƺͱ�׼��',
  year:'i.��ݽ��������������������ƹ�ͬ��ݳ��������������ݵ�б�ʡ�',fe:'fe���Ƹ��岻��ʱ��仯�Ĳ��죻����������������ʱ��仯�Ļ��ӡ�',
  vce:plan.vcov==='cluster'?'���������õ�������׼�󣬾����ֶ�Ϊ '+plan.cluster+'��':plan.vcov==='hetero'?'��OLS��vce(robust)���췽���Ƚ���׼��':'���������ó��淽����ơ�',
  command:command.topic==='estimate'?'���������Ӧ��ǰ�Ѻ˶Ե�ģ�ͽṹ�����������Ķ���ִ�С�':({import:'��ȡ���ְ��еĹ淶��CSV��',numeric:'��ѡ����ֵ�ֶ�ת������ֵ���쳣�ַ��ᱨ������������㡣',missing:'����������ѡ��������ȱʧ���޹��ֶβ�Ӱ��������',sample:'����������������',xtset:'�����������Ƚṹ�������Զ�����ģ�͡�',post:'����ȷ����ݶ������ߺ�ʱ�ڡ�',interaction:'���ɴ����������ߺ�Ľ����',cluster:'������ֵ�����ţ����ı�ԭ����塣',panel:'������ֵ�����ţ�ԭ��ź��岻�䡣'}[command.topic]||'�������ڶ�Ӧ���������׼�����衣')};
 const dictionary=task?.dictionary||state.variable_dictionary||{};
 const engine=task?.engine_id||plan.engine_id;const software=engine==='browser_webr'?'����� R / fixest':engine==='statspai_cloud'?'Python / StatsPAI':task?.software||plan.software||'����δ��¼';
 const execution=task?(task.status==='succeeded'?'������ '+software+' ��ɼ��㡣':task.status==='failed'?'���� '+software+' ����δ��ɡ�':'��������ʹ�� '+software+'��������ɽ����'):'��������ʹ�� '+software+'����δִ�С�';
 let summary=definitions[part];
 if(focus==='sample')summary='���ι���ʹ�� '+result.n_used+' �С���������������������ܲ�ͬ��ɾ��ԭ���������¼��';
 if(c&&focus==='estimate')summary=c.term+' ��ϵ��Ϊ '+c.estimate+'���������˵����'+(dictionary[plan.outcome]||'��λ�뺬��δ�ṩ���������Ի���')+'�����Զ����������';
 if(c&&focus==='std_error')summary=c.term+' �ı�׼��Ϊ '+c.std_error+'����ӳ��ǰ�ƶ������µĹ��Ʋ�ȷ���ԡ�';
 if(c&&focus==='interval')summary=c.term+' ��95%����Ϊ ['+c.ci_low+', '+c.ci_high+']�����䲻�ܵ���֤�������';
 const card={id:'corresponding-'+command.id,title:focus==='command'?'Stata ��Ӧ���� �� '+(part==='command'?'����':part):'���η������ �� '+focus,summary,
  example:command.text,reminder:execution+' Stata��Ӧ����Ϊֻ����ѧ���',content:summary+'\n\n```stata\n'+command.text+'\n```\n\n�ֶ�ӳ�䣺'+mapping+'\n\n'+preview.differences.join('\n'),
  source:'https://www.stata.com/manuals/'+(command.topic==='xtset'?'xtxtset':plan.method!=='ols'&&['estimate','panel'].includes(command.topic)?'xtxtreg':command.topic==='import'?'dimportdelimited':command.topic==='numeric'?'ddestring':command.topic==='missing'?'u12':'rregress')+'.pdf',source_version:'�ٷ������ֲᣬ2026-10-29�˶ԣ�ģ������Stata18',version:preview.template_version,review_status:'�ܿ�ģ��Ĺ̶����⣻�Ķ����������ջ�������'};
 return {preview,plan,result,task,command,card,reference:{intent:'stata_corresponding',task_id:task?.id||null,confirmation_token:task?null:ref.confirmation_token,preview_hash:preview.sha256,command_id:command.id,part,focus,term:ref.term||null}};
}
