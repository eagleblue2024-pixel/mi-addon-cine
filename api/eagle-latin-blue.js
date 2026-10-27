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
  try{return send(200,audit?await inspectHosts():await sources(match[1]));}catch(e){if(audit)return send(200,{diagnosticVersion:8,addonVersion:'0.5.2',stage:'diagnostic',status:'inspection_failed',error:diagnosticError(e),streamsChanged:false,apiFunctionsAdded:0});return send(200,{streams:[],error:e.name==='TimeoutError'||e.name==='AbortError'?'source_timeout':e.name==='TypeError'?'source_fetch_or_parse_failed':e.message});}
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
 const manifestHosts=new Map([
  ['https://vidhidepro.com/v/tm9efwej4bv8',{hls2:'wt4pjiive9agjpl.dramiyos-cdn.com',hls3:'wt4pjiive9agjpl.starlakecreativeworks.sbs'}],
  ['https://vidhidepro.com/v/h7lvwnfyrtnj',{hls2:'yxqc9c2vqj7vepbl.acek-cdn.com',hls3:'yxqc9c2vqj7vepbl.riverrundesigncollect.store'}]
 ]);
 const initialPlayers=new Set([...destinations.keys()].slice(0,4));
 const allowed=new Set([PAGE,...destinations.keys(),...destinations.values()]);
 const decode=s=>String(s||'').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'").replace(/\\\//g,'/');
 const text=s=>decode(s).replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim().slice(0,250);
 function attrs(s){const a={};for(const m of s.matchAll(/([\w-]+)\s*=\s*(["'])([\s\S]*?)\2/g))a[m[1].toLowerCase()]=decode(m[3]);return a;}
 function https(raw,base){try{const u=new URL(decode(raw),base);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port?u:null;}catch{return null;}}
 function manifestAllowed(u,context){
  const hosts=manifestHosts.get(context);if(!u||!hosts||u.hash||u.search.length>2048||u.pathname.length>256||!/^[A-Za-z0-9_./-]+$/.test(u.pathname))return false;
  const code=context.split('/').pop();if(!u.pathname.split('/').includes(code+'_n'))return false;
  return u.hostname===hosts.hls2&&u.pathname.endsWith('/master.m3u8')||u.hostname===hosts.hls3&&u.pathname.endsWith('/master.txt');
 }
 async function read(raw,max,manifestContext=null){
  const u=https(raw,PAGE);if(!u||!(manifestContext?manifestAllowed(u,manifestContext):allowed.has(u.href)))throw Error('diagnostic_destination_not_allowed');
  const remaining=deadline-Date.now();if(remaining<=0)throw Error('diagnostic_deadline');
  const requestStarted=Date.now(),signal=AbortSignal.timeout(Math.min(7000,remaining));
  const referer=manifestContext?destinations.get(destinations.get(manifestContext)):u.href===PAGE?'https://pelisplushd.la/':PAGE;
  const r=await fetch(u.href,{redirect:'manual',signal,headers:{Accept:'text/html, application/vnd.apple.mpegurl, text/plain','User-Agent':'EagleLatinBlue/0.5',Referer:referer}});
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
 function unpackLinks(script){
  if(script.length>12000)throw Error('packed_script_too_large');
  const m=script.match(/\}\('((?:\\.|[^'\\])*)',36,([0-9]{1,4}),'((?:\\.|[^'\\])*)'\.split\('\|'\)\)/);
  if(!m)throw Error('packed_format_not_supported');
  const unescape=s=>s.replace(/\\(['\\])/g,'$1'),count=Number(m[2]),dict=unescape(m[3]).split('|');
  if(!count||count>1000||dict.length!==count)throw Error('packed_dictionary_not_supported');
  const unpacked=unescape(m[1]).replace(/\b[0-9a-z]+\b/g,t=>{const i=parseInt(t,36);return i<dict.length&&dict[i]?dict[i]:t;});
  const obj=unpacked.match(/\bvar\s+links\s*=\s*(\{[^;]*?\});/);if(!obj)throw Error('packed_links_missing');
  return JSON.parse(obj[1]);
 }
 function summarizeReferences(body,baseUrl){
  const base=new URL(baseUrl),references=[],tagCounts=Object.create(null);let count=0,pendingVariant=false;
  const describe=raw=>{
   const relative=!/^[A-Za-z][A-Za-z0-9+.-]*:/.test(raw)&&!raw.startsWith('//');
   if(raw.includes('{$'))return {relative,unresolvedVariables:true,requested:false};
   try{
    const u=new URL(raw,base),web=['https:','http:'].includes(u.protocol);
    return {relative,protocol:u.protocol,host:web?u.hostname:null,sameOrigin:web&&u.origin===base.origin,sameDirectory:web&&u.origin===base.origin&&u.pathname.startsWith(base.pathname.slice(0,base.pathname.lastIndexOf('/')+1)),extension:u.pathname.match(/\.([A-Za-z0-9]{1,8})$/)?.[1]||null,queryPresent:Boolean(u.search),fragmentPresent:Boolean(u.hash),credentialsPresent:Boolean(u.username||u.password),nonDefaultPort:Boolean(u.port),requested:false};
   }catch{return {relative,invalidUrl:true,requested:false};}
  };
  const add=(entry,raw)=>{count++;if(references.length<40)references.push({...entry,target:describe(raw)});};
  for(const rawLine of body.split(/\r?\n/)){
   const line=rawLine.trim();if(!line)continue;
   if(!line.startsWith('#')){add({kind:pendingVariant?'variant_playlist':'untagged_reference'},line);pendingVariant=false;continue;}
   const tag=line.split(':',1)[0];if(!/^#EXT[A-Z0-9-]*$/.test(tag))continue;
   if(Object.hasOwn(tagCounts,tag)||Object.keys(tagCounts).length<50)tagCounts[tag]=(tagCounts[tag]||0)+1;
   if(tag==='#EXT-X-STREAM-INF')pendingVariant=true;
   const colon=line.indexOf(':');if(colon<0)continue;
   const a=Object.create(null);
   for(const m of line.slice(colon+1).matchAll(/([A-Z0-9-]+)\s*=\s*("[^"]*"|[^,]*)/g))a[m[1]]=m[2].startsWith('"')?m[2].slice(1,-1):m[2].trim();
   const metadata={};for(const key of ['TYPE','GROUP-ID','NAME','LANGUAGE','DEFAULT','AUTOSELECT','METHOD','KEYFORMAT','AUDIO','SUBTITLES','CLOSED-CAPTIONS'])if(Object.hasOwn(a,key))metadata[key]=a[key].replace(/[\u0000-\u001f\u007f]/g,'').slice(0,120);
   for(const key of Object.keys(a))if(key==='URI'||key.endsWith('-URI'))add({kind:'uri_attribute',tag,attribute:key,metadata},a[key]);
  }
  return {tagCounts,referenceCount:count,references,referencesTruncated:count>references.length,resourceRequests:0,headerRequirements:'not_determined_by_static_inspection',urlDetails:'hosts_and_structure_only_paths_queries_and_credentials_omitted'};
 }
 async function checkManifest(kind,raw,p){
  const base={kind,playbackVerified:false,segmentsRequested:0};
  const u=typeof raw==='string'?https(raw,p.url):null;
  if(!manifestAllowed(u,p.url)||u.hostname!==manifestHosts.get(p.url)?.[kind])return {...base,status:'manifest_destination_not_allowed'};
  base.host=u.hostname;base.file=u.pathname.split('/').pop();
  try{
   const r=await read(u.href,262144,p.url);
   const result={...base,httpStatus:r.httpStatus,contentType:r.contentType,sampledBytes:r.sampledBytes,possiblyTruncated:r.possiblyTruncated,elapsedMs:r.elapsedMs};
   if(r.verificationSignals)return {...result,status:'verification_required'};
   if(r.httpStatus>=300&&r.httpStatus<400)return {...result,status:'manifest_redirect_not_followed'};
   if(r.httpStatus!==200||r.possiblyTruncated)return {...result,status:'manifest_not_usable'};
   if(!/^\uFEFF?\s*#EXTM3U(?:\s|$)/.test(r.html))return {...result,status:'not_hls'};
   const declarations=r.html.split(/\r?\n/).filter(line=>/^\s*#EXT-X-STREAM-INF:/.test(line));
   const variants=declarations.slice(0,20).map(line=>{
    const resolution=line.match(/(?:[:,])\s*RESOLUTION=([0-9]{1,5})x([0-9]{1,5})(?:,|\s*$)/i),bandwidth=line.match(/(?:[:,])\s*BANDWIDTH=([0-9]{1,10})(?:,|\s*$)/i);
    return {width:resolution?Number(resolution[1]):null,height:resolution?Number(resolution[2]):null,bandwidth:bandwidth?Number(bandwidth[1]):null};
   });
   const mediaPlaylist=/#EXTINF:/.test(r.html);
   return {...result,status:declarations.length||mediaPlaylist?'hls_structure_observed_playback_unverified':'hls_header_only_or_unrecognized',playlistType:declarations.length?'master':mediaPlaylist?'media':'unknown',declaredVariantCount:declarations.length,variants,qualityBasis:'playlist_declarations_only',uriAttributesPresent:/\bURI\s*=/.test(r.html),referenceAnalysis:summarizeReferences(r.html,u.href)};
  }catch(e){return {...base,status:'manifest_inspection_failed',error:diagnosticError(e)};}
 }
 const out={diagnosticVersion:8,addonVersion:'0.5.2',pageUrl:PAGE,stage:'movie_page',playbackVerified:false,streamsChanged:false,apiFunctionsAdded:0,limits:{perReadMs:7000,totalBudgetMs:22000,movieAttempts:2,players:4,redirectHopsPerPlayer:2,voeRedirectHopsPerPlayer:1,manifestsPerVidhidePlayer:2,manifestBytes:262144,manifestRedirectHops:0,segments:0},movieAttempts:[],playerChecks:[]};let root;
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
   result.status=videos.size?'unverified_media_candidates_found':'no_plain_media_url_found';
   if(manifestHosts.has(p.url)){
    try{
     const packed=scripts.find(s=>s.signals.includes('packed_or_encoded'));
     if(!packed)throw Error('packed_script_missing');
     const links=unpackLinks(packed.body);
     result.packedExtraction={status:'links_extracted_statically',scriptIndex:packed.index,fields:['hls2','hls3'].filter(k=>typeof links[k]==='string')};
     result.manifestChecks=await Promise.all(['hls2','hls3'].map(k=>checkManifest(k,links[k],p)));
     result.status='manifest_inspection_complete_playback_unverified';
    }catch(e){result.packedExtraction={status:'extraction_failed',error:diagnosticError(e)};}
   }
   return result;
  }catch(e){return {...p,finalUrl:current,chain,stage:'player_page',status:'inspection_failed',error:diagnosticError(e),elapsedMs:Date.now()-playerStarted,playbackVerified:false};}
 }));
 out.status=selected.length?'inspection_complete':'no_target_players_found';out.elapsedMs=Date.now()-started;
 out.notice='Diagnóstico de Idiotas: páginas y destinos exactos observados, dos saltos HTTP en VidhidePro y uno en Voe. Se detiene ante verificación. Extrae el objeto links por sustitución estática, sin ejecutar JavaScript. Solo permite los cuatro hosts de manifiestos observados, vinculados al vídeo y archivo master; hasta dos manifiestos de 262144 bytes por vídeo Vidhide, sin seguir redirecciones ni solicitar variantes, segmentos o claves. Siete segundos por lectura y 22 segundos totales. No añade fuentes ni cambia reproducción. La estructura HLS y resolución declarada no prueban reproducción ni calidad visual. Evidencia de scripts limitada a 18000 caracteres por reproductor. Resume hasta 40 referencias HLS sin solicitarlas; omite rutas, consultas y credenciales de esas referencias. Las cabeceras requeridas no se determinan por inspección estática.';
 return out;
}
