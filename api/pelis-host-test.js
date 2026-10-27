'use strict';
module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  const send = (status, data) => { res.statusCode = status; res.end(JSON.stringify({experimental:true, playbackVerified:false, ...data}, null, 2)); };
  if (req.method !== 'GET') { res.setHeader('Allow','GET'); return send(405,{error:'Solo GET'}); }
  const mode = new URL(req.url, 'https://addon.local').searchParams.get('mode') || 'page';
  if (!['page','script'].includes(mode)) return send(400,{error:'Modo inválido'});
  const pageUrl = mode === 'script' ? 'https://streamwish.to/main.js?v=1.1.9' : 'https://streamwish.to/e/ejfrl3vz4rbs';
  try {
    const r = await fetch(pageUrl, {redirect:'manual', signal:AbortSignal.timeout(10000), headers:{Accept:mode === 'script' ? 'application/javascript, text/javascript, */*' : 'text/html', 'User-Agent':'NebulaPlayDiagnostics/0.4', Referer:mode === 'script' ? 'https://streamwish.to/e/ejfrl3vz4rbs' : 'https://pelisplushd.la/pelicula/eb'}});
    const parts=[]; let size=0;
    if (r.body) {
      const reader=r.body.getReader();
      try { while(size<1000000) { const {done,value}=await reader.read(); if(done) break; const part=value.subarray(0,1000000-size); parts.push(Buffer.from(part)); size+=part.length; } }
      finally { await reader.cancel().catch(()=>{}); }
    }
    const html=Buffer.concat(parts).toString('utf8');
    const verification=r.headers.get('cf-mitigated')==='challenge'||/cf-chl-|g-recaptcha|altcha-widget|verify you are human/i.test(html);
    const limit = mode === 'script' ? 20000 : 4096;
    return send(200,{diagnosticVersion:3, mode, pageUrl, upstreamStatus:r.status, contentType:r.headers.get('content-type'), sampledBytes:size, possiblyTruncated:size>=1000000, verificationDetected:verification, status:verification?'verification_required':!r.ok?'upstream_http_error':'text_received', packedScriptDetected:/eval\(function\(p,a,c,k,e,d\)/.test(html), playerDetected:/jwplayer/.test(html), htmlSample:html.slice(0,limit), htmlSampleTruncated:html.length>limit, notice:'Inspección de texto de dos direcciones fijas. No ejecuta scripts, no sigue redirecciones ni modifica las fuentes de Nebula.'});
  } catch(e) { return send(502,{pageUrl,status:'fetch_failed',errorType:e.name}); }
};
