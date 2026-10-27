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
  try{return send(200,audit?await inspectHosts():await sources(match[1]));}catch(e){if(audit)return send(200,{diagnosticVersion:6,addonVersion:'0.5.2',stage:'diagnostic',status:'inspection_failed',error:diagnosticError(e),streamsChanged:false,apiFunctionsAdded:0});return send(200,{streams:[],error:e.name==='TimeoutError'||e.name==='AbortError'?'source_timeout':e.name==='TypeError'?'source_fetch_or_parse_failed':e.message});}
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
 const PAGE='https://pelisplushd.la/pelicula/idiotas',started=Date.now(),deadline=started+22000;
 const destinations=new Map([
  ['https://vidhidepro.com/v/tm9efwej4bv8','https://vidhidefast.com/v/tm9efwej4bv8'],
  ['https://vidhidepro.com/v/h7lvwnfyrtnj','https://vidhidefast.com/v/h7lvwnfyrtnj'],
  ['https://voe.sx/e/hhvcphfmwecr','https://ashleyhardat.com/e/hhvcphfmwecr'],
  ['https://voe.sx/e/3lrlv7lusyuu','https://ashleyhardat.com/e/3lrlv7lusyuu'],
  ['https://vidhidefast.com/v/tm9efwej4bv8','https://callistanise.com/v/tm9efwej4bv8'],
  ['https://vidhidefast.com/v/h7lvwnfyrtnj','https://callistanise.com/v/h7lvwnfyrtnj']
 ]);
 const initialPlayers=new Set([...destinations.keys()].slice(0,4));
 const allowed=new Set([PAGE,...destinations.keys(),...destinations.values()]);
 const decode=s=>String(s||'').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'").replace(/\\\//g,'/');
 const text=s=>decode(s).replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim().slice(0,250);
 function attrs(s){const a={};for(const m of s.matchAll(/([\w-]+)\s*=\s*(["'])([\s\S]*?)\2/g))a[m[1].toLowerCase()]=decode(m[3]);return a;}
 function https(raw,base){try{const u=new URL(decode(raw),base);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port?u:null;}catch{return null;}}
 async function read(raw,max){
  const u=https(raw,PAGE);if(!u||!allowed.has(u.href))throw Error('diagnostic_destination_not_allowed');
  const remaining=deadline-Date.now();if(remaining<=0)throw Error('diagnostic_deadline');
  const requestStarted=Date.now(),signal=AbortSignal.timeout(Math.min(7000,remaining));
  const r=await fetch(u.href,{redirect:'manual',signal,headers:{Accept:'text/html, application/vnd.apple.mpegurl, text/plain','User-Agent':'EagleLatinBlue/0.5',Referer:u.href===PAGE?'https://pelisplushd.la/':PAGE}});
  const chunks=[];let size=0,complete=false;
  if(r.body){const reader=r.body.getReader();try{while(size<max){const {done,value}=await reader.read();if(done){complete=true;break;}const p=value.subarray(0,max-size);chunks.push(Buffer.from(p));size+=p.length;}}finally{await reader.cancel().catch(()=>{});}}
  const html=Buffer.concat(chunks).toString('utf8'),location=r.headers.get('location');
  return {httpStatus:r.status,contentType:r.headers.get('content-type'),sampledBytes:size,possiblyTruncated:!complete,elapsedMs:Date.now()-requestStarted,verificationSignals:r.headers.get('cf-mitigated')==='challenge'||/cf-chl-|g-recaptcha|h-captcha|altcha-widget|verify you are human|confirme que es humano/i.test(html),redirectTarget:location?https(location,u.href)?.href||null:null,html};
 }
 function info(r){return {httpStatus:r.httpStatus,contentType:r.contentType,sampledBytes:r.sampledBytes,possiblyTruncated:r.possiblyTruncated,elapsedMs:r.elapsedMs,verificationSignals:r.verificationSignals,redirectTarget:r.redirectTarget};}
 function usable(r){return r.httpStatus===200&&!r.possiblyTruncated&&!r.verificationSignals&&/text\/html/i.test(r.contentType||'');}
 function literalRedirect(html,base){
  const targets=new Set();
  for(const script of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)){
   for(const m of script[1].matchAll(/window\.location\.href\s*=\s*(['"])(https:\/\/[^'"\s<>]+)\1\s*;/g)){
    const u=https(m[2],base);if(u)targets.add(u.href);
   }
  }
  return targets.size===1?[...targets][0]:null;
 }
 const out={diagnosticVersion:6,addonVersion:'0.5.2',pageUrl:PAGE,stage:'movie_page',playbackVerified:false,streamsChanged:false,apiFunctionsAdded:0,limits:{perReadMs:7000,totalBudgetMs:22000,movieAttempts:2,players:4,redirectHopsPerPlayer:2,voeRedirectHopsPerPlayer:1},movieAttempts:[],playerChecks:[]};let root;
 for(let attempt=1;attempt<=2;attempt++){
  const attemptStarted=Date.now();
  try{root=await read(PAGE,1000000);out.movieAttempts.push({attempt,httpStatus:root.httpStatus,elapsedMs:Date.now()-attemptStarted});break;}
  catch(e){const error=diagnosticError(e);out.movieAttempts.push({attempt,error,elapsedMs:Date.now()-attemptStarted});if(!['request_timeout','network_or_parse_error'].includes(error)||attempt===2)return {...out,status:error==='request_timeout'?'movie_page_timeout':'movie_page_read_failed',error,elapsedMs:Date.now()-started};}
 }
 out.moviePage=info(root);
 if(!usable(root))return {...out,status:root.verificationSignals?'movie_page_verification_required':root.httpStatus>=300&&root.httpStatus<400?'movie_page_redirect_not_followed':'movie_page_not_usable',elapsedMs:Date.now()-started};
 const selected=[],seen=new Set();
 for(const m of root.html.matchAll(/<li\b([^>]*)>([\s\S]*?)<\/li>/gi)){
  const a=attrs(m[1]);if(!(a.class||'').split(/\s+/).includes('playurl')||!a['data-url'])continue;
  const u=https(a['data-url'],PAGE);if(!u||!initialPlayers.has(u.href)||seen.has(u.href))continue;
  seen.add(u.href);selected.push({url:u.href,server:u.hostname,label:text(a['data-name'])||null});if(selected.length>=4)break;
 }
 out.stage='player_pages';
 out.playerChecks=await Promise.all(selected.map(async p=>{
  const playerStarted=Date.now(),chain=[],maxHops=p.server==='vidhidepro.com'?2:1;let current=p.url,redirectKind=null;
  try{
   let r=await read(current,500000);chain.push({url:current,...info(r)});
   const snapshot=status=>({...p,...info(r),finalUrl:current,redirectKind,chain,stage:'player_page',title:text(r.html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]),status,playbackVerified:false});
   for(let hops=0;;hops++){
    if(r.verificationSignals)return snapshot('verification_required');
    if(r.possiblyTruncated)return snapshot('player_page_not_usable');
    const httpRedirect=r.httpStatus>=300&&r.httpStatus<400;
    const literal=usable(r)?literalRedirect(r.html,current):null;
    const target=httpRedirect?r.redirectTarget:hops===0?literal:null;
    if(!target){
     if(httpRedirect)return snapshot('redirect_not_followed');
     if(literal)return snapshot('redirect_hop_limit');
     break;
    }
    if(hops>=maxHops)return snapshot('redirect_hop_limit');
    if(target!==destinations.get(current))return snapshot('redirect_destination_not_allowed');
    redirectKind=httpRedirect?'http':'static_javascript_literal';current=target;
    r=await read(current,500000);chain.push({url:current,...info(r)});
   }
   if(!usable(r))return snapshot('player_page_not_usable');
   const result=snapshot('html_received'),videos=new Set();
   for(const m of decode(r.html).matchAll(/https:\/\/[^\s"'<>\\`]+/gi)){const u=https(m[0],current);if(u&&/\.(?:m3u8|mp4|mpd)$/i.test(u.pathname))videos.add(u.href);if(videos.size>=10)break;}
   result.directMediaCandidates=[...videos].map(url=>({url,verified:false}));
   const scripts=[];let totalScripts=0;
   for(const m of r.html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)){
    const index=totalScripts++,body=m[2];if(!body.trim())continue;
    let score=0;const signals=[];
    const mark=(pattern,weight,label)=>{if(pattern.test(body)){score+=weight;signals.push(label);}};
    mark(/\.setup\s*\(/i,100,'player_setup');
    mark(/['"]?sources['"]?\s*[:=]/i,80,'sources_config');
    mark(/['"]?file['"]?\s*[:=]/i,60,'file_config');
    mark(/m3u8|\.mp4\b|\.mpd\b/i,40,'media_marker');
    mark(/eval\s*\(|atob\s*\(|function\s*\(\s*p\s*,\s*a\s*,\s*c\s*,\s*k/i,30,'packed_or_encoded');
    if(/application\/json/i.test(m[1])){score+=10;signals.push('json_payload');}
    mark(/jwplayer/i,5,'player_reference');
    if(!score)continue;
    scripts.push({index,score,signals,attributes:m[1].slice(0,300),totalCharacters:body.length,body});
   }
   scripts.sort((a,b)=>b.score-a.score||a.index-b.index);
   result.scriptEvidence=scripts.slice(0,3).map(({body,...entry},rank)=>{const sampleLimitCharacters=rank===0?12000:3000;return {...entry,sampleLimitCharacters,truncated:body.length>sampleLimitCharacters,sample:body.slice(0,sampleLimitCharacters)};});
   result.scriptScan={totalScripts,eligibleScripts:scripts.length,selectedScripts:result.scriptEvidence.length,sampleLimitCharacters:12000,secondarySampleLimitCharacters:3000,totalSampleBudgetCharacters:18000,selection:'weighted_static_markers_not_execution'};
   result.status=videos.size?'unverified_media_candidates_found':'no_plain_media_url_found';return result;
  }catch(e){return {...p,finalUrl:current,chain,stage:'player_page',status:'inspection_failed',error:diagnosticError(e),elapsedMs:Date.now()-playerStarted,playbackVerified:false};}
 }));
 out.status=selected.length?'inspection_complete':'no_target_players_found';out.elapsedMs=Date.now()-started;
 out.notice='Diagnóstico de Idiotas limitado a cuatro URLs originales y sus destinos exactos observados. Hasta dos saltos HTTP en VidhidePro y uno en Voe; el literal JavaScript solo se considera en la página original, sin ejecutarlo. Cada salto exige la pareja exacta origen-destino autorizada. Se detiene ante verificación humana. No envía cookies ni tokens, descarga medios ni añade fuentes. Siete segundos por lectura, presupuesto total 22 segundos. No reintenta bloqueos HTTP o CAPTCHA. Reproducción sin cambios. Evidencia estática: prioriza configuración y código empaquetado; una muestra de hasta 12000 caracteres y otras dos de hasta 3000, máximo total 18000 por reproductor, sin solicitar scripts externos.';
 return out;
}
