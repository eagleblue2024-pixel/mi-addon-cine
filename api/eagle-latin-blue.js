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
  try{return send(200,audit?await inspectHosts():await sources(match[1]));}catch(e){if(audit)return send(200,{diagnosticVersion:9,addonVersion:'0.5.2',stage:'diagnostic',status:'inspection_failed',error:diagnosticError(e),streamsChanged:false,apiFunctionsAdded:0});return send(200,{streams:[],error:e.name==='TimeoutError'||e.name==='AbortError'?'source_timeout':e.name==='TypeError'?'source_fetch_or_parse_failed':e.message});}
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
 const players=[{code:'tm9efwej4bv8',label:'Español Latino'},{code:'h7lvwnfyrtnj',label:'Subtitulado'}].map(p=>({...p,url:'https://vidhidepro.com/v/'+p.code,chainUrls:['https://vidhidepro.com/v/'+p.code,'https://vidhidefast.com/v/'+p.code,'https://callistanise.com/v/'+p.code]}));
 const pageUrls=new Set([PAGE,...players.flatMap(p=>p.chainUrls)]);
 function url(raw,base=PAGE){try{const u=new URL(raw,base);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&!u.hash?u:null;}catch{return null;}}
 function masterAllowed(u,code){return Boolean(u&&players.some(p=>p.code===code)&&/^[a-z0-9]{8,32}\.(?:acek-cdn|dramiyos-cdn)\.com$/.test(u.hostname)&&u.search.length<=2048&&new RegExp('^/hls2/[0-9]{2}/[0-9]{1,8}/'+code+'_n/master\\.m3u8$').test(u.pathname));}
 function childAllowed(u,master,code){
  if(!u||!masterAllowed(master,code)||u.search.length>2048||u.origin!==master.origin)return false;
  const directory=master.pathname.slice(0,master.pathname.lastIndexOf('/')+1);
  return u.pathname.startsWith(directory)&&/^[A-Za-z0-9_-]{1,100}\.m3u8$/.test(u.pathname.slice(directory.length))&&u.pathname!==master.pathname;
 }
 async function read(raw,max,context=null){
  const u=url(raw);const valid=u&&(context?context.kind==='master'?masterAllowed(u,context.code):context.kind==='child'&&childAllowed(u,context.master,context.code):pageUrls.has(u.href));
  if(!valid)throw Error('diagnostic_destination_not_allowed');
  const remaining=deadline-Date.now();if(remaining<=0)throw Error('diagnostic_deadline');
  const t=Date.now(),signal=AbortSignal.timeout(Math.min(7000,remaining));
  const referer=context?'https://callistanise.com/v/'+context.code:u.href===PAGE?'https://pelisplushd.la/':PAGE;
  const r=await fetch(u.href,{redirect:'manual',signal,headers:{Accept:'text/html, application/vnd.apple.mpegurl, text/plain','User-Agent':'EagleLatinBlue/0.5',Referer:referer}});
  const chunks=[];let size=0,complete=false;
  if(r.body){const reader=r.body.getReader();try{while(size<max){const {done,value}=await reader.read();if(done){complete=true;break;}const part=value.subarray(0,max-size);chunks.push(Buffer.from(part));size+=part.length;}}finally{await reader.cancel().catch(()=>{});}}
  const body=Buffer.concat(chunks).toString('utf8');
  return {body,httpStatus:r.status,contentType:r.headers.get('content-type'),sampledBytes:size,possiblyTruncated:!complete,elapsedMs:Date.now()-t,verificationSignals:r.headers.get('cf-mitigated')==='challenge'||/cf-chl-|g-recaptcha|h-captcha|altcha-widget|verify you are human|confirm you(?:&#039;|')?re human|confirme que es humano/i.test(body),location:r.headers.get('location')};
 }
 function info(r){return {httpStatus:r.httpStatus,contentType:r.contentType,sampledBytes:r.sampledBytes,possiblyTruncated:r.possiblyTruncated,elapsedMs:r.elapsedMs,verificationSignals:r.verificationSignals};}
 function responseProblem(r){return r.verificationSignals?'verification_required':r.httpStatus>=300&&r.httpStatus<400?'redirect_not_followed':r.httpStatus!==200?'upstream_http_error':r.possiblyTruncated?'response_incomplete':null;}
 function attributes(s){const a=Object.create(null);for(const m of s.matchAll(/([A-Z0-9-]+)\s*=\s*("[^"]*"|[^,]*)/g))a[m[1]]=m[2].startsWith('"')?m[2].slice(1,-1):m[2].trim();return a;}
 function summarizeReferences(body,baseUrl){
  const base=new URL(baseUrl),references=[],tagCounts=Object.create(null),keyDeclarations=[];let count=0,pendingVariant=false;
  const describe=raw=>{
   const relative=!/^[A-Za-z][A-Za-z0-9+.-]*:/.test(raw)&&!raw.startsWith('//');
   if(raw.includes('{$'))return {relative,unresolvedVariables:true,requested:false};
   try{const u=new URL(raw,base),web=['https:','http:'].includes(u.protocol);return {relative,protocol:u.protocol,host:web?u.hostname:null,sameOrigin:web&&u.origin===base.origin,sameDirectory:web&&u.origin===base.origin&&u.pathname.startsWith(base.pathname.slice(0,base.pathname.lastIndexOf('/')+1)),extension:u.pathname.match(/\.([A-Za-z0-9]{1,8})$/)?.[1]||null,queryPresent:Boolean(u.search),fragmentPresent:Boolean(u.hash),credentialsPresent:Boolean(u.username||u.password),nonDefaultPort:Boolean(u.port),requested:false};}catch{return {relative,invalidUrl:true,requested:false};}
  };
  const add=(entry,raw)=>{count++;if(references.length<40)references.push({...entry,target:describe(raw)});};
  for(const rawLine of body.split(/\r?\n/)){
   const line=rawLine.trim();if(!line)continue;
   if(!line.startsWith('#')){add({kind:pendingVariant?'variant_playlist':'untagged_reference'},line);pendingVariant=false;continue;}
   const tag=line.split(':',1)[0];if(!/^#EXT[A-Z0-9-]*$/.test(tag))continue;
   if(Object.hasOwn(tagCounts,tag)||Object.keys(tagCounts).length<50)tagCounts[tag]=(tagCounts[tag]||0)+1;
   if(tag==='#EXT-X-STREAM-INF')pendingVariant=true;
   const colon=line.indexOf(':');if(colon<0)continue;
   const a=attributes(line.slice(colon+1)),metadata={};
   for(const key of ['TYPE','GROUP-ID','NAME','LANGUAGE','DEFAULT','AUTOSELECT','METHOD','KEYFORMAT','AUDIO','SUBTITLES','CLOSED-CAPTIONS'])if(Object.hasOwn(a,key))metadata[key]=a[key].replace(/[\u0000-\u001f\u007f]/g,'').slice(0,120);
   if((tag==='#EXT-X-KEY'||tag==='#EXT-X-SESSION-KEY')&&keyDeclarations.length<20)keyDeclarations.push({tag,metadata,uriPresent:Object.hasOwn(a,'URI')});
   for(const key of Object.keys(a))if(key==='URI'||key.endsWith('-URI'))add({kind:'uri_attribute',tag,attribute:key,metadata},a[key]);
  }
  return {tagCounts,keyDeclarations,referenceCount:count,references,referencesTruncated:count>references.length,resourceRequests:0,headerRequirements:'not_determined_by_static_inspection',urlDetails:'hosts_and_structure_only_paths_queries_and_credentials_omitted'};
 }
 function hlsSummary(r,u){
  const result={...info(r),host:u.hostname,playbackVerified:false,segmentsRequested:0,keysRequested:0};
  const problem=responseProblem(r);if(problem)return {...result,status:problem};
  if(!/^\uFEFF?\s*#EXTM3U(?:\s|$)/.test(r.body))return {...result,status:'not_hls'};
  const lines=r.body.split(/\r?\n/),declarations=lines.filter(line=>/^\s*#EXT-X-STREAM-INF:/.test(line));
  const variants=declarations.slice(0,20).map(line=>{const a=attributes(line.slice(line.indexOf(':')+1)),m=(a.RESOLUTION||'').match(/^([0-9]{1,5})x([0-9]{1,5})$/);return {width:m?Number(m[1]):null,height:m?Number(m[2]):null,bandwidth:/^[0-9]{1,10}$/.test(a.BANDWIDTH||'')?Number(a.BANDWIDTH):null};});
  const media=/#EXTINF:/.test(r.body);
  return {...result,status:declarations.length||media?'hls_structure_observed_playback_unverified':'hls_header_only_or_unrecognized',playlistType:declarations.length?'master':media?'media':'unknown',declaredVariantCount:declarations.length,variants,qualityBasis:'playlist_declarations_only',referenceAnalysis:summarizeReferences(r.body,u.href)};
 }
 function firstVariant(body){
  let pending=false;
  for(const rawLine of body.split(/\r?\n/)){const line=rawLine.trim();if(!line)continue;if(line.startsWith('#EXT-X-STREAM-INF:')){pending=true;continue;}if(pending&&!line.startsWith('#'))return line;}
  return null;
 }
 function unpackLinks(script){
  if(script.length>12000)throw Error('packed_script_too_large');
  const m=script.match(/\}\('((?:\\.|[^'\\])*)',36,([0-9]{1,4}),'((?:\\.|[^'\\])*)'\.split\('\|'\)\)/);if(!m)throw Error('packed_format_not_supported');
  const unescape=s=>s.replace(/\\(['\\])/g,'$1'),count=Number(m[2]),dict=unescape(m[3]).split('|');
  if(!count||count>1000||dict.length!==count)throw Error('packed_dictionary_not_supported');
  const unpacked=unescape(m[1]).replace(/\b[0-9a-z]+\b/g,t=>{const i=parseInt(t,36);return i<dict.length&&dict[i]?dict[i]:t;});
  const obj=unpacked.match(/\bvar\s+links\s*=\s*(\{[^;]*?\});/);if(!obj)throw Error('packed_links_missing');return JSON.parse(obj[1]);
 }
 const out={diagnosticVersion:9,addonVersion:'0.5.2',pageUrl:PAGE,stage:'movie_page',playbackVerified:false,streamsChanged:false,apiFunctionsAdded:0,excludedHosts:['voe.sx','ashleyhardat.com'],limits:{perReadMs:7000,totalBudgetMs:22000,movieAttempts:2,players:2,redirectHopsPerPlayer:2,masterPlaylistsPerPlayer:1,normalChildPlaylistsPerPlayer:1,manifestBytes:262144,manifestRedirectHops:0,segments:0,keys:0},movieAttempts:[],playerChecks:[]};let root;
 for(let attempt=1;attempt<=2;attempt++){
  const t=Date.now();try{root=await read(PAGE,1000000);out.movieAttempts.push({attempt,httpStatus:root.httpStatus,elapsedMs:Date.now()-t});break;}
  catch(e){const error=diagnosticError(e);out.movieAttempts.push({attempt,error,elapsedMs:Date.now()-t});if(!['request_timeout','network_or_parse_error'].includes(error)||attempt===2)return {...out,status:error==='request_timeout'?'movie_page_timeout':'movie_page_read_failed',error,elapsedMs:Date.now()-started};}
 }
 out.moviePage=info(root);
 const rootProblem=responseProblem(root);if(rootProblem||!/text\/html/i.test(root.contentType||''))return {...out,status:rootProblem||'movie_page_not_html',elapsedMs:Date.now()-started};
 const declared=new Set();
 for(const m of root.body.matchAll(/<li\b([^>]*)>/gi)){
  const a=Object.create(null);for(const v of m[1].matchAll(/([\w-]+)\s*=\s*(["'])([\s\S]*?)\2/g))a[v[1].toLowerCase()]=v[3].replace(/&amp;/g,'&');
  if((a.class||'').split(/\s+/).includes('playurl')&&a['data-url']){const u=url(a['data-url']);if(u)declared.add(u.href);}
 }
 out.stage='player_pages';
 out.playerChecks=await Promise.all(players.map(async p=>{
  const result={url:p.url,server:'vidhidepro.com',label:p.label,chain:[],playbackVerified:false,manifestChecks:[]};
  if(!declared.has(p.url))return {...result,status:'player_not_in_movie_page'};
  let current=p.url;
  try{
   let page;
   for(let hop=0;hop<=2;hop++){
    page=await read(current,500000);result.chain.push({url:current,...info(page)});result.finalUrl=current;
    if(page.verificationSignals)return {...result,status:'verification_required'};
    if(page.possiblyTruncated)return {...result,status:'player_page_incomplete'};
    if(page.httpStatus<300||page.httpStatus>=400)break;
    if(hop===2)return {...result,status:'redirect_hop_limit'};
    const next=page.location?url(page.location,current):null;
    if(!next||next.href!==p.chainUrls[hop+1])return {...result,status:'redirect_destination_not_allowed'};
    current=next.href;
   }
   const problem=responseProblem(page);if(problem||!/text\/html/i.test(page.contentType||''))return {...result,status:problem||'player_page_not_html'};
   const candidates=[...page.body.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(m=>m[1]).filter(s=>s.includes('eval(function(p,a,c,k,e,d)')).slice(0,3);
   let links;for(const candidate of candidates){try{links=unpackLinks(candidate);break;}catch{}}
   if(!links)return {...result,status:'packed_links_not_extracted'};
   result.packedExtraction={status:'links_extracted_statically',hls2Present:typeof links.hls2==='string',hls3:'not_requested'};
   const master=typeof links.hls2==='string'?url(links.hls2):null;
   if(!masterAllowed(master,p.code))return {...result,status:'manifest_destination_not_allowed',destinationSummary:master?{host:master.hostname,protocol:master.protocol}:null};
   const r=await read(master.href,262144,{kind:'master',code:p.code});
   const masterCheck={kind:'hls2',...hlsSummary(r,master)};result.manifestChecks.push(masterCheck);
   if(masterCheck.status!=='hls_structure_observed_playback_unverified'||masterCheck.playlistType!=='master')return {...result,status:'master_inspected_child_not_requested'};
   const rawChild=firstVariant(r.body);
   const child=rawChild&&!rawChild.includes('{$')?url(rawChild,master.href):null;
   if(!childAllowed(child,master,p.code))return {...result,status:'normal_child_not_allowed'};
   const childResponse=await read(child.href,262144,{kind:'child',master,code:p.code});
   result.manifestChecks.push({kind:'normal_child',...hlsSummary(childResponse,child)});
   result.status='master_and_child_inspected_playback_unverified';return result;
  }catch(e){return {...result,status:'inspection_failed',error:diagnosticError(e)};}
 }));
 out.status='inspection_complete';out.elapsedMs=Date.now()-started;
 out.notice='Solo VidhidePro para los dos vídeos de Idiotas. Voe excluido. Extrae enlaces frescos por sustitución estática, sin ejecutar scripts. Maestra hls2 limitada a subdominios alfanuméricos de 8 a 32 caracteres de acek-cdn.com o dramiyos-cdn.com y ruta hls2 vinculada al identificador del vídeo. Una variante normal del mismo dominio y directorio por vídeo, sin redirecciones de manifiestos ni solicitudes de I-frames, segmentos o claves. Se detiene ante verificación humana. Mantiene siete segundos por lectura y 22 totales. No añade fuentes ni altera reproducción; hls3 no se solicita. Resultados resumidos sin scripts completos ni rutas o consultas de recursos. Necesidad de cabeceras y reproducción aún no verificadas.';
 return out;
}
