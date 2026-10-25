'use strict';
const page = 'https://pelisjuanita.org/pelicula/moana-2026';
let cache;
function decode(s) { return s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/\\\//g, '/').replace(/\\u002[fF]/g, '/'); }
function safe(raw, base) {
  try {
    const u = new URL(decode(raw), base);
    if (!['http:', 'https:'].includes(u.protocol)) return null;
    return {url: u.origin + u.pathname.replace(/[A-Za-z0-9_=-]{24,}/g, '[redacted]'), queryKeys: [...new Set(u.searchParams.keys())].slice(0, 20).map(k => k.replace(/[^a-z0-9_-]/gi, '').slice(0, 40)), parametersOmitted: !!(u.search || u.hash)};
  } catch { return null; }
}
async function inspect() {
  const signal = AbortSignal.timeout(15000);
  async function read(url, referer) {
    const headers = {Accept: 'text/html', 'User-Agent': 'NebulaPlayDiagnostics/0.6'};
    if (referer) headers.Referer = referer;
    const r = await fetch(url, {redirect: 'manual', signal, headers});
    const parts = []; let size = 0;
    if (r.body) {
      const reader = r.body.getReader();
      try {
        while (size < 262144) {
          const {done, value} = await reader.read();
          if (done) break;
          const part = value.subarray(0, 262144 - size);
          parts.push(Buffer.from(part)); size += part.length;
        }
      } finally { await reader.cancel().catch(() => {}); }
    }
    const html = Buffer.concat(parts).toString('utf8');
    const title = decode((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim().slice(0, 160);
    const hints = [], seen = new Set();
    if (r.ok) for (const m of decode(html).matchAll(/https?:\/\/[^\s"'<>\\`]+/gi)) {
      if (!/m3u8|mp4|embed|player|stream|api|\.js(?:[?#]|$)/i.test(m[0])) continue;
      const item = safe(m[0], url);
      if (item && !seen.has(item.url) && hints.length < 25) { seen.add(item.url); hints.push(item); }
    }
    return {html, summary: {httpStatus: r.status, contentType: r.headers.get('content-type'), challenge: r.headers.get('cf-mitigated') === 'challenge', title: title || null, sampledBytes: size, bodyTruncated: size >= 262144, unavailableText: /player no disponible/i.test(html), redirect: r.status >= 300 && r.status < 400 ? safe(r.headers.get('location') || '', url) : null, hints}};
  }
  const source = await read(page);
  if (source.summary.httpStatus !== 200 || source.summary.challenge) return {status: 'source_unavailable', source: source.summary};
  const urls = [];
  for (const m of decode(source.html).matchAll(/https:\/\/videoapp\.mov\/[^\s"'<>\\`]+/gi)) {
    try {
      const u = new URL(m[0]);
      if (u.origin === 'https://videoapp.mov' && u.pathname === '/e/movie/1108427' && !u.username && !u.password && !urls.includes(u.href)) urls.push(u.href);
    } catch {}
  }
  if (!urls.length) return {status: 'exact_embed_not_found', source: source.summary};
  const embed = urls[0];
  async function probe(referer) {
    try { return (await read(embed, referer)).summary; }
    catch (e) { return {errorType: e.name}; }
  }
  const [withoutReferrer, withSiteReferrer] = await Promise.all([probe(), probe('https://pelisjuanita.org/')]);
  return {status: 'comparison_completed', embed: safe(embed, page), matchingUrlCount: urls.length, selectedMatch: 1, source: source.summary, withoutReferrer, withSiteReferrer};
}
module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  const send = (status, data) => { res.statusCode = status; res.end(JSON.stringify({experimental: true, version: 1, ...data, playbackVerified: false, note: 'Compara el primer enlace exacto hallado en la ficha, sin publicar valores de parámetros. No usa cookies, no sigue redirecciones, no ejecuta scripts ni confirma reproducción.'}, null, 2)); };
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return send(405, {error: 'Solo GET'}); }
  try {
    if (!cache || cache.until < Date.now()) cache = {until: Date.now() + 60000, result: inspect()};
    return send(200, await cache.result);
  } catch (e) { cache = null; return send(502, {status: 'fetch_failed', errorType: e.name}); }
};
