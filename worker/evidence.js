export function upgradeState(state) {
  state.research_revision ||= 0;
  state.preparation ||= { question_type: 'association', cards: {} };
  state.preparation.adoption_mode ||= 'unknown';
  state.variable_dictionary ||= {};
  state.artifact_history ||= [];
  state.tutor_records ||= [];
  return state;
}
export function evidenceSnapshot(state) {
  upgradeState(state);
  return JSON.parse(JSON.stringify({ revision: state.research_revision, preparation: state.preparation,
    blueprint: state.project, dictionary: state.variable_dictionary }));
}
export function didConflict(state) {
  upgradeState(state);
  const batch = state.project?.policy_batches?.value || '';
  const cards = state.preparation.cards || {};
  const records = [batch, cards.expansion_date?.value, cards.treated_list?.value].filter(Boolean);
  if (state.preparation.adoption_mode === 'staggered' || records.some(text=>/分批/.test(text.replace(/没有分批|不是分批|非分批/g,'')))) return '资料记录了分批实施，同批 DID 不适用。';
  if (state.preparation.question_type === 'policy_evaluation' && state.preparation.adoption_mode !== 'single_batch') return '请先在研究准备中明确实施批次；尚未确定不能确认同批 DID。';
  if (cards.expansion_date?.value && !state.preparation.sample_batch_note?.trim()) return '已记录扩围信息，请说明当前样本是否包含不同批次，并核对实施类型。';
  return '';
}
export function suitability(state) {
  upgradeState(state);
  const labels = { question: '研究问题', sample: '对象与时期', outcome: '结果与单位', predictor: '解释变量', data_source: '数据来源', access: '获取条件' };
  const cards = state.preparation.cards;
  const satisfied = [], missing = [];
  for (const [key, label] of Object.entries(labels)) (cards[key]?.value ? satisfied : missing).push(label);
  if (state.preparation.question_type === 'policy_evaluation') {
    for (const [key,label]of Object.entries({policy_doc:'政策原文',effective_date:'实施日期',treated_list:'处理名单',comparison:'比较对象'})) if (!cards[key]?.value) missing.push(label);
  }
  const conflict = didConflict(state);
  return { revision: state.research_revision, satisfied, missing, blockers: conflict ? [conflict] : [],
    next: missing.length ? `下一步补充：${missing[0]}。` : conflict || '可进入数据检查；方法适用性仍须结合数据与识别条件核对。',
    source_warning: '结构检查不认证来源真实性；来源状态由学生核对。' };
}
