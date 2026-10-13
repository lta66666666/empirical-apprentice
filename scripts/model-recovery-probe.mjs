// Isolated live-provider diagnostic. Credentials arrive only through stdin and are never printed.
// Input: {env:{MODEL_API_KEY,MODEL_NAME,MODEL_BASE_URL},kind:"candidate"|"tutor"|"reflection",input:{...}}
import {proposeCandidate,modelFeedback} from '../worker/model.js';
let text='';for await(const chunk of process.stdin)text+=chunk;
try{
  const {env,kind='candidate',input={}}=JSON.parse(text);text='';
  if(!['candidate','tutor','reflection'].includes(kind))throw Error();
  const value=kind==='candidate'?await (await proposeCandidate(input,env)).json():await modelFeedback(kind,input,env);
  console.log(JSON.stringify({mode:value.mode,ready:value.ready,prompt_version:value.prompt_version,actual_model:value.actual_model,error_type:value.error_type,diagnostics:value.diagnostics,answer:value.answer,summary:value.summary,details:value.details,reason:value.reason,questions:value.questions,proposed_cards:value.proposed_cards,proposed_dictionary:value.proposed_dictionary,candidate:value.candidate}));
}catch{console.log(JSON.stringify({probe_error:'invalid_input_or_probe_failure'}));process.exitCode=1;}
