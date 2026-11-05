import {fixtures} from './fixtures.js';
const digest=async text=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))].map(x=>x.toString(16).padStart(2,'0')).join('');
let knownHashes;
export function cleanDictionary(value,profile){
 const names=new Set(profile.columns.map(c=>c.name));
 if(!value||typeof value!=='object'||Array.isArray(value))return {};
 return Object.fromEntries(Object.entries(value).filter(([k,v])=>names.has(k)&&typeof v==='string'&&v.trim()).slice(0,60).map(([k,v])=>[k,v.trim().slice(0,300)]));
}
export async function datasetMetadata(inputHash,profile,attached){
 knownHashes||=Promise.all(Object.values(fixtures).flatMap(f=>[f.text,f.text.replaceAll('\n','\r\n'),'\uFEFF'+f.text,'\uFEFF'+f.text.replaceAll('\n','\r\n')].map(async text=>[await digest(text),f])));
 const fixture=(await knownHashes).find(([hash])=>hash===inputHash)?.[1];
 const supplied=cleanDictionary(attached,profile),base=fixture?cleanDictionary(fixture.dictionary,profile):{};
 return {dictionary:{...base,...supplied},provenance:Object.fromEntries(Object.keys({...base,...supplied}).map(name=>[name,supplied[name]?'supplied_dictionary':'builtin_fixture'])),source:fixture?fixture.source:'用户随附的数据字典，内容未独立核实',fixture_id:fixture?.id||null,simulated:!!fixture};
}
export function interpretationWarnings(plan,dictionary={}){
 const names=[plan.outcome,...(plan.predictors||[])].filter(Boolean),missing=names.filter(n=>!dictionary[n]);
 return missing.length?[`尚无完整含义与单位说明：${missing.join('、')}。可以计算；解释按原始数值尺度，不猜测货币、时间单位或因果含义。`]:['变量说明随结果保存；说明不等于来源或因果识别已核实。'];
}
