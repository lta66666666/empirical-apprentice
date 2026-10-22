"""Native DTA edge cases using synthetic data, not real student records."""
import io,json,struct,sys
from pathlib import Path
root=Path(__file__).resolve().parents[1];sys.path.insert(0,str(root))
import pandas as pd
from pandas.io.stata import StataMissingValue
from executor.import_data import parse_dta
out=root/'outputs/dta-acceptance';out.mkdir(exist_ok=True);checks=[]
frame=pd.DataFrame({'hospital':['甲','乙','丙','丁']*3,'year':[2018]*4+[2019]*4+[2020]*4,'cost':[1.,2.,-99.,None]*3,'group':[0,1,0,1]*3,'month':pd.date_range('2019-01-01',periods=12,freq='MS')})
stream=io.BytesIO();frame.to_stata(stream,write_index=False,version=118,variable_labels={'cost':'医疗费用（单位待确认）','group':'分组'},value_labels={'group':{0:'对照',1:'处理'}},convert_dates={'month':'tm'})
raw=stream.getvalue();result=parse_dta(raw)
assert result['metadata']['value_labels']['group']=={'0':'对照','1':'处理'}
assert result['metadata']['variable_labels']['cost']=='医疗费用（单位待确认）';assert '-99' in result['text'];assert result['metadata']['date_formats']['month']=='%tm'
(out/'hospital.dta').write_bytes(raw);(out/'normalized.csv').write_text(result['text'],encoding='utf-8');(out/'metadata.json').write_text(json.dumps(result['metadata'],ensure_ascii=False,indent=2),encoding='utf-8')
checks+=['中文变量/值标签、字符串编号、数值码、系统缺失及普通负数保留','月日期格式保留，不自动转换年度']
values=[12345.678901,23456.789012,-99.0];buf=io.BytesIO();pd.DataFrame({'x':values}).to_stata(buf,version=118,write_index=False);raw=buf.getvalue()
for number,label in zip(values[:2],['.a','.z']):
 missing=next(k for k,v in StataMissingValue.MISSING_VALUES.items() if v==label and k>1e300)
 token=struct.pack('<d',number);assert raw.count(token)==1;raw=raw.replace(token,struct.pack('<d',missing))
extended=parse_dta(raw);assert extended['metadata']['missing_codes']['x']=={'.a':[1],'.z':[2]};assert pd.read_csv(io.StringIO(extended['text'])).x.isna().sum()==2
(out/'extended-missing.dta').write_bytes(raw);checks.append('.a/.z规范化为缺失，原类别与行号留在侧车，-99不改写')
for fmt in ['ty','tm','tq','td']:
 buf=io.BytesIO();pd.DataFrame({'date':pd.date_range('2018-01-01',periods=8)}).to_stata(buf,version=118,write_index=False,convert_dates={'date':fmt});assert parse_dta(buf.getvalue())['metadata']['date_formats']['date']=='%'+fmt
checks.append('年、季、月、日格式分别保留')
for bad in [b'broken',b'x'*2_000_001]:
 try:parse_dta(bad)
 except Exception:pass
 else:raise AssertionError('Invalid file accepted')
for frame in [pd.DataFrame({'x':range(20001)}),pd.DataFrame({'v'+str(i):[1] for i in range(61)})]:
 buf=io.BytesIO();frame.to_stata(buf,version=118,write_index=False)
 try:parse_dta(buf.getvalue())
 except ValueError:pass
 else:raise AssertionError('Oversize table accepted')
checks.append('损坏、超2MB、超行数、超列数明确拒绝')
(out/'acceptance.json').write_text(json.dumps({'checks':checks},ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps({'checks':checks},ensure_ascii=False))
