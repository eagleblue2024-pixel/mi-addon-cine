'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { createHandler } = require('../lib/addon');
const base = createHandler(require('../config.json'), require('../data/catalog.json'));
const logo = fs.readFileSync(path.join(__dirname, '../lib/logo.svg'), 'utf8');
module.exports = (req, res) => {
  let route;
  try {
    const u = new URL(req.url, 'http://addon.local');
    route = u.pathname;
    if (['/api/index', '/api/index.js'].includes(route) && u.searchParams.has('route')) route = '/' + u.searchParams.get('route').replace(/^\/+/, '');
  } catch { return base(req, res); }
  if (route === '/logo.svg' && ['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    res.statusCode = req.method === 'OPTIONS' ? 204 : 200;
    res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    return res.end(req.method === 'GET' ? logo : undefined);
  }
  if (route === '/manifest.json' && req.method === 'GET') {
    const end = res.end;
    res.end = function(body, ...args) {
      res.end = end;
      if (res.statusCode === 200 && typeof body === 'string') {
        const manifest = JSON.parse(body);
        const host = req.headers.host;
        if (host && /^[a-zA-Z0-9.:[\]-]+$/.test(host)) {
          const protocol = req.socket?.encrypted || process.env.VERCEL ? 'https:' : 'http:';
          manifest.logo = new URL('/logo.svg', protocol + '//' + host).href;
        }
        body = JSON.stringify(manifest);
      }
      return end.call(this, body, ...args);
    };
  }
  if (route === '/') {
    const setHeader = res.setHeader;
    res.setHeader = function(name, value) {
      if (name.toLowerCase() === 'content-security-policy') value = value.replace("default-src 'none';", "default-src 'none'; img-src 'self';");
      return setHeader.call(this, name, value);
    };
  }
  return base(req, res);
};
