import { readFileSync } from 'node:fs';
export function config(env = process.env) {
  const number = (name, fallback, min, max) => {
    const n = Number(env[name] ?? fallback);
    if (!Number.isInteger(n) || n < min || n > max) throw new Error(`Invalid ${name}`);
    return n;
  };
  const token = env.RING_TOKEN_FILE ? readFileSync(env.RING_TOKEN_FILE, 'utf8').trim() : env.RING_TOKEN;
  if (!/^[A-Za-z0-9_-]{43,128}$/.test(token ?? '')) throw new Error('Generate a strong RING_TOKEN with npm run token');
  const targets = [...new Set((env.ECHO_TARGETS ?? '').split(',').map(s => s.trim()).filter(Boolean))];
  if (!targets.length || targets.length > 16) throw new Error('Configure 1–16 ECHO_TARGETS');
  const text = env.ANNOUNCEMENT ?? 'Es hat an der Haustür geklingelt.';
  if (!text.trim() || text.length > 250) throw new Error('Invalid ANNOUNCEMENT');
  return { token, targets, text, port: number('PORT', 8080, 1, 65535), debounceMs: number('DEBOUNCE_MS', 5000, 0, 60000), queueSize: number('QUEUE_SIZE', 4, 1, 100), maxAgeMs: number('MAX_EVENT_AGE_MS', 15000, 100, 60000), timeoutMs: number('ALEXA_TIMEOUT_MS', 5000, 100, 10000), session: env.SESSION_FILE ?? '/data/session.json' };
}
