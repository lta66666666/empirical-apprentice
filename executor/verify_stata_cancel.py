import asyncio
import json
import os
import tempfile
from pathlib import Path
import psutil
from .engines import process
root=Path(__file__).resolve().parents[1]
async def main():
    with tempfile.TemporaryDirectory(prefix='stata-cancel-',dir=root/'outputs') as tmp:
        directory=Path(tmp)
        (directory/'cancel.do').write_text('version 18.0\nclear all\nset more off\ncapture log close _all\nlog using execution.log, text replace\nfile open marker using started.txt, write replace\nfile write marker "started"\nfile close marker\nsleep 30000\nfile open done using finished.txt, write replace\nfile close done\nlog close\nexit, clear\n',encoding='utf-8')
        seen=[]
        task=asyncio.create_task(process([os.environ['EA_STATA_EXECUTABLE'],'/e','do','cancel.do'],cwd=directory,on_start=seen.append))
        for _ in range(120):
            if (directory/'started.txt').exists():break
            await asyncio.sleep(.1)
        else:
            raise AssertionError('Stata did not begin cancellation fixture')
        pid=seen[0];children=[p.pid for p in psutil.Process(pid).children(recursive=True)]
        task.cancel()
        try:await task
        except asyncio.CancelledError:pass
        assert all(not psutil.pid_exists(p) for p in [pid,*children]),'Stata process tree remains'
        assert not (directory/'finished.txt').exists()
        (root/'outputs/stata-cancel-evidence.json').write_text(json.dumps({'started':True,'cancelled':True,'process_tree_exited':True}),encoding='utf-8')
        print('PASS: real Stata batch interrupted; parent and child processes exited')
asyncio.run(main())
