import {parseCsv} from './research.js';
import {loadOwnedSession,requireSessionVersion,touchSession} from './sessions.js';
import {nodeRequest,digest} from './executor.js';
import {datasetMetadata,cleanDictionary} from './dataset-metadata.js';
const fail=(message,status=422)=>Object.assign(Error(message),{status});
async function bytesHash(bytes){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');}
function base64(bytes){let text='';for(let i=0;i<bytes.length;i+=8192)text+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(text);}
export async function loadResearchData(env,owner,session,id){
 const row=await env.DB.prepare('SELECT body FROM research_data WHERE id=? AND owner=? AND session_id=?').bind(id,owner,session).first();
 if(!row)throw fail('数据材料不存在或不属于当前练习。',404);
 const record=JSON.parse(row.body),object=await env.FILES.get(record.canonical_key);
 if(!object)throw fail('数据材料已丢失。',404);
 const text=await object.text();if(await digest(text)!==record.canonical_sha256)throw fail('数据材料校验失败。',409);
 return {...record,text};
}
export async function cleanupResearchData(env,session){
 const rows=await env.DB.prepare('SELECT body FROM research_data WHERE session_id=?').bind(session).all();
 for(const row of rows.results){const d=JSON.parse(row.body);await env.FILES.delete([d.source_key,d.canonical_key,d.metadata_key]);}
 await env.DB.prepare('DELETE FROM research_data WHERE session_id=?').bind(session).run();
}
export async function handleResearchData(request,env,owner,path){
 const match=/^\/api\/sessions\/([a-z0-9]{12})\/research\/data(?:\/([0-9a-f-]{36}))?$/.exec(path);if(!match)return null;
 try{
  const session=await loadOwnedSession(env,owner,match[1]);if(session==='expired')throw fail('练习已到期。',410);if(!session)throw fail('练习不可读取。',404);
  if(request.method==='GET'&&match[2]){const d=await loadResearchData(env,owner,session.session_id,match[2]);return Response.json(publicData(d));}
  if(request.method==='POST'&&match[2]){
   const body=await request.json();requireSessionVersion(session,body);if(!['preview_year','year'].includes(body.operation))throw fail('转换操作无效');
   const source=await loadResearchData(env,owner,session.session_id,match[2]),data=parseCsv(source.text,'canonical.csv'),column=String(body.column||''),format=source.labels?.date_formats?.[column];
   if(!format||!/^%t[mqd]/.test(format))throw fail('仅支持预览Stata月、季、日日期提取年份');
   let name=column.slice(0,90)+'_year';for(let n=2;data.headers.includes(name);n++)name=column.slice(0,85)+'_year'+n;
   const index=data.headers.indexOf(column),values=data.rows.map(row=>{const raw=row[index];if(raw==='')return '';const value=Number(raw);if(!Number.isFinite(value)||!Number.isInteger(value))throw fail('日期编码不是有限整数');const year=format.startsWith('%tm')?1960+Math.floor(value/12):format.startsWith('%tq')?1960+Math.floor(value/4):new Date(Date.UTC(1960,0,1)+value*86400000).getUTCFullYear();if(!Number.isInteger(year)||year<1800||year>2200)throw fail('年度转换范围无效');return String(year);});
   const valid=values.filter(Boolean).map(Number);if(!valid.length)throw fail('日期列全部缺失，不能提取年度');const preview={column,new_column:name,source_format:format,min_year:Math.min(...valid),max_year:Math.max(...valid),row_count:data.rows.length,warning:'仅新增年度列，不合并、不删除观测；同一个体同一年多行时，面板核对会阻止执行。'};
   if(body.operation==='preview_year')return Response.json(preview);
   if(body.confirmed!==true||!/^[a-zA-Z0-9-]{16,80}$/.test(body.request_id||''))throw fail('请先预览并确认转换');
   const fingerprint=await digest(JSON.stringify([source.id,column,'year-1'])),prior=await env.DB.prepare('SELECT id,request_sha256 FROM research_data WHERE owner=? AND session_id=? AND request_id=?').bind(owner,session.session_id,body.request_id).first();
   if(prior){if(prior.request_sha256!==fingerprint)throw fail('转换编号内容不同。',409);return Response.json(publicData(await loadResearchData(env,owner,session.session_id,prior.id)));}
   const quote=v=>/[",\r\n]/.test(v)?'"'+v.replaceAll('"','""')+'"':v,text=[data.headers.concat(name).map(quote).join(','),...data.rows.map((row,i)=>row.concat(values[i]).map(quote).join(','))].join('\n')+'\n',profile=parseCsv(text,'canonical.csv').profile;
   const id=crypto.randomUUID(),prefix=`data/${owner}/${session.session_id}/${id}`,record={...source,id,data_id:id,source_key:prefix+'/source',canonical_key:prefix+'/canonical.csv',metadata_key:prefix+'/metadata.json',canonical_sha256:await digest(text),import_version:source.import_version+':year-1',profile,
    metadata:{...source.metadata,dictionary:{...source.metadata.dictionary,[name]:'经用户确认，从'+column+'提取的年度'},provenance:{...source.metadata.provenance,[name]:'confirmed_date_transform'}},labels:{...source.labels,date_formats:{...source.labels.date_formats,[name]:'%ty'}}};
   delete record.text;record.input_sha256=record.canonical_sha256;
   const original=await env.FILES.get(source.source_key),sidecar=await env.FILES.get(source.metadata_key);if(!original||!sidecar)throw fail('原始材料丢失',404);
   await env.FILES.put(record.source_key,new Uint8Array(await original.arrayBuffer()));await env.FILES.put(record.canonical_key,text);await env.FILES.put(record.metadata_key,JSON.stringify({...JSON.parse(await sidecar.text()),transformation:preview,parent_data_id:source.id}));
   try{const inserted=await env.DB.prepare('INSERT INTO research_data(id,session_id,owner,body,created_at,request_id,request_sha256) SELECT ?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM sessions WHERE id=? AND owner=? AND state_version=?)').bind(id,session.session_id,owner,JSON.stringify(record),Date.now(),body.request_id,fingerprint,session.session_id,owner,session.state_version).run();if(!inserted.meta.changes)throw fail('转换期间资料已变化。',409);}catch(e){await env.FILES.delete([record.source_key,record.canonical_key,record.metadata_key]);const receipt=await env.DB.prepare('SELECT id,request_sha256 FROM research_data WHERE owner=? AND session_id=? AND request_id=?').bind(owner,session.session_id,body.request_id).first();if(receipt?.request_sha256===fingerprint)return Response.json(publicData(await loadResearchData(env,owner,session.session_id,receipt.id)));throw e;}
   return Response.json(publicData({...record,text,transformation:preview}));
  }
  if(request.method!=='POST'||match[2])throw fail('方法不支持。',405);
  const form=await request.formData(),file=form.get('file'),request_id=String(form.get('request_id')||'');
  requireSessionVersion(session,{state_version:Number(form.get('state_version'))});
  if(!file||typeof file.arrayBuffer!=='function'||file.size>2_000_000||!file.size)throw fail('请选择不超过2MB的文件。');
  if(!/^[a-zA-Z0-9-]{16,80}$/.test(request_id))throw fail('上传编号无效。');
  const filename=String(file.name||'data.csv').slice(0,200),format=/\.(csv|tsv|dta)$/i.exec(filename)?.[1].toLowerCase();if(!format)throw fail('只支持CSV、TSV或DTA。');
  let supplied={};const dictionary=form.get('dictionary');if(dictionary){if(String(dictionary).length>50000)throw fail('字典过大');try{supplied=JSON.parse(String(dictionary));}catch{throw fail('字典须为JSON对象');}}
  const raw=new Uint8Array(await file.arrayBuffer()),source_sha256=await bytesHash(raw),fingerprint=await digest(JSON.stringify([source_sha256,supplied,format]));
  const prior=await env.DB.prepare('SELECT id,request_sha256 FROM research_data WHERE owner=? AND session_id=? AND request_id=?').bind(owner,session.session_id,request_id).first();
  if(prior){if(prior.request_sha256!==fingerprint)throw fail('相同上传编号的内容不同。',409);return Response.json(publicData(await loadResearchData(env,owner,session.session_id,prior.id)));}
  let text,sidecar={import_version:'delimited-import-1',warnings:[]};
  if(format==='dta'){const decoded=await nodeRequest(env,owner,'data/import',{content_base64:base64(raw)});text=decoded.text;sidecar=decoded.metadata;}
  else text=new TextDecoder('utf-8',{fatal:true}).decode(raw);
  const profile=parseCsv(text,format==='dta'?'normalized.csv':filename).profile;
  if(format==='dta'&&sidecar.row_count!==profile.row_count)throw fail('导入行数不一致，文件未保存');
  const fromLabels=cleanDictionary(sidecar.variable_labels||{},profile),metadata=await datasetMetadata(source_sha256,profile,{...fromLabels,...supplied});
  metadata.provenance={...metadata.provenance,...Object.fromEntries(Object.keys(fromLabels).filter(k=>!Object.hasOwn(supplied,k)).map(k=>[k,'dta_variable_label']))};
  const id=crypto.randomUUID(),prefix=`data/${owner}/${session.session_id}/${id}`,record={id,data_id:id,session_id:session.session_id,filename,format,source_sha256,input_sha256:source_sha256,
   canonical_sha256:await digest(text),import_version:sidecar.import_version,profile,metadata,source_key:prefix+'/source',canonical_key:prefix+'/canonical.csv',metadata_key:prefix+'/metadata.json',
   labels:{variable_labels:sidecar.variable_labels||{},value_labels:Object.fromEntries(Object.entries(sidecar.value_labels||{}).map(([k,v])=>[k,Object.fromEntries(Object.entries(v).slice(0,30))])),date_formats:sidecar.date_formats||{}},warnings:sidecar.warnings||[]};
  record.input_sha256=record.canonical_sha256;
  await env.FILES.put(record.source_key,raw);await env.FILES.put(record.canonical_key,text);await env.FILES.put(record.metadata_key,JSON.stringify(sidecar));
  try{
   const inserted=await env.DB.prepare('INSERT INTO research_data(id,session_id,owner,body,created_at,request_id,request_sha256) SELECT ?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM sessions WHERE id=? AND owner=? AND state_version=?)').bind(id,session.session_id,owner,JSON.stringify(record),Date.now(),request_id,fingerprint,session.session_id,owner,session.state_version).run();
   if(!inserted.meta.changes)throw fail('上传期间练习已变化，请同步后重试。',409);
  }catch(error){await env.FILES.delete([record.source_key,record.canonical_key,record.metadata_key]);const row=await env.DB.prepare('SELECT id,request_sha256 FROM research_data WHERE owner=? AND session_id=? AND request_id=?').bind(owner,session.session_id,request_id).first();if(row?.request_sha256===fingerprint)return Response.json(publicData(await loadResearchData(env,owner,session.session_id,row.id)));throw error;}
  await touchSession(env,session);return Response.json(publicData({...record,text}));
 }catch(e){return Response.json({detail:e.message},{status:e.status||422});}
}
function publicData(record){const {source_key,canonical_key,metadata_key,...rest}=record;return rest;}
