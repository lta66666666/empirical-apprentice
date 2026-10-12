import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const root=new URL('../',import.meta.url),source=await readFile(new URL('vendor/bcryptjs-3.0.3/index.js',root),'utf8');
const expected='import nodeCrypto from "crypto";';if(source.split(expected).length!==2)throw Error('Unexpected bcryptjs source; refusing to generate adapter');
await writeFile(new URL('worker/bcryptjs-3.0.3.js',root),source.replace(expected,'// Worker adapter: WebCrypto only; no weak random fallback.\nconst nodeCrypto = null;'));
const research=await readFile(new URL('worker/research.js',root),'utf8'),parser=research.slice(research.indexOf('export function parseCsv'),research.indexOf('\nfunction quoteCsv')).replace('export function parseCsv','window.eaParseCsv=function');
await writeFile(new URL('static/data-fragment.js',root),"// Generated from the server parser; keep limits and quoting behavior identical.\n(()=>{const MAX_BYTES=2000000,MAX_ROWS=20000,MISSING=new Set(['','NA','N/A','null','NaN']);\n"+parser+'\n})();\n');
console.log('bcryptjs 3.0.3 source SHA256 '+createHash('sha256').update(source).digest('hex'));
