// Local candidate only. Existing optional model configuration stays in memory.
import {spawn} from 'node:child_process';
import {resolve} from 'node:path';
import {randomBytes} from 'node:crypto';
const root=resolve('.'),secret=randomBytes(32).toString('hex'),children=[];
try{process.loadEnvFile('../empirical_apprentice_sites/.env.local');}catch{}
const common={...process.env},pythonEnv={...common};for(const key of Object.keys(pythonEnv))if(/MODEL|API_KEY|SECRET|TOKEN/.test(key))delete pythonEnv[key];
function run(command,args,env){const child=spawn(command,args,{cwd:root,env,stdio:'inherit'});children.push(child);child.on('exit',()=>{for(const other of children)if(other!==child)other.kill();});}
run(resolve('../empirical_apprentice_sites/local_stata/.venv/Scripts/python.exe'),['-m','uvicorn','executor.app:app','--host','127.0.0.1','--port','8000','--no-access-log'],{...pythonEnv,PYTHONPATH:resolve('outputs/api-deps')+';'+root,EA_NODE_DATA:resolve('outputs/experience-preview/executor'),EA_NODE_SECRET:secret});
run('node',['standalone/server.mjs'],{...common,PORT:'18843',PUBLIC_ORIGIN:'http://127.0.0.1:18843',EA_DATA_DIR:resolve('outputs/experience-preview/web'),EXECUTOR_URL:'http://127.0.0.1:8000',EXECUTOR_SECRET:secret,EXECUTOR_INTERNAL_HOST:'loopback'});
function stop(){for(const child of children)child.kill();}process.on('SIGINT',stop);process.on('SIGTERM',stop);
console.log('Independent candidate preview: http://127.0.0.1:18843/');

