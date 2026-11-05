#!/bin/bash
# 每 5 分钟探活；连续 3 次失败自动重启容器，并记录日志。
URL=https://ea-demo.duckdns.org:8000/healthz
STATE="$HOME/.health_fail_count"
LOG="$HOME/health.log"
CODE=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$URL")
if [ "$CODE" = "200" ]; then
  echo 0 > "$STATE"
  exit 0
fi
N=$(( $(cat "$STATE" 2>/dev/null || echo 0) + 1 ))
echo "$N" > "$STATE"
echo "$(date -Is) HEALTH_FAIL code=$CODE count=$N" >>"$LOG"
if [ "$N" -ge 3 ]; then
  sudo docker restart empirical-apprentice-joycode >/dev/null 2>&1
  echo "$(date -Is) HEALTH_RESTART" >>"$LOG"
  echo 0 > "$STATE"
fi
