'use strict';
const original = require('./nebula-play');
const targetRoute = 'stream/movie/tt12808182.json';
const testUrl = 'https://vibuxer.com/stream/C2pdiSLOr4vL3TU8rUZS-g/kjhhiuahiuhgihdf/1793083491/59214632/master.m3u8';
module.exports = async (req, res) => {
  let route;
  try { route = decodeURIComponent(String(req.query?.route || '')).replace(/^\/+|\/+$/g, ''); }
  catch { return original(req, res); }
  if (route !== targetRoute || req.method !== 'GET') return original(req, res);
  const end = res.end;
  res.end = function(chunk, ...args) {
    if (chunk !== undefined && res.statusCode === 200) {
      try {
        const data = JSON.parse(Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk));
        if (Array.isArray(data.streams)) {
          if (!data.streams.some(stream => stream.url === testUrl)) {
            data.streams.push({name: 'Nebula Play ⭐', title: '⭐ El último mercenario | HLS adicional de prueba | enlace fijo', url: testUrl, behaviorHints: {notWebReady: true}});
          }
          delete data.error;
          chunk = JSON.stringify(data);
          res.removeHeader('Content-Length');
        }
      } catch {}
    }
    return end.call(this, chunk, ...args);
  };
  return original(req, res);
};
