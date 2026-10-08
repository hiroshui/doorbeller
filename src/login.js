import AlexaRemote from 'alexa-remote2';
import { saveSession } from './session.js';
process.umask(0o077);
const remote = new AlexaRemote();
const timer = setTimeout(() => { console.error('Login-Zeitfenster abgelaufen.'); process.exit(1); }, 600000);
console.log('Im lokalen Browser http://127.0.0.1:3456 öffnen und Amazon-Login mit MFA durchführen.');
remote.init({ amazonPage: 'amazon.de', acceptLanguage: 'de-DE', setupProxy: true, proxyOwnIp: '127.0.0.1', proxyPort: 3456, proxyListenBind: process.env.LOGIN_BIND ?? '127.0.0.1', cookieRefreshInterval: 0, usePushConnection: false, logger: undefined }, err => {
  // Proxy-start callback is followed by the actual authenticated callback.
  if (err) return;
  try { saveSession(process.env.SESSION_FILE ?? '/data/session.json', remote.cookieData); console.log('Session gespeichert.'); clearTimeout(timer); remote.stop(); process.exit(0); }
  catch { console.error('Session konnte nicht gespeichert werden.'); process.exit(1); }
});
