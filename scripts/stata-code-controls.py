"""Actual Stata18 isolation, owned-session cancellation and hard timeout."""
import json,os,sys,threading,time
from pathlib import Path
home=Path(os.environ['STATA_HOME']);sys.path.insert(0,str(home/'ado/base/py'))
import stata_code as sc
from stata_code.core._pool import shutdown_default_pool
out=Path(__file__).resolve().parents[1]/'outputs'/('bridge-controls-'+str(time.time_ns()));out.mkdir(parents=True)
evidence={}
try:
    assert sc.run('clear all\nset obs 1\ngen marker = 42',session_id='ea_control_A').ok
    b=sc.run('capture confirm variable marker\nscalar isolated = _rc',session_id='ea_control_B',include_results='full')
    assert b.ok and b.results.r is not None
    # Inspect via an assertion, rather than infer isolation from log text.
    assert sc.run('capture confirm variable marker\nassert _rc == 111',session_id='ea_control_B').ok
    evidence['isolation']='passed'
    result={}
    def slow():result['run']=sc.run('sleep 30000',session_id='ea_control_A',timeout_ms=120000)
    thread=threading.Thread(target=slow);thread.start();time.sleep(2)
    started=time.monotonic();assert sc.cancel('ea_control_A');thread.join(15)
    assert not thread.is_alive() and not result['run'].ok and result['run'].error.kind.value=='cancelled'
    evidence['cancel_seconds']=time.monotonic()-started
    assert sc.run('display 5',session_id='ea_control_B').ok
    assert sc.run('capture confirm variable marker\nassert _rc == 111',session_id='ea_control_A').ok
    evidence['cancel_other_session_and_rebuild']='passed'
    started=time.monotonic();timed=sc.run('sleep 130000',session_id='ea_control_timeout',timeout_ms=120000)
    elapsed=time.monotonic()-started
    assert not timed.ok and 119<=elapsed<=135
    evidence['timeout_seconds']=elapsed;evidence['timeout_error']=timed.error.kind.value
    assert sc.run('display 6',session_id='ea_control_timeout').ok
    evidence['post_timeout_rebuild']='passed'
    (out/'evidence.json').write_text(json.dumps(evidence,indent=2),encoding='utf-8')
    print('Passed controls:',evidence,'Evidence:',out,flush=True)
finally:shutdown_default_pool()
