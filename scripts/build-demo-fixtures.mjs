import {fixtures} from '../worker/fixtures.js';
import {fixtureVersion} from '../worker/demo-fixture.js';
import {mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const folder=new URL('../local_stata/sample-fixtures/',import.meta.url);await mkdir(folder,{recursive:true});
const manifest={version:fixtureVersion,fixtures:{}};
for(const [id,f]of Object.entries(fixtures)){
 manifest.fixtures[id]={fixture_id:id,fixture_version:fixtureVersion,input_sha256:createHash('sha256').update(f.text).digest('hex')};
 await writeFile(new URL(id+'.csv',folder),f.text);
 await writeFile(new URL(id+'.dictionary.json',folder),JSON.stringify(f.dictionary,null,2));
}
await writeFile(new URL('manifest.json',folder),JSON.stringify(manifest,null,2));
