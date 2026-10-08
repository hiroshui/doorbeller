import { readFileSync } from 'node:fs';
import { skillConfig } from './skill.js';
export function config(env = process.env) {
  const number = (name, fallback, min, max) => {
    const n = Number(env[name] ?? fallback);
    if (!Number.isInteger(n) || n < min || n > max) throw new Error(`Invalid ${name}`);
    return n;
  };
  const token = env.RING_TOKEN_FILE ? readFileSync(env.RING_TOKEN_FILE, 'utf8').trim() : env.RING_TOKEN;
  if (!/^[A-Za-z0-9_-]{43,128}$/.test(token ?? '')) throw new Error('Generate a strong RING_TOKEN with npm run token');
  const targets = [...new Set((env.ECHO_TARGETS ?? '').split(',').map(s => s.trim()).filter(Boolean))];
  if (!targets.length || targets.length > 16 || (targets.includes('all') && targets.length !== 1)) throw new Error('Configure 1–16 ECHO_TARGETS');
  const text = env.ANNOUNCEMENT ?? 'Es hat an der Haustür geklingelt.';
  if (!text.trim() || text.length > 250) throw new Error('Invalid ANNOUNCEMENT');
  const output = env.ALEXA_OUTPUT ?? 'speak';
  if (!['speak', 'skill'].includes(output)) throw new Error('Invalid ALEXA_OUTPUT');
  const skill = skillConfig(env);
  if (output === 'skill' && !skill?.id) throw new Error('Configure skill endpoint and ALEXA_SKILL_ID before selecting skill');
  let push;
  if (env.NTFY_URL) {
    const url = new URL(env.NTFY_URL);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('Invalid NTFY_URL');
    if (url.protocol === 'http:' && !['ntfy', 'localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error('Remote ntfy connections require HTTPS');
    const pushToken = readFileSync(env.NTFY_TOKEN_FILE ?? '/run/secrets/ntfy_publish_token', 'utf8').trim();
    if (!/^tk_[A-Za-z0-9]{29,64}$/.test(pushToken)) throw new Error('Invalid ntfy publisher token');
    const topic = env.NTFY_TOPIC ?? 'haustuer';
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(topic)) throw new Error('Invalid NTFY_TOPIC');
    const message = env.NTFY_MESSAGE ?? 'Es hat an der Haustür geklingelt.';
    if (!message.trim() || message.length > 500) throw new Error('Invalid NTFY_MESSAGE');
    push = { url: url.origin, token: pushToken, topic, text: message, timeoutMs: number('NTFY_TIMEOUT_MS', 3000, 100, 10000) };
  }
  return { output, skill, push, token, targets, text, port: number('PORT', 8080, 1, 65535), debounceMs: number('DEBOUNCE_MS', 5000, 0, 60000), queueSize: number('QUEUE_SIZE', 4, 1, 100), maxAgeMs: number('MAX_EVENT_AGE_MS', 15000, 100, 60000), timeoutMs: number('ALEXA_TIMEOUT_MS', 5000, 100, 10000), session: env.SESSION_FILE ?? '/data/session.json' };
}
