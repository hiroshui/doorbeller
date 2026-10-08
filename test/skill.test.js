import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { sign } from 'node:crypto';
import { certificateURL, verifyCertificateChain, signatureVerifier } from '../src/skill-auth.js';
import { skillConfig, skillSpeech } from '../src/skill.js';
import { config } from '../src/config.js';
import { createGateway } from '../src/gateway.js';
const id = 'amzn1.ask.skill.12345678-1234-1234-1234-123456789012';
const skill = { id, user: 'amzn1.ask.account.allowed', order: 'before', bytes: Buffer.from('abcdef'), path: '/alexa/audio/test.mp3', url: 'https://example.com/clip.mp3' };
const envelope = (overrides = {}) => ({ context: { System: { application: { applicationId: id }, user: { userId: skill.user } } }, request: { type: 'LaunchRequest', timestamp: new Date().toISOString(), ...overrides } });
async function fixture(t, verify = async () => {}) {
  const logs = []; let rings = 0;
  const cfg = { skill: { ...skill }, text: 'Hallo <lang xml:lang="en-US">World</lang>', token: 'a'.repeat(43) };
  const gateway = createGateway(cfg, { ready: () => true, announce: () => rings++ }, { skillVerify: verify, log: event => logs.push(event) });
  await new Promise(resolve => gateway.server.listen(0, '127.0.0.1', resolve));
  t.after(() => gateway.stop());
  const base = `http://127.0.0.1:${gateway.server.address().port}`;
  return { cfg, logs, rings: () => rings, base, post: (body = envelope(), headers = {}) => fetch(base + '/alexa/skill', { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) }) };
}

