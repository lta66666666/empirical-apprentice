import {createHash} from 'node:crypto';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {dirname,resolve,basename} from 'node:path';

function parseCsv(text){
  const rows=[];let row=[],field='',quoted=false;
  for(let i=0;i<text.length;i++){
    const ch=text[i];
    if(quoted){
      if(ch==='"'){if(text[i+1]==='"'){field+='"';i++;}else quoted=false;}
      else field+=ch;
      continue;
    }
    if(ch==='"'){quoted=true;continue;}
    if(ch===','){row.push(field);field='';continue;}
    if(ch==='\n'){row.push(field);rows.push(row);row=[];field='';continue;}
    if(ch==='\r')continue;
    field+=ch;
  }
  if(field!==''||row.length){row.push(field);rows.push(row);}
  return rows.filter(items=>items.length>1||(items.length===1&&items[0]!==''));
}
const isNumeric=value=>/^[-+]?(\d+(\.\d*)?|\.\d+)([eE][-+]?\d+)?$/.test(value);
const args=process.argv.slice(2);
const option=(name,fallback)=>{const index=args.indexOf('--'+name);return index>=0?args[index+1]:fallback;};
const path=args[0];
if(!path)throw Error('用法：node scripts/data-evidence.mjs <csv> --label <名称> --provenance <来源说明> --out <json>');
const raw=await readFile(path);
const text=raw.toString('utf8').replace(/^\uFEFF/,'');
const rows=parseCsv(text);
const header=rows[0],data=rows.slice(1);
const columns=header.map((name,index)=>{
  const values=data.map(row=>row[index]??'');
  const missing=values.filter(value=>value.trim()==='').length;
  const present=values.filter(value=>value.trim()!=='');
  const numeric=present.length>0&&present.every(isNumeric);
  const numbers=numeric?present.map(Number):[];
  const unique=new Set(present).size;
  return {
    name,
    inferred_type:numeric?'numeric':'text',
    missing,
    missing_rate:data.length?Number((missing/data.length).toFixed(4)):0,
    unique,
    ...(numeric?{min:Math.min(...numbers),max:Math.max(...numbers)}:{}),
  };
});
const sha256=createHash('sha256').update(raw).digest('hex');
const audit={
  generated_at:new Date().toISOString(),
  label:option('label',basename(path)),
  provenance:option('provenance','待填写'),
  path,
  filename:basename(path),
  sha256,
  bytes:raw.length,
  rows:data.length,
  columns_count:header.length,
  columns,
  complete_rows:data.filter(row=>row.every(value=>(value??'').trim()!=='')).length,
  duplicate_rows:data.length-new Set(data.map(row=>row.join('\u0000'))).size,
  warnings:[
    '本审计只核对文件结构、哈希与缺失，不证明来源真实性。',
    '模拟数据不得作为真实世界来源证据。',
  ],
};
const out=resolve(option('out','docs/evidence/data/'+basename(path).replace(/\.csv$/,'')+'.audit.json'));
await mkdir(dirname(out),{recursive:true});
await writeFile(out,JSON.stringify(audit,null,2));
console.log(JSON.stringify({label:audit.label,rows:audit.rows,columns:audit.columns_count,sha256,out},null,2));
