import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {expectedStataTeaching,validateStataPreview,stataLesson} from '../worker/stata-teaching.js';
for(const method of ['ols','panel_fe','did'])for(const vcov of ['iid','hetero','cluster'])for(const missing of ['drop','block']){
 const fixture=JSON.parse(await readFile(new URL('../outputs/mcp-fixtures/'+method+'.json',import.meta.url),'utf8'));
 const columns=fixture.text.trim().split('\n')[0].replace(/\r/g,'').split(',').map(name=>({name}));
 const task={kind:'template',engine_id:'stata_local_mcp',profile:{columns,row_count:160},input_sha256:'a'.repeat(64),plan_sha256:'b'.repeat(64),plan:{...fixture.plan,vcov,missing,cluster:vcov==='cluster'?(fixture.plan.unit||columns[1].name):''}};
 const python=String.raw`import sys,json
from pathlib import Path
sys.path.insert(0,str(Path('executor').resolve()))
from engines import stata_script
from stata_teaching import teaching_manifest
t=json.load(sys.stdin);p=t['plan'].copy();a={c['name']:'v'+str(i) for i,c in enumerate(t['profile']['columns'])}
for k in ('outcome','unit','time','treated','cluster'):p[k]=a.get(p.get(k),'')
p['predictors']=[a[v] for v in p['predictors']]
code,_=stata_script(p)
print(json.dumps(teaching_manifest(code,p,t['profile']['columns'])))`;
 const run=spawnSync('local_stata/.venv/Scripts/python.exe',['-c',python],{input:JSON.stringify(task),encoding:'utf8'});assert.equal(run.status,0,run.stderr);
 const actual=JSON.parse(run.stdout);assert.deepEqual(actual,expectedStataTeaching(task),method+' '+vcov+' '+missing);
 const value={...actual,input_sha256:task.input_sha256,plan_sha256:task.plan_sha256,code_sha256:'c'.repeat(64),script_sha256:'d'.repeat(64)};
 const preview=await validateStataPreview(value,task);assert.match(preview.preview_hash,/^[a-f0-9]{64}$/);
 await assert.rejects(validateStataPreview({...value,commands:[{...actual.commands[0],text:'shell whoami'}]},task));
 await assert.rejects(validateStataPreview({...value,path:'C:/private/data.csv'},task));
 await assert.rejects(validateStataPreview({...value,mapping:[{alias:'v0',name:'fake'}]},task));
 await assert.rejects(validateStataPreview({...value,input_sha256:'f'.repeat(64)},task));
 await assert.rejects(validateStataPreview(value,{...task,engine_id:'statspai_local'}));
 const main=preview.commands.find(c=>c.topic==='estimate');task.teaching_preview=preview;
 const lesson=stataLesson(task,main.id);assert.match(lesson.content,/因果|内生性/);
 if(vcov==='hetero')assert.match(lesson.content,method==='ols'?/异方差稳健标准误/:/按面板个体聚类/);
 assert.throws(()=>stataLesson(task,main.id,'sample'));
 task.status='succeeded';task.code_sha256=preview.code_sha256;task.result={n_used:159,coefficients:[{term:'x',estimate:1,std_error:.1,ci_low:.8,ci_high:1.2}]};
 assert.match(stataLesson(task,main.id,'sample').content,/159/);assert.match(stataLesson(task,main.id,'std_error','x').content,/0.1/);assert.throws(()=>stataLesson(task,main.id,'estimate','fake'));
 console.log('PASS',method,vcov,missing,'actual script manifest, invalid payloads, lesson/output binding');
}
