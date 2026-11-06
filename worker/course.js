import {curriculum} from './content.js';

const findLesson=id=>curriculum.lessons.find(item=>item.id===Number(id));
const finished=(state,id)=>{
  const item=findLesson(id),record=state.lesson_records?.find(value=>value.stage===Number(id));
  return Boolean(item&&item.steps.every((_,index)=>record?.steps.some(step=>step.step_idx===index&&step.outcome)));
};
const firstPending=state=>curriculum.lessons.find(item=>!finished(state,item.id))?.id;

// Course navigation is independent of research preparation and execution state.
// Legacy course progress is projected once; reading it never writes the database.
export function ensureLearningContext(state){
  if(state.learning_context)return state.learning_context;
  const match=/^l(\d+)s(\d+)$/.exec(state.last_question||'');
  const pending=firstPending(state),hadCourse=Boolean(state.lesson_idx||state.lesson_records?.length);
  const id=Number(match?.[1]||state.lesson_idx||pending||curriculum.lessons.at(-1).id);
  const item=findLesson(id)||findLesson(pending)||curriculum.lessons[0];
  const record=state.lesson_records?.find(value=>value.stage===item.id);
  const firstUnanswered=item.steps.findIndex((_,index)=>!record?.steps.some(step=>step.step_idx===index&&step.outcome));
  state.learning_context={
    status:!hadCourse?'not_started':pending?'active':'completed',
    lesson_id:item.id,step_idx:Math.min(Number(match?.[2]??(firstUnanswered<0?item.steps.length:firstUnanswered)),item.steps.length),
    view_mode:'directory',view_lesson_id:item.id,pane:'learn',tutorial_step:0,
    conversation:hadCourse?[...(state.conversation||[])]:[],
  };
  return state.learning_context;
}

export function learningProjection(state){
  const context=ensureLearningContext(state);
  return {...state,_course_projection:true,stage:context.status==='active'?'lesson':'project_choice',lesson_idx:context.lesson_id,
    last_question:`l${context.lesson_id}s${context.step_idx}`,conversation:context.conversation};
}

export function commitLearningProjection(state,projection){
  const context=ensureLearningContext(state),match=/^l(\d+)s(\d+)$/.exec(projection.last_question||'');
  context.lesson_id=projection.lesson_idx||context.lesson_id;
  context.step_idx=Number(match?.[2]??findLesson(context.lesson_id)?.steps.length??0);
  context.status=projection.stage==='lesson'?'active':'completed';
  context.conversation=projection.conversation;
  context.view_mode='continue';context.view_lesson_id=context.lesson_id;
}

export function courseView(state){
  const context=ensureLearningContext(state);
  if(context.status!=='active')return null;
  const item=findLesson(context.lesson_id),index=context.step_idx;
  const step=item?.steps[index]||(index===item?.steps.length?{type:'checkpoint',prompt:'本阶段练习结束。请补写成果卡，再决定是否进入下一阶段。'}:null);
  if(!item||!step)return null;
  return {lesson_id:item.id,title:item.title,banner:curriculum.case_banner||'',case_id:item.case_id||'main',case_label:item.case_label||'',
    intro:item.intro,goal:item.goal||'',duration:item.duration||'',output:item.output||'',visual:item.visual||'',visual_extra:item.visual_extra||'',guide:item.guide||'',example:item.example||'',
    pitfalls:item.pitfalls||[],worksheet:item.worksheet||null,step_idx:index,total_steps:item.steps.length,step_type:step.type,prompt:step.prompt,
    options:step.options||null,total_lessons:curriculum.lessons.length,progress:`第 ${item.id}/${curriculum.lessons.length} 阶段 · ${item.title}`};
}

export function coursePayload(state){
  const context=ensureLearningContext(state),pending=firstPending(state);
  return {session_id:state.session_id,state_version:state.state_version||0,learning_context:context,lesson_ui:courseView(state),
    completed:context.status==='completed',lessons:curriculum.lessons.map(item=>({id:item.id,title:item.title,goal:item.goal||'',duration:item.duration||'',output:item.output||'',
      completed:finished(state,item.id),status:item.id===(context.status==='active'?context.lesson_id:pending)?'current':finished(state,item.id)?'completed':'preview'}))};
}

export function openCourse(state,body={}){
  const context=ensureLearningContext(state),mode=body.mode||'continue';
  if(mode==='directory'){context.view_mode='directory';return;}
  if(mode==='cursor'){
    if(body.pane!==undefined){if(!['learn','practice','workbook','tutorial','hand'].includes(body.pane))throw Error('课程显示位置无效。');context.pane=body.pane;}
    if(body.tutorial_step!==undefined){
      const index=Number(body.tutorial_step),records=state.tutorial?.records||{};
      let unlocked=0;while(unlocked<5&&records[String(unlocked)]?.passed)unlocked++;
      if(!Number.isInteger(index)||index<0||index>unlocked)throw Error('请先完成前面的手算任务。');
      context.tutorial_step=index;
    }
    return;
  }
  if(!['continue','review','preview'].includes(mode))throw Error('课程打开方式无效。');
  const id=Number(body.lesson_id||context.lesson_id||firstPending(state)),item=findLesson(id);
  if(!item)throw Error('课程不存在。');
  if(mode==='review'&&!finished(state,id))throw Error('未完成的阶段只能继续或预览。');
  if(mode==='preview'&&finished(state,id))throw Error('已完成阶段请使用回顾。');
  if(mode==='continue'){
    const allowed=context.status==='active'?context.lesson_id:firstPending(state);
    if(!allowed||id!==allowed)throw Error('请按目录继续当前阶段；后续阶段可先预览。');
    if(context.status!=='active'){
      // 已完成全部阶段但仍有无作答记录的阶段（如“学过一些方法”从阶段3起步）时，允许回到这些阶段补完。
      const record=state.lesson_records.find(value=>value.stage===id);
      const index=item.steps.findIndex((_,stepIndex)=>!record?.steps.some(step=>step.step_idx===stepIndex&&step.outcome));
      context.status='active';context.lesson_id=id;context.step_idx=index<0?item.steps.length:index;
      if(!state.entry_path)state.entry_path='zero';
      if(!record)state.lesson_records.push({stage:id,title:item.title,steps:[]});
      if(context.step_idx===0)context.conversation.push({role:'assistant',content:`${curriculum.case_banner||''}\n\n### 阶段 ${id}：${item.title}\n\n${item.intro}`},
        {role:'assistant',content:`**${item.steps[0].prompt}**`});
    }
    context.view_lesson_id=context.lesson_id;
  }else context.view_lesson_id=id;
  context.view_mode=mode;
}
