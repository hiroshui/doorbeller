import { config } from './config.js';
import { AlexaClient, log } from './alexa.js';
import { createGateway } from './gateway.js';
process.umask(0o077);
const cfg = config();
const alexa = new AlexaClient(cfg);
const gateway = createGateway(cfg, alexa);
alexa.start();
const check = setInterval(() => alexa.check(), 60000);
gateway.server.listen(cfg.port, '0.0.0.0', () => log('gateway_started'));
let closing = false;
async function shutdown() {
  if (closing) return;
  closing = true; clearInterval(check); alexa.stop();
  const kill = setTimeout(() => process.exit(0), cfg.timeoutMs + 1000);
  await gateway.stop(); clearTimeout(kill); process.exit(0);
}
process.on('SIGTERM', shutdown); process.on('SIGINT', shutdown);
