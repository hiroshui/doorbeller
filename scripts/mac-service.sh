#!/bin/sh
# launchd supervisor: start the existing Podman VM and reconcile this stack.
set -u
export PATH=/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin
cd "$(dirname "$0")/.." || exit 1
/usr/bin/caffeinate -i -s &
awake_pid=$!
node scripts/mac-notifier.js &
notifier_pid=$!
sleep_pid=''
cleanup() {
  trap - TERM INT EXIT
  kill "$awake_pid" "$notifier_pid" "$sleep_pid" 2>/dev/null || true
  exit 0
}
trap cleanup TERM INT EXIT
while :; do
  if ! kill -0 "$notifier_pid" 2>/dev/null; then
    node scripts/mac-notifier.js &
    notifier_pid=$!
  fi
  if ! podman info >/dev/null 2>&1; then
    podman machine start >/dev/null 2>&1 || true
  fi
  if podman info >/dev/null 2>&1; then
    if [ -f secrets/ntfy/server.yml ]; then
      stack_services='gateway cloudflared ntfy'
    else
      stack_services='gateway cloudflared'
    fi
    if ! podman compose --profile tunnel --profile notifications up -d $stack_services >/dev/null 2>&1; then
      echo 'Doorbeller: Containerstart fehlgeschlagen; erneuter Versuch in 60 Sekunden.' >&2
    fi
  else
    echo 'Doorbeller: Podman noch nicht verfügbar; erneuter Versuch in 60 Sekunden.' >&2
  fi
  sleep 60 &
  sleep_pid=$!
  wait "$sleep_pid" || true
done
