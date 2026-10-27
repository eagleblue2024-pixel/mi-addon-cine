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
  try{return send(200,audit?await inspectHosts(false,true):match[1]==='pelisprobe-live-idiotas'?await resolveIdiotas(match[1]):await sources(match[1]));}catch(e){if(audit)return send(200,{diagnosticVersion:11,addonVersion:'0.5.3',stage:'diagnostic',status:'inspection_failed',error:diagnosticError(e),streamsChanged:false,apiFunctionsAdded:0});return send(200,{streams:[],error:e.name==='TimeoutError'||e.name==='AbortError'?'source_timeout':e.name==='TypeError'?'source_fetch_or_parse_failed':e.message});}
 }
 const end=res.end;
 res.end=function(chunk,...args){
  if(chunk!==undefined&&res.statusCode===200){
   try{
    const data=JSON.parse(Buffer.isBuffer(chunk)?chunk.toString('utf8'):String(chunk));let changed=false;
    if(data.id==='org.nebulaplay.pelis.isolated'){
     data.id='org.eaglelatinblue.pelis';data.name='Eagle Latin Blue';data.version='0.5.3';
     data.description='Películas de PelisPlusHD con portada y búsqueda. Hasta 20 candidatos StreamWish/Hanerix, ordenados por resolución declarada. VidhidePro experimental solo en Idiotas, sin reproducción verificada. Voe excluido. No garantiza calidad visual ni todas las fuentes.';
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
async function resolveIdiotas(id){
 const [baseResult,testResult]=await Promise.allSettled([sources(id),inspectHosts(true)]);
 const test=testResult.status==='fulfilled'?testResult.value:null,extra=Array.isArray(test?.experimentalStreams)?test.experimentalStreams:[];
 if(baseResult.status==='rejected'&&!extra.length)throw baseResult.reason;
 const base=baseResult.status==='fulfilled'?baseResult.value:{streams:[]};
 return {...base,streams:[...(Array.isArray(base.streams)?base.streams:[]),...extra],vidhideTestReport:{addonVersion:'0.5.3',experimental:true,movieId:id,returned:extra.length,playbackVerified:false,delivery:'direct_cdn_with_unverified_client_header_hints',originalSourceError:baseResult.status==='rejected'?diagnosticError(baseResult.reason):null,inspectionStatus:test?.status||'inspection_failed',checks:(test?.playerChecks||[]).map(p=>({label:p.label,status:p.status,segmentReferenceValidation:p.segmentReferenceValidation||null})),notice:'Opciones VidhidePro de prueba añadidas después de las fuentes originales. URLs frescas, sin caché ni proxy de vídeo. La compatibilidad de cabeceras y reproducción requiere comprobarse en Nuvio.'}};
}
function diagnosticError(e){return e.name==='TimeoutError'||e.name==='AbortError'?'request_timeout':e.name==='TypeError'?'network_or_parse_error':e.message==='diagnostic_deadline'?'diagnostic_deadline':'inspection_error';}
async function inspectHosts(includeStreams=false,probeSegments=false){
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
 async function probeSegment(raw,child,master,code){
  const t=Date.now(),result={status:'not_requested',requestAttempted:false,httpStatus:null,host:null,sampledBytes:0,sampleLimitBytes:4096,rangeRequested:'bytes=0-4095',rangeHonored:false,verificationSignals:false,transportStreamSyncObserved:false,playbackVerified:false,requestContext:'vercel_with_player_referer_and_addon_user_agent',urlDetails:'host_only'};
  try{
   const u=url(raw,child.href),directory=child.pathname.slice(0,child.pathname.lastIndexOf('/')+1);
   if(!probeSegments||!childAllowed(child,master,code)||!u||u.origin!==child.origin||u.search.length>2048||!u.pathname.startsWith(directory)||!/^[A-Za-z0-9_-]{1,160}\.ts$/.test(u.pathname.slice(directory.length))){result.status='segment_destination_not_allowed';return result;}
   result.host=u.hostname;const remaining=deadline-Date.now();if(remaining<=0){result.status='diagnostic_deadline';return result;}
   result.requestAttempted=true;
   const r=await fetch(u.href,{redirect:'manual',signal:AbortSignal.timeout(Math.min(7000,remaining)),headers:{Accept:'*/*',Range:'bytes=0-4095','Accept-Encoding':'identity','User-Agent':'EagleLatinBlue/0.5',Referer:'https://callistanise.com/v/'+code}});
   result.httpStatus=r.status;result.contentType=(r.headers.get('content-type')||'').slice(0,120);
   result.verificationSignals=r.headers.get('cf-mitigated')==='challenge';
   if(result.verificationSignals||![200,206].includes(r.status)){if(r.body)await r.body.cancel().catch(()=>{});result.status=result.verificationSignals?'verification_required':r.status>=300&&r.status<400?'redirect_not_followed':r.status===403?'access_forbidden':'upstream_http_error';return result;}
   const range=(r.headers.get('content-range')||'').match(/^bytes 0-([0-9]{1,10})\/(?:[0-9]{1,16}|\*)$/);
   result.rangeHonored=r.status===206&&Boolean(range)&&Number(range[1])<4096;
   if(r.status===206&&!result.rangeHonored){if(r.body)await r.body.cancel().catch(()=>{});result.status='unexpected_content_range';return result;}
   const chunks=[];let size=0,complete=false;
   if(r.body){const reader=r.body.getReader();try{while(size<4096){const {done,value}=await reader.read();if(done){complete=true;break;}const part=value.subarray(0,4096-size);chunks.push(Buffer.from(part));size+=part.length;}}finally{await reader.cancel().catch(()=>{});}}
   const sample=Buffer.concat(chunks);result.sampledBytes=size;result.responseBodyComplete=complete;
   result.verificationSignals=/cf-chl-|g-recaptcha|h-captcha|altcha-widget|verify you are human|confirme que es humano/i.test(sample.toString('latin1'));
   for(let offset=0;offset<188&&offset+376<sample.length;offset++)if(sample[offset]===71&&sample[offset+188]===71&&sample[offset+376]===71){result.transportStreamSyncObserved=true;break;}
   result.status=result.verificationSignals?'verification_required':!size?'empty_sample':result.transportStreamSyncObserved?'segment_sample_observed_playback_unverified':'sample_received_transport_unconfirmed';
   return result;
  }catch(e){result.status='segment_probe_failed';result.error=diagnosticError(e);return result;}finally{result.elapsedMs=Date.now()-t;}
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
 function validateSegments(body,child){
  if(!/^\uFEFF?\s*#EXTM3U(?:\s|$)/.test(body)||!/#EXT-X-ENDLIST(?:\s|$)/.test(body))throw Error('media_playlist_required');
  const directory=child.pathname.slice(0,child.pathname.lastIndexOf('/')+1);let count=0,entries=0;
  for(const rawLine of body.split(/\r?\n/)){
   const line=rawLine.trim();if(!line)continue;
   if(line.startsWith('#')){
    if(/^#EXTINF:/.test(line))entries++;
    if(/^#EXT-X-(?:KEY|SESSION-KEY|MAP|DEFINE|CONTENT-STEERING|STREAM-INF|I-FRAMES-ONLY)(?::|$)/.test(line)||/\b[A-Z0-9-]*URI\s*=/.test(line))throw Error('unsupported_media_dependency');
    continue;
   }
   if(line.includes('{$'))throw Error('unresolved_media_variable');
   const u=new URL(line,child);
   if(u.protocol!=='https:'||u.username||u.password||u.port||u.hash||u.search.length>2048||u.origin!==child.origin||!u.pathname.startsWith(directory)||!/^[A-Za-z0-9_-]{1,160}\.ts$/.test(u.pathname.slice(directory.length)))throw Error('segment_destination_not_allowed');
   count++;if(count>10000)throw Error('segment_count_limit');
  }
  if(!count||count!==entries)throw Error('segment_count_mismatch');return count;
 }
 function unpackLinks(script){
  if(script.length>12000)throw Error('packed_script_too_large');
  const m=script.match(/\}\('((?:\\.|[^'\\])*)',36,([0-9]{1,4}),'((?:\\.|[^'\\])*)'\.split\('\|'\)\)/);if(!m)throw Error('packed_format_not_supported');
  const unescape=s=>s.replace(/\\(['\\])/g,'$1'),count=Number(m[2]),dict=unescape(m[3]).split('|');
  if(!count||count>1000||dict.length!==count)throw Error('packed_dictionary_not_supported');
  const unpacked=unescape(m[1]).replace(/\b[0-9a-z]+\b/g,t=>{const i=parseInt(t,36);return i<dict.length&&dict[i]?dict[i]:t;});
  const obj=unpacked.match(/\bvar\s+links\s*=\s*(\{[^;]*?\});/);if(!obj)throw Error('packed_links_missing');return JSON.parse(obj[1]);
 }
 const out={diagnosticVersion:11,addonVersion:'0.5.3',pageUrl:PAGE,stage:'movie_page',playbackVerified:false,streamsChanged:false,apiFunctionsAdded:0,excludedHosts:['voe.sx','ashleyhardat.com'],limits:{perReadMs:7000,totalBudgetMs:22000,movieAttempts:2,players:2,redirectHopsPerPlayer:2,masterPlaylistsPerPlayer:1,normalChildPlaylistsPerPlayer:1,manifestBytes:262144,manifestRedirectHops:0,segments:probeSegments?2:0,segmentsPerPlayer:probeSegments?1:0,segmentSampleBytes:4096,segmentRedirectHops:0,keys:0},movieAttempts:[],playerChecks:[]};
 if(includeStreams)out.experimentalStreams=[];
 let root;
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
   const childCheck={kind:'normal_child',...hlsSummary(childResponse,child)};result.manifestChecks.push(childCheck);
   result.status='master_and_child_inspected_playback_unverified';
   if(childCheck.status==='hls_structure_observed_playback_unverified'&&childCheck.playlistType==='media'){
    try{
     const count=validateSegments(childResponse.body,child);
     result.segmentReferenceValidation={status:'all_references_validated',count,segmentsRequested:0,playbackVerified:false};
     if(probeSegments){const first=childResponse.body.split(/\r?\n/).map(s=>s.trim()).find(s=>s&&!s.startsWith('#'));result.segmentCheck=await probeSegment(first,child,master,p.code);}
     if(includeStreams){
      const q=masterCheck.variants[0]||{},resolution=q.width&&q.height?q.width+'x'+q.height+' declarada en HLS':'Resolución no declarada';
      out.experimentalStreams.push({name:'Eagle Latin Blue - VidhidePro '+p.label+(q.height?' '+q.height+'p':'')+' (prueba)',title:'Idiotas | '+p.label+' (etiqueta de la ficha) | '+resolution+' | VidhidePro experimental; reproducción no verificada',url:child.href,behaviorHints:{notWebReady:true,proxyHeaders:{request:{Referer:'https://callistanise.com/v/'+p.code,'User-Agent':'EagleLatinBlue/0.5'}}}});
     }
    }catch{result.segmentReferenceValidation={status:'validation_failed',error:'media_reference_validation_failed',segmentsRequested:0};}
   }
   return result;
  }catch(e){return {...result,status:'inspection_failed',error:diagnosticError(e)};}
 }));
 if(includeStreams)out.experimentalStreams.sort((a,b)=>a.name.localeCompare(b.name));
 out.status='inspection_complete';out.elapsedMs=Date.now()-started;
 out.segmentRequestsAttempted=out.playerChecks.filter(p=>p.segmentCheck?.requestAttempted).length;
 out.notice='Diagnóstico 11: solo VidhidePro de Idiotas, Voe excluido. Mantiene extracción estática, validación de destinos, siete segundos por lectura y 22 totales. Solo en diagnostics/hosts.json solicita una muestra del primer segmento TS validado de cada vídeo, Range bytes=0-4095, conserva como máximo 4096 bytes y cancela la lectura; el servidor remoto podría ignorar Range y el transporte recibir más datos antes de cancelar. Sin redirecciones de segmentos, claves, hls3 ni exposición de firmas o contenido binario. Un HTTP 200/206 o sincronía TS desde Vercel no verifica decodificación ni reproducción desde el teléfono. Las rutas de reproducción y Hanerix permanecen sin cambios.';
 return out;
}
module.exports=require('../lib/eagle-vidhide-playlist-test').wrap(module.exports,inspectHosts);
