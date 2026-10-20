import {readFile,writeFile} from 'node:fs/promises';
import {modelFeedback} from '../worker/model.js';
import {fixtures} from '../worker/fixtures.js';
// Reuse the user's existing runtime configuration in memory only. Never export it.
process.loadEnvFile('../empirical_apprentice_sites/.env.local');
const numeric=JSON.parse(await readFile('outputs/cloud-compute-acceptance.json','utf8'));
const cases={ols:'在160行模拟数据中，控制工作经验后，教育年限每增加一年与月收入平均增加约0.774千元相关。结果不证明因果。',
 panel_fe:'控制城市和年份固定效应后，数字化指数增加1与模拟生产率指数平均增加约1.276相关。采用城市聚类标准误，不代表因果已识别。',
 did:'在同批模拟政策设定下，城市和年份固定效应及城市聚类估计的DID系数约为-1.835。这不是对真实政策的证明，平行趋势仍需核对。'};
const checks=[];
for(const [method,answer]of Object.entries(cases)){
 const result=numeric.results[method].result;
 const feedback=await modelFeedback('reflection',{answer,materials:[{id:'executed_result',content:result},
   {id:'confirmed_plan',content:{plan:fixtures[method].plan,dictionary:fixtures[method].dictionary}}]},process.env);
 checks.push({method,mode:feedback.mode,error_type:feedback.error_type||null,assessment:feedback.assessment||null});
 await writeFile('outputs/cloud-model-acceptance.json',JSON.stringify({scope:'real existing DeepSeek; local callback, not JoyCode browser conversation',checks},null,2));
 console.log(JSON.stringify(checks.at(-1)));
}
if(checks.some(c=>c.mode!=='ai_advice'||c.assessment?.status!=='consistent'))process.exitCode=1;
