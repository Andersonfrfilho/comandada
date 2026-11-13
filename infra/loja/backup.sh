#!/bin/sh
# Faz pg_dump do banco da loja a cada BACKUP_INTERVAL_HOURS e mantém os BACKUP_KEEP mais recentes.
set -eu

interval_seconds=$(( ${BACKUP_INTERVAL_HOURS:-1} * 3600 ))
keep=${BACKUP_KEEP:-72}

while true; do
  timestamp=$(date +%Y-%m-%d_%H%M)
  target="/backups/comandada_${timestamp}.dump"
  if pg_dump --format=custom --file="${target}.parcial"; then
    mv "${target}.parcial" "${target}"
    echo "[backup] ok ${target}"
  else
    rm -f "${target}.parcial"
    echo "[backup] falhou em ${timestamp}" >&2
  fi
  ls -1t /backups/comandada_*.dump 2>/dev/null | tail -n +"$((keep + 1))" | xargs -r rm -f
  sleep "${interval_seconds}"
done
