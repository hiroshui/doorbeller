import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer, connect } from 'node:net';
import { mkdtempSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as pause } from 'node:timers/promises';
test('local interactive login starts without credentials, persists restricted registration and reuses device identity', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'doorbeller-login-test-'));
  const server = createServer(); await new Promise(r => server.listen(0, '127.0.0.1', r));
  const port = server.address().port; await new Promise(r => server.close(r));
  let deviceId;
  for (let run = 0; run < 2; run++) {
    const child = spawn(process.execPath, ['src/login.js'], { env: { ...process.env, SESSION_FILE: join(dir, 'session.json'), LOGIN_PORT: String(port), LOGIN_BIND: '127.0.0.1' } });
    let output = ''; child.stdout.on('data', d => output += d); child.stderr.on('data', d => output += d);
    const exited = new Promise(r => child.once('exit', r));
    try {
      let listening = false;
      for (let i = 0; i < 100; i++) {
        assert.equal(child.exitCode, null, output);
        listening = await new Promise(r => {
          const socket = connect({ host: '127.0.0.1', port });
          socket.once('connect', () => { socket.destroy(); r(true); }); socket.once('error', () => r(false));
        });
        if (listening) break;
        await pause(20);
      }
      assert.equal(listening, true, output);
      const file = join(dir, 'login-registration.json');
      assert.equal(statSync(file).mode & 0o777, 0o600); assert.equal(statSync(dir).mode & 0o777, 0o700);
      const data = JSON.parse(readFileSync(file)); assert.ok(data.deviceId);
      if (run === 0) deviceId = data.deviceId;
      else assert.equal(data.deviceId, deviceId);
      assert.ok(!output.includes(deviceId)); assert.ok(!output.includes('refreshToken'));
    } finally { child.kill('SIGTERM'); await exited; }
  }
});
