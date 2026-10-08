import { X509Certificate, verify } from 'node:crypto';
import { rootCertificates } from 'node:tls';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const execute = promisify(execFile);
const domain = 'echo-api.amazon.com';

export function certificateURL(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.hostname !== 's3.amazonaws.com' || url.port || url.username || url.password || url.search || url.hash || !/^\/echo\.api\/[A-Za-z0-9_-]+\.pem$/.test(url.pathname)) throw new Error('Invalid signing certificate URL');
  return url.href;
}

// Native OpenSSL performs complete chain validation (CA constraints, dates and
// trust), rather than implementing X.509 path validation in JavaScript.
export async function verifyCertificateChain(pem, roots = rootCertificates) {
  if (Buffer.byteLength(pem) > 65536) throw new Error('Certificate too large');
  const certificates = pem.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g);
  if (!certificates?.length || certificates.length > 8) throw new Error('Invalid chain');
  const leaf = new X509Certificate(certificates[0]);
  if (leaf.ca || leaf.checkHost(domain, { subject: 'never', wildcards: false }) !== domain) throw new Error('Invalid signing identity');
  const directory = await mkdtemp(join(tmpdir(), 'doorbeller-cert-'));
  try {
    await Promise.all([
      writeFile(join(directory, 'leaf.pem'), certificates[0], { mode: 0o600 }),
      writeFile(join(directory, 'chain.pem'), certificates.join('\n'), { mode: 0o600 }),
      writeFile(join(directory, 'roots.pem'), roots.join('\n'), { mode: 0o600 })
    ]);
    await execute('openssl', ['verify', '-no-CApath', '-no-CAstore', '-CAfile', join(directory, 'roots.pem'), '-untrusted', join(directory, 'chain.pem'), '-verify_hostname', domain, '-purpose', 'sslserver', join(directory, 'leaf.pem')], { timeout: 2000, maxBuffer: 8192 });
    return leaf;
  } finally { await rm(directory, { recursive: true, force: true }); }
}

export function signatureVerifier({ request = fetch, validateChain = verifyCertificateChain, now = Date.now } = {}) {
  const cache = new Map();
  return async (body, headers) => {
    const url = certificateURL(headers.signaturecertchainurl);
    const signature = headers['signature-256'];
    if (typeof signature !== 'string' || signature.length > 2048 || !/^[A-Za-z0-9+/]+={0,2}$/.test(signature)) throw new Error('Missing signature');
    let entry = cache.get(url);
    if (!entry || entry.until <= now()) {
      const response = await request(url, { redirect: 'error', signal: AbortSignal.timeout(2500) });
      if (!response.ok) { await response.body?.cancel(); throw new Error('Certificate unavailable'); }
      let size = 0; const chunks = [];
      for await (const chunk of response.body) {
        size += chunk.length;
        if (size > 65536) throw new Error('Certificate too large');
        chunks.push(Buffer.from(chunk));
      }
      const leaf = await validateChain(Buffer.concat(chunks).toString('utf8'));
      entry = { key: leaf.publicKey, until: Math.min(now() + 600000, Date.parse(leaf.validTo)) };
      if (!Number.isFinite(entry.until) || entry.until <= now()) throw new Error('Expired certificate');
      if (cache.size >= 8) cache.delete(cache.keys().next().value);
      cache.set(url, entry);
    }
    if (!verify('RSA-SHA256', body, entry.key, Buffer.from(signature, 'base64'))) throw new Error('Invalid request signature');
  };
}
