import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {modelFeedback} from '../worker/model.js';
const job=JSON.parse(await readFile('outputs/operation-exports/record.json','utf8'));
const {audit,used_indices,...result}=job.result;
const materials=[{id:'executed_result',content:result},{id:'confirmed_plan',content:{plan:job.plan,dictionary:job.dictionary}}],checks=[];
const inputs=[...job.reflections.slice(0,2).map((r,i)=>({name:'原正确答案'+(i+1),answer:r.answer,expected:'consistent'})),
 {name:'错误系数',answer:'教育多一年与模拟月收入增加5000千元相关。标准误稳健，不证明因果。',expected:'needs_correction',aspect:'coefficient'},
 {name:'单位倍率错误',answer:'教育每多一年与模拟月收入增加0.774元相关，不是因果结论。',expected:'needs_correction',aspect:'unit'},
 {name:'显著性冒充因果',answer:'这个显著的教育系数已经证明教育必然导致收入提高，因果关系已成立。',expected:'needs_correction',aspect:'causality'}];
for(const input of inputs){const feedback=await modelFeedback('reflection',{answer:input.answer,materials},process.env);checks.push({name:input.name,answer:input.answer,feedback});await writeFile('outputs/v43-feedback-live.json',JSON.stringify({at:new Date().toISOString(),checks},null,2));assert.equal(feedback.mode,'ai_advice',JSON.stringify({name:input.name,type:feedback.error_type}));assert.equal(feedback.assessment.status,input.expected,JSON.stringify({name:input.name,assessment:feedback.assessment}));if(input.aspect)assert.ok(feedback.assessment.required_corrections.some(c=>c.aspect===input.aspect));console.log('PASS live feedback',input.name,feedback.assessment.status);}
