import { createECDH } from 'node:crypto';
export function ntfyConfig(baseUrl, writerHash, writerToken, topic = 'haustuer') {
  const url = new URL(baseUrl);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('Public ntfy URL must be an HTTPS origin');
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(topic)) throw new Error('Invalid topic');
  const keys = createECDH('prime256v1'); keys.generateKeys();
  return {
    'base-url': url.origin, 'listen-http': ':8080',
    'auth-file': '/var/lib/ntfy/auth.db', 'auth-default-access': 'deny-all',
    'auth-users': [`gateway:${writerHash}:user`], 'auth-access': [`gateway:${topic}:wo`],
    'auth-tokens': [`gateway:${writerToken}:Doorbeller publisher`],
    'enable-login': true, 'enable-signup': false,
    'cache-file': '/var/lib/ntfy/cache.db', 'cache-duration': '1m', 'manager-interval': '15s',
    'upstream-base-url': 'https://ntfy.sh',
    'web-push-public-key': keys.getPublicKey().toString('base64url'),
    'web-push-private-key': keys.getPrivateKey().toString('base64url'),
    'web-push-file': '/var/lib/ntfy/webpush.db',
    'web-push-email-address': `webpush@${url.hostname.split('.').slice(-2).join('.')}`,
    'behind-proxy': true, 'proxy-forwarded-header': 'CF-Connecting-IP',
    'visitor-request-limit-burst': 60, 'visitor-request-limit-replenish': '5s',
    'visitor-message-daily-limit': 500, 'message-size-limit': '4k', 'log-level': 'error'
  };
}
export function addDevice(config, name, hash, topic) {
  if (typeof name !== 'string' || !/^[a-z][a-z0-9-]{1,40}$/.test(name) || ['gateway', 'everyone'].includes(name)) throw new Error('Use a device name like iphone-maxi or pc-maxi');
  if (config['auth-users'].some(user => user.split(':')[0] === name)) throw new Error('Device already exists');
  config['auth-users'].push(`${name}:${hash}:user`);
  config['auth-access'].push(`${name}:${topic}:ro`);
}
