import {fixtures} from '../worker/fixtures.js';
import {mkdir,writeFile} from 'node:fs/promises';
await mkdir(new URL('../outputs/mcp-fixtures/',import.meta.url),{recursive:true});
for(const method of ['ols','panel_fe','did'])await writeFile(new URL('../outputs/mcp-fixtures/'+method+'.json',import.meta.url),JSON.stringify(fixtures[method]));
console.log('Exported the three existing simulated teaching fixtures for local acceptance.');
