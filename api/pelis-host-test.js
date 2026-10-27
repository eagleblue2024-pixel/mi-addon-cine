'use strict';
const PAGE='https://hanerix.com/e/ejfrl3vz4rbs';
async function read(url,referer,max){
  const r=await fetch(url,{redirect:'manual',signal:AbortSignal.timeout(8000),headers:{Accept:'*/*','User-Agent':'NebulaPlayDiagnostics/0.4',Referer:referer}});
  const parts=[];let size=0;
  if(r.body){const reader=r.body.getReader();try{while(size<max){const {done,value}=await reader.read();if(done)break;const p=value.subarray(0,max-size);parts.push(Buffer.from(p));size+=p.length;}}finally{await reader.cancel().catch(()=>{});}}
  return {httpStatus:r.status,ok:r.ok,contentType:r.headers.get('content-type'),text:Buffer.concat(parts).toString('utf8'),possiblyTruncated:size>=max,challenge:r.headers.get('cf-mitigated')==='challenge'};
}
function unpackLinks(html){
  const m=html.match(/\}\('((?:\\.|[^'\\])*)',36,(\d+),'([^']*)'\.split\('\|'\)/);
  if(!m||Number(m[2])>5000)throw new Error('packed_format_not_supported');
  const dict=m[3].split('|');
  const payload=m[1].replace(/\\(['\\])/g,'$1');
  const decoded=payload.replace(/\b[0-9a-z]+\b/g,t=>{const i=parseInt(t,36);return i<dict.length&&dict[i]?dict[i]:t;});
  const object=decoded.match(/\bvar\s+links\s*=\s*(\{[^;]*?\});/);
  if(!object)throw new Error('links_object_missing');
  const raw=JSON.parse(object[1]);const links={};
  for(const key of ['hls4','hls3','hls2']){if(typeof raw[key]!=='string')continue;const u=new URL(raw[key],PAGE);if(u.protocol!=='https:'||u.username||u.password||u.port)continue;links[key]=u.href;}
  return links;
}
module.exports=async(req,res)=>{
  res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
  const send=(code,data)=>{res.statusCode=code;res.end(JSON.stringify({diagnosticVersion:6,experimental:true,playbackVerified:false,pageUrl:PAGE,...data},null,2));};
  if(req.method!=='GET'){res.setHeader('Allow','GET');return send(405,{error:'Solo GET'});}
  try{
    const page=await read(PAGE,'https://pelisplushd.la/pelicula/eb',1000000);
    if(page.challenge||/cf-chl-|g-recaptcha|altcha-widget|verify you are human/i.test(page.text))return send(200,{status:'verification_required',links:{}});
    if(!page.ok||page.possiblyTruncated||!/text\/html/i.test(page.contentType||''))return send(200,{status:'page_not_usable',upstreamStatus:page.httpStatus});
    let links;try{links=unpackLinks(page.text);}catch(e){return send(200,{status:'extraction_failed',reason:e.message});}
    let playlistCheck={status:'not_checked'};
    if(links.hls4){const u=new URL(links.hls4);if(u.origin==='https://hanerix.com'&&u.pathname.startsWith('/stream/')&&u.pathname.endsWith('/master.m3u8')){try{const h=await read(u.href,PAGE,131072);const hls=h.ok&&/^\uFEFF?\s*#EXTM3U/.test(h.text);playlistCheck={status:hls?'hls_received':'hls_not_confirmed',httpStatus:h.httpStatus,contentType:h.contentType,possiblyTruncated:h.possiblyTruncated,variantCount:(h.text.match(/#EXT-X-STREAM-INF:/g)||[]).length};}catch(e){playlistCheck={status:'fetch_failed',errorType:e.name};}}}
    return send(200,{status:Object.keys(links).length?'links_extracted':'no_links',links,playlistCheck,notice:'Prueba de un solo video; no integra la búsqueda de películas. No ejecuta JavaScript remoto, no sigue redirecciones ni descarga segmentos. hls_received no confirma reproducción en Nuvio.'});
  }catch(e){return send(502,{status:'fetch_failed',errorType:e.name});}
};
