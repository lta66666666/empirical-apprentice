// Generated from the server parser; keep limits and quoting behavior identical.
(()=>{const MAX_BYTES=2000000,MAX_ROWS=20000,MISSING=new Set(['','NA','N/A','null','NaN']);
window.eaParseCsv=function(text, filename = 'data.csv') {
  if (typeof text !== 'string' || new TextEncoder().encode(text).length > MAX_BYTES) throw new Error('文件最多 2 MB。');
  if (text.includes('\ufffd')) throw new Error('检测到无法解码的字符，请重新导出 UTF-8 CSV/TSV。');
  const delimiter = filename.toLowerCase().endsWith('.tsv') ? '\t' : ',';
  const rows = [], starts = [];
  let row = [], value = '', quoted = false, afterQuote = false, line = 1, rowLine = 1;
  const source = text.replace(/^\ufeff/, '');
  const pushField = () => { row.push(value); value = ''; afterQuote = false; };
  const pushRow = () => { pushField(); rows.push(row); starts.push(rowLine); row = []; rowLine = line + 1; };
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (quoted) {
      if (ch === '"' && source[i + 1] === '"') { value += '"'; i++; }
      else if (ch === '"') { quoted = false; afterQuote = true; }
      else { value += ch; if (ch === '\n') line++; }
    } else if (ch === '"' && value === '' && !afterQuote) quoted = true;
    else if (ch === delimiter) pushField();
    else if (ch === '\n') { pushRow(); line++; }
    else if (ch === '\r' && source[i + 1] === '\n') { pushRow(); i++; line++; }
    else if (afterQuote && ch !== ' ' && ch !== '\t') throw new Error(`第 ${line} 行引号后的内容无效。`);
    else value += ch;
  }
  if (quoted) throw new Error('CSV 引号未闭合。');
  if (value || row.length || afterQuote) pushRow();
  if (!rows.length) throw new Error('数据文件为空。');
  const headers = rows.shift().map((value) => value.trim());
  starts.shift();
  if (!headers.length || headers.length > 60 || headers.some((value) => !value || value.length > 100) || new Set(headers).size !== headers.length) {
    throw new Error('列名须非空且不重复，最多 60 列，单列名最多 100 字。');
  }
  const body = [], lines = [];
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].every((value) => !value.trim())) continue;
    if (rows[i].length !== headers.length) throw new Error(`第 ${starts[i]} 行列数与表头不一致。`);
    if (body.length >= MAX_ROWS) throw new Error('最多支持 20000 行。');
    body.push(rows[i].map((value) => value.trim())); lines.push(starts[i]);
  }
  if (!body.length) throw new Error('文件没有观测行。');
  const columns = headers.map((name, index) => {
    const values = body.map((row) => row[index]);
    const present = values.filter((value) => !MISSING.has(value));
    return { name, missing: values.length - present.length,
      numeric: !!present.length && present.every((value) => Number.isFinite(Number(value))), unique: new Set(present).size };
  });
  return { headers, rows: body, lines, profile: { row_count: body.length, columns, format: delimiter === '\t' ? 'TSV' : 'CSV' } };
}

window.eaParseFragmentAsync=(text,filename)=>{if(typeof Worker==='undefined')return Promise.resolve(window.eaParseCsv(text,filename));return new Promise((resolve,reject)=>{const worker=new Worker('/static/data-fragment-worker.js');const timer=setTimeout(()=>{worker.terminate();reject(Error('数据片段解析超时，文字已保留，请精简或上传文件。'));},15000);const finish=()=>{clearTimeout(timer);worker.terminate();};worker.onmessage=event=>{finish();event.data.error?reject(Error(event.data.error)):resolve(event.data);};worker.onerror=()=>{finish();reject(Error('本地解析未完成，文字已保留，请重试或上传文件。'));};worker.postMessage({text,filename});});};
})();
