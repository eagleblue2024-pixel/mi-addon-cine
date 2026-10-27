'use strict';
const PAGE='https://hanerix.com/e/ejfrl3vz4rbs';
const HOSTS=new Set(['hanerix.com','cyyroro04xrqr.riskanalytics.cfd','cyyroro04xrqr.premilkyway.com']);
const CDNS=new Set(['p19-ad-site-sign-sg.tiktokcdn.com','p16-ad-site-sign-sg.tiktokcdn.com']);
function safe(raw,base=PAGE,segment=false){const u=new URL(raw,base);if(u.protocol!=='https:'||u.port||u.username||u.password||!(segment?CDNS.has(u.hostname):HOSTS.has(u.hostname)))throw new Error('destination_not_allowed');return u.href;}
async function read(url,max,segment=false){
 const r=await fetch(safe(url,PAGE,segment),{redirect:'manual',signal:AbortSignal.timeout(6000),headers:{Accept:'*/*','User-Agent':'NebulaPlayDiagnostics/0.4',Referer:PAGE,...(segment?{Range:'bytes=0-16383'}:{})}});
 const parts=[];let size=0,complete=false;
 if(r.body){const reader=r.body.getReader();try{while(size<max){const {done,value}=await reader.read();if(done){complete=true;break;}const p=value.subarray(0,max-size);parts.push(Buffer.from(p));size+=p.length;}}finally{await reader.cancel().catch(()=>{});}}
 const bytes=Buffer.concat(parts);return {bytes,httpStatus:r.status,ok:r.ok,contentType:r.headers.get('content-type'),contentRange:r.headers.get('content-range'),text:bytes.toString('utf8'),firstBytesHex:bytes.subarray(0,16).toString('hex'),sampledBytes:size,possiblyTruncated:!complete,challenge:r.headers.get('cf-mitigated')==='challenge'};
}
function crc32(b){let c=0xffffffff;for(const v of b){c^=v;for(let j=0;j<8;j++)c=(c>>>1)^((c&1)?0xedb88320:0);}return (c^0xffffffff)>>>0;}
function inspectPNG(b){
 const out={signatureMatches:b.length>=8&&b.subarray(0,8).toString('hex')==='89504e470d0a1a0a',iendFound:false,chunks:[],decoded:false};if(!out.signatureMatches){out.status='png_signature_not_found';return out;}
 let offset=8;while(out.chunks.length<32){
 if(offset+8>b.length){out.status='inconclusive_sample_ends_before_chunk_header';return out;}
 const length=b.readUInt32BE(offset),type=b.subarray(offset+4,offset+8).toString('latin1');if(length>0x7fffffff||!/^[A-Za-z]{4}$/.test(type)){out.status='invalid_chunk_header';return out;}
 const end=offset+12+length,complete=end<=b.length,chunk={offset,type,length,complete};out.chunks.push(chunk);if(!complete){out.status='inconclusive_sample_ends_inside_chunk';return out;}
 chunk.crcValid=crc32(b.subarray(offset+4,end-4))===b.readUInt32BE(end-4);if(offset===8&&type==='IHDR'&&length===13)out.header={width:b.readUInt32BE(offset+8),height:b.readUInt32BE(offset+12),bitDepth:b[offset+16],colorType:b[offset+17]};
 if(type==='IEND'){if(length!==0){out.status='invalid_iend_length';return out;}out.iendFound=true;out.pngEndOffset=end;out.trailingBytesInSample=b.length-end;out.trailingFirstBytesHex=b.subarray(end,end+16).toString('hex');out.allTraversedCRCsValid=out.chunks.every(c=>c.crcValid===true);out.status='iend_boundary_found_not_decoded';return out;}offset=end;
 }out.status='inconclusive_chunk_count_limit';return out;
}
function mpegCRC(b){let c=0xffffffff;for(const v of b){c^=v<<24;for(let j=0;j<8;j++)c=(c<<1)^((c&0x80000000)?0x04c11db7:0);}return c>>>0;}
function section(packet,id,min){
 const p=packet.payload;if(!packet.start||!p||p.length<1)return null;const at=1+p[0];if(at+3>p.length||p[at]!==id||!(p[at+1]&128))return null;
 const len=((p[at+1]&15)<<8)|p[at+2],end=at+3+len;if(len>1021||end>p.length||3+len<min)return null;const s=p.subarray(at,end);if(!(s[5]&1)||s[6]!==0||s[7]!==0||mpegCRC(s)!==0)return null;return s;
}
function inspectTS(b,start){
 const n=Math.floor((b.length-start)/188),out={status:'inconclusive',startOffset:start,packetSize:188,completePackets:n,trailingPartialBytes:(b.length-start)%188,syncMatches:0,invalidHeaders:0,transportErrorPackets:0,scrambledPackets:0,programs:[],pmts:[],decoded:false,limitations:'Solo muestra del segmento seleccionado. PAT/PMT de sección única completas dentro de un paquete y con CRC correcto; sin reensamblaje, análisis de continuidad, PES ni decodificación.'};
 const packets=[],counts={};
 for(let i=0;i<n;i++){const p=b.subarray(start+i*188,start+(i+1)*188);if(p[0]!==0x47)continue;out.syncMatches++;const pid=((p[1]&31)<<8)|p[2],afc=(p[3]>>4)&3,tei=Boolean(p[1]&128),scrambled=Boolean(p[3]&192);counts[pid]=(counts[pid]||0)+1;if(tei)out.transportErrorPackets++;if(scrambled)out.scrambledPackets++;
 let at=4;if(afc===0){out.invalidHeaders++;continue;}if(afc&2){at=5+p[4];if(at>188||(afc===2&&at!==188)||(afc===3&&at>=188)){out.invalidHeaders++;continue;}}
 if((afc&1)&&!tei&&!scrambled)packets.push({pid,start:Boolean(p[1]&64),payload:p.subarray(at)});}
 out.pidPacketCounts=counts;out.allCompletePacketsSynchronized=n>=5&&out.syncMatches===n;out.status=out.allCompletePacketsSynchronized&&out.invalidHeaders===0?'ts_packet_structure_detected_not_decoded':'ts_structure_not_confirmed';
 if(!out.allCompletePacketsSynchronized||out.invalidHeaders)return out;
 for(const p of packets){if(p.pid!==0)continue;const s=section(p,0,12);if(!s||(s.length-12)%4)continue;for(let i=8;i<s.length-4;i+=4){const program=s.readUInt16BE(i),pmtPid=((s[i+2]&31)<<8)|s[i+3];if(program&&!out.programs.some(x=>x.program===program&&x.pmtPid===pmtPid))out.programs.push({program,pmtPid});}}
 for(const program of out.programs){for(const p of packets){if(p.pid!==program.pmtPid)continue;const s=section(p,2,16);if(!s||s.readUInt16BE(3)!==program.program)continue;const end=s.length-4,pcrPid=((s[8]&31)<<8)|s[9],streams=[];let at=12+(((s[10]&15)<<8)|s[11]),valid=at<=end;
 while(valid&&at<end){if(at+5>end){valid=false;break;}const streamType=s[at],pid=((s[at+1]&31)<<8)|s[at+2],len=((s[at+3]&15)<<8)|s[at+4];if(at+5+len>end){valid=false;break;}streams.push({streamType,pid});at+=5+len;}
 if(valid&&at===end){out.pmts.push({program:program.program,pmtPid:program.pmtPid,pcrPid,crcValid:true,streams});break;}}}
 out.patFound=out.programs.length>0;out.pmtFound=out.pmts.length>0;return out;
}
function unpackLinks(html){const m=html.match(/\}\('((?:\\.|[^'\\])*)',36,(\d+),'([^']*)'\.split\('\|'\)/);if(!m||Number(m[2])>5000)throw new Error('packed_format_not_supported');const dict=m[3].split('|'),payload=m[1].replace(/\\(['\\])/g,'$1');const decoded=payload.replace(/\b[0-9a-z]+\b/g,t=>{const i=parseInt(t,36);return i<dict.length&&dict[i]?dict[i]:t;});const object=decoded.match(/\bvar\s+links\s*=\s*(\{[^;]*?\});/);if(!object)throw new Error('links_object_missing');const raw=JSON.parse(object[1]),links={};for(const k of ['hls4','hls3','hls2'])if(typeof raw[k]==='string'){try{links[k]=safe(raw[k]);}catch{}}return links;}
function isHLS(r){return r.ok&&!r.challenge&&/^\uFEFF?\s*#EXTM3U/.test(r.text);}
function info(r){return {httpStatus:r.httpStatus,contentType:r.contentType,sampledBytes:r.sampledBytes,possiblyTruncated:r.possiblyTruncated};}
async function checkSegment(uri,base,index){
 const out={segmentIndex:index,segmentNumber:index+1,requested:false};try{
 const u=new URL(uri,base);out.host=u.hostname;out.protocol=u.protocol;out.status='destination_blocked_not_requested';const url=safe(uri,base,true);out.status='request_started';out.requested=true;const sample=await read(url,16384,true);
 const errorBody=sample.challenge||/text\/html|application\/(?:json|xml)/i.test(sample.contentType||'')||/^\s*(?:<!doctype|<html|<\?xml|\{\s*\")/i.test(sample.text);const usable=sample.ok&&!errorBody&&(sample.httpStatus===200||(sample.httpStatus===206&&/^bytes 0-\d+\/\d+$/.test(sample.contentRange||'')));
 const pngInspection=usable?inspectPNG(sample.bytes):{status:'response_not_usable'};const tsInspection=usable&&pngInspection.iendFound&&pngInspection.allTraversedCRCsValid?inspectTS(sample.bytes,pngInspection.pngEndOffset):{status:'not_inspected_png_boundary_not_confirmed'};
 return {...out,status:usable?(pngInspection.signatureMatches?'png_prefix_received_not_decoded':'sample_received_not_decoded'):'sample_not_confirmed',...info(sample),contentRange:sample.contentRange,rangeHonored:sample.httpStatus===206,firstBytesHex:sample.firstBytesHex,pngInspection,tsInspection};
 }catch(e){out.failure={reason:e.message,errorType:e.name};if(out.requested)out.status='sample_failed';return out;}
}
module.exports=async(req,res)=>{
 res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
 const out={diagnosticVersion:13,experimental:true,playbackVerified:false,pageUrl:PAGE,playlistCheck:{status:'not_checked'},variantCheck:{status:'not_checked'},segmentChecks:[],notice:'Segundo segmento y uno a mitad de la lista, hasta 16 KiB cada uno (máximo 32 KiB leídos de segmentos). Inspección independiente PNG y TS sin desplazamiento fijo. Solo hosts CDN exactos p19 y p16 autorizados. No transforma contenido ni confirma reproducción. Sin redirecciones, claves, inicialización ni cambios en fuentes.'};
 const send=code=>{res.statusCode=code;res.end(JSON.stringify(out,null,2));};if(req.method!=='GET'){res.setHeader('Allow','GET');out.status='method_not_allowed';return send(405);}let stage='page';try{
 const page=await read(PAGE,1000000);if(page.challenge||/cf-chl-|g-recaptcha|altcha-widget|verify you are human/i.test(page.text)){out.status='verification_required';return send(200);}if(!page.ok||page.possiblyTruncated||!/text\/html/i.test(page.contentType||'')){out.status='page_not_usable';out.pageCheck=info(page);return send(200);}
 stage='extraction';out.links=unpackLinks(page.text);out.status=Object.keys(out.links).length?'links_extracted':'no_links';if(!out.links.hls4)return send(200);
 stage='master';const masterURL=safe(out.links.hls4),master=await read(masterURL,131072);out.playlistCheck={status:isHLS(master)?'hls_received':'hls_not_confirmed',...info(master),variantCount:(master.text.match(/#EXT-X-STREAM-INF:/g)||[]).length};if(!isHLS(master)||master.possiblyTruncated)return send(200);
 let media=master,mediaURL=masterURL;const lines=master.text.split(/\r?\n/).map(s=>s.trim()),at=lines.findIndex(s=>s.startsWith('#EXT-X-STREAM-INF:'));if(at>=0){stage='variant';const uri=lines.slice(at+1).find(s=>s&&!s.startsWith('#'));if(!uri)throw new Error('variant_uri_missing');mediaURL=safe(uri,masterURL);media=await read(mediaURL,262144);}
 out.variantCheck={status:isHLS(media)?'media_playlist_received':'hls_not_confirmed',...info(media),url:mediaURL,encryptionDeclared:/#EXT-X-KEY:/.test(media.text),initializationMapDeclared:/#EXT-X-MAP:/.test(media.text)};if(!isHLS(media)||media.possiblyTruncated)return send(200);if(/#EXT-X-STREAM-INF:|#EXT-X-BYTERANGE:/.test(media.text)){out.samplingStatus='unsupported_playlist_layout';return send(200);}
 stage='segments';const uris=media.text.split(/\r?\n/).map(s=>s.trim()).filter(s=>s&&!s.startsWith('#'));out.segmentCount=uris.length;if(uris.length<2){out.samplingStatus='insufficient_segments';return send(200);}
 const indices=[...new Set([1,Math.floor(uris.length/2)])];out.samplingIndices=indices;out.segmentChecks=await Promise.all(indices.map(i=>checkSegment(uris[i],mediaURL,i)));out.samplingStatus='checks_finished';return send(200);
 }catch(e){out.failure={stage,reason:e.message,errorType:e.name};if(stage==='extraction')out.status='extraction_failed';return send(200);}
};
