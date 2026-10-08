import { randomBytes } from 'node:crypto';
import { mkdirSync, chmodSync, readFileSync, writeFileSync, existsSync, renameSync, rmSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { ntfyConfig, addDevice } from './ntfy-config.js';
process.umask(0o077);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(root);
const runtime = process.env.CONTAINER_RUNTIME ?? (spawnSync('podman', ['--version'], { stdio: 'ignore' }).status === 0 ? 'podman' : 'docker');
if (!['podman', 'docker'].includes(runtime)) throw new Error('Unsupported CONTAINER_RUNTIME');
const image = 'docker.io/binwiederhier/ntfy:v2.29.0';
const directory = resolve('secrets/ntfy');
mkdirSync(directory, { recursive: true, mode: 0o700 }); chmodSync(resolve('secrets'), 0o700); chmodSync(directory, 0o700);
const configFile = resolve(directory, 'server.yml');
const topic = 'haustuer';
function cli(args, input) {
  const result = spawnSync(runtime, ['run', '--rm', '-i', '--network=none', '--read-only', '--cap-drop=ALL', image, ...args], { input, encoding: 'utf8', timeout: 60000 });
  if (result.status !== 0) throw new Error('ntfy CLI failed; check container runtime/image availability');
  return result.stdout.trim();
}
function hash(password) {
  const result = cli(['user', 'hash'], `${password}\n${password}\n`);
  if (!/^\$2[aby]\$[0-9]{2}\$[./A-Za-z0-9]{53}$/.test(result)) throw new Error('Invalid password hash from ntfy');
  return result;
}
function save(file, data, mode = 0o600) {
  writeFileSync(`${file}.tmp`, data, { mode }); chmodSync(`${file}.tmp`, mode); renameSync(`${file}.tmp`, file);
}
let config;
const command = process.argv[2] ?? 'setup';
if (existsSync(configFile)) config = JSON.parse(readFileSync(configFile, 'utf8'));
else if (command === 'setup') {
  const token = cli(['token', 'generate']);
  if (!/^tk_[A-Za-z0-9]{29,64}$/.test(token)) throw new Error('Invalid token');
  config = ntfyConfig(process.env.NTFY_PUBLIC_URL ?? 'https://notify.hiroshui.men', hash(randomBytes(32).toString('base64url')), token, topic);
  if (process.env.NTFY_CONTACT_EMAIL) config['web-push-email-address'] = process.env.NTFY_CONTACT_EMAIL;
  save(resolve('secrets/ntfy_publish_token'), `${token}\n`, 0o644);
} else throw new Error('Run npm run ntfy:setup first');
const provisionedToken = config['auth-tokens'].find(entry => entry.startsWith('gateway:'))?.split(':')[1];
if (!/^tk_[A-Za-z0-9]{29,64}$/.test(provisionedToken ?? '')) throw new Error('Missing provisioned publisher token');
if (!existsSync(resolve('secrets/ntfy_publish_token'))) save(resolve('secrets/ntfy_publish_token'), `${provisionedToken}\n`, 0o644);
if (command === 'add') {
  const name = process.argv[3];
  const password = randomBytes(24).toString('base64url');
  addDevice(config, name, hash(password), topic);
  save(resolve(directory, `${name}.json`), JSON.stringify({ server: config['base-url'], topic, username: name, password }, null, 2) + '\n');
} else if (command === 'remove') {
  const name = process.argv[3];
  if (!/^[a-z][a-z0-9-]{1,40}$/.test(name ?? '') || name === 'gateway') throw new Error('Invalid device name');
  if (!config['auth-users'].some(user => user.split(':')[0] === name)) throw new Error('Unknown device');
  config['auth-users'] = config['auth-users'].filter(user => user.split(':')[0] !== name);
  config['auth-access'] = config['auth-access'].filter(access => access.split(':')[0] !== name);
  rmSync(resolve(directory, `${name}.json`), { force: true });
} else if (command !== 'setup') throw new Error('Use setup, add NAME or remove NAME');
// File is mounted read-only for UID 1000; private parent directory protects host access.
// Preserve the bind-mounted inode; the server reads config only at startup.
writeFileSync(configFile, JSON.stringify(config, null, 2) + '\n', { mode: 0o644 }); chmodSync(configFile, 0o644);
console.log(`ntfy configuration updated. ${command === 'add' ? 'Device credentials saved locally in secrets/ntfy/' + process.argv[3] + '.json (0600).' : ''}`);
const result = spawnSync(runtime, ['compose', '--profile', 'notifications', 'up', '--build', '-d', 'ntfy'], { stdio: 'inherit' });
if (result.status !== 0) process.exit(result.status ?? 1);
const restarted = spawnSync(runtime, ['compose', '--profile', 'notifications', 'restart', 'ntfy'], { stdio: 'inherit' });
if (restarted.status !== 0) process.exit(restarted.status ?? 1);
