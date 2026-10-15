"""Windows child-tree ownership: closing the parent ends its adapter workers."""
import os

class ProcessGuard:
    def __init__(self, process):
        self.handle = None
        if os.name != 'nt': return
        import ctypes as c
        from ctypes import wintypes as w
        class Basic(c.Structure):
            _fields_=[('per_process_time',c.c_int64),('per_job_time',c.c_int64),('flags',w.DWORD),
                      ('minimum_working_set',c.c_size_t),('maximum_working_set',c.c_size_t),('active_process_limit',w.DWORD),
                      ('affinity',c.c_size_t),('priority',w.DWORD),('scheduling',w.DWORD)]
        class IO(c.Structure):
            _fields_=[(name,c.c_uint64) for name in ('read_ops','write_ops','other_ops','read_bytes','write_bytes','other_bytes')]
        class Extended(c.Structure):
            _fields_=[('basic',Basic),('io',IO),('process_memory',c.c_size_t),('job_memory',c.c_size_t),('peak_process_memory',c.c_size_t),('peak_job_memory',c.c_size_t)]
        kernel=c.WinDLL('kernel32',use_last_error=True)
        kernel.CreateJobObjectW.argtypes=[c.c_void_p,w.LPCWSTR];kernel.CreateJobObjectW.restype=w.HANDLE
        kernel.SetInformationJobObject.argtypes=[w.HANDLE,c.c_int,c.c_void_p,w.DWORD];kernel.SetInformationJobObject.restype=w.BOOL
        kernel.AssignProcessToJobObject.argtypes=[w.HANDLE,w.HANDLE];kernel.AssignProcessToJobObject.restype=w.BOOL
        kernel.CloseHandle.argtypes=[w.HANDLE];kernel.CloseHandle.restype=w.BOOL
        handle=kernel.CreateJobObjectW(None,None)
        if not handle: raise c.WinError(c.get_last_error())
        settings=Extended();settings.basic.flags=0x2000 # JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
        if not kernel.SetInformationJobObject(handle,9,c.byref(settings),c.sizeof(settings)) or not kernel.AssignProcessToJobObject(handle,int(process._handle)):
            error=c.get_last_error();kernel.CloseHandle(handle);process.kill();process.wait();raise c.WinError(error)
        self.kernel,self.handle=kernel,handle
    def close(self):
        if self.handle:self.kernel.CloseHandle(self.handle);self.handle=None
