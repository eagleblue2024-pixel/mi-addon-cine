'use strict';
module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  const send = (status, data) => { res.statusCode = status; res.end(JSON.stringify({experimental:true, playbackVerified:false, ...data}, null, 2)); };
  if (req.method !== 'GET') { res.setHeader('Allow','GET'); return send(405,{error:'Solo GET'}); }
  const pageUrl = 'https://streamwish.to/e/ejfrl3vz4rbs';
  try {
    const r = await fetch(pageUrl, {redirect:'manual', signal:AbortSignal.timeout(10000), headers:{Accept:'text/html', 'User-Agent':'NebulaPlayDiagnostics/0.4', Referer:'https://pelisplushd.la/pelicula/eb'}});
    const parts=[]; let size=0;
    if (r.body) {
      const reader=r.body.getReader();
      try { while(size<1000000) { const {done,value}=await reader.read(); if(done) break; const part=value.subarray(0,1000000-size); parts.push(Buffer.from(part)); size+=part.length; } }
      finally { await reader.cancel().catch(()=>{}); }
    }
    const html=Buffer.concat(parts).toString('utf8');
    const verification=r.headers.get('cf-mitigated')==='challenge'||/cf-chl-|g-recaptcha|altcha-widget|verify you are human/i.test(html);
    return send(200,{pageUrl, upstreamStatus:r.status, contentType:r.headers.get('content-type'), sampledBytes:size, possiblyTruncated:size>=1000000, verificationDetected:verification, status:verification?'verification_required':!r.ok?'upstream_http_error':'html_received', packedScriptDetected:/eval\(function\(p,a,c,k,e,d\)/.test(html), playerDetected:/jwplayer/.test(html), notice:'Solo diagnostica acceso. No ejecuta scripts ni modifica las fuentes de Nebula.'});
  } catch(e) { return send(502,{pageUrl,status:'fetch_failed',errorType:e.name}); }
};
