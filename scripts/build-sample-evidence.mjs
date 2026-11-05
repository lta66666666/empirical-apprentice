import {readFile,writeFile} from 'node:fs/promises';
const source=await readFile(new URL('../worker/sample-evidence.js',import.meta.url),'utf8');
await writeFile(new URL('../static/sample-evidence.js',import.meta.url),'// Generated from the shared read-only execution projection.\n(()=>{\n'+source.replace(/^export /gm,'')+'\nwindow.eaSampleEvidence=sampleEvidence;window.eaSampleEvidenceText=sampleEvidenceText;\n})();\n');
