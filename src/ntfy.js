import { log } from './alexa.js';
export class NtfyClient {
  constructor(cfg, request = fetch) { this.cfg = cfg; this.request = request; this.state = cfg ? 'starting' : 'disabled'; }
  ready() { return this.state === 'ready'; }
  async check() {
    if (!this.cfg || this.stopped) return;
    try {
      const response = await this.request(`${this.cfg.url}/v1/health`, { signal: AbortSignal.timeout(this.cfg.timeoutMs), redirect: 'error' });
      if (!response.ok || (await response.json()).healthy !== true) throw new Error('health');
      const accountResponse = await this.request(`${this.cfg.url}/v1/account`, { headers: { Authorization: `Bearer ${this.cfg.token}` }, signal: AbortSignal.timeout(this.cfg.timeoutMs), redirect: 'error' });
      if (!accountResponse.ok || !(await accountResponse.json()).username) throw new Error('auth');
      if (!this.stopped) this.state = 'ready';
    } catch { if (!this.stopped) this.state = 'unavailable'; }
  }
  async announce() {
    if (!this.ready()) throw new Error('Push unavailable');
    try {
      const response = await this.request(this.cfg.url, {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(this.cfg.timeoutMs),
        headers: { Authorization: `Bearer ${this.cfg.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: this.cfg.topic, title: 'DoorBird', message: this.cfg.text, priority: 4, tags: ['bell'] })
      });
      if (!response.ok) { await response.body?.cancel(); throw new Error('publish'); }
      const message = await response.json();
      if (message.event !== 'message' || message.topic !== this.cfg.topic || !message.id) throw new Error('response');
      log('push_published');
    } catch {
      this.state = 'unavailable'; log('push_failed'); throw new Error('Push failed');
    }
  }
  stop() { this.stopped = true; this.state = 'stopping'; }
}
