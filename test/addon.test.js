'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { createHandler, validate } = require('../lib/addon');
const config = require('../config.json');
const catalog = require('../data/catalog.json');
const series = {
  id: 'miaddon:test-serie', type: 'series', name: 'Serie de prueba interna',
  videos: [{ id: 'miaddon:test-serie:1:1', title: 'Episodio de prueba', released: '2026-01-01T00:00:00.000Z', season: 1, episode: 1, streams: catalog[0].streams }]
};
function request(url, method = 'GET', items = catalog) {
  return new Promise((resolve, reject) => {
    const headers = {};
    const req = {url, method};
    const res = {statusCode: 200, setHeader(k, v) { headers[k.toLowerCase()] = v; }, end(body) { resolve({status: this.statusCode, headers, text: body || '', json: headers['content-type']?.startsWith('application/json') && body ? JSON.parse(body) : undefined}); }};
    try { createHandler(config, items)(req, res); } catch (error) { reject(error); }
  });
}
test('manifiesto con catálogo, meta, stream y prefijo propio', async () => {
  const r = await request('/manifest.json'); assert.equal(r.status, 200); assert.deepEqual(r.json.resources, ['catalog', 'meta', 'stream']); assert.deepEqual(r.json.idPrefixes, ['miaddon:']);
});
test('CORS presente', async () => { assert.equal((await request('/manifest.json')).headers['access-control-allow-origin'], '*'); });
test('catálogo película', async () => { assert.equal((await request('/catalog/movie/peliculas.json')).json.metas.length, 1); });
test('catálogo no filtra URLs de stream ni alias', async () => {const meta = (await request('/catalog/movie/peliculas.json')).json.metas[0]; assert.equal(meta.streams, undefined); assert.equal(meta.aliases, undefined);});
test('búsqueda parcial', async () => { assert.equal((await request('/catalog/movie/peliculas/search=bunny.json')).json.metas.length, 1); });
test('búsqueda por alias y normalización', async () => { assert.equal((await request('/catalog/movie/peliculas/search=GR%C3%81N%20CONEJO.json')).json.metas.length, 1); });
test('búsqueda inexistente', async () => { assert.deepEqual((await request('/catalog/movie/peliculas/search=noexiste.json')).json.metas, []); });
test('extra completo codificado', async () => { assert.equal((await request('/catalog/movie/peliculas/search%3Dbunny%26skip%3D0.json')).json.metas.length, 1); });
test('búsqueda por query string', async () => { assert.equal((await request('/catalog/movie/peliculas.json?search=bunny')).json.metas.length, 1); });
test('paginación agotada', async () => { assert.deepEqual((await request('/catalog/movie/peliculas/skip=100.json')).json.metas, []); });
test('skip inválido', async () => { assert.equal((await request('/catalog/movie/peliculas/skip=-1.json')).status, 400); });
test('catálogo desconocido', async () => { assert.equal((await request('/catalog/movie/desconocido.json')).status, 404); });
test('meta película', async () => { const r = await request('/meta/movie/miaddon%3Abig-buck-bunny.json'); assert.equal(r.json.meta.name, 'Big Buck Bunny'); assert.equal(r.json.meta.streams, undefined); });
test('meta tipo incorrecto', async () => { assert.equal((await request('/meta/series/miaddon:big-buck-bunny.json')).status, 404); });
test('meta desconocido', async () => { assert.equal((await request('/meta/movie/miaddon:unknown.json')).status, 404); });
test('stream película HTTPS', async () => {assert.ok((await request('/stream/movie/miaddon:big-buck-bunny.json')).json.streams[0].url.startsWith('https://'));});
test('stream desconocido devuelve vacío', async () => {assert.deepEqual((await request('/stream/movie/miaddon:unknown.json')).json.streams, []);});
test('catálogo series inicialmente vacío', async () => {assert.deepEqual((await request('/catalog/series/series.json')).json.metas, []);});
test('soporte catálogo series con datos de prueba', async () => {assert.equal((await request('/catalog/series/series.json', 'GET', [...catalog, series])).json.metas.length, 1);});
test('meta serie omite streams embebidos del episodio', async () => {const r = await request('/meta/series/miaddon:test-serie.json', 'GET', [series]); assert.equal(r.json.meta.videos[0].season, 1); assert.equal(r.json.meta.videos[0].streams, undefined);});
test('stream episodio', async () => {assert.equal((await request('/stream/series/miaddon:test-serie:1:1.json', 'GET', [series])).json.streams.length, 1);});
test('no tratar meta serie como episodio', async () => {assert.deepEqual((await request('/stream/series/miaddon:test-serie.json', 'GET', [series])).json.streams, []);});
test('OPTIONS', async () => {assert.equal((await request('/manifest.json', 'OPTIONS')).status, 204);});
test('HEAD sin cuerpo', async () => {const r = await request('/manifest.json', 'HEAD'); assert.equal(r.status, 200); assert.equal(r.text, '');});
test('rechazo POST', async () => {assert.equal((await request('/manifest.json', 'POST')).status, 405);});
test('codificación inválida', async () => {assert.equal((await request('/meta/movie/%ZZ.json')).status, 400);});
test('URL demasiado larga', async () => {assert.equal((await request('/' + 'a'.repeat(4096))).status, 414);});
test('inicio HTML', async () => {const r = await request('/'); assert.equal(r.status, 200); assert.ok(r.text.includes('navigator.clipboard'));});
test('salud', async () => {assert.equal((await request('/health')).json.status, 'ok');});
test('ruta desconocida', async () => {assert.equal((await request('/no-existe')).status, 404);});
test('entrada Vercel con route explícita', async () => {assert.equal((await request('/api/index?route=catalog/movie/peliculas.json')).json.metas.length, 1);});
test('entrada Vercel con ruta de búsqueda', async () => {assert.equal((await request('/api/index?route=' + encodeURIComponent('catalog/movie/peliculas/search=bunny.json'))).json.metas.length, 1);});
test('IDs duplicados rechazados', () => {assert.throws(() => validate(config, [...catalog, catalog[0]]));});
test('prefijo incorrecto rechazado', () => {assert.throws(() => validate(config, [{...catalog[0], id: 'otro:id'}]));});
test('stream HTTP rechazado', () => {assert.throws(() => validate(config, [{...catalog[0], streams: [{url: 'http://example.com/video.mp4'}]}]));});
test('serie sin episodios rechazada', () => {assert.throws(() => validate(config, [{...series, videos: []}]));});
test('paginación real con 105 elementos internos', async () => {const items = Array.from({length: 105}, (_,i)=>({...catalog[0], id:`miaddon:test-${i}`})); assert.equal((await request('/catalog/movie/peliculas.json','GET',items)).json.metas.length,100); assert.equal((await request('/catalog/movie/peliculas/skip=100.json','GET',items)).json.metas.length,5);});
test('HTTP local real', async () => {
  const server = http.createServer(createHandler(config, catalog));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const base = 'http://127.0.0.1:' + server.address().port;
    const response = await fetch(base + '/manifest.json'); assert.equal(response.status, 200); assert.equal((await response.json()).name, config.name);
    const stream = await fetch(base + '/stream/movie/miaddon:big-buck-bunny.json'); assert.equal((await stream.json()).streams.length, 1);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
