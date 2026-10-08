import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readdirSync, rmSync, renameSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
process.umask(0o077);
process.chdir(resolve(dirname(fileURLToPath(import.meta.url)), '..'));
const [source, startValue, durationValue] = process.argv.slice(2);
const start = Number(startValue), duration = Number(durationValue);
if (!source || !startValue || !durationValue || !Number.isFinite(start) || start < 0 || !Number.isFinite(duration) || duration < 0.1 || duration > 30) throw new Error('Use: npm run audio:prepare -- SOURCE START_SECONDS DURATION_SECONDS (0.1–30s)');
const scratch = mkdtempSync(join(tmpdir(), 'doorbeller-audio-'));
function run(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8', timeout: 180000, maxBuffer: 4 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(`${command} failed. Ensure yt-dlp/ffmpeg are installed and the source is available.`);
}
try {
  let input = resolve(source), offset = start;
  if (/^https?:/i.test(source)) {
    const url = new URL(source);
    if (url.protocol !== 'https:' || url.username || url.password || !['youtube.com','www.youtube.com','m.youtube.com','youtu.be'].includes(url.hostname)) throw new Error('Use a local audio file or an HTTPS YouTube URL');
    run('yt-dlp', ['--no-playlist','--no-progress','-f','bestaudio','--download-sections',`*${start}-${start+duration}`,'--force-keyframes-at-cuts','-o',join(scratch,'source.%(ext)s'),source]);
    input = join(scratch, readdirSync(scratch).find(name => name.startsWith('source.') && !name.endsWith('.part')) ?? 'missing'); offset = 0;
  }
  const output = join(scratch,'ring.mp3');
  run('ffmpeg', ['-hide_banner','-loglevel','error','-y','-ss',String(offset),'-i',input,'-t',String(duration),'-vn','-map_metadata','-1','-ac','2','-ar','24000','-c:a','libmp3lame','-b:a','48k','-write_xing','0',output]);
  mkdirSync('data/audio',{recursive:true,mode:0o755});
  chmodSync(output,0o644);
  renameSync(output, resolve('data/audio/ring.mp3'));
  console.log(`Prepared data/audio/ring.mp3: start ${start}s, duration ${duration}s. Recreate gateway to load it.`);
} finally { rmSync(scratch,{recursive:true,force:true}); }
