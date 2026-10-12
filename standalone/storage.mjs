import { DatabaseSync } from 'node:sqlite';
import { mkdir, readFile, writeFile, rename, unlink, stat } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

export async function openStorage(directory) {
  const root=resolve(directory); await mkdir(root,{recursive:true});
  const sqlite=new DatabaseSync(join(root,'website.sqlite3'));
  sqlite.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS ea_migrations(name TEXT PRIMARY KEY);');
  const { readdir }=await import('node:fs/promises');
  const migrations=new URL('../drizzle/',import.meta.url);
  for(const name of (await readdir(migrations)).filter(n=>n.endsWith('.sql')).sort()){
    if(sqlite.prepare('SELECT name FROM ea_migrations WHERE name=?').get(name))continue;
    sqlite.exec('BEGIN IMMEDIATE');
    try{sqlite.exec(await readFile(new URL(name,migrations),'utf8'));sqlite.prepare('INSERT INTO ea_migrations VALUES(?)').run(name);sqlite.exec('COMMIT');}
    catch(error){sqlite.exec('ROLLBACK');throw error;}
  }
  const DB={prepare(sql){const statement=sqlite.prepare(sql);let args=[];const query={bind(...values){args=values;return query;},async first(column){const row=statement.get(...args);return column?row?.[column]??null:row??null;},async all(){return {results:statement.all(...args)};},async run(){const result=statement.run(...args);return {success:true,meta:{changes:Number(result.changes)}};}};return query;}};
  const files=join(root,'files');await mkdir(files,{recursive:true});
  const pathFor=key=>{if(typeof key!=='string'||!key||key.length>512)throw Error('Invalid storage key');return join(files,createHash('sha256').update(key).digest('hex'));};
  const FILES={
    async put(key,value){const destination=pathFor(key),temporary=destination+'.'+randomUUID()+'.tmp';await writeFile(temporary,value);await rename(temporary,destination);},
    async get(key){try{const bytes=await readFile(pathFor(key));return {body:bytes,text:async()=>bytes.toString('utf8'),arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)};}catch(e){if(e.code==='ENOENT')return null;throw e;}},
    async head(key){try{return {size:(await stat(pathFor(key))).size};}catch(e){if(e.code==='ENOENT')return null;throw e;}},
    async delete(keys){for(const key of Array.isArray(keys)?keys:[keys]){try{await unlink(pathFor(key));}catch(e){if(e.code!=='ENOENT')throw e;}}},
  };
  return {DB,FILES,sqlite,root,close(){sqlite.close();}};
}
