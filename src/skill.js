import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { signatureVerifier } from './skill-auth.js';

export function skillConfig(env) {
  if (!env.ALEXA_SKILL_AUDIO_FILE) return undefined;
  const base = new URL(env.ALEXA_SKILL_BASE_URL);
  if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash || base.pathname !== '/') throw new Error('ALEXA_SKILL_BASE_URL must be an HTTPS origin');
  const id = env.ALEXA_SKILL_ID;
  if (id && !/^amzn1\.ask\.skill\.[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw new Error('Invalid ALEXA_SKILL_ID');
  const order = env.ALEXA_SKILL_AUDIO_ORDER ?? 'before';
  if (!['before', 'after', 'only'].includes(order)) throw new Error('Invalid ALEXA_SKILL_AUDIO_ORDER');
  const launch = env.ALEXA_SKILL_LAUNCH ?? 'id';
  if (!['id', 'text'].includes(launch)) throw new Error('Invalid ALEXA_SKILL_LAUNCH');
  const invocation = env.ALEXA_SKILL_INVOCATION ?? 'dungeon klingel';
  if (!/^[a-zäöüß ]{3,60}$/.test(invocation)) throw new Error('Invalid ALEXA_SKILL_INVOCATION');
  const bytes = readFileSync(env.ALEXA_SKILL_AUDIO_FILE);
  if (!bytes.length || bytes.length > 2 * 1024 * 1024 || !(bytes.subarray(0, 3).toString() === 'ID3' || (bytes[0] === 255 && (bytes[1] & 224) === 224))) throw new Error('Use a small MP3 for ALEXA_SKILL_AUDIO_FILE');
  const path = `/alexa/audio/${createHash('sha256').update(bytes).digest('hex')}.mp3`;
  const user = env.ALEXA_SKILL_USER_ID;
  if (user && !/^amzn1\.ask\.account\.[A-Za-z0-9._-]{1,512}$/.test(user)) throw new Error('Invalid ALEXA_SKILL_USER_ID');
  return { id, order, launch, invocation, user, bytes, path, url: base.origin + path };
}

const escape = text => text.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]);
export function skillSpeech(skill, text) {
  // ANNOUNCEMENT already supports trusted, locally configured SSML fragments
  // such as <lang>. Preserve them instead of speaking their tags aloud.
  let speech = /<[a-z]/i.test(text) ? text : escape(text);
  if (speech.startsWith('<speak>') && speech.endsWith('</speak>')) speech = speech.slice(7, -8);
  const clip = `<audio src="${escape(skill.url)}"/>`;
  return `<speak>${skill.order === 'only' ? clip : skill.order === 'after' ? speech + clip : clip + speech}</speak>`;
}

export function serveSkillAudio(req, res, skill, path) {
  if (!skill || path !== skill.path) return false;
  if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405, { Allow: 'GET, HEAD' }); res.end(); return true; }
  const size = skill.bytes.length;
  let start = 0, end = size - 1, status = 200;
  if (req.headers.range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
    if (match && (match[1] || match[2])) {
      if (!match[1]) start = Math.max(0, size - Number(match[2]));
      else { start = Number(match[1]); if (match[2]) end = Math.min(end, Number(match[2])); }
    } else start = size;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= size) { res.writeHead(416, { 'Content-Range': `bytes */${size}` }); res.end(); return true; }
    status = 206;
  }
  res.writeHead(status, { 'Content-Type': 'audio/mpeg', 'Content-Length': end - start + 1, 'Accept-Ranges': 'bytes', 'Cache-Control': 'public, max-age=86400, immutable', 'X-Content-Type-Options': 'nosniff', ...(status === 206 ? { 'Content-Range': `bytes ${start}-${end}/${size}` } : {}) });
  res.end(req.method === 'HEAD' ? undefined : skill.bytes.subarray(start, end + 1));
  return true;
}

export function createSkillHandler(cfg, { verify = signatureVerifier(), now = Date.now, log = () => {} } = {}) {
  let active = 0;
  return async (req, res) => {
    const reply = (status, body) => { if (res.destroyed) return; res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)); req.resume(); };
    if (req.method !== 'POST') return reply(405, { error: 'method_not_allowed' });
    if (!cfg.skill?.id) return reply(503, { error: 'skill_not_configured' });
    if (active >= 4) return reply(429, { error: 'busy' });
    if (!/^application\/json(?:\s*;.*)?$/i.test(req.headers['content-type'] ?? '') || req.headers['content-encoding']) return reply(400, { error: 'invalid_request' });
    if (Number(req.headers['content-length']) > 65536) return reply(413, { error: 'too_large' });
    active++;
    const timer = setTimeout(() => req.destroy(), 3500);
    try {
      const chunks = []; let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 65536) { reply(413, { error: 'too_large' }); return; }
        chunks.push(chunk);
      }
      clearTimeout(timer);
      const body = Buffer.concat(chunks);
      const envelope = JSON.parse(body.toString('utf8'));
      const system = envelope.context?.System;
      const id = system?.application?.applicationId ?? envelope.session?.application?.applicationId;
      const sessionId = envelope.session?.application?.applicationId;
      if (id !== cfg.skill.id || (sessionId && sessionId !== id)) throw new Error('Skill mismatch');
      const timestamp = Date.parse(envelope.request?.timestamp);
      if (!Number.isFinite(timestamp) || Math.abs(now() - timestamp) > 150000) throw new Error('Invalid timestamp');
      const user = system?.user?.userId ?? envelope.session?.user?.userId;
      if (cfg.skill.user && user !== cfg.skill.user) throw new Error('Wrong user');
      await verify(body, req.headers);
      const type = envelope.request?.type;
      const intent = envelope.request?.intent?.name;
      if (type === 'SessionEndedRequest') return reply(200, { version: '1.0', response: {} });
      if (type === 'IntentRequest' && ['AMAZON.StopIntent', 'AMAZON.CancelIntent'].includes(intent)) return reply(200, { version: '1.0', response: { shouldEndSession: true } });
      const play = type === 'LaunchRequest' || (type === 'IntentRequest' && intent === 'RingIntent');
      if (!play && !(type === 'IntentRequest' && ['AMAZON.HelpIntent', 'AMAZON.FallbackIntent'].includes(intent))) throw new Error('Unsupported request');
      log(play ? 'skill_clip_response' : 'skill_help_response');
      return reply(200, { version: '1.0', response: { outputSpeech: play ? { type: 'SSML', ssml: skillSpeech(cfg.skill, cfg.text) } : { type: 'PlainText', text: 'Sage: spiele die Klingel.' }, shouldEndSession: true } });
    } catch { log('skill_request_rejected'); reply(400, { error: 'invalid_request' }); }
    finally { clearTimeout(timer); active--; }
  };
}
