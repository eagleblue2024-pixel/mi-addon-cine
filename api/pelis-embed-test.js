'use strict';
const {parsePage} = require('../lib/pelis-scraper');
let cache;
async function inspect(id) {
  const pageUrl = 'https://pelisgratishds.com/embed.php?id=' + id;
  const response = await fetch(pageUrl, {redirect: 'error', signal: AbortSignal.timeout(10000), headers: {'Accept': 'text/html', 'User-Agent': 'NebulaPlayDiagnostics/0.2'}});
  if (!response.ok) return {pageUrl, status: 'upstream_http_error', upstreamStatus: response.status, streams: []};
  if (!/text\/html/i.test(response.headers.get('content-type') || '')) return {pageUrl, status: 'unexpected_content_type', streams: []};
  const reader = response.body.getReader();
  const chunks = [];
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
  const add = (raw, foundIn) => {
    if (candidates.size >= 40) return;
    try {
      const value = raw.replace(/&amp;/g, '&').replace(/\\\//g, '/');
      const u = new URL(value, pageUrl);
      if (u.protocol !== 'https:' || u.username || u.password || (u.port && u.port !== '443') || !u.hostname.includes('.') || /^[\d.]+$/.test(u.hostname) || u.hostname.includes(':') || /(?:^|\.)(localhost|local|internal|invalid|test)$/.test(u.hostname)) return;
      if (/\.(?:css|js|png|jpg|jpeg|gif|svg|woff2?)(?:$)/i.test(u.pathname)) return;
      candidates.set(u.href, {url: u.href, host: u.hostname, foundIn, verified: false});
    } catch {}
  };
  for (const p of parsed.players || []) add(p.url, 'iframe_or_data_attribute');
  for (const tag of html.matchAll(/<(?:a|button|li|div|iframe)\b[^>]*>/gi)) {
    for (const m of tag[0].matchAll(/\b(href|src|data-src|data-url|data-link|data-embed|data-player)\s*=\s*["']([^"']+)["']/gi)) {
      if (/^(?:https:|\/\/|\/[^\/])/i.test(m[2])) add(m[2], m[1]);
    }
  }
  for (const m of html.matchAll(/["'](?:url|src|embed|link)["']\s*:\s*["'](https:[^"'\s]+)["']/gi)) add(m[1], 'literal_in_script');
  const labels = ['EARNVIDS', 'STREAMHG', 'BYSEDIKAMOUM', 'VOE'].filter(name => html.toUpperCase().includes(name));
  const result = [...candidates.values()];
  return {pageUrl, status: parsed.streams.length ? 'direct_candidates_found' : result.length ? 'server_candidates_found' : 'no_server_urls_in_static_html', serverLabels: labels, candidates: result, streams: parsed.streams, playbackVerified: false};
}
module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  const send = (code, value) => { res.statusCode = code; res.end(JSON.stringify({experimental: true, notice: 'Solo inspecciona HTML estático del mismo sitio. No ejecuta scripts, no visita servidores externos y no verifica reproducción. Los candidatos pueden incluir publicidad o navegación.', ...value}, null, 2)); };
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return send(405, {error: 'Solo GET'}); }
  const id = new URL(req.url, 'http://addon.local').searchParams.get('id') || '15313';
  if (!/^[1-9][0-9]{0,9}$/.test(id)) return send(400, {error: 'ID inválido'});
  try {
    if (!cache || cache.id !== id || cache.until < Date.now()) cache = {id, until: Date.now() + 30000, result: inspect(id)};
    return send(200, await cache.result);
  } catch (error) {
    cache = null;
    return send(502, {status: 'fetch_failed', errorType: error.name, streams: []});
  }
};
