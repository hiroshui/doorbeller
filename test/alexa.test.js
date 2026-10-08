import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtempSync, statSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AlexaClient } from '../src/alexa.js';
import { saveSession } from '../src/session.js';
import { config } from '../src/config.js';
function fixture(targets = ['A', 'B']) {
  const remote = new EventEmitter(); const calls = [];
  remote.httpsGet = () => { throw new Error('Automatic auth must not run'); };
  remote.httpsGetCall = (...args) => calls.push(args);
  remote.stop = () => {};
  remote.serialNumbers = { a: { serialNumber: '1', accountName: 'A', capabilities: ['AUDIO_PLAYER'] }, b: { serialNumber: '2', accountName: 'B', capabilities: ['AUDIO_PLAYER'] } };
  remote.sendSequenceCommand = (serial, command, text, cb) => { calls.push(serial); cb(null, { success: true }); };
  const client = new AlexaClient({ targets, timeoutMs: 20, text: 'Klingel', session: '/nonexistent/session' }, remote);
  client.state = 'ready'; return { client, remote, calls };
}
test('all targets validated before any side effect, ambiguous names rejected', async () => {
  const f = fixture(['A', 'missing']); await assert.rejects(f.client.announce()); assert.equal(f.calls.length, 0);
  f.remote.serialNumbers.b.accountName = 'A'; assert.throws(() => f.client.resolveTargets());
});
test('multiple targets and partial failure never retry', async () => {
  const f = fixture();
  f.remote.sendSequenceCommand = (serial, cmd, text, cb) => { f.calls.push(serial); cb(serial === '2' ? new Error('secret') : null); };
  await assert.rejects(f.client.announce()); assert.deepEqual(f.calls, ['1', '2']); assert.equal(f.client.ready(), false);
});
test('timeout marks unavailable; late callback cannot cause another send', async () => {
  const f = fixture(['A']); let late;
  f.remote.sendSequenceCommand = (serial, cmd, text, cb) => { f.calls.push(serial); late = cb; };
  await assert.rejects(f.client.announce()); late(null); assert.equal(f.client.ready(), false); assert.deepEqual(f.calls, ['1']);
});
test('verified speak transport bypasses auth refresh and disables library retries', () => {
  const f = fixture(); f.remote.httpsGet('/api/behaviors/preview', () => {}, { method: 'POST' });
  assert.equal(f.calls[0][2].isRetry, true); assert.equal(f.calls[0][2].timeout, 20);
});
test('full registration saved atomically with restricted permissions', () => {
  const dir = mkdtempSync(join(tmpdir(), 'doorbeller-test-')); const path = join(dir, 'session.json');
  const data = { refreshToken: 'secret', localCookie: 'cookie', macDms: 'registration' }; saveSession(path, data);
  assert.equal(statSync(dir).mode & 0o777, 0o700); assert.equal(statSync(path).mode & 0o777, 0o600);
  assert.deepEqual(JSON.parse(readFileSync(path)), data); assert.throws(() => saveSession(path, {}));
});
test('configuration refuses weak tokens, missing targets and invalid limits', () => {
  const env = { RING_TOKEN: 'a'.repeat(43), ECHO_TARGETS: 'Flur' }; assert.equal(config(env).targets[0], 'Flur');
  assert.throws(() => config({ ...env, RING_TOKEN: 'weak' })); assert.throws(() => config({ ...env, QUEUE_SIZE: '0' })); assert.throws(() => config({ ...env, ECHO_TARGETS: '' }));
});
test('missing session requires local login and keeps readiness false', () => {
  const f = fixture(); f.client.start(); assert.equal(f.client.state, 'login_required'); assert.equal(f.client.ready(), false);
});
test('successful independent auth check recovers availability; failure keeps unready', async () => {
  const f = fixture();
  f.remote.checkAuthentication = cb => cb(true);
  f.remote.initDeviceState = cb => cb();
  f.client.state = 'unavailable'; await f.client.check(); assert.equal(f.client.ready(), true);
  f.remote.checkAuthentication = cb => cb(false, new Error('secret'));
  await f.client.check(); assert.equal(f.client.ready(), false);
});
test('different target identifiers for the same serial announce only once', async () => {
  const f = fixture(['A', '1']); await f.client.announce(); assert.deepEqual(f.calls, ['1']);
});
