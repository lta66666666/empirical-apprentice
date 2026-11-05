#!/bin/bash
# 每日同步 Let's Encrypt 证书到 nginx 并重载；acme.sh 自身 cron 负责续期。
# 依赖：~/.secrets/duckdns.conf 中的 DuckDNS_Token，以及 sudo 免密。
set -u
export DuckDNS_Token="$(sed -n 's/^DuckDNS_Token=//p' "$HOME/.secrets/duckdns.conf" | tr -d '\r' | tr 'A-Z' 'a-z')"
"$HOME/.acme.sh/acme.sh" --cron --home "$HOME/.acme.sh" >/dev/null 2>&1
sudo cp "$HOME/.acme.sh/ea-demo.duckdns.org_ecc/fullchain.cer" /etc/nginx/certs/ea-demo.fullchain.pem
sudo cp "$HOME/.acme.sh/ea-demo.duckdns.org_ecc/ea-demo.duckdns.org.key" /etc/nginx/certs/ea-demo.key
sudo chmod 600 /etc/nginx/certs/ea-demo.key
sudo systemctl reload nginx
