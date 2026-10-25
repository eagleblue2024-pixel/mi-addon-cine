'use strict';
let cached;
const target = 'https://embed.pelisgratishd.lat/embed.php?id=15313';
async function inspect() {
  const r = await fetch(target, {redirect: 'manual', signal: AbortSignal.timeout(10000), headers: {'Accept': 'text/html', 'User-Agent': 'NebulaPlayDiagnostics/0.4'}});
  const headers = {};
  for (const name of ['content-type', 'server', 'cf-mitigated', 'retry-after']) {
    const value = r.headers.get(name);
    if (value) headers[name] = value.slice(0, 160);
  }
  let html = '', truncated = false;
  if (/text\/html|text\/plain/i.test(r.headers.get('content-type') || '')) {
    const reader = r.body.getReader(), parts = [];
    let size = 0;
    try {
      while (true) {
        const {done, value} = await reader.read();
        if (done) break;
        const keep = value.subarray(0, Math.max(0, 65536 - size));
        parts.push(Buffer.from(keep));
        size += keep.byteLength;
        if (size >= 65536) { truncated = true; break; }
      }
    } finally { await reader.cancel().catch(() => {}); }
    html = Buffer.concat(parts).toString('utf8');
  } else if (r.body) await r.body.cancel();
  const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '').replace(/<[^>]+>/g, '').replace(/[A-Za-z0-9_=-]{24,}/g, '[redacted]').replace(/\s+/g, ' ').trim().slice(0, 160);
  const signals = {humanVerification: /altcha-widget|g-recaptcha|h-captcha|verify you are human|confirme que es humano/i.test(html), challengeMarker: /cf-chl-|challenge-platform|just a moment/i.test(html), accessDeniedText: /access denied|forbidden|acceso denegado/i.test(html)};
  return {target, upstreamStatus: r.status, headers, title: title || null, signals, bodyTruncated: truncated, status: r.status === 403 ? 'access_denied_unresolved' : r.ok ? 'response_received' : 'non_success_response', note: 'Las señales son heurísticas; no identifican por sí solas la causa. No se devuelven cookies, tokens ni HTML completo.', playbackVerified: false};
}
module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  const send = (status, data) => { res.statusCode = status; res.end(JSON.stringify({experimental: true, ...data}, null, 2)); };
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return send(405, {error: 'Solo GET'}); }
  try {
    if (!cached || cached.until <= Date.now()) cached = {until: Date.now() + 60000, result: inspect()};
    return send(200, await cached.result);
  } catch (error) { cached = null; return send(502, {status: 'fetch_failed', errorType: error.name}); }
};
