"""Transport-only faults: no website requests, Stata processes or credentials."""
import importlib.util, io, ssl, sys, tempfile, os, urllib.error
from pathlib import Path
from unittest.mock import patch

root = Path(__file__).resolve().parents[1]
with tempfile.TemporaryDirectory(dir=root/'outputs') as home:
    os.environ['EA_LOCAL_STATA_DIR'] = home
    sys.path.insert(0, str(root/'local_stata'))
    spec = importlib.util.spec_from_file_location('assistant_transport', root/'local_stata/assistant.py')
    a = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(a)
    datafile=Path(home)/'example.csv';datafile.write_text('income,education\n10,12\n11,13\n',encoding='utf-8')
    assert a.read_input(datafile)['dictionary']=={}
    datafile.with_suffix('.dictionary.json').write_text('{"income":"收入，千元","education":"教育年限，年"}',encoding='utf-8')
    assert a.read_input(datafile)['dictionary']['income']=='收入，千元'
    datafile.with_suffix('.dictionary.json').write_text('{"raw_rows":[[10,12]]}',encoding='utf-8')
    invalid=a.read_input(datafile);assert invalid['dictionary']=={} and invalid['metadata_warning'] and invalid['profile']['row_count']==2
    class Response(io.BytesIO):
        headers = {}
    def success(): return Response(b'{"ok":true}')
    eof = urllib.error.URLError(ssl.SSLEOFError('EOF'))
    with patch.object(a.urllib.request,'urlopen',side_effect=[eof,success()]) as send:
        assert a.http('https://example.test',{},safe_retry=True)[0]['ok']
        assert send.call_count == 2
        assert all(c.kwargs['timeout'] <= 15 for c in send.call_args_list)
    for error in [urllib.error.HTTPError('https://example.test',403,'denied',{},None),
                  urllib.error.URLError(ssl.SSLCertVerificationError('certificate'))]:
        with patch.object(a.urllib.request,'urlopen',side_effect=error) as send:
            try: a.http('https://example.test',{},safe_retry=True)
            except Exception: pass
            else: raise AssertionError('failure was hidden')
            assert send.call_count == 1
    with patch.object(a.urllib.request,'urlopen',side_effect=eof) as send:
        try: a.http('https://example.test',{})
        except urllib.error.URLError: pass
        assert send.call_count == 1
    a.CONFIG.update(site='https://example.test',id='test',token='ephemeral-test-only')
    a.STATE.update(error='calculation error retained',network_error='old EOF',online=False)
    with patch.object(a,'http',return_value=({'ok':True},{})):
        a.remote('heartbeat',{})
    assert a.STATE['online'] and not a.STATE['network_error']
    assert a.STATE['error'] == 'calculation error retained'
    # A completed estimate survives a lost event response and an assistant restart.
    task={'id':'12345678-1234-1234-1234-123456789012','status':'running','input_sha256':'a'*64,'plan_sha256':'b'*64,'bridge_id':'stata_mcp'}
    directory=Path(home)/'tasks'/task['id'];directory.mkdir(parents=True)
    (directory/'estimate.do').write_text('display 4',encoding='utf-8')
    frozen={'estimate.do':a.digest((directory/'estimate.do').read_bytes())};bundle=a.digest(a.json.dumps(frozen,sort_keys=True).encode());task['code_sha256']=bundle
    current={'task':dict(task),'dir':directory,'hash':bundle,'frozen':frozen}
    result={'n_used':10,'coefficients':[]};a.save_completed(current,result)
    with patch.object(a,'remote',side_effect=eof) as remote:
        a.sync_completed(current,task)
        assert current['sync_pending'] and a.STATE['result']==result and remote.call_count==1
    a.STATE['result']=None
    recovered=a.recover_completed(task);assert recovered['sync_pending'] and a.STATE['result']==result
    with patch.object(a,'remote') as remote:
        a.sync_completed(recovered,dict(task,status='awaiting_upload'))
        remote.assert_not_called()
    assert not recovered['sync_pending'] and recovered['task']['status']=='awaiting_upload'
    (directory/'result.json').write_text('{}',encoding='utf-8')
    try: a.recover_completed(task)
    except ValueError: pass
    else: raise AssertionError('tampered result recovered')
    print('PASS: result persisted before network event; loss/restart restores awaiting-upload without re-execution or publish; tampering rejected')
    print('PASS: one bounded safe retry; HTTP/certificate/non-idempotent failures not retried; recovered connection clears only network error')
