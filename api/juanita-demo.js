'use strict';
const id = 'njdemo:moana';
let cached;
const manifest = {id: 'org.nebulaplay.juanita.demo', version: '0.1.0', name: 'Nebula Play - Prueba Juanita', description: 'Prueba experimental de reproducción de un solo título. No es un catálogo completo.', resources: ['catalog', 'meta', 'stream'], types: ['movie'], idPrefixes: ['njdemo:'], catalogs: [{type: 'movie', id: 'juanita-demo', name: 'Prueba Juanita'}]};
const meta = {id, type: 'movie', name: 'Moana - prueba PelisJuanita', description: 'Caso único de prueba. Abre esta ficha y selecciona el stream de PelisJuanita. La reproducción todavía debe verificarse en Nuvio.'};
function decode(s) { return s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/\\\//g, '/').replace(/\\u002[fF]/g, '/').replace(/\\u0026/g, '&'); }
function find(html, origin, path) {
  for (const m of decode(html).matchAll(/https?:\/\/[^\s"'<>\\`]+/gi)) {
    try { const u = new URL(m[0]); if (u.origin === origin && u.pathname === path && !u.username && !u.password) return u.href; } catch {}
  }
  return null;
}
async function resolve() {
  const signal = AbortSignal.timeout(15000);
  async function read(url, referer) {
    const u = new URL(url);
    if (!['https://videoapp.mov', 'https://vimeos.net'].includes(u.origin) || u.username || u.password) throw new Error('unsupported_origin');
    const r = await fetch(u, {redirect: 'manual', signal, headers: {Accept: 'text/html', Referer: referer, 'User-Agent': 'NebulaPlayDemo/0.1'}});
    if (!r.ok || r.headers.get('cf-mitigated') === 'challenge') { if (r.body) await r.body.cancel(); throw new Error('upstream_unavailable'); }
    const reader = r.body.getReader(), parts = []; let size = 0;
    try {
      while (size < 524288) {
        const {done, value} = await reader.read();
        if (done) break;
        const part = value.subarray(0, 524288 - size); parts.push(Buffer.from(part)); size += part.length;
      }
    } finally { await reader.cancel().catch(() => {}); }
    if (size >= 524288) throw new Error('page_limit');
    return Buffer.concat(parts).toString('utf8');
  }
  const html = await read('https://videoapp.mov/e/movie/1108427', 'https://pelisjuanita.org/');
  const player = find(html, 'https://vimeos.net', '/embed-rxqr2clfd240.html');
  if (!player) throw new Error('player_not_found');
  const body = await read(player, 'https://videoapp.mov/');
  const url = find(body, 'https://s9.vimeos.net', '/hls2/03/00013/rxqr2clfd240_,n,h,.urlset/master.m3u8');
  if (!url) throw new Error('hls_not_found');
  return url;
}
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  const send = (status, data) => { res.statusCode = status; res.end(JSON.stringify(data)); };
  if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end(); }
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET, OPTIONS'); return send(405, {error: 'Solo GET'}); }
  let route;
  try { route = decodeURIComponent(String(req.query.route || '')).replace(/^\/+|\/+$/g, ''); } catch { return send(400, {error: 'Ruta inválida'}); }
  if (route === 'manifest.json') return send(200, manifest);
  if (route === 'catalog/movie/juanita-demo.json') return send(200, {metas: [meta]});
  if (route === 'meta/movie/' + id + '.json') return send(200, {meta});
  if (route === 'stream/movie/' + id + '.json') {
    try {
      if (!cached || cached.until < Date.now()) cached = {until: Date.now() + 15000, result: resolve()};
      const url = await cached.result;
      return send(200, {streams: [{name: 'PelisJuanita - prueba', title: 'Moana | HLS directo | reproducción experimental', url, behaviorHints: {notWebReady: true}}]});
    } catch (e) { cached = null; return send(200, {streams: [], error: e.name === 'TimeoutError' ? 'Tiempo de espera agotado' : 'No se pudo extraer el stream en esta solicitud'}); }
  }
  return send(404, {error: 'Ruta no disponible en esta prueba de un solo título'});
};
