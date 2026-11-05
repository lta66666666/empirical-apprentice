import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {textbookSources,textbookCatalog} from '../worker/textbook-sources.js';
import {textbookCards} from '../worker/textbook-cards.js';
import {knowledgeContext,knowledgeOptions} from '../worker/knowledge.js';
import {openStorage} from '../standalone/storage.mjs';
import worker from '../dist/server/index.js';
const catalog=textbookCatalog(textbookCards),store=await openStorage('outputs/material-api-'+Date.now());
const env={DB:store.DB,FILES:store.FILES},origin='https://materials.test';let cookie='';
const call=(path,options={})=>worker.fetch(new Request(origin+path,{...options,headers:{Origin:origin,Cookie:cookie,...options.headers}}),env);
try{
 assert.equal(catalog.file_count,7);assert.equal(catalog.textbook_count,5);assert.equal(catalog.sources.length,6);
 assert.ok(catalog.sources.every(s=>s.card_ids.length));
 assert.equal(new Set(catalog.sources.flatMap(s=>s.files.map(f=>f.sha256))).size,7);
 for(const c of textbookCards)for(const r of c.references.filter(r=>r.access==='local_reference')){
  const source=textbookSources.find(s=>s.id===r.source_id);assert.ok(source,c.id);assert.ok(source.reviewed_pdf_pages.includes(r.pdf_page),c.id);assert.ok(r.pdf_page<=source.files[0].pages);
 }
 assert.throws(()=>knowledgeOptions({source_id:'arbitrary'}));
 for(const [q,id]of [['数值标签和编码','textbook_labels'],['非平衡面板','textbook_unbalanced'],['教材勘误版本','textbook_errata'],['显著性水平置信度','textbook_significance'],['工作目录找不到文件','textbook_paths']])assert.equal((await knowledgeContext(q))[0].id,id);
 const scoped=await knowledgeContext('',{source_id:'wang_stata_1'});assert.ok(scoped.length);assert.ok(scoped.every(c=>c.references.some(r=>r.source_id==='wang_stata_1')));
 const json=JSON.stringify(catalog);assert.doesNotMatch(json,/C:\\|xwechat|z-library|api_key|front_text/i);
 const index=await readFile('static/teaching/source-index.html','utf8');assert.ok(index.includes('17张自编教学卡'));for(const c of textbookCards)assert.ok(index.includes('id="'+c.id.replace('textbook_','')+'"'));
 assert.equal((await call('/api/knowledge?catalog=textbooks')).status,401);
 const signup=await call('/api/auth/register',{method:'POST',body:JSON.stringify({username:'material_reader',password:'Material-reader-pass-2026',password_confirmation:'Material-reader-pass-2026'})});assert.equal(signup.status,200);cookie=signup.headers.get('set-cookie').split(';')[0];
 const api=await call('/api/knowledge?catalog=textbooks');assert.equal(api.status,200);assert.deepEqual((await api.json()).catalog,catalog);
 const found=await call('/api/knowledge?source_id=wang_stata_1&q='+encodeURIComponent('数值标签'));assert.equal(found.status,200);assert.equal((await found.json()).materials[0].id,'textbook_labels');
 assert.equal((await call('/api/knowledge?source_id=arbitrary')).status,422);
 const home=await (await call('/home')).text();assert.equal((home.match(/<a /g)||[]).length,2);
 console.log('PASS 7 files / 6 source records / 17 cards; page identity, source filtering, current-topic retrieval, protected catalog API, safe public index, unchanged two-entry home. Not full-book or browser acceptance.');
}finally{store.close();}
