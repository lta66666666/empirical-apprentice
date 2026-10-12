import asyncio
import json
import os
import tempfile
import zipfile
from pathlib import Path
from .engines import process
root=Path(__file__).resolve().parents[1]
evidence=[]
baseline=json.loads((root.parent/'native_r_check/native-results.json').read_text(encoding='utf-8'))
native=json.loads((root/'outputs/executor-evidence.json').read_text(encoding='utf-8'))['r']
baseline_difference=max(abs(row[k]-next(r for r in baseline[m] if ('DID effect' if r['term']=='policy_effect' else r['term'])==row['term'])[k]) for m in native for row in native[m]['coefficients'] for k in ('estimate','std_error','ci_low','ci_high'))
assert baseline_difference<=5e-6
async def main():
    for method in ('ols','panel_fe','did'):
        with tempfile.TemporaryDirectory(prefix='package-rerun-',dir=root/'outputs') as tmp:
            directory=Path(tmp)
            with zipfile.ZipFile(root/'outputs'/f'cloud-{method}.zip') as archive:
                for name in archive.namelist():
                    target=(directory/name).resolve()
                    if not target.is_relative_to(directory):raise ValueError('Archive path escapes package')
                archive.extractall(directory)
            expected=json.loads((directory/'results.json').read_text(encoding='utf-8'))
            assert (directory/'estimate.R').exists() and (directory/'parameters.json').exists()
            assert 'R version' in (directory/'session-info.txt').read_text(encoding='utf-8')
            code,log=await process([os.environ['EA_RSCRIPT'],'--vanilla',directory/'estimate.R',directory])
            actual=json.loads((directory/'result.json').read_text(encoding='utf-8'))
            assert code==0 and actual['status']=='succeeded',log
            difference=max(abs(row[k]-next(r for r in expected['coefficients'] if r['term']==row['term'])[k]) for row in actual['coefficients'] for k in ('estimate','std_error','ci_low','ci_high'))
            assert difference<=5e-6 and actual['used_indices']==expected['used_indices']
            evidence.append({'method':method,'max_difference':difference,'sample_identical':True})
asyncio.run(main())
result={'native_baseline_max_difference':baseline_difference,'independent_packages':evidence}
(root/'outputs/package-verification.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
print(json.dumps(result))
