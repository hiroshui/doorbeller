import AlexaRemote from 'alexa-remote2';
import { loadSession, saveSession } from './session.js';
export const log = (event, details = {}) => console.log(JSON.stringify({ time: new Date().toISOString(), event, ...details }));
export function deadline(operation, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Object.assign(new Error('timeout'), { code: 'TIMEOUT' })), ms);
    Promise.resolve().then(operation).then(resolve, reject).finally(() => clearTimeout(timer));
  });
}
export class AlexaClient {
  constructor(cfg, remote = new AlexaRemote()) {
    this.cfg = cfg; this.remote = remote; this.state = 'starting';
    if (typeof remote.init === 'function') {
      const init = remote.init.bind(remote);
      remote.init = (...args) => { this.state = 'authenticating'; return init(...args); };
    }
    // Speak must neither refresh authentication nor silently retry a side effect.
    const original = remote.httpsGet.bind(remote);
    remote.httpsGet = (path, callback, flags) => {
      if (path === '/api/behaviors/preview') {
        if (!this.ready()) return callback(new Error('Unavailable'));
        return remote.httpsGetCall(path, callback, { ...flags, isRetry: true, timeout: cfg.timeoutMs });
      }
      return original(path, callback, flags);
    };
    remote.on('cookie', () => {
      try { saveSession(cfg.session, remote.cookieData); }
      catch { this.sessionError = true; this.state = 'session_error'; log('session_write_failed'); }
    });
  }
  start() {
    let session;
    try { session = loadSession(this.cfg.session); } catch { this.state = 'login_required'; return; }
    this.state = 'authenticating';
    const watchdog = setTimeout(() => { this.state = 'unavailable'; log('alexa_init_timeout'); }, 30000);
    this.remote.init({ cookie: session, formerRegistrationData: session, amazonPage: 'amazon.de', alexaServiceHost: 'alexa.amazon.de', acceptLanguage: 'de-DE', setupProxy: false, usePushConnection: false, cookieRefreshInterval: 86400000, logger: undefined }, err => {
      clearTimeout(watchdog);
      if (this.stopped) return;
      if (err) { this.state = 'login_required'; log('alexa_auth_failed'); }
      else {
        try { this.resolveTargets(); this.state = 'ready'; log('alexa_ready'); }
        catch { this.state = 'invalid_targets'; log('alexa_targets_invalid'); }
      }
    });
  }
  resolveTargets() {
    const devices = Object.values(this.remote.serialNumbers);
    if (this.cfg.targets.length === 1 && this.cfg.targets[0] === 'all') {
      const available = devices.filter(d => d.deviceFamily === 'ECHO' && d.capabilities?.includes('AUDIO_PLAYER') && d.online === true);
      if (!available.length) throw new Error('No online Echos');
      return [...new Set(available.map(d => d.serialNumber))];
    }
    return [...new Set(this.cfg.targets.map(target => {
      const matches = devices.filter(d => d.serialNumber === target || d.accountName === target);
      if (matches.length !== 1 || !matches[0].capabilities?.includes('AUDIO_PLAYER') || matches[0].online === false) throw new Error('Invalid target');
      return matches[0].serialNumber;
    }))];
  }
  ready() { return !this.sessionError && this.state === 'ready'; }
  async check() {
    if (this.stopped || ['starting', 'authenticating', 'checking', 'login_required', 'session_error'].includes(this.state)) return;
    this.state = 'checking';
    try {
      await deadline(() => new Promise((resolve, reject) => this.remote.checkAuthentication((ok, err) => ok ? resolve() : reject(err ?? new Error('auth')))), this.cfg.timeoutMs);
      await deadline(() => new Promise((resolve, reject) => this.remote.initDeviceState(err => err ? reject(err) : resolve())), this.cfg.timeoutMs);
      this.resolveTargets(); if (!this.stopped) this.state = 'ready';
    } catch { this.state = 'unavailable'; log('alexa_check_failed'); }
  }
  async announce() {
    if (!this.ready()) throw new Error('Unavailable');
    const targets = this.resolveTargets(); // Validate all before sending anything.
    const results = await Promise.allSettled(targets.map(serial => deadline(() => new Promise((resolve, reject) => {
      this.remote.sendSequenceCommand(serial, 'speak', this.cfg.text, (err, result) => {
        if (err || result?.success === false || result?.error || result?.errors) reject(new Error('Alexa rejected request'));
        else resolve();
      });
    }), this.cfg.timeoutMs)));
    const failed = results.filter(r => r.status === 'rejected');
    log('announcement_result', { total: targets.length, succeeded: targets.length - failed.length, failed: failed.length, timeouts: failed.filter(r => r.reason.code === 'TIMEOUT').length });
    if (failed.length) { this.state = 'unavailable'; throw new Error('Announcement failed or partial'); }
  }
  stop() { this.stopped = true; this.state = 'stopping'; this.remote.stop(); }
}
