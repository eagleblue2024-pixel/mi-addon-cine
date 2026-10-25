'use strict';
const target = 'https://pelisjuanita.org/pelicula/moana-2026';
let cache;
function decode(s) { return s.replace(/&amp;/g, '&').replace(/&#(?:0*39|x0*27);/gi, "'").replace(/&quot;/g, '"').replace(/\\\//g, '/'); }
function safeUrl(raw) {
  try {
    const u = new URL(decode(raw), target);
    if (!['https:', 'http:'].includes(u.protocol)) return null;
    return {url: u.origin + u.pathname.replace(/[A-Za-z0-9_=-]{32,}/g, '[redacted]'), parametersOmitted: !!(u.search || u.hash)};
  } catch { return null; }
}
async function inspect() {
  const r = await fetch(target, {redirect: 'manual', signal: AbortSignal.timeout(10000), headers: {Accept: 'text/html', 'User-Agent': 'NebulaPlayDiagnostics/0.4'}});
  const parts = []; let size = 0, truncated = false;
  if (r.body) {
    const reader = r.body.getReader();
    try {
      while (size < 262144) {
        const {done, value} = await reader.read();
        if (done) break;
        const part = value.subarray(0, 262144 - size);
        parts.push(Buffer.from(part)); size += part.length;
        if (size === 262144) truncated = true;
      }
    } finally { await reader.cancel().catch(() => {}); }
  }
  const html = Buffer.concat(parts).toString('utf8');
  const title = decode((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim().slice(0, 180);
  const candidates = [], seen = new Set();
  function add(kind, raw) {
    const item = safeUrl(raw);
    if (!item) return;
    const key = kind + item.url;
    if (seen.has(key) || candidates.length >= 30) return;
    seen.add(key); candidates.push({kind, ...item});
  }
  if (r.ok) {
    for (const tag of html.matchAll(/<(iframe|video|source|a|button)\b[^>]*>/gi)) {
      for (const attr of tag[0].matchAll(/\b(src|data-src|data-url|href)\s*=\s*(["'])(.*?)\2/gi)) {
        const kind = tag[1].toLowerCase();
        if (['iframe', 'video', 'source'].includes(kind) || /embed|player|stream|\.m3u8|\.mp4/i.test(attr[3])) add(kind, attr[3]);
      }
    }
    const normalized = decode(html);
    for (const m of normalized.matchAll(/https?:\/\/[^\s"'<>\\]+?\.(?:m3u8|mp4)(?:\?[^\s"'<>\\]*)?/gi)) add('media_reference', m[0]);
  }
  return {target, upstreamStatus: r.status, contentType: r.headers.get('content-type'), challenge: r.headers.get('cf-mitigated') === 'challenge', title: title || null, sampledBytes: size, bodyTruncated: truncated, redirect: r.status >= 300 && r.status < 400 ? safeUrl(r.headers.get('location') || '') : null, status: !r.ok ? 'upstream_non_success' : candidates.length ? 'candidates_found' : 'no_static_candidates', candidates, playbackVerified: false, note: 'Análisis estático: no ejecuta scripts ni sigue enlaces o redirecciones. Los candidatos pueden ser publicidad. Parámetros y rutas largas se ocultan; las URLs mostradas no son necesariamente reproducibles.'};
}
module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  const send = (status, value) => { res.statusCode = status; res.end(JSON.stringify({experimental: true, ...value}, null, 2)); };
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return send(405, {error: 'Solo GET'}); }
  try {
    if (!cache || cache.until < Date.now()) cache = {until: Date.now() + 60000, result: inspect()};
    return send(200, await cache.result);
  } catch (e) { cache = null; return send(502, {status: 'fetch_failed', errorType: e.name}); }
};
