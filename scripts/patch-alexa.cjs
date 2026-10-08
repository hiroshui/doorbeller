// Narrow transport fixes for the pinned upstream version; no Amazon API reimplementation.
const fs = require('node:fs');
const path = require.resolve('alexa-remote2');
if (require('alexa-remote2/package.json').version !== '8.1.1') throw new Error('Review transport patch for new upstream version');
let source = fs.readFileSync(path, 'utf8');
if (!source.includes('// doorbeller transport guards')) {
  const substitutions = [
    ['const handleResponse = (err, res, body) => {', `const handleResponse = (err, res, body) => {
            // doorbeller transport guards: side effects must report HTTP rejection.
            if (flags.isRetry && (res.statusCode < 200 || res.statusCode >= 300)) {
                return callback(new Error('HTTP ' + res.statusCode), null);
            }`],
    ["        req.on('error', (e) => {", `        // Absolute deadline also covers DNS/TLS and actively closes timed-out requests.
        const absoluteDeadline = setTimeout(() => req.destroy(new Error('Request deadline')), flags.timeout || 10000);
        req.once('close', () => clearTimeout(absoluteDeadline));
        req.on('error', (e) => {`]
  ];
  for (const [from, to] of substitutions) {
    if (source.split(from).length !== 2) throw new Error('Upstream source changed; review required');
    source = source.replace(from, to);
  }
  fs.writeFileSync(path, source);
}
// The proxy ignores its custom store path when reading and otherwise replaces
// even a supplied registration's identity. Preserve identity across local setup.
if (require('alexa-cookie2/package.json').version !== '5.0.6') throw new Error('Review login registration patch for new upstream version');
const proxyPath = require.resolve('alexa-cookie2/lib/proxy');
let proxy = fs.readFileSync(proxyPath, 'utf8');
if (!proxy.includes('// doorbeller registration guards')) {
  const substitutions = [
    ["fs.readFileSync(path.join(__dirname, 'formerDataStore.json'), 'utf8')", "fs.readFileSync(formerDataStorePath, 'utf8')"],
    ["if (!_options.formerRegistrationData || !_options.formerRegistrationData.deviceId || !formerDataStoreValid) {", "// doorbeller registration guards\n    if (!_options.formerRegistrationData || !_options.formerRegistrationData.deviceId) {"]
  ];
  for (const [from, to] of substitutions) {
    if (proxy.split(from).length !== 2) throw new Error('Upstream proxy source changed; review required');
    proxy = proxy.replace(from, to);
  }
  fs.writeFileSync(proxyPath, proxy);
}
