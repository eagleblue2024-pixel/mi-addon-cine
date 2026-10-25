'use strict';
const target = 'https://audinifer.com/stream/VSe7IA4ckkGOKkGdMx81vg/kjhhiuahiuhgihdf/1793010328/59212527/master.m3u8';
let cache;
async function inspect() {
  const signal = AbortSignal.timeout(12000);
  const origin = new URL(target).origin;
  const checks = [];
  async function read(url, stage, segment = false) {
    const u = new URL(url);
    if (u.origin !== origin || u.username || u.password) throw new Error('unsupported_origin');
    const r = await fetch(u, {redirect: 'manual', signal, headers: segment ? {Range: 'bytes=0-1023'} : {Accept: 'application/vnd.apple.mpegurl, application/x-mpegURL, text/plain'}});
    const check = {stage, httpStatus: r.status, contentType: r.headers.get('content-type'), challenge: r.headers.get('cf-mitigated') === 'challenge'};
    checks.push(check);
    const parts = []; let size = 0;
    const limit = segment ? 1024 : 65536;
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
    check.sampleBytes = size;
    const text = Buffer.concat(parts).toString('utf8').replace(/^\uFEFF/, '').trimStart();
    if (!segment) check.isPlaylist = text.startsWith('#EXTM3U');
    return {ok: r.ok, text, check};
  }
  try {
    let url = target;
    for (let depth = 0; depth < 3; depth++) {
      const p = await read(url, depth === 0 ? 'master' : 'variant');
      if (!p.ok || !p.check.isPlaylist) return {status: 'playlist_unavailable', checks};
      if (/#EXT-X-STREAM-INF:/.test(p.text)) {
        const match = p.text.match(/#EXT-X-STREAM-INF:[^\r\n]*[\r\n]+([^#\r\n][^\r\n]*)/);
        if (!match) return {status: 'variant_not_found', checks};
        url = new URL(match[1].trim(), url).href; continue;
      }
      const media = p.text.split(/\r?\n/).map(s => s.trim()).find(s => s && !s.startsWith('#'));
      if (!media) return {status: 'segment_not_found', checks};
      const encrypted = /#EXT-X-KEY:(?!METHOD=NONE)/.test(p.text);
      const s = await read(new URL(media, url).href, 'segment_sample', true);
      return {status: s.ok && s.check.sampleBytes > 0 ? 'segment_sample_received' : 'segment_unavailable', encrypted, checks};
    }
    return {status: 'playlist_depth_limit', checks};
  } catch (e) { return {status: 'test_incomplete', errorType: e.name, crossOriginUnsupported: e.message === 'unsupported_origin', checks}; }
}
module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method !== 'GET') { res.statusCode = 405; res.setHeader('Allow', 'GET'); return res.end(JSON.stringify({error: 'Solo GET'})); }
  if (!cache || cache.until < Date.now()) cache = {until: Date.now() + 60000, result: inspect()};
  const result = await cache.result;
  res.end(JSON.stringify({experimental: true, ...result, playbackVerified: false, note: 'Una muestra accesible no confirma reproducción. No se prueban claves, pistas alternativas ni segmentos completos. Redirecciones y otros dominios no se siguen.'}, null, 2));
};
