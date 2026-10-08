#!/bin/sh
# launchd supervisor: start the existing Podman VM and reconcile this stack.
set -u
export PATH=/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin
cd "$(dirname "$0")/.." || exit 1
/usr/bin/caffeinate -i -s &
awake_pid=$!
trap 'kill "$awake_pid" 2>/dev/null || true; exit 0' TERM INT EXIT
while :; do
  if ! podman info >/dev/null 2>&1; then
    podman machine start >/dev/null 2>&1 || true
  fi
  if podman info >/dev/null 2>&1; then
    if ! podman compose --profile tunnel up -d gateway cloudflared >/dev/null 2>&1; then
      echo 'Doorbeller: Containerstart fehlgeschlagen; erneuter Versuch in 60 Sekunden.' >&2
    fi
  else
    echo 'Doorbeller: Podman noch nicht verfügbar; erneuter Versuch in 60 Sekunden.' >&2
  fi
  sleep 60 &
  wait $! || true
done
