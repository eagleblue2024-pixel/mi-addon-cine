'use strict';
const fs = require('node:fs');
const path = require('node:path');
const normalize = value => String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const isHttps = value => {
  try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password; }
  catch { return false; }
};
function validate(config, items) {
  if (!config.id || !config.name || !/^\d+\.\d+\.\d+$/.test(config.version) || !config.idPrefix) throw new Error('Configuración incompleta');
  if (config.pageSize !== 100) throw new Error('pageSize debe ser 100');
  if (!Array.isArray(items)) throw new Error('El catálogo debe ser un array');
  const ids = new Set();
  const videoIds = new Set();
  const checkStreams = streams => {
    if (streams !== undefined && !Array.isArray(streams)) throw new Error('streams debe ser un array');
    for (const stream of streams || []) {
      if (!isHttps(stream.url)) throw new Error('Los streams deben usar URL HTTPS sin credenciales');
      if (Object.keys(stream).some(key => !['name', 'title', 'url'].includes(key))) throw new Error('El stream admite name, title y url');
    }
  };
  for (const item of items) {
    if (!item.id?.startsWith(config.idPrefix) || !item.name || !['movie', 'series'].includes(item.type)) throw new Error('Elemento inválido');
    if (ids.has(item.id)) throw new Error('ID duplicado');
    ids.add(item.id);
    if (item.poster && !isHttps(item.poster)) throw new Error('El póster debe usar HTTPS');
    if (item.aliases && (!Array.isArray(item.aliases) || item.aliases.some(x => typeof x !== 'string'))) throw new Error('Alias inválidos');
    checkStreams(item.streams);
    if (item.type === 'series' && (!Array.isArray(item.videos) || item.videos.length === 0)) throw new Error('Las series requieren episodios');
    if (item.type === 'movie' && item.videos !== undefined) throw new Error('Las películas usan streams, no videos');
    for (const video of item.videos || []) {
      if (!video.id?.startsWith(item.id + ':') || !video.title || !/^\d{4}-\d{2}-\d{2}T/.test(video.released || '') || !Number.isFinite(Date.parse(video.released))) throw new Error('Episodio inválido');
      if (!Number.isInteger(video.season) || video.season < 0 || !Number.isInteger(video.episode) || video.episode < 1) throw new Error('Numeración de episodio inválida');
      if (videoIds.has(video.id)) throw new Error('ID de episodio duplicado');
      videoIds.add(video.id);
      checkStreams(video.streams);
    }
  }
  if ([...videoIds].some(id => ids.has(id))) throw new Error('ID de episodio en conflicto con un título');
}
function publicMeta(item, preview = false) {
  const result = {};
  const allowed = preview ? ['id', 'type', 'name', 'poster', 'posterShape', 'genres', 'releaseInfo'] : ['id', 'type', 'name', 'poster', 'posterShape', 'genres', 'releaseInfo', 'description', 'background', 'runtime'];
  for (const key of allowed) if (item[key] !== undefined) result[key] = item[key];
  if (!preview && item.type === 'series') result.videos = item.videos.map(video => {
    const output = {};
    for (const key of ['id', 'title', 'released', 'season', 'episode', 'overview', 'thumbnail']) if (video[key] !== undefined) output[key] = video[key];
    return output;
  });
  return result;
}
function createHandler(config, items) {
  validate(config, items);
  const manifest = {
    id: config.id, version: config.version, name: config.name, description: config.description,
    resources: ['catalog', 'meta', 'stream'], types: ['movie', 'series'], idPrefixes: [config.idPrefix],
    catalogs: [
      { type: 'movie', id: 'peliculas', name: `${config.name} · Películas`, extra: [{name: 'search', isRequired: false}, {name: 'skip', isRequired: false}] },
      { type: 'series', id: 'series', name: `${config.name} · Series`, extra: [{name: 'search', isRequired: false}, {name: 'skip', isRequired: false}] }
    ],
    behaviorHints: { adult: false, configurable: false }
  };
  const byId = new Map(items.map(item => [item.id, item]));
  const episodes = new Map(items.flatMap(item => (item.videos || []).map(video => [video.id, video])));
  const home = fs.readFileSync(path.join(__dirname, 'home.html'), 'utf8');
  return function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    const send = (status, body, contentType = 'application/json; charset=utf-8') => {
      res.statusCode = status;
      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', status === 200 && contentType.startsWith('application/json') ? 'public, max-age=60' : 'no-store');
      const output = contentType.startsWith('application/json') ? JSON.stringify(body) : body;
      res.end(req.method === 'HEAD' ? undefined : output);
    };
    if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end(); }
    if (!['GET', 'HEAD'].includes(req.method)) { res.setHeader('Allow', 'GET, HEAD, OPTIONS'); return send(405, {error: 'Método no permitido'}); }
    if (!req.url || req.url.length > 4096) return send(414, {error: 'URL demasiado larga'});
    try {
      const url = new URL(req.url, 'http://addon.local');
      let pathname = url.pathname;
      if (pathname === '/api/index' || pathname === '/api/index.js') {
        const route = url.searchParams.get('route');
        if (route !== null) pathname = '/' + route.replace(/^\/+/, '');
      }
      decodeURIComponent(pathname);
      if (pathname === '/') {
        res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'");
        return send(200, home, 'text/html; charset=utf-8');
      }
      if (pathname === '/manifest.json') return send(200, manifest);
      if (pathname === '/health') return send(200, {status: 'ok', version: config.version});
      const match = pathname.match(/^\/(catalog|meta|stream)\/(movie|series)\/([^/]+?)(?:\/(.+))?\.json$/);
      if (!match) return send(404, {error: 'Ruta no encontrada'});
      const [, resource, type, rawId, rawExtra] = match;
      const id = decodeURIComponent(rawId);
      if (resource === 'catalog') {
        if (id !== (type === 'movie' ? 'peliculas' : 'series')) return send(404, {metas: []});
        let extraString = rawExtra || '';
        if (!extraString.includes('=') && /%3d/i.test(extraString)) extraString = decodeURIComponent(extraString);
        const extras = new URLSearchParams(extraString);
        const skipText = extras.get('skip') ?? url.searchParams.get('skip') ?? '0';
        if (!/^\d{1,9}$/.test(skipText)) return send(400, {error: 'skip inválido'});
        const skip = Number(skipText);
        const search = normalize(extras.get('search') ?? url.searchParams.get('search') ?? '');
        const words = search.split(' ').filter(Boolean);
        const matches = items.filter(item => item.type === type && words.every(word => normalize([item.name, ...(item.aliases || [])].join(' ')).includes(word)));
        return send(200, {metas: matches.slice(skip, skip + config.pageSize).map(item => publicMeta(item, true))});
      }
      if (rawExtra) return send(404, {error: 'Ruta no encontrada'});
      const item = byId.get(id);
      if (resource === 'meta') return item?.type === type ? send(200, {meta: publicMeta(item)}) : send(404, {meta: null});
      if (type === 'movie') return send(200, {streams: item?.type === 'movie' ? item.streams || [] : []});
      const episode = episodes.get(id);
      return send(200, {streams: episode?.streams || []});
    } catch (error) {
      return send(400, {error: 'Solicitud inválida'});
    }
  };
}
module.exports = { createHandler, validate, normalize };
