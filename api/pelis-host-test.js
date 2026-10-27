'use strict';
const {createHash} = require('node:crypto');
module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  const send = (status, data) => { res.statusCode = status; res.end(JSON.stringify({experimental:true, playbackVerified:false, ...data}, null, 2)); };
  if (req.method !== 'GET') { res.setHeader('Allow','GET'); return send(405,{error:'Solo GET'}); }
  const params = new URL(req.url, 'https://addon.local').searchParams;
  const mode = params.get('mode') || 'page';
  const targets = {page:'https://streamwish.to/e/ejfrl3vz4rbs',script:'https://streamwish.to/main.js?v=1.1.9',hanerix:'https://hanerix.com/e/ejfrl3vz4rbs'};
  if (!Object.prototype.hasOwnProperty.call(targets,mode)) return send(400,{error:'Modo inválido'});
  const offsetText = params.get('offset') || '0';
  if (!/^[0-9]{1,7}$/.test(offsetText) || Number(offsetText)>1000000) return send(400,{error:'Offset inválido'});
  const offset = Number(offsetText);
  const pageUrl = targets[mode];
  try {
    const r = await fetch(pageUrl, {redirect:'manual', signal:AbortSignal.timeout(10000), headers:{Accept:mode === 'script' ? 'application/javascript, text/javascript, */*' : 'text/html', 'User-Agent':'NebulaPlayDiagnostics/0.4', Referer:mode === 'script' ? 'https://streamwish.to/e/ejfrl3vz4rbs' : 'https://pelisplushd.la/pelicula/eb'}});
    const parts=[]; let size=0;
    if (r.body) {
      const reader=r.body.getReader();
      try { while(size<1000000) { const {done,value}=await reader.read(); if(done) break; const part=value.subarray(0,1000000-size); parts.push(Buffer.from(part)); size+=part.length; } }
      finally { await reader.cancel().catch(()=>{}); }
    }
    const buffer=Buffer.concat(parts);
    const html=buffer.toString('utf8');
    const verification=r.headers.get('cf-mitigated')==='challenge'||/cf-chl-|g-recaptcha|altcha-widget|verify you are human/i.test(html);
    const limit = mode === 'script' || mode === 'hanerix' ? 20000 : 4096;
    const end = Math.min(offset+limit,html.length);
    return send(200,{diagnosticVersion:5, mode, pageUrl, upstreamStatus:r.status, contentType:r.headers.get('content-type'), sampledBytes:size, possiblyTruncated:size>=1000000, sha256:createHash('sha256').update(buffer).digest('hex'), totalCharacters:html.length, offset, nextOffset:end<html.length?end:null, verificationDetected:verification, status:verification?'verification_required':!r.ok?'upstream_http_error':'text_received', packedScriptDetected:/eval\(function\(p,a,c,k,e,d\)/.test(html), playerDetected:/jwplayer/.test(html), htmlSample:html.slice(offset,end), htmlSampleTruncated:offset>0||end<html.length, notice:'Lectura de tres direcciones fijas. No ejecuta scripts ni sigue redirecciones ni modifica fuentes de Nebula. Cada consulta descarga de nuevo; compare sha256 entre partes.'});
  } catch(e) { return send(502,{pageUrl,status:'fetch_failed',errorType:e.name}); }
};
