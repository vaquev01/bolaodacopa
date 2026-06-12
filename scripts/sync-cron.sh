#!/bin/bash
# Cron local de sync de placares — roda enquanto o deploy Vercel não existe.
# Instalação: LaunchAgent ~/Library/LaunchAgents/com.keli.bolao-sync.plist (StartInterval 600).
# Log: /tmp/bolao-sync.log

set -euo pipefail

SECRET=$(security find-generic-password -s keli-vault/bolao-cron -a default -w)
TS=$(date "+%Y-%m-%d %H:%M:%S")

RESULT=$(curl -fsS -m 50 -X POST \
  -H "x-cron-secret: ${SECRET}" \
  http://localhost:3017/api/sync-results 2>&1) || {
  echo "${TS} ERRO: ${RESULT}" >> /tmp/bolao-sync.log
  exit 1
}

echo "${TS} ${RESULT}" >> /tmp/bolao-sync.log
