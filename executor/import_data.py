"""Bounded DTA decoding. Labels are untrusted metadata, never instructions."""
import csv,io,json,math,sys
from pathlib import Path

VERSION='dta-import-1'

def parse_dta(raw):
    import pandas as pd
    from pandas.io.stata import StataMissingValue
    if not 0<len(raw)<=2_000_000:raise ValueError('文件最多2MB')
    try:
        with pd.io.stata.StataReader(io.BytesIO(raw),convert_dates=False,convert_categoricals=False,
              convert_missing=True,preserve_dtypes=False,compression=None) as reader:
            # Read the header before allocating observations, including malformed files.
            reader.variable_labels()
            if reader._nobs>20000 or reader._nvar>60:raise ValueError('最多20000行、60列')
            frame=reader.read(nrows=20001)
            labels=reader.variable_labels();all_values=reader.value_labels()
            label_sets=getattr(reader,'_lbllist',[]);formats=getattr(reader,'_fmtlist',[])
            data_label=str(reader.data_label or '')[:300]
    except (ValueError,TypeError,EOFError,NotImplementedError) as error:
        raise ValueError('DTA读取失败，请检查格式或重新导出：'+str(error)[:180]) from None
    if not 1<=len(frame)<=20000 or not 1<=len(frame.columns)<=60:raise ValueError('DTA行列数无效')
    names=list(map(str,frame.columns))
    if len(set(names))!=len(names) or any(not n.strip() or len(n)>100 for n in names):raise ValueError('字段名无效')
    values={};date_formats={};missing={}
    for index,name in enumerate(names):
        if index<len(label_sets) and label_sets[index] in all_values:
            values[name]={str(k):str(v)[:300] for k,v in all_values[label_sets[index]].items()}
        if index<len(formats) and str(formats[index]).startswith('%t'):date_formats[name]=str(formats[index])
    out=io.StringIO();writer=csv.writer(out,lineterminator='\n');writer.writerow(names)
    for i,row in enumerate(frame.itertuples(index=False,name=None),1):
        cells=[]
        for name,value in zip(names,row):
            if isinstance(value,StataMissingValue):
                missing.setdefault(name,{}).setdefault(value.string,[]).append(i);cells.append('')
            elif pd.isna(value):cells.append('')
            elif isinstance(value,str):cells.append(value)
            elif isinstance(value,(float,int)) or hasattr(value,'item'):
                number=float(value)
                if not math.isfinite(number):raise ValueError('数据含非有限数值')
                cells.append(str(int(number)) if number.is_integer() and abs(number)<2**53 else repr(number))
            else:raise ValueError('不支持的数据类型')
        writer.writerow(cells)
        if out.tell()>2_000_000:raise ValueError('规范化数据超过2MB，不能截断导入')
    text=out.getvalue()
    if len(text.encode())>2_000_000:raise ValueError('规范化数据超过2MB')
    metadata={'row_count':len(frame),'column_count':len(names),'import_version':VERSION,'variable_labels':labels,'value_labels':values,'data_label':data_label,
              'date_formats':date_formats,'missing_codes':missing,'notes':None,'notes_status':'保留在原始DTA，未提取为指令或研究事实',
              'warnings':['DTA标签来自文件，未独立核实；计算保留原数值编码。','-99等普通数值不会自动改为缺失。']}
    if len(json.dumps(metadata,ensure_ascii=False).encode())>8_000_000:raise ValueError('标签及缺失记录过大，请缩小数据后导入')
    return {'text':text,'metadata':metadata}

if __name__=='__main__':
    directory=Path(sys.argv[1]).resolve()
    result=parse_dta((directory/'input.dta').read_bytes())
    (directory/'import.json').write_text(json.dumps(result,ensure_ascii=False,allow_nan=False),encoding='utf-8')
