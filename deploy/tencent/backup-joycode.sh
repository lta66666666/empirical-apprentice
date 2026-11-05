#!/bin/bash
# 每日离线快照：短暂停服 → 一致性备份 → 自动恢复服务；保留最近 7 份。
set -u
STAMP=$(date +%Y%m%d-%H%M%S)
ROOT="$HOME/joycode"
SNAP="$HOME/backups/joycode-$STAMP"
LOG="$HOME/backup.log"
mkdir -p "$HOME/backups"
cd "$ROOT" || exit 1
trap 'sudo docker compose start >/dev/null 2>&1' EXIT
sudo docker compose stop >/dev/null 2>&1
python3 deploy/joycode/snapshot.py backup \
  --web data/web --executor data/executor --snapshot "$SNAP" --services-stopped >>"$LOG" 2>&1
code=$?
if [ "$code" -ne 0 ]; then
  echo "$(date -Is) BACKUP_FAILED code=$code" >>"$LOG"
  exit "$code"
fi
ls -1dt "$HOME"/backups/joycode-* 2>/dev/null | tail -n +8 | xargs -r rm -rf
echo "$(date -Is) BACKUP_OK $SNAP" >>"$LOG"
