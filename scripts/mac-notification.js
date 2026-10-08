import { spawn } from 'node:child_process';
// Only explicit, current admission events produce notifications. No log contents
// or user-configured text are interpolated into AppleScript.
export function isRing(line, now = Date.now()) {
  try {
    const event = JSON.parse(line);
    const age = now - Date.parse(event.time);
    return event.event === 'ring_accepted' && age >= -1000 && age <= 15000;
  } catch { return false; }
}
export function notify(spawnProcess = spawn) {
  return spawnProcess('/usr/bin/osascript', ['-e', 'display notification "Es hat an der Haustür geklingelt." with title "DoorBird"'], { stdio: 'ignore' });
}
