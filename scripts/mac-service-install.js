import { mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { setTimeout as pause } from 'node:timers/promises';
if (process.platform !== 'darwin') throw new Error('Nur für macOS');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const label = 'de.hiroshui.doorbeller';
const agents = join(homedir(), 'Library/LaunchAgents');
const logs = join(homedir(), 'Library/Logs/doorbeller');
mkdirSync(agents, { recursive: true }); mkdirSync(logs, { recursive: true, mode: 0o700 });
const escape = s => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const plist = join(agents, `${label}.plist`);
writeFileSync(plist, `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key><string>${label}</string>
<key>ProgramArguments</key><array><string>/bin/sh</string><string>${escape(join(root, 'scripts/mac-service.sh'))}</string></array>
<key>WorkingDirectory</key><string>${escape(root)}</string>
<key>RunAtLoad</key><true/>
<key>KeepAlive</key><true/>
<key>ThrottleInterval</key><integer>15</integer>
<key>StandardOutPath</key><string>${escape(join(logs, 'service.log'))}</string>
<key>StandardErrorPath</key><string>${escape(join(logs, 'service-error.log'))}</string>
</dict></plist>\n`, { mode: 0o600 });
const uid = process.getuid();
const removed = spawnSync('launchctl', ['bootout', `gui/${uid}/${label}`], { stdio: 'ignore' });
if (removed.status === 0) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (spawnSync('launchctl', ['print', `gui/${uid}/${label}`], { stdio: 'ignore' }).status !== 0) break;
    await pause(100);
  }
}
for (const [cmd, args] of [['plutil', ['-lint', plist]], ['launchctl', ['bootstrap', `gui/${uid}`, plist]], ['launchctl', ['kickstart', `gui/${uid}/${label}`]]]) {
  const r = spawnSync(cmd, args, { stdio: 'inherit' }); if (r.status !== 0) process.exit(r.status ?? 1);
}
console.log('Doorbeller-Autostart installiert und gestartet.');
