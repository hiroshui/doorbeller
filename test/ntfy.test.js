import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NtfyClient } from '../src/ntfy.js';
import { Delivery } from '../src/delivery.js';
import { ntfyConfig, addDevice } from '../scripts/ntfy-config.js';
const cfg = { url: 'http://ntfy:8080', token: 'tk_test_secret', topic: 'haustuer', text: 'Es hat geklingelt.', timeoutMs: 20 };
test('ntfy publisher uses a scoped header token, Unicode JSON and no redirects', async () => {
  const calls = [];
  const client = new NtfyClient(cfg, async (url, options) => {
    calls.push({ url, options });
    return new Response(JSON.stringify(url.endsWith('/health') ? { healthy: true } : url.endsWith('/account') ? { username: 'gateway' } : { event: 'message', topic: cfg.topic, id: 'event-id' }));
  });
  await client.check(); assert.equal(client.ready(), true); await client.announce();
  const publish = calls.find(call => call.options.method === 'POST');
  assert.equal(publish.url, cfg.url); assert.equal(publish.options.redirect, 'error');
  assert.equal(publish.options.headers.Authorization, `Bearer ${cfg.token}`);
  assert.equal(JSON.parse(publish.options.body).priority, 4);
  assert.equal(JSON.parse(publish.options.body).topic, cfg.topic);
  assert.ok(!publish.url.includes(cfg.token));
});
test('ntfy HTTP rejection is not retried; readiness recovers independently', async () => {
  let attempts = 0;
  const client = new NtfyClient(cfg, async url => {
    if (url.endsWith('/health')) return Response.json({ healthy: true });
    if (url.endsWith('/account')) return Response.json({ username: 'gateway' });
    attempts++; return new Response('private error', { status: 403 });
  });
  await client.check(); await assert.rejects(client.announce(), /Push failed/);
  assert.equal(client.ready(), false); assert.equal(attempts, 1);
  await client.check(); assert.equal(client.ready(), true);
});
test('ntfy hung request is aborted at deadline without replay', async () => {
  let calls = 0, aborted = false;
  const client = new NtfyClient(cfg, (url, options) => new Promise((resolve, reject) => {
    calls++;
    const guard = setTimeout(() => reject(new Error('test guard')), 1000);
    options.signal.addEventListener('abort', () => { aborted = true; clearTimeout(guard); reject(options.signal.reason); });
  }));
  client.state = 'ready'; await assert.rejects(client.announce());
  assert.equal(aborted, true); assert.equal(calls, 1);
});
test('push works without Alexa and a failing Echo does not retry a delivered notification', async () => {
  let pushCalls = 0, alexaCalls = 0;
  const alexa = { state: 'unavailable', ready: () => false, announce: async () => { alexaCalls++; throw new Error(); } };
  const push = { state: 'ready', ready: () => true, announce: async () => { pushCalls++; } };
  const delivery = new Delivery(alexa, push); assert.equal(delivery.ready(), true);
  await delivery.announce(); assert.equal(pushCalls, 1); assert.equal(alexaCalls, 0);
  alexa.ready = () => true; await delivery.announce();
  assert.equal(pushCalls, 2); assert.equal(alexaCalls, 1);
});
test('all outputs failed drops the event and disabled push is unready', async () => {
  assert.equal(new NtfyClient(undefined).ready(), false);
  const client = { ready: () => true, announce: async () => { throw new Error(); } };
  await assert.rejects(new Delivery(client, client).announce());
});
test('ntfy defaults deny anonymous access, writer is write-only, each device read-only', () => {
  const config = ntfyConfig('https://notify.example.com', 'HASH', 'TOKEN');
  assert.equal(config['auth-default-access'], 'deny-all');
  assert.deepEqual(config['auth-access'], ['gateway:haustuer:wo']);
  assert.equal(config['enable-signup'], false);
  addDevice(config, 'iphone-maxi', 'HASH2', 'haustuer');
  assert.deepEqual(config['auth-access'], ['gateway:haustuer:wo', 'iphone-maxi:haustuer:ro']);
  assert.throws(() => addDevice(config, 'gateway', 'x', 'haustuer'));
  assert.throws(() => addDevice(config, '../../file', 'x', 'haustuer'));
  assert.throws(() => addDevice(config, 'iphone-maxi', 'x', 'haustuer'));
  assert.throws(() => ntfyConfig('http://public.example.com', 'x', 'x'));
  assert.equal(Buffer.from(config['web-push-public-key'], 'base64url').length, 65);
  assert.equal(Buffer.from(config['web-push-private-key'], 'base64url').length, 32);
});
test('gateway refuses insecure remote push URLs and malformed publisher secrets', async () => {
  const { config } = await import('../src/config.js');
  const { mkdtempSync, writeFileSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const file = join(mkdtempSync(join(tmpdir(), 'ntfy-config-test-')), 'token');
  writeFileSync(file, 'tk_'+ 'a'.repeat(29), {mode:0o600});
  const env = { RING_TOKEN:'a'.repeat(43), ECHO_TARGETS:'all', NTFY_URL:'http://ntfy:8080', NTFY_TOKEN_FILE:file };
  assert.equal(config(env).push.topic,'haustuer');
  for (const url of ['http://public.example.com','https://name:password@example.com','https://example.com?token=secret','https://example.com/path']) assert.throws(()=>config({...env,NTFY_URL:url}));
  writeFileSync(file,'bad-token'); assert.throws(()=>config(env));
});
test('healthy ntfy with rejected publisher credentials remains unready', async () => {
  let authenticated = false;
  const client = new NtfyClient(cfg, async url => url.endsWith('/health') ? Response.json({healthy:true}) : authenticated ? Response.json({username:'gateway'}) : new Response('denied',{status:401}));
  await client.check(); assert.equal(client.ready(),false);
  authenticated = true; await client.check(); assert.equal(client.ready(),true);
});
