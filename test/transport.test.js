import { test } from 'node:test';
import assert from 'node:assert/strict';
import https from 'node:https';
import { EventEmitter } from 'node:events';
import AlexaRemote from 'alexa-remote2';
import { AlexaClient } from '../src/alexa.js';
function remote() {
  const r = new AlexaRemote(); r._options = { amazonPage: 'amazon.de' }; r.cookie = 'csrf=fake'; r.csrf = 'fake';
  r.serialNumbers = { '1': { serialNumber: '1', accountName: 'Flur', deviceType: 'fake', deviceOwnerCustomerId: 'fake', capabilities: ['AUDIO_PLAYER'] } };
  const client = new AlexaClient({ targets: ['Flur'], text: 'Klingel', timeoutMs: 30 }, r); client.state = 'ready';
  return client;
}
test('real upstream Speak generates one request and rejects JSON HTTP 503 without retry', async t => {
  let calls = 0;
  t.mock.method(https, 'request', (options, callback) => {
    calls++; assert.equal(options.path, '/api/behaviors/preview'); assert.equal(options.method, 'POST');
    const req = new EventEmitter(); req.write = data => assert.ok(JSON.parse(data).sequenceJson.includes('Alexa.Speak'));
    req.end = () => setImmediate(() => {
      const res = new EventEmitter(); res.statusCode = 503; res.headers = {};
      callback(res); res.emit('data', Buffer.from('{"message":"unavailable"}')); res.emit('end'); req.emit('close');
    }); req.destroy = () => req.emit('close'); return req;
  });
  await assert.rejects(remote().announce()); assert.equal(calls, 1);
});
test('absolute upstream deadline destroys stalled transport', async t => {
  let destroyed = false;
  t.mock.method(https, 'request', () => {
    const req = new EventEmitter(); req.write = () => {}; req.end = () => {};
    req.destroy = err => { destroyed = true; req.emit('error', err); req.emit('close'); }; return req;
  });
  await assert.rejects(remote().announce());
  await new Promise(r => setTimeout(r, 10)); assert.equal(destroyed, true);
});
