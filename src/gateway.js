import http from 'node:http';
import { createSkillHandler, serveSkillAudio } from './skill.js';
import { timingSafeEqual } from 'node:crypto';
import { log as defaultLog } from './alexa.js';
export function createGateway(cfg, alexa, { now = Date.now, log = defaultLog, skillVerify } = {}) {
  const skillHandler = createSkillHandler(cfg, { now, log, ...(skillVerify ? { verify: skillVerify } : {}) });
  let queue = [], running = false, stopping = false, lastAccepted = -Infinity;
  async function drain() {
    if (running || stopping) return;
    running = true;
    while (queue.length && !stopping) {
      const accepted = queue.shift();
      if (now() - accepted > cfg.maxAgeMs || !alexa.ready()) { log('event_dropped'); continue; }
      try { await alexa.announce(); } catch { log('event_failed'); queue = []; }
    }
    running = false;
  }
  const server = http.createServer((req, res) => {
    const reply = (status, body) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)); req.resume(); };
    let url;
    try { url = new URL(req.url, 'http://gateway'); } catch { return reply(400, { error: 'bad_request' }); }
    // Never log URL, headers, body, upstream errors or credentials.
    if (serveSkillAudio(req, res, cfg.skill, url.pathname)) return;
    if (url.pathname === '/alexa/skill') { if (stopping) return reply(503, { error: 'stopping' }); void skillHandler(req, res); return; }
    if (req.method === 'GET' && url.pathname === '/health/live') return reply(stopping ? 503 : 200, { live: !stopping });
    if (req.method === 'GET' && url.pathname === '/health/ready') return reply(!stopping && alexa.ready() ? 200 : 503, { ready: !stopping && alexa.ready(), ...(alexa.status?.() ?? { alexa: alexa.state }) });
    if (url.pathname !== '/ring') return reply(404, { error: 'not_found' });
    if (!['GET', 'POST'].includes(req.method)) return reply(405, { error: 'method_not_allowed' });
    const supplied = req.headers.authorization !== undefined ? (req.headers.authorization.startsWith('Bearer ') ? req.headers.authorization.slice(7) : '') : (url.searchParams.getAll('token').length === 1 ? url.searchParams.get('token') : '');
    const a = Buffer.from(supplied ?? ''), b = Buffer.from(cfg.token);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return reply(401, { error: 'unauthorized' });
    if (stopping || !alexa.ready()) return reply(503, { error: 'delivery_unavailable' });
    if (now() - lastAccepted < cfg.debounceMs) return reply(200, { debounced: true });
    if (queue.length + Number(running) >= cfg.queueSize) return reply(429, { error: 'queue_full' });
    lastAccepted = now(); queue.push(lastAccepted);
    reply(202, { accepted: true });
    log('ring_accepted');
    setImmediate(drain);
  });
  server.requestTimeout = 5000; server.headersTimeout = 5000; server.keepAliveTimeout = 1000;
  return { server, async stop() { stopping = true; queue = []; await new Promise(resolve => server.close(resolve)); } };
}
