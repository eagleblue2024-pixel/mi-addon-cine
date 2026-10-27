'use strict';
const PAGE='https://hanerix.com/e/ejfrl3vz4rbs',API='/api/pelis-host-test',BASE='https://mi-addon-cine.vercel.app';
const ID='pelisprobe-ejfrl3vz4rbs';
const META={id:ID,type:'movie',name:'Prueba Hanerix - video fijo',description:'Prueba técnica aislada del video ejfrl3vz4rbs. Imagen y audio comprobados unos 15 segundos en navegador; compatibilidad con Nuvio todavía pendiente. Listas por Vercel y segmentos directos, sin transformación.'};
const MANIFEST={id:'org.nebulaplay.pelis.isolated',version:'0.1.0',name:'Pelis - Prueba aislada',description:'Un único video de prueba; no añade fuentes al catálogo principal de Nebula. No confirma reproducción en Nuvio.',resources:['catalog','meta',{name:'stream',types:['movie'],idPrefixes:['pelisprobe-']}],types:['movie'],idPrefixes:['pelisprobe-'],catalogs:[{type:'movie',id:'pelis-isolated',name:'Pelis - Video de prueba'}],behaviorHints:{configurable:false}};
const CDNS=new Set(['p19-ad-site-sign-sg.tiktokcdn.com','p16-ad-site-sign-sg.tiktokcdn.com']);
const TOKEN=/^[A-Za-z0-9_-]{16,128}$/,STAMP=/^[0-9]{10,12}$/;
function params(token,stamp,file){if(!TOKEN.test(token)||!STAMP.test(stamp)||!['master.m3u8','index-v1-a1.m3u8'].includes(file))throw new Error('invalid_playlist_parameters');return {token,stamp,file};}
function upstream(p){return 'https://hanerix.com/stream/'+p.token+'/kjhhiuahiuhgihdf/'+p.stamp+'/76097401/'+p.file;}
function local(p){return API+'?'+new URLSearchParams({mode:'playlist',...p}).toString();}
async function read(url,max){
 const u=new URL(url);if(u.origin!=='https://hanerix.com')throw new Error('destination_not_allowed');
 const r=await fetch(u.href,{redirect:'manual',signal:AbortSignal.timeout(8000),headers:{Accept:'*/*','User-Agent':'NebulaPlayDiagnostics/0.4',Referer:PAGE}});
 const parts=[];let size=0,complete=false;if(r.body){const reader=r.body.getReader();try{while(size<max){const {done,value}=await reader.read();if(done){complete=true;break;}const p=value.subarray(0,max-size);parts.push(Buffer.from(p));size+=p.length;}}finally{await reader.cancel().catch(()=>{});}}
 return {ok:r.ok,status:r.status,contentType:r.headers.get('content-type'),text:Buffer.concat(parts).toString('utf8'),truncated:!complete,challenge:r.headers.get('cf-mitigated')==='challenge'};
}
function extract(html){const m=html.match(/\}\('((?:\\.|[^'\\])*)',36,(\d+),'([^']*)'\.split\('\|'\)/);if(!m||Number(m[2])>5000)throw new Error('packed_format_not_supported');const dict=m[3].split('|'),payload=m[1].replace(/\\(['\\])/g,'$1'),decoded=payload.replace(/\b[0-9a-z]+\b/g,t=>{const i=parseInt(t,36);return i<dict.length&&dict[i]?dict[i]:t;});const obj=decoded.match(/\bvar\s+links\s*=\s*(\{[^;]*?\});/);if(!obj)throw new Error('links_missing');const raw=JSON.parse(obj[1]);if(typeof raw.hls4!=='string')throw new Error('hls4_missing');const u=new URL(raw.hls4,PAGE);const path=u.pathname.match(/^\/stream\/([A-Za-z0-9_-]{16,128})\/kjhhiuahiuhgihdf\/([0-9]{10,12})\/76097401\/master\.m3u8$/);if(u.origin!=='https://hanerix.com'||u.username||u.password||u.search||u.hash||!path)throw new Error('unexpected_master');return params(path[1],path[2],'master.m3u8');}
async function fresh(){const page=await read(PAGE,1000000);if(!page.ok||page.truncated||page.challenge||!/text\/html/i.test(page.contentType||'')||/cf-chl-|g-recaptcha|altcha-widget|verify you are human/i.test(page.text))throw new Error('page_not_usable');return extract(page.text);}
function rewrite(text,p){
 if(!/^\uFEFF?\s*#EXTM3U/.test(text))throw new Error('not_hls');
 if(/\bURI\s*=|#EXT-X-DEFINE:|#EXT-X-CONTENT-STEERING:/i.test(text))throw new Error('unsupported_uri_attribute');
 const master=p.file==='master.m3u8';if(master&&!/#EXT-X-STREAM-INF:/.test(text))throw new Error('expected_master_playlist');if(!master&&/#EXT-X-STREAM-INF:/.test(text))throw new Error('nested_master_not_supported');
 let references=0;const result=text.split(/\r?\n/).map(line=>{const s=line.trim();if(!s||s.startsWith('#'))return line;references++;const u=new URL(s,upstream(p));if(u.protocol!=='https:'||u.port||u.username||u.password||u.hash)throw new Error('unsafe_playlist_reference');
 if(master){const child=params(p.token,p.stamp,'index-v1-a1.m3u8');if(u.href!==upstream(child))throw new Error('unexpected_variant');return local(child);}
 if(!CDNS.has(u.hostname))throw new Error('segment_host_not_allowed');return u.href;}).join('\n');if(!references)throw new Error('empty_playlist');return result;
}
module.exports=async(req,res)=>{
 res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Access-Control-Allow-Origin','*');res.setHeader('Access-Control-Allow-Methods','GET, HEAD, OPTIONS');res.setHeader('Access-Control-Allow-Headers','Content-Type');
 const send=(code,data)=>{res.statusCode=code;res.setHeader('Content-Type','application/json; charset=utf-8');res.end(req.method==='HEAD'?undefined:JSON.stringify(data,null,2));};const json=(code,data)=>send(code,{diagnosticVersion:15,experimental:true,playbackVerified:false,videoProxied:false,...data});
 if(req.method==='OPTIONS'){res.statusCode=204;return res.end();}if(!['GET','HEAD'].includes(req.method)){res.setHeader('Allow','GET, HEAD, OPTIONS');return json(405,{error:'only_get_or_head'});}const q=new URL(req.url,'https://addon.local').searchParams;
 const addonRaw=req.query?.addonRoute??q.get('addonRoute');
 if(addonRaw!==null&&addonRaw!==undefined){let route;try{route=decodeURIComponent(String(addonRaw)).replace(/^\/+|\/+$/g,'');}catch{return send(400,{error:'invalid_route'});}
 if(route==='manifest.json')return send(200,MANIFEST);
 if(route==='catalog/movie/pelis-isolated.json')return send(200,{metas:[META]});
 if(route==='meta/movie/'+ID+'.json')return send(200,{meta:META});
 if(route!=='stream/movie/'+ID+'.json')return send(404,{streams:[],error:'unsupported_test_route'});
 if(req.method==='HEAD')return send(200,{streams:[]});try{const p=await fresh();return send(200,{streams:[{name:'Pelis - Prueba aislada',title:'HLS de prueba | listas por Vercel | segmentos directos',url:BASE+local(p)}]});}catch{return send(200,{streams:[],error:'test_source_unavailable'});}}
 const mode=q.get('mode')||'resolve';if(req.method==='HEAD'){if(mode==='playlist'){res.statusCode=200;res.setHeader('Content-Type','application/vnd.apple.mpegurl; charset=utf-8');return res.end();}return json(200,{status:'head_only'});}
 try{if(mode==='resolve'){const p=await fresh();return json(200,{status:'playlist_route_ready',playlistUrl:local(p),manifestsProxied:true,notice:'Solo video ejfrl3vz4rbs. Listas por Vercel; segmentos directos sin transformación. Complemento aislado en /pelis-demo/manifest.json. No confirma reproducción en Nuvio.'});}
 if(mode!=='playlist')return json(400,{error:'invalid_mode'});let p;try{p=params(q.get('token')||'',q.get('stamp')||'',q.get('file')||'');}catch{return json(400,{error:'invalid_playlist_parameters'});}
 const r=await read(upstream(p),262144);if(!r.ok||r.truncated||r.challenge)return json(502,{error:'playlist_not_usable',upstreamStatus:r.status});const body=rewrite(r.text,p);res.statusCode=200;res.setHeader('Content-Type','application/vnd.apple.mpegurl; charset=utf-8');res.end(body);
 }catch(e){return json(502,{error:e.name==='TimeoutError'?'upstream_timeout':e.name==='TypeError'?'fetch_or_parse_failed':e.message});}
};
