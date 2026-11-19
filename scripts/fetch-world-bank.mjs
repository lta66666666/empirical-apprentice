import {createHash} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {dirname} from 'node:path';

const INDICATORS={
  internet:{code:'IT.NET.USER.ZS',name:'Individuals using the Internet (% of population)'},
  productivity:{code:'SL.GDP.PCAP.EM.KD',name:'GDP per person employed (constant 2021 PPP $)'},
  investment:{code:'NE.GDI.TOTL.ZS',name:'Gross capital formation (% of GDP)'},
};
const BASE='https://api.worldbank.org/v2';
const country='CHN';
const range='2000:2023';
async function series(code){
  const url=`${BASE}/country/${country}/indicator/${code}?format=json&per_page=100&date=${range}`;
  const response=await fetch(url);
  if(!response.ok)throw Error(`${code} ${response.status}`);
  const payload=await response.json();
  if(!Array.isArray(payload)||!Array.isArray(payload[1]))throw Error(`${code} unexpected payload`);
  return {url,lastupdated:payload[0].lastupdated,values:payload[1].map(item=>({year:Number(item.date),value:item.value}))};
}
const fetched={};
for(const [key,indicator] of Object.entries(INDICATORS))fetched[key]=await series(indicator.code);
const years=[...new Set(Object.values(fetched).flatMap(item=>item.values.map(row=>row.year)))].sort((a,b)=>a-b);
const rows=[];
for(const year of years){
  const internet=fetched.internet.values.find(row=>row.year===year)?.value;
  const productivity=fetched.productivity.values.find(row=>row.year===year)?.value;
  const investment=fetched.investment.values.find(row=>row.year===year)?.value;
  if([internet,productivity,investment].some(value=>value==null))continue;
  rows.push([year,internet,productivity,investment]);
}
if(rows.length<20)throw Error('可用年份过少：'+rows.length);
const csv=['year,internet_users_pct,gdp_per_person_employed_ppp,gross_capital_formation_pct',...rows.map(row=>row.map(value=>typeof value==='number'?String(Number(value.toFixed(6))):value).join(','))].join('\n')+'\n';
const out='static/real-data/world-bank-china-2000-2023.csv';
await mkdir(dirname(out),{recursive:true});
await writeFile(out,csv);
const sha256=createHash('sha256').update(csv).digest('hex');
const metadata={
  dataset:'World Bank World Development Indicators (WDI)',
  publisher:'World Bank',
  country:'China (CHN)',
  period:`${rows[0][0]}-${rows.at(-1)[0]}`,
  retrieved_at:new Date().toISOString(),
  api_base:BASE,
  indicators:Object.fromEntries(Object.entries(INDICATORS).map(([key,item])=>[key,{...item,url:fetched[key].url,last_updated:fetched[key].lastupdated}])),
  license:'CC BY 4.0',
  citation:'World Bank. World Development Indicators. Washington, D.C.: World Bank Group. https://datacatalog.worldbank.org/dataset/world-development-indicators',
  file:out,
  rows:rows.length,
  columns:['year','internet_users_pct','gdp_per_person_employed_ppp','gross_capital_formation_pct'],
  sha256,
  limits:[
    '国家年度总量，不是城市或企业面板。',
    '互联网使用率与人均产出只能作描述性关联，不能单独支撑因果结论。',
    '2021 PPP 美元与百分比指标口径见 World Bank 元数据。',
  ],
};
await writeFile('static/real-data/source.json',JSON.stringify(metadata,null,2));
console.log(JSON.stringify({rows:rows.length,period:metadata.period,sha256,file:out},null,2));
