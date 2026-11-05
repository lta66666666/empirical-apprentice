import {existsSync,readFileSync} from 'node:fs';
import {resolve} from 'node:path';
const root=resolve('.'),checks=[];
for(const path of ['static/ui/components.css','static/ui/theme.css','deploy/joycode/requirements-linux.txt','dist/server/index.js','dist/server/ai-interpretation.js','drizzle/0010_ai_interpretations.sql'])checks.push({check:path,pass:existsSync(resolve(root,path))});
checks.push({check:'container copies compiled static UI',pass:readFileSync('Dockerfile','utf8').includes('COPY static ./static')});
checks.push({check:'health endpoint',pass:readFileSync('standalone/server.mjs','utf8').includes("req.url==='/healthz'")});
console.log(JSON.stringify({scope:'source readiness only; not Linux, resources or public deployment acceptance',checks}));if(checks.some(c=>!c.pass))process.exitCode=1;
