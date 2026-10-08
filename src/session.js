import { mkdirSync, readFileSync, writeFileSync, renameSync, chmodSync } from 'node:fs';
import { dirname } from 'node:path';
export function loadSession(path) { return JSON.parse(readFileSync(path, 'utf8')); }
export function saveSession(path, data) {
  if (!data?.refreshToken || !data?.localCookie || !data?.macDms) throw new Error('Incomplete registration');
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  chmodSync(dirname(path), 0o700);
  writeFileSync(`${path}.tmp`, JSON.stringify(data), { mode: 0o600 });
  chmodSync(`${path}.tmp`, 0o600);
  renameSync(`${path}.tmp`, path);
}
