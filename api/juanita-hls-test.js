'use strict';
const embed = 'https://videoapp.mov/e/movie/1108427';
let cache;
function decode(s) { return s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/\\\//g, '/').replace(/\\u002[fF]/g, '/').replace(/\\u0026/g, '&'); }
function extract(html, origin, path) {
  for (const m of decode(html).matchAll(/https?:\/\/[^\s"'<>\\`]+/gi)) {
    try {
      const u = new URL(m[0]);
      if (u.origin === origin && u.pathname === path && !u.username && !u.password) return u.href;
    } catch {}
  }
  return null;
}
async function inspect() {
  const signal = AbortSignal.timeout(20000), checks = [];
  async function read(raw, referer, stage, segment = false) {
    const u = new URL(raw);
    if (!['https://videoapp.mov', 'https://vimeos.net', 'https://s9.vimeos.net'].includes(u.origin) || u.username || u.password) throw new Error('unsupported_origin');
    const headers = {Referer: referer, 'User-Agent': 'NebulaPlayDiagnostics/0.8', Accept: segment ? '*/*' : 'text/html, application/vnd.apple.mpegurl, text/plain'};
    if (segment) headers.Range = 'bytes=0-1023';
    const r = await fetch(u, {redirect: 'manual', signal, headers});
    const check = {stage, host: u.hostname, httpStatus: r.status, contentType: r.headers.get('content-type'), challenge: r.headers.get('cf-mitigated') === 'challenge'};
    checks.push(check);
    const parts = []; let size = 0;
    const limit = segment ? 1024 : stage === 'videoapp' || stage === 'vimeos' ? 524288 : 131072;
    if (r.body) {
      const reader = r.body.getReader();
      try {
        while (size < limit) {
          const {done, value} = await reader.read();
          if (done) break;
          const part = value.subarray(0, limit - size);
          parts.push(Buffer.from(part)); size += part.length;
        }
      } finally { await reader.cancel().catch(() => {}); }
    }
    check.sampleBytes = size; check.sampleLimitReached = size >= limit;
    const text = Buffer.concat(parts).toString('utf8').replace(/^\uFEFF/, '').trimStart();
    if (stage === 'master' || stage === 'variant') check.isPlaylist = text.startsWith('#EXTM3U');
    if (segment) check.looksLikeHtml = /text\/html/i.test(check.contentType || '') || /^<(?:!doctype|html)/i.test(text);
    return {text, check, ok: r.ok && !check.challenge};
  }
  try {
    const first = await read(embed, 'https://pelisjuanita.org/', 'videoapp');
    if (!first.ok || /player no disponible/i.test(first.text)) return {status: 'videoapp_unavailable', checks};
    const vimeos = extract(first.text, 'https://vimeos.net', '/embed-rxqr2clfd240.html');
    if (!vimeos) return {status: 'vimeos_reference_not_found', checks};
    const second = await read(vimeos, 'https://videoapp.mov/', 'vimeos');
    if (!second.ok) return {status: 'vimeos_unavailable', checks};
    let url = extract(second.text, 'https://s9.vimeos.net', '/hls2/03/00013/rxqr2clfd240_,n,h,.urlset/master.m3u8');
    if (!url) return {status: 'hls_reference_not_found', checks};
    let encrypted = false, initializationMapPresent = false, alternateMediaPresent = false;
    for (let depth = 0; depth < 3; depth++) {
      if (new URL(url).origin !== 'https://s9.vimeos.net') throw new Error('unsupported_origin');
      const p = await read(url, 'https://vimeos.net/', depth === 0 ? 'master' : 'variant');
      if (!p.ok || !p.check.isPlaylist) return {status: 'playlist_unavailable', checks};
      if (p.check.sampleLimitReached) return {status: 'playlist_sample_limit', checks};
      alternateMediaPresent ||= /#EXT-X-MEDIA:/.test(p.text);
      encrypted ||= [...p.text.matchAll(/#EXT-X-KEY:([^\r\n]*)/g)].some(m => !/(?:^|,)METHOD=NONE(?:,|$)/.test(m[1]));
      initializationMapPresent ||= /#EXT-X-MAP:/.test(p.text);
      if (/#EXT-X-STREAM-INF:/.test(p.text)) {
        const m = p.text.match(/#EXT-X-STREAM-INF:[^\r\n]*[\r\n]+([^#\r\n][^\r\n]*)/);
        if (!m) return {status: 'variant_not_found', checks};
        url = new URL(m[1].trim(), url).href; continue;
      }
      const m = p.text.match(/#EXTINF:[^\r\n]*[\r\n]+(?:#[^\r\n]*[\r\n]+)*([^#\r\n][^\r\n]*)/);
      if (!m) return {status: 'media_segment_not_found', checks};
      const segment = new URL(m[1].trim(), url);
      if (segment.origin !== 'https://s9.vimeos.net') throw new Error('unsupported_origin');
      const s = await read(segment.href, 'https://vimeos.net/', 'segment_sample', true);
      return {status: s.ok && s.check.sampleBytes > 0 && !s.check.looksLikeHtml ? 'segment_sample_received' : 'segment_sample_unavailable', encrypted, initializationMapPresent, alternateMediaPresent, checks};
    }
    return {status: 'playlist_depth_limit', checks};
  } catch (e) { return {status: 'test_incomplete', errorType: e.name, crossOriginUnsupported: e.message === 'unsupported_origin', checks}; }
}
module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  const send = (status, data) => { res.statusCode = status; res.end(JSON.stringify({experimental: true, version: 1, ...data, playbackVerified: false, note: 'Extrae URLs completas sin publicarlas. No sigue redirecciones ni desafíos. Solo primera variante y hasta 1 KB del primer segmento; no valida decodificación, claves, mapas de inicialización ni pistas alternativas.'}, null, 2)); };
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return send(405, {error: 'Solo GET'}); }
  try {
    if (!cache || cache.until < Date.now()) cache = {until: Date.now() + 60000, result: inspect()};
    return send(200, await cache.result);
  } catch (e) { cache = null; return send(502, {status: 'fetch_failed', errorType: e.name}); }
};
