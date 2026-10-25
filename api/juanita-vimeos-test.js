'use strict';
const embed = 'https://videoapp.mov/e/movie/1108427';
let cache;
function decode(s) { return s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/\\\//g, '/').replace(/\\u002[fF]/g, '/'); }
function safe(raw, base) {
  try {
    const u = new URL(decode(raw), base);
    if (!['https:', 'http:'].includes(u.protocol)) return null;
    return {url: u.origin + u.pathname.replace(/[A-Za-z0-9_=-]{24,}/g, '[redacted]'), queryKeys: [...new Set(u.searchParams.keys())].slice(0, 20).map(k => k.replace(/[^a-z0-9_-]/gi, '').slice(0, 40)), parametersOmitted: !!(u.search || u.hash)};
  } catch { return null; }
}
async function inspect() {
  const signal = AbortSignal.timeout(15000);
  const stages = [];
  async function read(url, referer, stage) {
    const r = await fetch(url, {redirect: 'manual', signal, headers: {Accept: 'text/html', Referer: referer, 'User-Agent': 'NebulaPlayDiagnostics/0.7'}});
    const parts = []; let size = 0;
    if (r.body) {
      const reader = r.body.getReader();
      try {
        while (size < 524288) {
          const {done, value} = await reader.read();
          if (done) break;
          const part = value.subarray(0, 524288 - size);
          parts.push(Buffer.from(part)); size += part.length;
        }
      } finally { await reader.cancel().catch(() => {}); }
    }
    const html = Buffer.concat(parts).toString('utf8');
    const summary = {stage, target: safe(url, url), httpStatus: r.status, contentType: r.headers.get('content-type'), challenge: r.headers.get('cf-mitigated') === 'challenge', title: decode((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim().slice(0, 160), sampledBytes: size, bodyTruncated: size >= 524288, redirect: r.status >= 300 && r.status < 400 ? safe(r.headers.get('location') || '', url) : null};
    stages.push(summary);
    return {html, allowed: r.ok && !summary.challenge};
  }
  try {
    const first = await read(embed, 'https://pelisjuanita.org/', 'videoapp');
    if (!first.allowed || /player no disponible/i.test(first.html)) return {status: 'videoapp_unavailable', stages};
    const matches = [];
    for (const m of decode(first.html).matchAll(/https:\/\/vimeos\.net\/[^\s"'<>\\`]+/gi)) {
      try {
        const u = new URL(m[0]);
        if (u.origin === 'https://vimeos.net' && u.pathname === '/embed-rxqr2clfd240.html' && !u.username && !u.password && !matches.includes(u.href)) matches.push(u.href);
      } catch {}
    }
    if (!matches.length) return {status: 'exact_reference_not_found', stages};
    const url = matches[0];
    const second = await read(url, 'https://videoapp.mov/', 'vimeos');
    if (!second.allowed) return {status: 'vimeos_non_success_or_challenge', stages};
    const text = decode(second.html), candidates = [], scripts = [], seen = new Set();
    function add(kind, raw) {
      const item = safe(raw, url);
      if (!item || candidates.length >= 40 || seen.has(kind + item.url)) return;
      seen.add(kind + item.url); candidates.push({kind, ...item});
    }
    for (const m of text.matchAll(/https?:\/\/[^\s"'<>\\`]+/gi)) {
      if (/\.(m3u8|mp4)(?:[?#]|$)/i.test(m[0])) add('media_reference', m[0]);
      else if (/embed|player|stream|source|api/i.test(m[0])) add('url_hint', m[0]);
    }
    for (const m of text.matchAll(/<(iframe|video|source)\b[^>]*?\b(?:src|data-src)\s*=\s*(["'])(.*?)\2/gi)) add(m[1].toLowerCase(), m[3]);
    for (const m of text.matchAll(/<script\b[^>]*?\bsrc\s*=\s*(["'])(.*?)\1/gi)) { const item = safe(m[2], url); if (item && scripts.length < 30) scripts.push(item); }
    return {status: candidates.length ? 'hints_found' : 'no_static_candidates', stages, matchingReferenceCount: matches.length, candidates, externalScripts: scripts, packedScriptMarker: /eval\s*\(\s*function\s*\(p,a,c,k,e,/i.test(second.html)};
  } catch (e) { return {status: 'test_incomplete', errorType: e.name, stages}; }
}
module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  const send = (status, data) => { res.statusCode = status; res.end(JSON.stringify({experimental: true, version: 1, ...data, playbackVerified: false, note: 'Solo dos páginas permitidas. No sigue redirecciones ni desafíos, no ejecuta scripts ni descarga vídeos. Los parámetros se conservan internamente, pero sus valores no se publican. Las pistas no confirman reproducción.'}, null, 2)); };
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return send(405, {error: 'Solo GET'}); }
  try {
    if (!cache || cache.until < Date.now()) cache = {until: Date.now() + 60000, result: inspect()};
    return send(200, await cache.result);
  } catch (e) { cache = null; return send(502, {status: 'fetch_failed', errorType: e.name}); }
};
