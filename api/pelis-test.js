'use strict';
const {createHash}=require('node:crypto');
const {parsePage}=require('../lib/pelis-scraper');
const TARGETS=Object.freeze({idiotas:'https://pelisplushd.la/pelicula/idiotas','demonio-ancestral':'https://pelisplushd.la/pelicula/demonio-ancestral'});
const decode=s=>String(s).replace(/&amp;/g,'&').replace(/\\\//g,'/').replace(/\\u0026/gi,'&');
function candidate(raw,base){try{const u=new URL(decode(raw),base);if(u.protocol!=='https:'||u.port||u.username||u.password)return null;if(/\.(?:css|js|png|jpe?g|gif|svg|woff2?)(?:$)/i.test(u.pathname))return null;if(!/embed|player|streamwish|hanerix|streamhg|\/e\//i.test(u.href))return null;return u.href;}catch{return null;}}
async function inspect(slug,includeHTML,offset){
 const pageUrl=TARGETS[slug];try{const r=await fetch(pageUrl,{redirect:'manual',signal:AbortSignal.timeout(10000),headers:{Accept:'text/html','User-Agent':'NebulaPlayDiagnostics/0.4'}});
 const parts=[];let size=0,complete=false;if(r.body){const reader=r.body.getReader();try{while(size<1000000){const {done,value}=await reader.read();if(done){complete=true;break;}const p=value.subarray(0,1000000-size);parts.push(Buffer.from(p));size+=p.length;}}finally{await reader.cancel().catch(()=>{});}}
 const bytes=Buffer.concat(parts),html=bytes.toString('utf8');const result={slug,pageUrl,httpStatus:r.status,contentType:r.headers.get('content-type'),sampledBytes:size,possiblyTruncated:!complete,sha256:createHash('sha256').update(bytes).digest('hex'),totalCharacters:html.length,status:r.ok?'page_received':r.status>=300&&r.status<400?'redirect_not_followed':'upstream_http_error',verificationSignals:r.headers.get('cf-mitigated')==='challenge'||/cf-chl-|g-recaptcha|altcha-widget|verify you are human/i.test(html)};
 if(!r.ok||!/text\/html/i.test(result.contentType||''))return result;
 const parsed=parsePage(html,pageUrl);result.meta=parsed.meta;result.title=(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]||'').replace(/<[^>]*>/g,'').trim().slice(0,250);result.parserStatus=parsed.status;result.playerCandidates=parsed.players;
 const candidates=new Set();for(const p of parsed.players||[]){const u=candidate(p.url,pageUrl);if(u)candidates.add(u);}
 for(const m of decode(html).matchAll(/https?:\/\/[^\s"'<>\\`]+/gi)){const u=candidate(m[0],pageUrl);if(u&&candidates.size<30)candidates.add(u);}
 for(const m of html.matchAll(/\b(?:src|data-src|href|data-url|data-embed|data-player)\s*=\s*["']([^"']+)["']/gi)){const u=candidate(m[1],pageUrl);if(u&&candidates.size<30)candidates.add(u);}
 result.relevantUrlCandidates=[...candidates];result.imdbIdCandidates=[...new Set(html.match(/\btt[0-9]{5,12}\b/g)||[])].slice(0,10);
 result.scriptSources=[...html.matchAll(/<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi)].slice(0,25).map(m=>{try{return new URL(decode(m[1]),pageUrl).href;}catch{return null;}}).filter(Boolean);
 const snippets=[];for(const m of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)){if(/embed|player|iframe|streamwish|hanerix|streamhg|atob|servers/i.test(m[1]))snippets.push(m[1].slice(0,1600));if(snippets.length>=8)break;}result.playerScriptSnippets=snippets;
 if(includeHTML){const end=Math.min(offset+20000,html.length);result.offset=offset;result.htmlSample=html.slice(offset,end);result.nextOffset=end<html.length?end:null;}
 return result;
 }catch(e){return {slug,pageUrl,status:'fetch_failed',errorType:e.name};}
}
module.exports=async(req,res)=>{res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');const send=(code,data)=>{res.statusCode=code;res.end(JSON.stringify({diagnosticVersion:2,experimental:true,playbackVerified:false,...data},null,2));};if(req.method!=='GET'){res.setHeader('Allow','GET');return send(405,{error:'only_get'});}
 const q=new URL(req.url,'https://addon.local').searchParams,slug=q.get('slug'),includeHTML=q.get('html')==='1',off=q.get('offset')||'0';if(slug&&!Object.hasOwn(TARGETS,slug))return send(400,{error:'only_two_fixed_movie_pages_allowed'});if(!/^[0-9]{1,7}$/.test(off)||Number(off)>1000000)return send(400,{error:'invalid_offset'});if(includeHTML&&!slug)return send(400,{error:'html_requires_one_fixed_slug'});const selected=slug?[slug]:Object.keys(TARGETS);return send(200,{notice:'Solo dos fichas proporcionadas por el usuario. No ejecuta scripts, resuelve verificaciones ni sigue redirecciones o reproductores. Candidatos, identificadores y fragmentos de script sin validar; no confirman correspondencia ni reproducción. No modifica /pelis-demo ni Nebula. Para HTML paginado use slug, html=1 y offset; cada consulta descarga de nuevo, compare sha256.',pages:await Promise.all(selected.map(s=>inspect(s,includeHTML,Number(off))))});};