test('skill config is optional and speak remains default; incomplete skill cannot replace it', () => {
  const env = { RING_TOKEN: 'a'.repeat(43), ECHO_TARGETS: 'all' };
  assert.equal(config(env).output, 'speak'); assert.equal(config(env).skill, undefined);
  assert.throws(() => config({ ...env, ALEXA_OUTPUT: 'skill' }));
  assert.throws(() => config({ ...env, ALEXA_OUTPUT: 'unknown' }));
  const directory = mkdtempSync(join(tmpdir(), 'skill-audio-'));
  try {
    const path = join(directory, 'ring.mp3'); writeFileSync(path, Buffer.from([255,251,1]));
    const settings = { ...env, ALEXA_SKILL_AUDIO_FILE: path, ALEXA_SKILL_BASE_URL: 'https://example.com' };
    assert.ok(skillConfig(settings).path.startsWith('/alexa/audio/'));
    assert.equal(config({ ...settings, ALEXA_OUTPUT: 'skill', ALEXA_SKILL_ID: id }).output, 'skill');
    for (const extra of [{ ALEXA_SKILL_BASE_URL: 'http://example.com' }, { ALEXA_SKILL_ID: 'wrong' }, { ALEXA_SKILL_AUDIO_ORDER: 'bad' }, { ALEXA_SKILL_INVOCATION: '<script>' }]) assert.throws(() => skillConfig({ ...settings, ...extra }));
    writeFileSync(path, 'not MP3'); assert.throws(() => skillConfig(settings));
    writeFileSync(path, Buffer.alloc(2097153)); assert.throws(() => skillConfig(settings));
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
test('skill response supports before/after/only and preserves configured lang fragments', async t => {
  const f = await fixture(t); let response = await f.post(); assert.equal(response.status, 200);
  const ssml = (await response.json()).response.outputSpeech.ssml;
  assert.ok(ssml.indexOf('<audio') < ssml.indexOf('Hallo'));
  assert.ok(ssml.includes('<lang xml:lang="en-US">World</lang>'));
  assert.ok(!ssml.includes('&lt;lang')); assert.equal(f.rings(), 0);
  const after = skillSpeech({ ...skill, order: 'after' }, '<speak>Hello</speak>');
  assert.equal(after, '<speak>Hello<audio src="https://example.com/clip.mp3"/></speak>');
  assert.equal(skillSpeech({ ...skill, order: 'only' }, 'ignored'), '<speak><audio src="https://example.com/clip.mp3"/></speak>');
  assert.ok(skillSpeech(skill, 'A & B').includes('A &amp; B'));
  response = await f.post(envelope({ type: 'IntentRequest', intent: { name: 'AMAZON.StopIntent' } }));
  assert.equal((await response.json()).response.outputSpeech, undefined);
  response = await f.post(envelope({ type: 'SessionEndedRequest' })); assert.equal(response.status,200);
});
test('skill rejects invalid identity, time, signature, unsupported requests and large bodies without leaking data', async t => {
  const f = await fixture(t);
  for (const body of [envelope({ timestamp: 'invalid' }), envelope({ timestamp: new Date(Date.now()-151000).toISOString() }), envelope({ timestamp: new Date(Date.now()+151000).toISOString() }), envelope({ type: 'Unknown' }), '{bad-json']) assert.equal((await f.post(body)).status,400);
  let body=envelope(); body.context.System.application.applicationId='wrong'; assert.equal((await f.post(body)).status,400);
  body=envelope();body.context.System.user.userId='secret-other-user';assert.equal((await f.post(body)).status,400);
  body=envelope();body.session={application:{applicationId:'wrong'}};assert.equal((await f.post(body)).status,400);
  assert.equal((await f.post('x'.repeat(65537))).status,413);
  assert.equal((await f.post(envelope(),{'Content-Encoding':'gzip'})).status,400);
  assert.equal((await fetch(f.base+'/alexa/skill')).status,405);
  f.cfg.skill.id=undefined;assert.equal((await f.post()).status,503);
  const rejected=await fixture(t,async()=>{throw new Error('secret certificate or body');});
  assert.equal((await rejected.post()).status,400);
  assert.ok(!JSON.stringify([...f.logs,...rejected.logs]).includes('secret'));
});
test('public clip only serves configured bytes; ranges and HEAD work and ring stays authenticated', async t => {
  const f=await fixture(t);
  let r=await fetch(f.base+skill.path);assert.equal(r.status,200);assert.equal(await r.text(),'abcdef');
  r=await fetch(f.base+skill.path,{method:'HEAD'});assert.equal(r.headers.get('content-length'),'6');assert.equal(await r.text(),'');
  r=await fetch(f.base+skill.path,{headers:{Range:'bytes=2-3'}});assert.equal(r.status,206);assert.equal(r.headers.get('content-range'),'bytes 2-3/6');assert.equal(await r.text(),'cd');
  r=await fetch(f.base+skill.path,{headers:{Range:'bytes=-2'}});assert.equal(await r.text(),'ef');
  for(const range of ['bytes=6-','bytes=4-2','bytes=0-1,3-4','bytes=-0']) assert.equal((await fetch(f.base+skill.path,{headers:{Range:range}})).status,416);
  assert.equal((await fetch(f.base+'/alexa/audio/session.json')).status,404);
  assert.equal((await fetch(f.base+'/ring')).status,401);assert.equal(f.rings(),0);
});
test('signing certificate URLs cannot redirect requests to local hosts or arbitrary Amazon paths', () => {
  assert.equal(certificateURL('https://s3.amazonaws.com/echo.api/echo-api-cert.pem'),'https://s3.amazonaws.com/echo.api/echo-api-cert.pem');
  for(const url of ['http://s3.amazonaws.com/echo.api/cert.pem','https://127.0.0.1/echo.api/cert.pem','https://s3.amazonaws.com.evil.test/echo.api/cert.pem','https://user:pass@s3.amazonaws.com/echo.api/cert.pem','https://s3.amazonaws.com/elsewhere/cert.pem','https://s3.amazonaws.com/echo.api/cert.pem?redirect=evil','https://s3.amazonaws.com:444/echo.api/cert.pem']) assert.throws(()=>certificateURL(url));
});
test('native trust-chain and SHA256 checks accept a valid signed body, reject tampering/untrusted certs, and bound downloads', async () => {
  const directory=mkdtempSync(join(tmpdir(),'skill-signature-'));
  const file=name=>join(directory,name);
  function openssl(args) {const r=spawnSync('openssl',args,{encoding:'utf8',timeout:10000});assert.equal(r.status,0,'OpenSSL fixture generation failed');}
  try {
    openssl(['req','-x509','-newkey','rsa:2048','-nodes','-days','1','-subj','/CN=TestRoot','-addext','basicConstraints=critical,CA:TRUE','-addext','keyUsage=critical,keyCertSign,cRLSign','-keyout',file('root.key'),'-out',file('root.pem')]);
    openssl(['req','-new','-newkey','rsa:2048','-nodes','-subj','/CN=echo-api.amazon.com','-keyout',file('leaf.key'),'-out',file('leaf.csr')]);
    writeFileSync(file('ext'),'basicConstraints=critical,CA:FALSE\nsubjectAltName=DNS:echo-api.amazon.com\nkeyUsage=critical,digitalSignature\nextendedKeyUsage=serverAuth\n');
    openssl(['x509','-req','-in',file('leaf.csr'),'-CA',file('root.pem'),'-CAkey',file('root.key'),'-CAcreateserial','-days','1','-extfile',file('ext'),'-out',file('leaf.pem')]);
    const root=readFileSync(file('root.pem'),'utf8'), pem=readFileSync(file('leaf.pem'),'utf8')+root;
    const leaf=await verifyCertificateChain(pem,[root]);assert.equal(leaf.ca,false);
    await assert.rejects(verifyCertificateChain(pem)); // production roots must reject our test CA
    await assert.rejects(verifyCertificateChain(root,[root])); // a CA cannot sign Alexa requests
    const body=Buffer.from(JSON.stringify(envelope()));
    const headers={'signaturecertchainurl':'https://s3.amazonaws.com/echo.api/echo-api-cert.pem','signature-256':sign('RSA-SHA256',body,readFileSync(file('leaf.key'))).toString('base64')};
    let downloads=0;
    const verifier=signatureVerifier({request:async()=>{downloads++;return new Response(pem);},validateChain:p=>verifyCertificateChain(p,[root])});
    await verifier(body,headers);await verifier(body,headers);assert.equal(downloads,1);
    await assert.rejects(verifier(Buffer.from('tampered'),headers));
    await assert.rejects(verifier(body,{}));
    await assert.rejects(signatureVerifier({request:async()=>new Response('x'.repeat(65537))})(body,headers));
  } finally {rmSync(directory,{recursive:true,force:true});}
});

test('skill verification concurrency is bounded and capacity recovers', async t => {
  let release; const barrier=new Promise(resolve=>{release=resolve;}); let started=0;
  const f=await fixture(t,async()=>{started++;await barrier;});
  const pending=Array.from({length:4},()=>f.post());
  try {
    for(let i=0;i<100&&started<4;i++) await new Promise(r=>setTimeout(r,5));
    assert.equal(started,4);assert.equal((await f.post()).status,429);
  } finally {release();}
  for(const response of await Promise.all(pending)) assert.equal(response.status,200);
  assert.equal((await f.post()).status,200);
});
