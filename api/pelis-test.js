'use strict';
const {scrapeMovie} = require('../lib/pelis-scraper');
let cache = null;
module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); res.statusCode = 405; return res.end(JSON.stringify({error: 'Solo GET'})); }
  const slug = new URL(req.url, 'http://addon.local').searchParams.get('slug') || 'spirit-el-indomable';
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 160) { res.statusCode = 400; return res.end(JSON.stringify({error: 'Slug inválido'})); }
  try {
    const now = Date.now();
    if (!cache || cache.slug !== slug || cache.until <= now) cache = {slug, until: now + 30000, result: scrapeMovie(slug)};
    const result = await cache.result;
    return res.end(JSON.stringify({experimental: true, notice: 'Diagnóstico HTML. Los enlaces detectados no están verificados. No resuelve CAPTCHA, no ejecuta JavaScript ni sigue reproductores externos.', ...result}, null, 2));
  } catch (error) {
    cache = null;
    res.statusCode = 502;
    return res.end(JSON.stringify({experimental: true, status: 'fetch_failed', message: 'No se pudo leer la ficha. Puede haber un bloqueo, redirección, respuesta demasiado grande o timeout.', errorType: error.name, streams: []}, null, 2));
  }
};
