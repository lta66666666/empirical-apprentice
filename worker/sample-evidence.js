// Pure, read-only projection of persisted execution facts; never changes a result.
const count=value=>Number.isInteger(value)&&value>=0?value:null;
export function sampleEvidence(task){
 const result=task?.result,available=task?.status==='succeeded'&&!!result;
 const input=count(task?.profile?.row_count??task?.n_rows),used=available?count(result.n_used):null;
 const valid=used!==null&&(input===null||used<=input),excluded=valid&&input!==null?input-used:null;
 const audit=result?.audit||{},indices=audit.used_indices??result?.used_indices;
 const indicesRecorded=Array.isArray(indices)&&valid&&indices.length===used&&new Set(indices).size===used&&indices.every(i=>Number.isInteger(i)&&i>=1&&(input===null||i<=input));
 const missingLines=audit.missing_removed_csv_lines;
 let missing=available&&Array.isArray(missingLines)&&new Set(missingLines).size===missingLines.length&&missingLines.every(i=>Number.isInteger(i)&&i>0)?missingLines.length:null;
 let other=available?count(audit.model_removed_count):null;
 if(excluded===null||missing===null||other===null||missing+other!==excluded){missing=null;other=null;}
 const terms=available&&Array.isArray(result.omitted_terms)?result.omitted_terms.filter(x=>typeof x==='string').slice(0,100):null;
 const comparison=result?.comparison?.status,meta=task?.metadata||task?.dataset_metadata;
 return {schema_version:1,available:available&&valid,task_id:task?.id||null,record_version:task?.record_version??null,
  input,used:available&&valid?used:null,excluded,missing_excluded:missing,other_excluded:other,indices_recorded:indicesRecorded,
  exclusion_note:missing===null?'原因未分项记录，不能直接归因于缺失。':'缺失处理和其他模型排除来自本次持久记录；其他排除的具体原因仍需核对。',
  omitted_terms:terms,omission_note:terms===null?'省略估计项未记录。':terms.length?'导出记录的省略估计项；原因待核对，不代表排除观测。':'导出记录未列出省略项，不代表已经排除共线问题。',
  verification:{execution:available?'本次实际执行结果已保存'+(task?.execution_location?.startsWith('local')||task?.engine_id?.includes('local')?'，经本机批准上传。':'；不等于服务器独立认证。'):'尚无可展示的已完成结果。',
   numerical:task?.statistical_validation?.status==='requires_revalidation'?'历史统计导出待重验，运行成功不代表统计输出已核对。':!available?'尚无可核对结果。':comparison==='passed'?'本配置独立数值对照通过，不证明因果识别成立。':comparison==='unable_to_compare'?'本次数值对照无法比较，不能显示通过。':'未记录独立数值对照。',
   source:meta?.simulated?'内置模拟数据已按内容识别，不能当作真实研究证据。':'数据与变量说明尚未独立核实。',
   design:'研究假设与因果识别条件未由运行成功自动核验。'}};
}
export function sampleEvidenceText(task){
 const e=sampleEvidence(task);if(!e.available)return '尚无可展示的已完成结果。';
 return ['输入 '+(e.input??'未记录')+' 行 → 实际估计 '+e.used+' 行；'+(e.excluded===null?'未进入估计总数未记录。':e.excluded+' 行未进入本次估计。'),
 e.missing_excluded===null?e.exclusion_note:'缺失处理 '+e.missing_excluded+' 行；其他模型排除 '+e.other_excluded+' 行。'+e.exclusion_note,
 e.omitted_terms?.length?'导出记录的省略估计项：'+e.omitted_terms.join('、')+'。'+e.omission_note:e.omission_note,
 '实际样本索引：'+(e.indices_recorded?'已记录；索引指输入数据的记录序号，不等于含表头的CSV文件行号。':'未记录或不完整。'),
 ...Object.entries(e.verification).map(([k,v])=>({execution:'实际执行',numerical:'数值核对',source:'来源',design:'识别条件'}[k])+'：'+v)].join('\n');
}
