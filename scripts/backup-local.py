"""Isolated local D1/R2 restore rehearsal. Not a Cloudflare production backup."""
import pathlib, sqlite3, shutil, json, time
root = pathlib.Path(__file__).resolve().parents[1]
source = root / '.wrangler' / 'state'
target = root / 'outputs' / ('restore-' + str(int(time.time())))
target.mkdir(parents=True)
databases=[]
for item in source.rglob('*'):
    rel=item.relative_to(source); dest=target / rel
    if item.is_dir(): dest.mkdir(parents=True, exist_ok=True)
    elif item.suffix=='.sqlite':
        with sqlite3.connect(item) as live, sqlite3.connect(dest) as restored:
            live.backup(restored)
            assert restored.execute('PRAGMA integrity_check').fetchone()[0]=='ok'
            tables=[row[0] for row in live.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")]
            counts={name:live.execute('SELECT COUNT(*) FROM "'+name.replace('"','""')+'"').fetchone()[0] for name in tables}
            assert all(restored.execute('SELECT COUNT(*) FROM "'+name.replace('"','""')+'"').fetchone()[0]==count for name,count in counts.items())
            databases.append({'path':str(rel),'tables':counts,'integrity':'ok'})
    elif not item.name.endswith(('-wal','-shm')): shutil.copy2(item,dest)
report={'scope':'local D1 SQLite backup API + R2 local files; production restore not accepted','restored_to':str(target),'databases':databases,'created_at':time.strftime('%Y-%m-%d %H:%M:%S')}
(root/'outputs'/'v15-backup-local.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')
print('PASS: restored',len(databases),'SQLite stores; integrity and table counts match; R2 files copied. Public restore remains pending.')
print(str(target))
