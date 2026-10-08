import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isRing, notify } from '../scripts/mac-notification.js';
test('Mac notifications accept only current admission events, not stale or unrelated logs', () => {
  const now = Date.now();
  const event = (name, offset = 0) => JSON.stringify({ event: name, time: new Date(now + offset).toISOString() });
  assert.equal(isRing(event('ring_accepted'), now), true);
  assert.equal(isRing(event('ring_accepted', -16000), now), false);
  assert.equal(isRing(event('ring_accepted', 16000), now), false);
  for (const name of ['event_failed', 'announcement_result', 'gateway_started']) assert.equal(isRing(event(name), now), false);
  assert.equal(isRing('not JSON', now), false);
  assert.equal(isRing('{"event":"ring_accepted"}', now), false);
});
test('Mac notification uses a fixed native command without credentials or log interpolation', () => {
  let captured;
  notify((...args) => { captured = args; });
  assert.equal(captured[0], '/usr/bin/osascript');
  assert.deepEqual(captured[1], ['-e', 'display notification "Es hat an der Haustür geklingelt." with title "DoorBird"']);
});
