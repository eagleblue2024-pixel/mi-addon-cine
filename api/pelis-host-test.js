'use strict';
const PAGE='https://hanerix.com/e/ejfrl3vz4rbs';
const HOSTS=new Set(['hanerix.com','cyyroro04xrqr.riskanalytics.cfd','cyyroro04xrqr.premilkyway.com']);
const CDN='p19-ad-site-sign-sg.tiktokcdn.com';
function safe(raw,base=PAGE,segment=false){const u=new URL(raw,base);if(u.protocol!=='https:'||u.port||u.username||u.password||!(segment?u.hostname===CDN:HOSTS.has(u.hostname)))throw new Error('destination_not_allowed');return u.href;}
async function read(url,max,segment=false){
 const r=await fetch(safe(url,PAGE,segment),{redirect:'manual',signal:AbortSignal.timeout(6000),headers:{Accept:'*/*','User-Agent':'NebulaPlayDiagnostics/0.4',Referer:PAGE,...(segment?{Range:'bytes=0-16383'}:{})}});
 const parts=[];let size=0,complete=false;
 if(r.body){const reader=r.body.getReader();try{while(size<max){const {done,value}=await reader.read();if(done){complete=true;break;}const p=value.subarray(0,max-size);parts.push(Buffer.from(p));size+=p.length;}}finally{await reader.cancel().catch(()=>{});}}
 const bytes=Buffer.concat(parts);return {httpStatus:r.status,ok:r.ok,contentType:r.headers.get('content-type'),contentRange:r.headers.get('content-range'),text:bytes.toString('utf8'),firstBytesHex:bytes.subarray(0,16).toString('hex'),sampledBytes:size,possiblyTruncated:!complete,challenge:r.headers.get('cf-mitigated')==='challenge'};
}
function unpackLinks(html){
 const m=html.match(/\}\('((?:\\.|[^'\\])*)',36,(\d+),'([^']*)'\.split\('\|'\)/);
 if(!m||Number(m[2])>5000)throw new Error('packed_format_not_supported');
 const dict=m[3].split('|'),payload=m[1].replace(/\\(['\\])/g,'$1');
 const decoded=payload.replace(/\b[0-9a-z]+\b/g,t=>{const i=parseInt(t,36);return i<dict.length&&dict[i]?dict[i]:t;});
 const object=decoded.match(/\bvar\s+links\s*=\s*(\{[^;]*?\});/);if(!object)throw new Error('links_object_missing');
 const raw=JSON.parse(object[1]),links={};for(const k of ['hls4','hls3','hls2'])if(typeof raw[k]==='string'){try{links[k]=safe(raw[k]);}catch{}}return links;
}
function isHLS(r){return r.ok&&!r.challenge&&/^\uFEFF?\s*#EXTM3U/.test(r.text);}
function info(r){return {httpStatus:r.httpStatus,contentType:r.contentType,sampledBytes:r.sampledBytes,possiblyTruncated:r.possiblyTruncated};}
module.exports=async(req,res)=>{
 res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
 const out={diagnosticVersion:9,experimental:true,playbackVerified:false,pageUrl:PAGE,playlistCheck:{status:'not_checked'},variantCheck:{status:'not_checked'},segmentCheck:{status:'not_checked'},notice:'Un solo video; muestra de hasta 16 KiB leídos del primer segmento, cancelando al alcanzar el límite aunque se ignore Range. Solo el host CDN exacto autorizado. Sin redirecciones, claves, inicialización, decodificación ni cambios en fuentes. No confirma reproducción en Nuvio.'};
 const send=(code)=>{res.statusCode=code;res.end(JSON.stringify(out,null,2));};
 if(req.method!=='GET'){res.setHeader('Allow','GET');out.status='method_not_allowed';return send(405);}
 let stage='page';try{
 const page=await read(PAGE,1000000);if(page.challenge||/cf-chl-|g-recaptcha|altcha-widget|verify you are human/i.test(page.text)){out.status='verification_required';return send(200);}
 if(!page.ok||page.possiblyTruncated||!/text\/html/i.test(page.contentType||'')){out.status='page_not_usable';out.pageCheck=info(page);return send(200);}
 stage='extraction';out.links=unpackLinks(page.text);out.status=Object.keys(out.links).length?'links_extracted':'no_links';if(!out.links.hls4)return send(200);
 stage='master';const masterURL=safe(out.links.hls4),master=await read(masterURL,131072);out.playlistCheck={status:isHLS(master)?'hls_received':'hls_not_confirmed',...info(master),variantCount:(master.text.match(/#EXT-X-STREAM-INF:/g)||[]).length};if(!isHLS(master)||master.possiblyTruncated)return send(200);
 let media=master,mediaURL=masterURL;const lines=master.text.split(/\r?\n/).map(s=>s.trim()),at=lines.findIndex(s=>s.startsWith('#EXT-X-STREAM-INF:'));
 if(at>=0){stage='variant';const uri=lines.slice(at+1).find(s=>s&&!s.startsWith('#'));if(!uri)throw new Error('variant_uri_missing');mediaURL=safe(uri,masterURL);media=await read(mediaURL,262144);}
 out.variantCheck={status:isHLS(media)?'media_playlist_received':'hls_not_confirmed',...info(media),url:mediaURL,encryptionDeclared:/#EXT-X-KEY:/.test(media.text),initializationMapDeclared:/#EXT-X-MAP:/.test(media.text)};if(!isHLS(media)||media.possiblyTruncated)return send(200);
 if(/#EXT-X-STREAM-INF:|#EXT-X-BYTERANGE:/.test(media.text)){out.segmentCheck={status:'unsupported_playlist_layout',requested:false};return send(200);}
 stage='segment';const uri=media.text.split(/\r?\n/).map(s=>s.trim()).find(s=>s&&!s.startsWith('#'));if(!uri){out.segmentCheck={status:'no_segment_uri',requested:false};return send(200);}
 const u=new URL(uri,mediaURL);out.segmentCheck={status:'destination_blocked_not_requested',host:u.hostname,protocol:u.protocol,requested:false};const url=safe(uri,mediaURL,true);
 out.segmentCheck.status='request_started';out.segmentCheck.requested=true;const sample=await read(url,16384,true);
 const errorBody=sample.challenge||/text\/html|application\/(?:json|xml)/i.test(sample.contentType||'')||/^\s*(?:<!doctype|<html|<\?xml|\{\s*\")/i.test(sample.text);
 out.segmentCheck={...out.segmentCheck,status:sample.ok&&sample.sampledBytes>0&&!errorBody?'sample_received_not_decoded':'sample_not_confirmed',...info(sample),contentRange:sample.contentRange,rangeHonored:sample.httpStatus===206,firstBytesHex:sample.firstBytesHex};return send(200);
 }catch(e){out.failure={stage,reason:e.message,errorType:e.name};if(stage==='extraction')out.status='extraction_failed';return send(200);}
};
