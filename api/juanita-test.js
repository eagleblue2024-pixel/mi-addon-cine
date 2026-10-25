'use strict';
const target = 'https://pelisjuanita.org/pelicula/moana-2026';
let cache;
const relevant = /player|server|stream|embed|source|video|movie|pelicula|api|ajax|m3u8|mp4/i;
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
  const candidates = [], scripts = [], jsonHints = [], seen = new Set();
  let scriptCount = 0, inlineScriptCount = 0, nodes = 0;
  function add(kind, raw) {
    const item = safeUrl(raw);
    if (!item || candidates.length >= 50) return;
    const key = kind + item.url;
    if (!seen.has(key)) { seen.add(key); candidates.push({kind, ...item}); }
  }
  function scan(text) {
    const normalized = decode(text);
    for (const m of normalized.matchAll(/https?:\/\/[^\s"'<>\\`]+/gi)) if (relevant.test(m[0])) add('script_url_hint', m[0]);
    for (const m of normalized.matchAll(/["'](\/(?:api|ajax|embed|player|stream|video)[^"'\s<>]*)["']/gi)) add('route_hint', m[1]);
  }
  function walk(value, path, depth) {
    if (depth > 7 || ++nodes > 2500 || value === null) return;
    if (typeof value === 'string') {
      if (/^(https?:\/\/|\/)/i.test(decode(value)) && relevant.test(path + value)) add('json_url_hint', value);
      return;
    }
    if (typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value).slice(0, 100)) {
      const next = (path + '.' + key).slice(0, 180);
      if (relevant.test(key) && jsonHints.length < 50) jsonHints.push({path: next.replace(/[A-Za-z0-9_=-]{24,}/g, '[redacted]'), type: Array.isArray(child) ? 'array' : child === null ? 'null' : typeof child});
      walk(child, next, depth + 1);
    }
  }
  if (r.ok) {
    for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
      scriptCount++;
      const src = attr(m[1], 'src'), type = attr(m[1], 'type');
      if (src) { const u = safeUrl(src); if (u && scripts.length < 40) scripts.push(u); }
      else {
        inlineScriptCount++; scan(m[2]);
        if (/json/i.test(type)) { try { walk(JSON.parse(m[2]), 'jsonScript' + scriptCount, 0); } catch {} }
      }
    }
    for (const m of html.matchAll(/<(iframe|video|source|a|button)\b[^>]*>/gi)) {
      for (const name of ['src', 'data-src', 'data-url', 'href']) {
        const value = attr(m[0], name);
        if (value && (/iframe|video|source/i.test(m[1]) || relevant.test(value))) add(m[1].toLowerCase(), value);
      }
    }
    scan(html);
  }
  const title = decode((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim().slice(0, 180);
  return {version: 2, target, upstreamStatus: r.status, contentType: r.headers.get('content-type'), challenge: r.headers.get('cf-mitigated') === 'challenge', title, sampledBytes: size, bodyTruncated: truncated, redirect: r.status >= 300 && r.status < 400 ? safeUrl(r.headers.get('location') || '') : null, status: !r.ok ? 'upstream_non_success' : candidates.length ? 'hints_found' : 'no_url_hints', scriptCount, inlineScriptCount, externalScripts: scripts, jsonHints, candidates, playbackVerified: false, note: 'Solo inspección estática de la ficha. No descarga scripts externos, no los ejecuta ni consulta APIs. Oculta parámetros y cadenas largas. Las pistas no son enlaces de reproducción verificados.'};
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
