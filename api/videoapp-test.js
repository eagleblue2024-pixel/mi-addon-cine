'use strict';
const target = 'https://videoapp.mov/e/movie/1108427';
let cache;
function decode(s) { return s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/\\\//g, '/').replace(/\\u002[fF]/g, '/'); }
function safeUrl(raw) {
  try {
    const u = new URL(decode(raw), target);
    if (!['https:', 'http:'].includes(u.protocol)) return null;
    return {url: u.origin + u.pathname.replace(/[A-Za-z0-9_=-]{24,}/g, '[redacted]'), parametersOmitted: !!(u.search || u.hash)};
  } catch { return null; }
}
function attr(tag, name) {
  const m = tag.match(new RegExp('\\b' + name + '\\s*=\\s*([\"\'])(.*?)\\1', 'i'));
  return m ? m[2] : '';
}
async function inspect() {
  const r = await fetch(target, {redirect: 'manual', signal: AbortSignal.timeout(10000), headers: {Accept: 'text/html', 'User-Agent': 'NebulaPlayDiagnostics/0.5'}});
  const parts = []; let size = 0, truncated = false;
  if (r.body) {
    const reader = r.body.getReader();
    try {
      while (size < 524288) {
        const {done, value} = await reader.read();
        if (done) break;
        const part = value.subarray(0, 524288 - size);
        parts.push(Buffer.from(part)); size += part.length;
        if (size === 524288) truncated = true;
      }
    } finally { await reader.cancel().catch(() => {}); }
  }
  const html = Buffer.concat(parts).toString('utf8');
  const candidates = [], externalScripts = [], seen = new Set();
  let scriptCount = 0, inlineScriptCount = 0;
  function add(kind, raw) {
    const item = safeUrl(raw);
    if (!item || candidates.length >= 40) return;
    const key = kind + item.url;
    if (!seen.has(key)) { seen.add(key); candidates.push({kind, ...item}); }
  }
  if (r.ok) {
    for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
      scriptCount++;
      const src = attr(m[1], 'src');
      if (src) { const u = safeUrl(src); if (u && externalScripts.length < 30) externalScripts.push(u); }
      else inlineScriptCount++;
    }
    for (const m of html.matchAll(/<(iframe|video|source)\b[^>]*>/gi)) {
      for (const name of ['src', 'data-src', 'data-url']) { const value = attr(m[0], name); if (value) add(m[1].toLowerCase(), value); }
    }
    const text = decode(html);
    for (const m of text.matchAll(/https?:\/\/[^\s"'<>\\`]+/gi)) {
      if (/\.(m3u8|mp4)(?:[?#]|$)/i.test(m[0])) add('media_reference', m[0]);
      else if (/player|server|stream|embed|source|video|api/i.test(m[0])) add('url_hint', m[0]);
    }
    for (const m of text.matchAll(/["'](\/(?:api|ajax|embed|player|stream|video)[^"'\s<>]*)["']/gi)) add('route_hint', m[1]);
  }
  const title = decode((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim().slice(0, 180);
  return {version: 1, target, upstreamStatus: r.status, contentType: r.headers.get('content-type'), challenge: r.headers.get('cf-mitigated') === 'challenge', title: title || null, sampledBytes: size, bodyTruncated: truncated, redirect: r.status >= 300 && r.status < 400 ? safeUrl(r.headers.get('location') || '') : null, status: !r.ok ? 'upstream_non_success' : candidates.length ? 'hints_found' : 'no_static_candidates', scriptCount, inlineScriptCount, externalScripts, candidates, playbackVerified: false, note: 'Solo inspección estática del reproductor. No sigue redirecciones ni enlaces, no descarga scripts externos ni los ejecuta. Oculta parámetros y cadenas largas. Las pistas pueden incluir publicidad y no confirman reproducción.'};
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
