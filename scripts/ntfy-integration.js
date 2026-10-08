// Isolated real-server checks: no Amazon account, real messages, or user secrets.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, writeFileSync, chmodSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as pause } from 'node:timers/promises';
import { ntfyConfig, addDevice } from './ntfy-config.js';
const runtime = process.env.CONTAINER_RUNTIME ?? 'podman';
if (!['podman', 'docker'].includes(runtime)) throw new Error('Invalid runtime');
const name = `doorbeller-ntfy-test-${randomBytes(5).toString('hex')}`;
const image = 'localhost/doorbeller-ntfy-test:local';
const volume = `${name}-data`;
const directory = mkdtempSync(join(tmpdir(), 'doorbeller-ntfy-test-'));
const file = join(directory, 'server.yml');
function run(args, input) {
  const result = spawnSync(runtime, args, { input, encoding: 'utf8', timeout: 120000 });
  if (result.status !== 0) throw new Error(`Container command failed: ${args[0]} (output suppressed)`);
  return result.stdout.trim();
}
const password = randomBytes(24).toString('base64url');
const token = run(['run','--rm','docker.io/binwiederhier/ntfy:v2.29.0','token','generate']);
const hash = run(['run','--rm','-i','--network=none','docker.io/binwiederhier/ntfy:v2.29.0','user','hash'], `${password}\n${password}\n`);
const config = ntfyConfig('https://test.example.com', hash, token);
config['upstream-base-url'] = ''; // Do not send test metadata to any push provider.
addDevice(config, 'test-reader', hash, 'haustuer');
writeFileSync(file, JSON.stringify(config), { mode: 0o644 }); chmodSync(file, 0o644);
let started = false;
try {
  run(['build', '-f', 'Dockerfile.ntfy', '-t', image, '.']);
  run(['run','-d','--name',name,'-p','127.0.0.1::8080','--read-only','--tmpfs','/tmp','--cap-drop=ALL','--security-opt=no-new-privileges',
    '-v',`${file}:/etc/ntfy/server.yml:ro`,'-v',`${volume}:/var/lib/ntfy`,image]);
  started = true;
  function address() {
    const port = run(['port',name,'8080/tcp']).match(/127\.0\.0\.1:(\d+)/)?.[1];
    assert.ok(port); return `http://127.0.0.1:${port}`;
  }
  let base = address();
  const reader = 'Basic '+Buffer.from(`test-reader:${password}`).toString('base64');
  const writer = 'Bearer '+token;
  async function request(path, auth, body) {
    const response = await fetch(base+path, { method: body === undefined ? 'GET' : 'POST', headers: { ...(auth ? {Authorization:auth} : {}), ...(body ? {'Content-Type':'application/json'} : {}) }, body, signal:AbortSignal.timeout(3000) });
    const status = response.status; await response.body?.cancel(); return status;
  }
  async function healthy() {
    for (let attempt = 0; attempt < 30; attempt++) {
      try { if (await request('/v1/health') === 200) return; } catch {}
      await pause(1000);
    }
    const logs = run(['logs', name]).replaceAll(password, '[redacted]').replaceAll(token, '[redacted]').replaceAll(hash, '[redacted]');
    throw new Error(`ntfy did not become healthy: ${logs}`);
  }
  await healthy();
  const body = JSON.stringify({topic:'haustuer',title:'Test',message:'Isolated integration test',priority:4});
  assert.equal(await request('/haustuer/json?poll=1'),403);
  assert.equal(await request('/',undefined,body),403);
  assert.equal(await request('/haustuer/json?poll=1',reader),200);
  assert.equal(await request('/',reader,body),403);
  assert.equal(await request('/unrelated/json?poll=1',reader),403);
  assert.equal(await request('/haustuer/json?poll=1',writer),403);
  assert.equal(await request('/',writer,JSON.stringify({topic:'unrelated',message:'denied'})),403);
  const stream = await fetch(base+'/haustuer/json', { headers:{Authorization:reader}, signal:AbortSignal.timeout(5000) });
  assert.equal(stream.status,200);
  assert.equal(await request('/',writer,body),200);
  const chunks = stream.body.getReader(); let buffer = '', received = false;
  while (!received) {
    const {value,done} = await chunks.read(); if(done) break;
    buffer += Buffer.from(value).toString();
    let end;
    while ((end = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0,end); buffer = buffer.slice(end+1);
      if(!line) continue;
      const event=JSON.parse(line);
      if(event.event==='message') { assert.equal(event.topic,'haustuer'); assert.equal(event.message,'Isolated integration test'); received=true; }
    }
  }
  await chunks.cancel(); assert.equal(received,true);
  const perms=run(['exec',name,'stat','-c','%a','/var/lib/ntfy/auth.db']).trim(); assert.equal(perms,'600');
  config['auth-users']=config['auth-users'].filter(row=>!row.startsWith('test-reader:'));
  config['auth-access']=config['auth-access'].filter(row=>!row.startsWith('test-reader:'));
  writeFileSync(file,JSON.stringify(config)); run(['restart',name]); base = address(); await healthy();
  assert.ok([401,403].includes(await request('/haustuer/json?poll=1',reader)));
  console.log('ntfy integration: ACLs, real subscription/delivery, persistence permissions and device revocation passed');
} finally {
  if(started) spawnSync(runtime,['rm','-f',name],{stdio:'ignore'});
  spawnSync(runtime,['volume','rm',volume],{stdio:'ignore'});
  rmSync(directory,{recursive:true,force:true});
}
