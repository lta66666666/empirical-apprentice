"""Abrupt helper exit must not leave its Python/Stata worker tree alive."""
import ctypes,json,subprocess,sys,time
from ctypes import wintypes
from pathlib import Path
root=Path(__file__).resolve().parents[1]
grandchild='import time;time.sleep(60)'
child='import subprocess,sys,time,json;p=subprocess.Popen([sys.executable,"-c",'+repr(grandchild)+']);print(json.dumps({"grandchild":p.pid}),flush=True);time.sleep(60)'
parent='import sys,subprocess,time,json,os;sys.path.insert(0,'+repr(str(root/'local_stata'))+');from process_guard import ProcessGuard;p=subprocess.Popen([sys.executable,"-c","import sys;sys.stdin.buffer.read(1);exec(sys.argv[1])",'+repr(child)+'],stdin=subprocess.PIPE);g=ProcessGuard(p);p.stdin.write(b"1");p.stdin.close();print(json.dumps({"parent":os.getpid(),"child":p.pid}),flush=True);time.sleep(60)'
p=subprocess.Popen([getattr(sys,'_base_executable',sys.executable),'-c',parent],stdout=subprocess.PIPE,text=True)
kernel=ctypes.WinDLL('kernel32',use_last_error=True)
kernel.OpenProcess.argtypes=[wintypes.DWORD,wintypes.BOOL,wintypes.DWORD];kernel.OpenProcess.restype=wintypes.HANDLE
kernel.WaitForSingleObject.argtypes=[wintypes.HANDLE,wintypes.DWORD];kernel.WaitForSingleObject.restype=wintypes.DWORD
kernel.CloseHandle.argtypes=[wintypes.HANDLE]
kernel.TerminateProcess.argtypes=[wintypes.HANDLE,wintypes.UINT];kernel.TerminateProcess.restype=wintypes.BOOL
handles=[]
try:
    ids={};ids.update(json.loads(p.stdout.readline()));ids.update(json.loads(p.stdout.readline()))
    parent_handle=kernel.OpenProcess(0x100001,False,ids.pop('parent'));assert parent_handle
    for pid in ids.values():
        handle=kernel.OpenProcess(0x100000,False,pid);assert handle;handles.append(handle)
    assert kernel.TerminateProcess(parent_handle,1);kernel.CloseHandle(parent_handle);p.wait(timeout=10)
    assert all(kernel.WaitForSingleObject(handle,10000)==0 for handle in handles),'Orphan worker remains'
    out=root/'outputs'/('process-guard-'+str(time.time_ns())+'.json')
    out.write_text(json.dumps({'status':'passed','checks':['abrupt parent termination stops owned child and grandchild']}),encoding='utf-8')
    print('PASS abrupt helper exit kills its owned child tree. Evidence:',out)
finally:
    if p.poll() is None:p.terminate();p.wait(timeout=10)
    for handle in handles:kernel.CloseHandle(handle)
