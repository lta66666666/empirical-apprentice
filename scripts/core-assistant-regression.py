"""Isolated fixed-fixture preparation; never runs Stata or uses user files."""
import importlib.util,json,os,tempfile,sys,threading,urllib.request
from pathlib import Path
root=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(root/'local_stata'))
with tempfile.TemporaryDirectory(prefix='ea-fixture-',dir=root/'outputs',ignore_cleanup_errors=True) as folder:
    os.environ['EA_LOCAL_STATA_DIR']=folder
    spec=importlib.util.spec_from_file_location('ea_assistant_test',root/'local_stata/assistant.py');a=importlib.util.module_from_spec(spec);spec.loader.exec_module(a)
    manifest=json.loads((root/'local_stata/sample-fixtures/manifest.json').read_text())
    a.CONFIG={'id':'a'*36,'session_id':'testsession1'}
    request={**manifest['fixtures']['did'],'pairing_id':a.CONFIG['id'],'session_id':a.CONFIG['session_id'],'request_id':'r'*36,'status':'pending'}
    a.prepare_fixture(request)
    assert a.INPUT['profile']['row_count']==384 and a.INPUT['hash']==request['input_sha256']
    assert a.CURRENT is None and a.FIXTURE_RECEIPT['status']=='ready'
    assert (Path(a.INPUT['path']).parent/'prepared.json').exists()
    a.prepare_fixture(request);assert a.INPUT['hash']==request['input_sha256']
    a.INPUT=None;a.FIXTURE_RECEIPT=None;a.prepare_fixture(request);assert a.INPUT['session_id']==a.CONFIG['session_id']
    path=Path(a.INPUT['path']);path.write_bytes(path.read_bytes()+b'\n')
    try:a.prepare_fixture(request);raise AssertionError('modified file overwritten')
    except ValueError:assert path.read_bytes().endswith(b'\n\n')
    for patch in ({'fixture_version':'old'},{'fixture_id':'../../private'},{'pairing_id':'other'},{'session_id':'other'}):
        try:a.prepare_fixture({**request,**patch});raise AssertionError('invalid fixture accepted')
        except ValueError:pass
    print('PASS bundled fixture/hash/dictionary, durable receipt, restart, idempotence, modified-file protection, pairing/session/version validation; no execution')
    a.CURRENT={'task':{'id':'terminal-test','status':'succeeded'}}
    a.stop_current=lambda _:(_ for _ in ()).throw(AssertionError('terminal process must not be stopped'))
    server=a.ThreadingHTTPServer(('127.0.0.1',0),a.Handler);a.PORT=server.server_address[1]
    thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
    try:
        origin='http://127.0.0.1:'+str(a.PORT)
        request=urllib.request.Request(origin+'/cancel',data=b'{}',headers={'Origin':origin,'Content-Type':'application/json','X-Local-CSRF':a.CSRF})
        with urllib.request.urlopen(request) as response: result=json.load(response)
        assert result['already_terminal'] is True and a.CURRENT['task']['status']=='succeeded'
        a.sync_completed(a.CURRENT,{'id':'terminal-test','status':'awaiting_upload'})
        assert a.CURRENT['task']['status']=='succeeded'
        a.http=lambda *args,**kwargs:({'id':'new-test-pair'}, {})
        request=urllib.request.Request(origin+'/pair',data=json.dumps({'site':'https://example.test'}).encode(),headers={'Origin':origin,'Content-Type':'application/json','X-Local-CSRF':a.CSRF})
        with urllib.request.urlopen(request) as response: paired=json.load(response)
        assert len(paired['code'])==6 and a.INPUT is None and a.CURRENT is None and a.FIXTURE_RECEIPT is None
        print('PASS terminal cancel is a no-op, late heartbeat cannot reopen upload, and a new pairing clears previous input')
    finally:server.shutdown();server.server_close();thread.join(timeout=2)
