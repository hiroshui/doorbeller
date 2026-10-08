import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGateway } from '../src/gateway.js';
const token = 'a'.repeat(43);
const tick = () => new Promise(r => setImmediate(r));
async function fixture(t, overrides = {}) {
  let time = 1000;
  const logs = [];
  const alexa = { state: 'ready', ready: () => alexa.state === 'ready', announce: async () => {} };
  const cfg = { token, debounceMs: 100, queueSize: 2, maxAgeMs: 500, ...overrides };
  const gw = createGateway(cfg, alexa, { now: () => time, log: (event) => logs.push(event) });
  await new Promise(r => gw.server.listen(0, '127.0.0.1', r));
  t.after(() => gw.stop());
  const base = `http://127.0.0.1:${gw.server.address().port}`;
  return { alexa, logs, advance: n => time += n, request: (path = `/ring?token=${token}`, options = {}) => fetch(base + path, options) };
}
test('GET and POST authentication, malformed and duplicate tokens; logs omit secrets', async t => {
  const f = await fixture(t);
  assert.equal((await f.request('/ring')).status, 401);
  assert.equal((await f.request('/ring', { headers: { Authorization: token } })).status, 401);
  assert.equal((await f.request('/ring?token=wrong')).status, 401);
  assert.equal((await f.request(`/ring?token=${token}&token=${token}`)).status, 401);
  assert.equal((await f.request('/ring', { method: 'POST', headers: { Authorization: `Bearer ${token}` } })).status, 202);
  f.advance(101);
  assert.equal((await f.request()).status, 202);
  assert.equal((await f.request('/ring', { method: 'DELETE' })).status, 405);
  assert.equal((await f.request(`/secret/${token}`)).status, 404);
  assert.ok(!JSON.stringify(f.logs).includes(token));
});
test('202 before Amazon, debounce, bounded queue and explicit overload', async t => {
  const f = await fixture(t); let finish;
  f.alexa.announce = () => new Promise(r => finish = r);
  assert.equal((await f.request()).status, 202);
  assert.equal((await f.request()).status, 200);
  f.advance(101); assert.equal((await f.request()).status, 202);
  f.advance(101); assert.equal((await f.request()).status, 429);
  f.alexa.state = 'unavailable'; finish(); await tick();
  assert.ok(f.logs.includes('event_dropped'));
});
test('liveness differs from readiness during Alexa outage', async t => {
  const f = await fixture(t); f.alexa.state = 'unavailable';
  assert.equal((await f.request('/health/live')).status, 200);
  assert.equal((await f.request('/health/ready')).status, 503);
  assert.equal((await f.request()).status, 503);
});
test('expired queued events never speak', async t => {
  const f = await fixture(t); let finish; let calls = 0;
  f.alexa.announce = () => { calls++; return new Promise(r => finish = r); };
  await f.request(); f.advance(101); await f.request(); f.advance(501); finish(); await tick();
  assert.equal(calls, 1); assert.ok(f.logs.includes('event_dropped'));
});
test('failure clears queue and does not retry', async t => {
  const f = await fixture(t); let fail; let calls = 0;
  f.alexa.announce = () => { calls++; return new Promise((r, reject) => fail = reject); };
  await f.request(); f.advance(101); await f.request(); fail(new Error(token)); await tick();
  assert.equal(calls, 1); assert.deepEqual(f.logs, ['event_failed']);
});
