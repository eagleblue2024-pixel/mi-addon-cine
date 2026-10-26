'use strict';
const {parsePage} = require('../lib/pelis-scraper');
module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  const send = (code, data) => { res.statusCode = code; return res.end(JSON.stringify({experimental: true, playbackVerified: false, notice: 'Diagnóstico estático con Referer. No ejecuta scripts, no resuelve verificaciones ni visita candidatos externos.', ...data}, null, 2)); };
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return send(405, {error: 'Solo GET'}); }
  const id = new URL(req.url, 'https://addon.local').searchParams.get('id') || '15367';
  if (!/^[1-9][0-9]{0,9}$/.test(id)) return send(400, {error: 'ID inválido'});
  const pageUrl = 'https://embed.pelisgratishd.lat/embed.php?id=' + id;
  const referer = 'https://pelisgratishds.com/embed.php?id=' + id;
  try {
    const r = await fetch(pageUrl, {redirect: 'manual', signal: AbortSignal.timeout(10000), headers: {Accept: 'text/html', 'User-Agent': 'NebulaPlayDiagnostics/0.4', Referer: referer}});
    const contentType = r.headers.get('content-type') || '';
    const chunks = []; let size = 0;
    if (r.body) {
      const reader = r.body.getReader();
      try {
        while (size < 1000000) {
          const {done, value} = await reader.read(); if (done) break;
          const part = value.subarray(0, 1000000 - size); chunks.push(Buffer.from(part)); size += part.length;
        }
      } finally { await reader.cancel().catch(() => {}); }
    }
    const html = Buffer.concat(chunks).toString('utf8');
    const verification = r.headers.get('cf-mitigated') === 'challenge' || /altcha-widget|cf-chl-|g-recaptcha|verify you are human|confirme que es humano/i.test(html);
    const diagnostics = {pageUrl, refererSent: referer, upstreamStatus: r.status, contentType, verificationDetected: verification, sampledBytes: size, possiblyTruncated: size >= 1000000};
    if (verification) return send(200, {...diagnostics, status: 'verification_required', streams: []});
    if (!r.ok) return send(200, {...diagnostics, status: r.status >= 300 && r.status < 400 ? 'redirect_not_followed' : 'upstream_http_error', streams: []});
    if (!/text\/html/i.test(contentType)) return send(200, {...diagnostics, status: 'unexpected_content_type', streams: []});
    const parsed = parsePage(html, pageUrl);
    const candidates = new Map();
    function add(raw) {
      if (candidates.size >= 60) return;
      try {
        const u = new URL(raw.replace(/&amp;/g, '&').replace(/\\\//g, '/'), pageUrl);
        if (u.protocol !== 'https:' || u.username || u.password || u.port || !u.hostname.includes('.') || /^[\d.]+$/.test(u.hostname) || /(?:^|\.)(localhost|local|internal|invalid|test)$/.test(u.hostname)) return;
        if (/\.(?:js|css|png|jpe?g|gif|svg|woff2?|ico)$/i.test(u.pathname)) return;
        candidates.set(u.href, {url: u.href, host: u.hostname, verified: false});
      } catch {}
    }
    for (const p of parsed.players || []) add(p.url);
    for (const m of html.matchAll(/\b(?:href|src|data-src|data-url|data-link|data-embed|data-player)\s*=\s*["']([^"']+)["']/gi)) add(m[1]);
    const decoded = html.replace(/\\\//g, '/');
    for (const m of decoded.matchAll(/https:\/\/[^\s"'<>\\`]+/gi)) add(m[0]);
    return send(200, {...diagnostics, status: parsed.streams.length ? 'direct_candidates_found' : candidates.size ? 'server_candidates_found' : 'no_server_urls_in_static_html', serverLabels: ['EARNVIDS', 'STREAMHG', 'BYSEDIKAMOUM', 'VOE'].filter(x => html.toUpperCase().includes(x)), candidates: [...candidates.values()], streams: parsed.streams});
  } catch (e) { return send(502, {pageUrl, status: 'fetch_failed', errorType: e.name, streams: []}); }
};
