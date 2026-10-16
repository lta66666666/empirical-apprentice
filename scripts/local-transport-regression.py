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
    print('PASS: one bounded safe retry; HTTP/certificate/non-idempotent failures not retried; recovered connection clears only network error')
