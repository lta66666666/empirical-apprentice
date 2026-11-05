import assert from 'node:assert/strict';
import {textbookCards} from '../worker/textbook-cards.js';
import {knowledgeChunks,knowledgeContext,knowledgeVersion} from '../worker/knowledge.js';
import {teachingMaterials} from '../worker/analysis-workspace.js';
assert.equal(new Set(textbookCards.map(c=>c.id)).size,textbookCards.length);
for(const c of textbookCards){assert.ok(c.summary.length<100);assert.ok(c.references.length);assert.ok(c.task_stages.length);for(const r of c.references){if(r.access==='local_reference'){assert.equal(r.page_verified,true);assert.ok(r.pdf_page>0);assert.ok(r.printed_page===null||r.printed_page>0);}}assert.doesNotMatch(JSON.stringify(c),/C:\\|z-library|\.pdf"/);}
assert.equal(knowledgeChunks.filter(c=>c.id.startsWith('textbook_')).length,17);
assert.equal(knowledgeVersion,'ea-kb-20261103-textbooks');
const units=await knowledgeContext('未知单位 数值回归 物理单位');assert.ok(units.some(c=>c.id==='textbook_units'));assert.ok(units.every(c=>c.content_hash.length===64));
const prep=await teachingMaterials('不知道单位能跑回归吗',{focus_method:null,step:'prepare'});assert.ok(prep.length);assert.ok(prep.every(c=>c.id.startsWith('lesson_')||c.task_stages?.includes('prepare')));assert.ok(prep.every(c=>!c.id.startsWith('fixest_')));
assert.match(textbookCards.find(c=>c.id==='textbook_did').content,/不是.*2×2/);
console.log('PASS 17 source-indexed original cards, verified page metadata, scoped preparation retrieval, content hashes and explicit DID scope.');
