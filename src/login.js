import AlexaRemote from 'alexa-remote2';
import { loadSession, saveSession } from './session.js';
import { mkdirSync, chmodSync } from 'node:fs';
import { dirname, join } from 'node:path';
process.umask(0o077);
const sessionFile = process.env.SESSION_FILE ?? '/data/session.json';
const directory = dirname(sessionFile);
mkdirSync(directory, { recursive: true, mode: 0o700 });
chmodSync(directory, 0o700);
const registrationFile = join(directory, 'login-registration.json');
let formerRegistrationData;
try { formerRegistrationData = loadSession(sessionFile); }
catch { try { formerRegistrationData = loadSession(registrationFile); } catch {} }
const port = Number(process.env.LOGIN_PORT ?? 3456);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid LOGIN_PORT');
const remote = new AlexaRemote();
const timer = setTimeout(() => { console.error('Login-Zeitfenster abgelaufen.'); process.exit(1); }, 600000);
console.log(`Im lokalen Browser http://127.0.0.1:${port} öffnen und Amazon-Login mit MFA durchführen.`);
remote.init({ amazonPage: 'amazon.de', acceptLanguage: 'de-DE', setupProxy: true, proxyLogLevel: 'silent', formerRegistrationData, formerDataStorePath: registrationFile, proxyOwnIp: '127.0.0.1', proxyPort: port, proxyListenBind: process.env.LOGIN_BIND ?? '127.0.0.1', cookieRefreshInterval: 0, usePushConnection: false, logger: undefined }, err => {
  // Proxy-start callback is followed by the actual authenticated callback.
  if (err) return;
  try { saveSession(sessionFile, remote.cookieData); console.log('Session gespeichert.'); clearTimeout(timer); remote.stop(); process.exit(0); }
  catch { console.error('Session konnte nicht gespeichert werden.'); process.exit(1); }
});
