import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { isRing, notify } from './mac-notification.js';
let stopping = false, follower, retry;
function follow() {
  if (stopping) return;
  // New subscriptions start now: no replay of old bells after a restart/outage.
  follower = spawn('podman', ['logs', '--follow', '--since', new Date().toISOString(), 'doorbeller_gateway_1'], { stdio: ['ignore', 'pipe', 'ignore'] });
  const lines = createInterface({ input: follower.stdout });
  lines.on('line', line => {
    if (isRing(line)) {
      const notification = notify();
      notification.on('error', () => console.error('Doorbeller: macOS-Benachrichtigung konnte nicht gestartet werden.'));
      notification.on('exit', code => {
        if (code === 0) console.log(JSON.stringify({ event: 'mac_notification_submitted', time: new Date().toISOString() }));
        else console.error('Doorbeller: macOS hat die Benachrichtigung abgewiesen.');
      });
    }
  });
  follower.on('error', () => {}); // close also follows spawn errors
  follower.on('close', () => { lines.close(); if (!stopping) retry = setTimeout(follow, 5000); });
}
function stop() { stopping = true; clearTimeout(retry); follower?.kill('SIGTERM'); }
process.on('SIGTERM', stop); process.on('SIGINT', stop);
follow();
