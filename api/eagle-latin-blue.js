'use strict';
const original=require('./pelis-host-test'),sources=require('../lib/eagle-latin-blue-sources');
module.exports=async(req,res)=>{
 const q=new URL(req.url,'https://addon.local').searchParams,raw=req.query?.addonRoute??q.get('addonRoute');let route='';try{route=decodeURIComponent(String(raw||'')).replace(/^\/+|\/+$/g,'');}catch{}
 const match=route.match(/^stream\/movie\/(pelisprobe-live-[a-z0-9]+(?:-[a-z0-9]+)*)\.json$/),audit=route==='diagnostics/hosts.json';
 if(match||audit){
  res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Access-Control-Allow-Origin','*');res.setHeader('Access-Control-Allow-Methods','GET, HEAD, OPTIONS');res.setHeader('Access-Control-Allow-Headers','Content-Type');
  const send=(status,data)=>{res.statusCode=status;res.end(req.method==='HEAD'?undefined:JSON.stringify(data));};
  if(req.method==='OPTIONS'){res.statusCode=204;return res.end();}
  if(!['GET','HEAD'].includes(req.method)){res.setHeader('Allow','GET, HEAD, OPTIONS');return send(405,{streams:[],error:'only_get_or_head'});}
  if(req.method==='HEAD')return send(200,{});
  try{return send(200,audit?await inspectHosts():await sources(match[1]));}catch(e){return send(200,{streams:[],error:e.name==='TimeoutError'||e.name==='AbortError'?'source_timeout':e.name==='TypeError'?'source_fetch_or_parse_failed':e.message});}
 }
 const end=res.end;
 res.end=function(chunk,...args){
  if(chunk!==undefined&&res.statusCode===200){
   try{
    const data=JSON.parse(Buffer.isBuffer(chunk)?chunk.toString('utf8'):String(chunk));let changed=false;
    if(data.id==='org.nebulaplay.pelis.isolated'){
     data.id='org.eaglelatinblue.pelis';data.name='Eagle Latin Blue';data.version='0.5.1';
     data.description='Películas de PelisPlusHD con portada y búsqueda. Hasta 20 candidatos StreamWish/Hanerix por película, ordenados por resolución declarada en HLS. Otros servidores pendientes. No garantiza calidad visual ni todas las fuentes.';
     if(Array.isArray(data.catalogs))data.catalogs=data.catalogs.map(c=>({...c,name:c.id==='pelis-isolated'?'Eagle Latin Blue - Pruebas':c.id==='pelis-live'?'Eagle Latin Blue - Películas':c.name}));changed=true;
    }
    if(Array.isArray(data.streams)){data.streams=data.streams.map(s=>({...s,name:String(s.name||'').startsWith('Pelis - ')?'Eagle Latin Blue - '+s.name.slice(8):s.name}));changed=true;}
    if(changed){chunk=JSON.stringify(data);res.removeHeader('Content-Length');}
   }catch{}
  }
  return end.call(this,chunk,...args);
 };
 return original(req,res);
};
async function inspectHosts(){
 const PAGE='https://pelisplushd.la/pelicula/idiotas',HOSTS=new Set(['vidhidepro.com','voe.sx']),signal=AbortSignal.timeout(22000);
 const decode=s=>String(s||'').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'").replace(/\\\//g,'/');
 const text=s=>decode(s).replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim().slice(0,250);
 function attrs(s){const a={};for(const m of s.matchAll(/([\w-]+)\s*=\s*(["'])([\s\S]*?)\2/g))a[m[1].toLowerCase()]=decode(m[3]);return a;}
 function https(raw,base){try{const u=new URL(decode(raw),base);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port?u:null;}catch{return null;}}
 async function read(raw,max){const u=https(raw,PAGE);if(!u||u.hash||!(u.href===PAGE||HOSTS.has(u.hostname)&&u.pathname.length<=180))throw Error('diagnostic_destination_not_allowed');const r=await fetch(u.href,{redirect:'manual',signal,headers:{Accept:'text/html','User-Agent':'EagleLatinBlueDiagnostics/0.5.1',Referer:'https://pelisplushd.la/'}});const chunks=[];let size=0,complete=false;if(r.body){const reader=r.body.getReader();try{while(size<max){const {done,value}=await reader.read();if(done){complete=true;break;}const p=value.subarray(0,max-size);chunks.push(Buffer.from(p));size+=p.length;}}finally{await reader.cancel().catch(()=>{});}}const html=Buffer.concat(chunks).toString('utf8');return {httpStatus:r.status,contentType:r.headers.get('content-type'),sampledBytes:size,possiblyTruncated:!complete,verificationSignals:r.headers.get('cf-mitigated')==='challenge'||/cf-chl-|g-recaptcha|h-captcha|altcha-widget|verify you are human|confirme que es humano/i.test(html),redirectTarget:r.headers.get('location')?https(r.headers.get('location'),u.href)?.href||null:null,html};}
 function info(r){return {httpStatus:r.httpStatus,contentType:r.contentType,sampledBytes:r.sampledBytes,possiblyTruncated:r.possiblyTruncated,verificationSignals:r.verificationSignals,redirectTarget:r.redirectTarget};}
 const root=await read(PAGE,1000000);const out={diagnosticVersion:1,addonVersion:'0.5.1',pageUrl:PAGE,moviePage:info(root),playbackVerified:false,streamsChanged:false,apiFunctionsAdded:0};if(root.httpStatus!==200||root.possiblyTruncated||root.verificationSignals||!/text\/html/i.test(root.contentType||''))return {...out,status:'movie_page_not_usable',playerChecks:[]};
 const selected=[],seen=new Set();for(const m of root.html.matchAll(/<li\b([^>]*)>([\s\S]*?)<\/li>/gi)){const a=attrs(m[1]);if(!(a.class||'').split(/\s+/).includes('playurl')||!a['data-url'])continue;const u=https(a['data-url'],PAGE);if(!u||u.hash||!HOSTS.has(u.hostname)||u.pathname.length>180||seen.has(u.href))continue;seen.add(u.href);selected.push({url:u.href,server:u.hostname,label:text(a['data-name'])||null});if(selected.length>=4)break;}
 out.playerChecks=await Promise.all(selected.map(async p=>{try{const r=await read(p.url,500000),result={...p,...info(r),title:text(r.html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]),status:'html_received',playbackVerified:false};if(r.verificationSignals)return {...result,status:'verification_required'};if(r.httpStatus>=300&&r.httpStatus<400)return {...result,status:'redirect_not_followed'};if(r.httpStatus!==200||r.possiblyTruncated||!/text\/html/i.test(r.contentType||''))return {...result,status:'player_page_not_usable'};
 const videos=new Set();for(const m of decode(r.html).matchAll(/https:\/\/[^\s"'<>\\`]+/gi)){const u=https(m[0],p.url);if(u&&/\.(?:m3u8|mp4|mpd)$/i.test(u.pathname))videos.add(u.href);if(videos.size>=10)break;}result.directMediaCandidates=[...videos].map(url=>({url,verified:false}));
 result.scriptEvidence=[];for(const m of r.html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)){if(!/(?:m3u8|sources|jwplayer|eval\(|atob|window\.location|location\.href|application\/json)/i.test(m[0]))continue;result.scriptEvidence.push({attributes:m[1].slice(0,300),totalCharacters:m[2].length,truncated:m[2].length>6000,sample:m[2].slice(0,6000)});if(result.scriptEvidence.length>=3)break;}
 result.status=videos.size?'unverified_media_candidates_found':'no_plain_media_url_found';return result;
 }catch(e){return {...p,status:'inspection_failed',error:e.name==='TimeoutError'||e.name==='AbortError'?'diagnostic_timeout':e.name==='TypeError'?'fetch_or_parse_failed':e.message};}}));
 out.status=selected.length?'inspection_complete':'no_target_players_found';out.notice='Solo lectura de la ficha fija Idiotas y hasta cuatro URLs de VidhidePro/Voe anunciadas allí. No sigue redirecciones ni descarga medios, ejecuta scripts o resuelve CAPTCHA. Los enlaces y fragmentos son evidencia sin verificar, no fuentes reproducibles confirmadas. Conserva las fuentes existentes y no añade funciones API.';return out;
}
