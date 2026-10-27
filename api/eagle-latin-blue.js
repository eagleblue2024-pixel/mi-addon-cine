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
  try{return send(200,audit?await inspectHosts():await sources(match[1]));}catch(e){if(audit)return send(200,{diagnosticVersion:2,addonVersion:'0.5.2',stage:'diagnostic',status:'inspection_failed',error:diagnosticError(e),streamsChanged:false,apiFunctionsAdded:0});return send(200,{streams:[],error:e.name==='TimeoutError'||e.name==='AbortError'?'source_timeout':e.name==='TypeError'?'source_fetch_or_parse_failed':e.message});}
 }
 const end=res.end;
 res.end=function(chunk,...args){
  if(chunk!==undefined&&res.statusCode===200){
   try{
    const data=JSON.parse(Buffer.isBuffer(chunk)?chunk.toString('utf8'):String(chunk));let changed=false;
    if(data.id==='org.nebulaplay.pelis.isolated'){
     data.id='org.eaglelatinblue.pelis';data.name='Eagle Latin Blue';data.version='0.5.2';
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
function diagnosticError(e){return e.name==='TimeoutError'||e.name==='AbortError'?'request_timeout':e.name==='TypeError'?'network_or_parse_error':e.message==='diagnostic_deadline'?'diagnostic_deadline':'inspection_error';}
async function inspectHosts(){
 const PAGE='https://pelisplushd.la/pelicula/idiotas',HOSTS=new Set(['vidhidepro.com','voe.sx']),started=Date.now(),deadline=started+22000;
 const decode=s=>String(s||'').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'").replace(/\\\//g,'/');
 const text=s=>decode(s).replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim().slice(0,250);
 function attrs(s){const a={};for(const m of s.matchAll(/([\w-]+)\s*=\s*(["'])([\s\S]*?)\2/g))a[m[1].toLowerCase()]=decode(m[3]);return a;}
 function https(raw,base){try{const u=new URL(decode(raw),base);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port?u:null;}catch{return null;}}
 async function read(raw,max){const u=https(raw,PAGE);if(!u||u.hash||!(u.href===PAGE||HOSTS.has(u.hostname)&&u.pathname.length<=180))throw Error('diagnostic_destination_not_allowed');const remaining=deadline-Date.now();if(remaining<=0)throw Error('diagnostic_deadline');const requestStarted=Date.now(),signal=AbortSignal.timeout(Math.min(7000,remaining));const r=await fetch(u.href,{redirect:'manual',signal,headers:{Accept:'text/html, application/vnd.apple.mpegurl, text/plain','User-Agent':'EagleLatinBlue/0.5',Referer:u.href===PAGE?'https://pelisplushd.la/':PAGE}});const chunks=[];let size=0,complete=false;if(r.body){const reader=r.body.getReader();try{while(size<max){const {done,value}=await reader.read();if(done){complete=true;break;}const p=value.subarray(0,max-size);chunks.push(Buffer.from(p));size+=p.length;}}finally{await reader.cancel().catch(()=>{});}}const html=Buffer.concat(chunks).toString('utf8');return {httpStatus:r.status,contentType:r.headers.get('content-type'),sampledBytes:size,possiblyTruncated:!complete,elapsedMs:Date.now()-requestStarted,verificationSignals:r.headers.get('cf-mitigated')==='challenge'||/cf-chl-|g-recaptcha|h-captcha|altcha-widget|verify you are human|confirme que es humano/i.test(html),redirectTarget:r.headers.get('location')?https(r.headers.get('location'),u.href)?.href||null:null,html};}
 function info(r){return {httpStatus:r.httpStatus,contentType:r.contentType,sampledBytes:r.sampledBytes,possiblyTruncated:r.possiblyTruncated,elapsedMs:r.elapsedMs,verificationSignals:r.verificationSignals,redirectTarget:r.redirectTarget};}
 const out={diagnosticVersion:2,addonVersion:'0.5.2',pageUrl:PAGE,stage:'movie_page',playbackVerified:false,streamsChanged:false,apiFunctionsAdded:0,limits:{perReadMs:7000,totalBudgetMs:22000,movieAttempts:2,players:4},movieAttempts:[],playerChecks:[]};let root;
 for(let attempt=1;attempt<=2;attempt++){const attemptStarted=Date.now();try{root=await read(PAGE,1000000);out.movieAttempts.push({attempt,httpStatus:root.httpStatus,elapsedMs:Date.now()-attemptStarted});break;}catch(e){const error=diagnosticError(e);out.movieAttempts.push({attempt,error,elapsedMs:Date.now()-attemptStarted});if(!['request_timeout','network_or_parse_error'].includes(error)||attempt===2)return {...out,status:error==='request_timeout'?'movie_page_timeout':'movie_page_read_failed',error,elapsedMs:Date.now()-started};}}
 out.moviePage=info(root);if(root.httpStatus!==200||root.possiblyTruncated||root.verificationSignals||!/text\/html/i.test(root.contentType||''))return {...out,status:root.verificationSignals?'movie_page_verification_required':root.httpStatus>=300&&root.httpStatus<400?'movie_page_redirect_not_followed':'movie_page_not_usable',elapsedMs:Date.now()-started};
 const selected=[],seen=new Set();for(const m of root.html.matchAll(/<li\b([^>]*)>([\s\S]*?)<\/li>/gi)){const a=attrs(m[1]);if(!(a.class||'').split(/\s+/).includes('playurl')||!a['data-url'])continue;const u=https(a['data-url'],PAGE);if(!u||u.hash||!HOSTS.has(u.hostname)||u.pathname.length>180||seen.has(u.href))continue;seen.add(u.href);selected.push({url:u.href,server:u.hostname,label:text(a['data-name'])||null});if(selected.length>=4)break;}
 out.stage='player_pages';out.playerChecks=await Promise.all(selected.map(async p=>{const playerStarted=Date.now();try{const r=await read(p.url,500000),result={...p,...info(r),stage:'player_page',title:text(r.html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]),status:'html_received',playbackVerified:false};if(r.verificationSignals)return {...result,status:'verification_required'};if(r.httpStatus>=300&&r.httpStatus<400)return {...result,status:'redirect_not_followed'};if(r.httpStatus!==200||r.possiblyTruncated||!/text\/html/i.test(r.contentType||''))return {...result,status:'player_page_not_usable'};
 const videos=new Set();for(const m of decode(r.html).matchAll(/https:\/\/[^\s"'<>\\`]+/gi)){const u=https(m[0],p.url);if(u&&/\.(?:m3u8|mp4|mpd)$/i.test(u.pathname))videos.add(u.href);if(videos.size>=10)break;}result.directMediaCandidates=[...videos].map(url=>({url,verified:false}));
 result.scriptEvidence=[];for(const m of r.html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)){if(!/(?:m3u8|sources|jwplayer|eval\(|atob|window\.location|location\.href|application\/json)/i.test(m[0]))continue;result.scriptEvidence.push({attributes:m[1].slice(0,300),totalCharacters:m[2].length,truncated:m[2].length>6000,sample:m[2].slice(0,6000)});if(result.scriptEvidence.length>=3)break;}
 result.status=videos.size?'unverified_media_candidates_found':'no_plain_media_url_found';return result;
 }catch(e){return {...p,stage:'player_page',status:'inspection_failed',error:diagnosticError(e),elapsedMs:Date.now()-playerStarted};}}));
 out.status=selected.length?'inspection_complete':'no_target_players_found';out.elapsedMs=Date.now()-started;out.notice='Diagnóstico de lectura de Idiotas y hasta cuatro reproductores VidhidePro/Voe. Siete segundos por lectura, presupuesto total 22 segundos, un solo reintento de ficha ante fallo de red o timeout; no reintenta bloqueos HTTP o CAPTCHA. No sigue redirecciones, ejecuta scripts ni descarga medios. Evidencia sin verificar, no fuentes nuevas. Conserva reproducción y funciones API existentes.';return out;
}
