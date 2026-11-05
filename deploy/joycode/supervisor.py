"""One container, two supervised services. No unsupervised background processes."""
import os
import signal
import subprocess
import sys
import time
from pathlib import Path

root=Path(__file__).resolve().parents[2]
children=[]
stopping=False

def stop(*_):
    global stopping
    if stopping:return
    stopping=True
    for child in children:
        if child.poll() is None:child.terminate()
    deadline=time.monotonic()+12
    while any(c.poll() is None for c in children) and time.monotonic()<deadline:time.sleep(.1)
    for child in children:
        if child.poll() is None:child.kill()
    for child in children:child.wait()

def main():
    required=('PUBLIC_ORIGIN','EXECUTOR_SECRET','EA_DATA_DIR','EA_NODE_DATA')
    if any(not os.getenv(k) for k in required):raise RuntimeError('Missing required runtime configuration; see deployment guide')
    if len(os.environ['EXECUTOR_SECRET'])<32:raise RuntimeError('Signing secret must have at least 32 characters')
    if os.getenv('EA_DEPLOYMENT_APPROVED')!='true':raise RuntimeError('Resource, budget and persistent storage gates have not been approved')
    web=Path(os.environ['EA_DATA_DIR']).resolve();queue=Path(os.environ['EA_NODE_DATA']).resolve()
    if web==queue or web in queue.parents or queue in web.parents:raise RuntimeError('Website and executor require separate persistent directories')
    for path in (web,queue):path.mkdir(parents=True,exist_ok=True)
    # Load scientific libraries and validate immutable source before accepting jobs.
    subprocess.run([sys.executable,'-c',
      'from executor.statspai_runner import pinned_versions; pinned_versions(); import statspai; import statspai.fast; import scipy.stats'],
      cwd=root,check=True,env={k:v for k,v in os.environ.items() if k in ('PATH','HOME','LANG','OMP_NUM_THREADS','OPENBLAS_NUM_THREADS')})
    node_env={**os.environ,'PORT':'8080','BIND_ADDRESS':'0.0.0.0','NODE_ENV':'production',
              'EXECUTOR_URL':'http://127.0.0.1:8000','EXECUTOR_INTERNAL_HOST':'loopback'}
    python_env={k:v for k,v in os.environ.items() if k in ('PATH','HOME','LANG','EA_NODE_DATA','OMP_NUM_THREADS','OPENBLAS_NUM_THREADS')}
    python_env['EA_NODE_SECRET']=os.environ['EXECUTOR_SECRET']
    children.append(subprocess.Popen([sys.executable,'-m','uvicorn','executor.app:app','--host','127.0.0.1','--port','8000','--no-access-log'],cwd=root,env=python_env))
    # Signed capability request ensures queue migrations and lifespan startup finished.
    import hashlib,hmac,urllib.request,uuid
    ready=False
    for _ in range(150):
        if children[0].poll() is not None:break
        stamp=str(int(time.time()));rid=str(uuid.uuid4());owner='startup_readiness'
        canonical='\n'.join(['GET','/v1/capabilities',stamp,rid,owner,hashlib.sha256(b'').hexdigest()])
        signature=hmac.new(os.environ['EXECUTOR_SECRET'].encode(),canonical.encode(),hashlib.sha256).hexdigest()
        request=urllib.request.Request('http://127.0.0.1:8000/v1/capabilities',headers={
          'X-EA-Time':stamp,'X-EA-Request':rid,'X-EA-Owner':owner,'X-EA-Signature':signature})
        try:
            import json
            with urllib.request.urlopen(request,timeout=2) as response:ready=json.load(response)['statspai_cloud']['ready']
            if ready:break
        except OSError:pass
        time.sleep(.2)
    if not ready:raise RuntimeError('Executor readiness failed; website was not opened')
    children.append(subprocess.Popen(['node','standalone/server.mjs'],cwd=root,env=node_env))
    while all(c.poll() is None for c in children):time.sleep(.25)
    raise RuntimeError('A required service stopped; container must restart')

if __name__=='__main__':
    for sig in (signal.SIGINT,signal.SIGTERM):signal.signal(sig,stop)
    try:main()
    finally:stop()
