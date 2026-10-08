import { log } from './alexa.js';
export class Delivery {
  constructor(alexa, push) { this.alexa = alexa; this.push = push; }
  ready() { return this.alexa.ready() || this.push.ready(); }
  get state() { return this.ready() ? 'ready' : 'unavailable'; }
  status() { return { alexa: this.alexa.state, push: this.push.state }; }
  async announce() {
    const available = [this.alexa, this.push].filter(client => client.ready());
    if (!available.length) throw new Error('No available delivery');
    const results = await Promise.allSettled(available.map(client => client.announce()));
    const succeeded = results.filter(result => result.status === 'fulfilled').length;
    log('delivery_result', { attempted: available.length, succeeded, failed: results.length - succeeded });
    // Never repeat a successful output because another output failed.
    if (!succeeded) throw new Error('All delivery outputs failed');
  }
}
