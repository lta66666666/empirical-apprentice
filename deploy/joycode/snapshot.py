"""Offline paired snapshot. Stop both services first; never overwrite a restore target."""
import argparse
import hashlib
import json
import shutil
import sqlite3
from contextlib import closing
from pathlib import Path

def manifest(root):
    return {str(p.relative_to(root)).replace('\\','/'):hashlib.sha256(p.read_bytes()).hexdigest()
            for p in sorted(root.rglob('*')) if p.is_file() and p!=root/'SNAPSHOT.json'}

def copy_store(source, target):
    target.mkdir()
    for path in source.rglob('*'):
        if path.is_symlink():raise ValueError('Symlinks are not supported in a snapshot')
        dest=target/path.relative_to(source)
        if path.is_dir():dest.mkdir(exist_ok=True)
        elif not path.name.endswith(('-wal','-shm')):
            if path.suffix=='.sqlite3':
                with closing(sqlite3.connect(path.as_uri()+'?mode=ro',uri=True)) as live, closing(sqlite3.connect(dest)) as saved:
                    live.backup(saved)
                    assert saved.execute('PRAGMA integrity_check').fetchone()[0]=='ok'
                    saved.execute('PRAGMA journal_mode=DELETE')
            else:shutil.copy2(path,dest)

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('mode',choices=['backup','restore'])
    parser.add_argument('--web',required=True,type=Path)
    parser.add_argument('--executor',required=True,type=Path)
    parser.add_argument('--snapshot',required=True,type=Path)
    parser.add_argument('--services-stopped',required=True,action='store_true')
    args=parser.parse_args();web=args.web.resolve();executor=args.executor.resolve();snap=args.snapshot.resolve()
    paths=[web,executor,snap]
    if any(a==b or a in b.parents or b in a.parents for i,a in enumerate(paths) for b in paths[i+1:]):
        raise ValueError('All locations must be separate, non-nested directories')
    if args.mode=='backup':
        if snap.exists():raise ValueError('Snapshot target already exists')
        if not (web/'website.sqlite3').is_file() or not (executor/'tasks.sqlite3').is_file():
            raise ValueError('Both source stores must exist')
        snap.mkdir(parents=True);copy_store(web,snap/'web');copy_store(executor,snap/'executor')
        (snap/'SNAPSHOT.json').write_text(json.dumps({'version':1,'files':manifest(snap)},indent=2),encoding='utf-8')
    else:
        saved=json.loads((snap/'SNAPSHOT.json').read_text(encoding='utf-8'))
        if saved['version']!=1 or saved['files']!=manifest(snap):raise ValueError('Snapshot hash verification failed')
        if web.exists() or executor.exists():raise ValueError('Restore targets must not exist; use isolated empty locations')
        web.parent.mkdir(parents=True,exist_ok=True);executor.parent.mkdir(parents=True,exist_ok=True)
        shutil.copytree(snap/'web',web);shutil.copytree(snap/'executor',executor)
        for db in [web/'website.sqlite3',executor/'tasks.sqlite3']:
            with closing(sqlite3.connect(db)) as store:assert store.execute('PRAGMA integrity_check').fetchone()[0]=='ok'
    print('PASS offline '+args.mode+'; both services must remain stopped until completion')

if __name__=='__main__':main()
