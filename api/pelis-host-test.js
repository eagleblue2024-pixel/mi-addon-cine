'use strict';
const {parsePage} = require('../lib/pelis-scraper');
let cache;
async function inspect(id) {
  const pageUrl = 'https://embed.pelisgratishd.lat/embed.php?id=' + id;
  const r = await fetch(pageUrl, {redirect: 'manual', signal: AbortSignal.timeout(10000), headers: {'Accept': 'text/html', 'User-Agent': 'NebulaPlayDiagnostics/0.3'}});
  if (!r.ok) return {pageUrl, status: r.status >= 300 && r.status < 400 ? 'redirect_not_followed' : 'upstream_http_error', upstreamStatus: r.status, streams: []};
  if (!/text\/html/i.test(r.headers.get('content-type') || '')) return {pageUrl, status: 'unexpected_content_type', streams: []};
  const reader = r.body.getReader(), chunks = [];
  let size = 0;
  try {
    while (true) {
      const {done, value} = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 2000000) throw new Error('HTML demasiado grande');
      chunks.push(Buffer.from(value));
    }
  } finally { await reader.cancel().catch(() => {}); }
  const html = Buffer.concat(chunks).toString('utf8');
  const parsed = parsePage(html, pageUrl);
  if (parsed.status === 'verification_required') return {pageUrl, ...parsed};
  const candidates = new Map();
  function add(raw, foundIn) {
    if (candidates.size >= 60) return;
    try {
      const u = new URL(raw.replace(/&amp;/g, '&').replace(/\\\//g, '/'), pageUrl);
      if (u.protocol !== 'https:' || u.username || u.password || (u.port && u.port !== '443') || !u.hostname.includes('.') || /^[\d.]+$/.test(u.hostname) || u.hostname.includes(':') || /(?:^|\.)(localhost|local|internal|test|invalid)$/.test(u.hostname)) return;
      if (/\.(?:js|css|png|jpe?g|gif|svg|woff2?|ico)$/i.test(u.pathname)) return;
      candidates.set(u.href, {url: u.href, host: u.hostname, foundIn, verified: false});
    } catch {}
  }
  for (const p of parsed.players) add(p.url, 'parsed_embed');
  for (const tag of html.matchAll(/<(?:a|button|li|div|iframe)\b[^>]*>/gi)) {
    for (const m of tag[0].matchAll(/\b(href|src|data-src|data-url|data-link|data-embed|data-player)\s*=\s*["']([^"']+)["']/gi)) if (/^(?:https:|\/\/|\/[^\/])/i.test(m[2])) add(m[2], m[1]);
  }
  for (const script of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) {
    for (const m of script[1].matchAll(/["'](https:(?:\\\/|\/){2}[^"'\s<>]+)["']/gi)) add(m[1], 'script_literal');
  }
  const serverLabels = ['EARNVIDS', 'STREAMHG', 'BYSEDIKAMOUM', 'VOE'].filter(x => html.toUpperCase().includes(x));
  return {pageUrl, status: parsed.streams.length ? 'direct_candidates_found' : candidates.size ? 'server_candidates_found' : 'no_server_urls_in_static_html', serverLabels, candidates: [...candidates.values()], streams: parsed.streams, playbackVerified: false};
}
module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  const send = (code, body) => { res.statusCode = code; res.end(JSON.stringify({experimental: true, notice: 'Inspección estática de embed.pelisgratishd.lat. No ejecuta scripts, no resuelve verificaciones y no visita los candidatos. Puede detectar publicidad o navegación.', ...body}, null, 2)); };
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return send(405, {error: 'Solo GET'}); }
  const id = new URL(req.url, 'http://addon.local').searchParams.get('id') || '15313';
  if (!/^[1-9][0-9]{0,9}$/.test(id)) return send(400, {error: 'ID inválido'});
  try {
    if (!cache || cache.id !== id || cache.until <= Date.now()) cache = {id, until: Date.now() + 30000, result: inspect(id)};
    return send(200, await cache.result);
  } catch (error) { cache = null; return send(502, {status: 'fetch_failed', errorType: error.name, streams: []}); }
};
