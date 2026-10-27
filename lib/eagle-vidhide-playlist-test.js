'use strict';
const BASE='https://mi-addon-cine.vercel.app',PREFIX='experimental/vidhide/',CODES=new Set(['tm9efwej4bv8','h7lvwnfyrtnj']);
function childUrl(raw,code){
 try{const u=new URL(raw);return CODES.has(code)&&u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&!u.hash&&u.search.length<=2048&&/^[a-z0-9]{8,32}\.(?:acek-cdn|dramiyos-cdn)\.com$/.test(u.hostname)&&new RegExp('^/hls2/[0-9]{2}/[0-9]{1,8}/'+code+'_n/[A-Za-z0-9_-]{1,100}\\.m3u8$').test(u.pathname)&&!u.pathname.endsWith('/master.m3u8')?u:null;}catch{return null;}
}
function rewrite(text,child){
 if(!/^\uFEFF?\s*#EXTM3U(?:\s|$)/.test(text)||!/#EXT-X-ENDLIST(?:\s|$)/.test(text))throw Error('media_playlist_required');
 const directory=child.pathname.slice(0,child.pathname.lastIndexOf('/')+1);let count=0,entries=0;
 const lines=text.split(/\r?\n/).map(raw=>{
  const line=raw.trim();if(!line)return raw;
  if(line.startsWith('#')){
   if(/^#EXTINF:/.test(line))entries++;
   if(/^#EXT-X-(?:KEY|SESSION-KEY|MAP|DEFINE|CONTENT-STEERING|STREAM-INF|I-FRAMES-ONLY)(?::|$)/.test(line)||/\b[A-Z0-9-]*URI\s*=/.test(line))throw Error('unsupported_media_dependency');
   return raw;
  }
  if(line.includes('{$'))throw Error('unresolved_media_variable');
  const u=new URL(line,child);
  if(u.protocol!=='https:'||u.username||u.password||u.port||u.hash||u.search.length>2048||u.origin!==child.origin||!u.pathname.startsWith(directory)||!/^[A-Za-z0-9_-]{1,160}\.ts$/.test(u.pathname.slice(directory.length)))throw Error('segment_destination_not_allowed');
  if(++count>10000)throw Error('segment_count_limit');return u.href;
 });
 if(!count||count!==entries)throw Error('segment_count_mismatch');return lines.join('\n');
}
function local(code){return BASE+'/eagle-latin-blue/'+PREFIX+code+'.m3u8';}
async function serve(req,res,code,inspect){
 res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Access-Control-Allow-Origin','*');res.setHeader('Access-Control-Allow-Methods','GET, HEAD, OPTIONS');
 const fail=(status,error)=>{res.statusCode=status;res.setHeader('Content-Type','application/json; charset=utf-8');res.end(req.method==='HEAD'?undefined:JSON.stringify({error,experimental:true,playbackVerified:false,videoProxied:false}));};
 if(!CODES.has(code))return fail(400,'unsupported_test_video');
 if(req.method==='OPTIONS'){res.statusCode=204;return res.end();}
 if(!['GET','HEAD'].includes(req.method)){res.setHeader('Allow','GET, HEAD, OPTIONS');return fail(405,'only_get_or_head');}
 if(req.method==='HEAD'){res.statusCode=200;res.setHeader('Content-Type','application/vnd.apple.mpegurl; charset=utf-8');return res.end();}
 const deadline=Date.now()+22000;
 try{
  const report=await inspect(true,false);
  const candidates=Array.isArray(report?.experimentalStreams)?report.experimentalStreams:[];
  const child=candidates.map(s=>childUrl(s.url,code)).find(Boolean);
  if(!child)return fail(502,'validated_vidhide_playlist_unavailable');
  const remaining=deadline-Date.now();if(remaining<=0)return fail(504,'playlist_test_timeout');
  const r=await fetch(child.href,{redirect:'manual',signal:AbortSignal.timeout(Math.min(7000,remaining)),headers:{Accept:'application/vnd.apple.mpegurl, text/plain','User-Agent':'EagleLatinBlue/0.5',Referer:'https://callistanise.com/v/'+code}});
  if(r.status!==200||r.headers.get('cf-mitigated')==='challenge'||!/application\/(?:vnd\.apple\.mpegurl|x-mpegurl)|audio\/mpegurl|text\/plain/i.test(r.headers.get('content-type')||'')){if(r.body)await r.body.cancel().catch(()=>{});return fail(502,'playlist_upstream_rejected');}
  const parts=[];let size=0,complete=false;
  if(r.body){const reader=r.body.getReader();try{while(size<262144){const {done,value}=await reader.read();if(done){complete=true;break;}const part=value.subarray(0,262144-size);parts.push(Buffer.from(part));size+=part.length;}}finally{await reader.cancel().catch(()=>{});}}
  if(!complete)return fail(502,'playlist_incomplete');
  const text=Buffer.concat(parts).toString('utf8');
  if(/cf-chl-|g-recaptcha|h-captcha|altcha-widget|verify you are human|confirme que es humano/i.test(text))return fail(502,'verification_required');
  const body=rewrite(text,child);
  res.statusCode=200;res.setHeader('Content-Type','application/vnd.apple.mpegurl; charset=utf-8');return res.end(body);
 }catch(e){return fail(e.name==='TimeoutError'||e.name==='AbortError'?504:502,e.name==='TimeoutError'||e.name==='AbortError'?'playlist_test_timeout':'playlist_test_failed');}
}
function wrap(handler,inspect){
 return async(req,res)=>{
  const q=new URL(req.url,'https://addon.local').searchParams,raw=req.query?.addonRoute??q.get('addonRoute');let route='';try{route=decodeURIComponent(String(raw||'')).replace(/^\/+|\/+$/g,'');}catch{}
  if(route.startsWith(PREFIX)){const m=route.match(/^experimental\/vidhide\/([a-z0-9]{12})\.m3u8$/);return serve(req,res,m?m[1]:'',inspect);}
  if(route!=='stream/movie/pelisprobe-live-idiotas.json'||req.method!=='GET')return handler(req,res);
  const end=res.end;
  res.end=function(chunk,...args){
   if(chunk!==undefined&&res.statusCode===200){try{
    const data=JSON.parse(Buffer.isBuffer(chunk)?chunk.toString('utf8'):String(chunk)),extra=[];
    if(Array.isArray(data.streams))for(const code of CODES){
     const s=data.streams.find(s=>String(s.name||'').includes('VidhidePro')&&childUrl(s.url,code));
     if(s)extra.push({...s,name:String(s.name).replace(/\s*\(prueba\)\s*$/,'')+' (listas addon - prueba)',title:String(s.title||'Idiotas')+' | Solo lista mediante addon; segmentos directos; reproducción no verificada',url:local(code)});
    }
    if(extra.length){data.streams.push(...extra);data.vidhidePlaylistTestReport={version:1,added:extra.length,manifestProxied:true,segmentsProxied:false,playbackVerified:false,notice:'Opciones aisladas añadidas sin sustituir fuentes. Cada solicitud obtiene una lista fresca; los segmentos siguen directos al CDN.'};chunk=JSON.stringify(data);res.removeHeader('Content-Length');}
   }catch{}}
   return end.call(this,chunk,...args);
  };
  return handler(req,res);
 };
}
module.exports={wrap};
