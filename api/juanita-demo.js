'use strict';
const cache = new Map();
const manifest = {id:'org.nebulaplay.juanita.demo',version:'0.4.0',name:'Nebula Play - Fuentes Juanita',description:'Proveedor experimental de fuentes Videoapp/Vimeos por IMDb y TMDB. Sin catálogo propio. La disponibilidad depende del reproductor.',resources:[{name:'stream',types:['movie'],idPrefixes:['tt','tmdb:']}],types:['movie'],idPrefixes:['tt','tmdb:'],catalogs:[],behaviorHints:{configurable:false}};
const decode=s=>String(s||'').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/\\\//g,'/').replace(/\\u002[fF]/g,'/').replace(/\\u0026/g,'&');
function url(value,base){try{const u=new URL(decode(value),base);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port?u:null;}catch{return null;}}
function allowed(u){return u&&(['https://v3-cinemeta.strem.io','https://query.wikidata.org','https://videoapp.mov','https://vimeos.net'].includes(u.origin)||/^s[0-9]+\.vimeos\.net$/.test(u.hostname));}
async function read(raw,referer,signal,limit=1048576){
 const u=url(raw);if(!allowed(u))throw Error('unsupported_origin');const headers={Accept:'application/json, text/html, application/vnd.apple.mpegurl, text/plain','User-Agent':'NebulaPlaySources/0.4'};if(referer)headers.Referer=referer;
 const r=await fetch(u,{redirect:'manual',signal,headers});if(!r.ok||r.headers.get('cf-mitigated')==='challenge'){if(r.body)await r.body.cancel();throw Error('upstream_unavailable');}if(!r.body)throw Error('empty_body');
 const parts=[];let size=0;const reader=r.body.getReader();try{while(size<limit){const {done,value}=await reader.read();if(done)break;const part=value.subarray(0,limit-size);parts.push(Buffer.from(part));size+=part.length;}}finally{await reader.cancel().catch(()=>{});}if(size>=limit)throw Error('response_too_large');return Buffer.concat(parts).toString('utf8');
}
function remember(key,ttl,fn){const old=cache.get(key);if(old&&old.until>Date.now())return old.value;if(cache.size>=200)cache.clear();const value=Promise.resolve().then(fn).catch(e=>{cache.delete(key);throw e;});cache.set(key,{until:Date.now()+ttl,value});return value;}
function validTmdb(value){const s=String(value||'');return /^[1-9][0-9]{0,9}$/.test(s)?s:null;}
async function movieId(id,signal){
 const direct=id.match(/^tmdb:(?:movie:)?([1-9][0-9]{0,9})$/);if(direct)return direct[1];if(!/^tt[0-9]{5,12}$/.test(id))throw Error('unsupported_id');
 return remember('id:'+id,86400000,async()=>{
  try{const data=JSON.parse(await read('https://v3-cinemeta.strem.io/meta/movie/'+id+'.json',null,signal));const meta=data.meta;const mapped=validTmdb(meta?.moviedb_id);if(mapped&&(meta.imdb_id===id||meta.id===id))return mapped;}catch{}
  const query='SELECT DISTINCT ?tmdb WHERE { ?film wdt:P345 "'+id+'"; wdt:P4947 ?tmdb. } LIMIT 2';const endpoint=new URL('https://query.wikidata.org/sparql');endpoint.searchParams.set('query',query);endpoint.searchParams.set('format','json');
  const data=JSON.parse(await read(endpoint.href,null,signal));const ids=[...new Set((data.results?.bindings||[]).map(x=>validTmdb(x.tmdb?.value)).filter(Boolean))];if(ids.length!==1)throw Error('movie_id_not_found');return ids[0];
 });
}
function find(html,predicate){for(const m of decode(html).matchAll(/https?:\/\/[^\s"'<>\\`]+/gi)){const u=url(m[0]);if(u&&predicate(u))return u.href;}return null;}
function attrs(line){const out={};for(const m of line.matchAll(/([A-Z0-9-]+)=("[^"]*"|[^,]*)/g))out[m[1]]=m[2].replace(/^"|"$/g,'');return out;}
function qualities(text,master){const lines=text.split(/\r?\n/),out=[];for(let i=0;i<lines.length;i++){if(!lines[i].startsWith('#EXT-X-STREAM-INF:'))continue;const a=attrs(lines[i]);if(a.AUDIO)continue;let j=i+1;while(j<lines.length&&(!lines[j].trim()||lines[j].trim().startsWith('#')))j++;if(j>=lines.length)continue;const u=url(lines[j].trim(),master);if(!u||!/^s[0-9]+\.vimeos\.net$/.test(u.hostname))continue;const [w,h]=(a.RESOLUTION||'0x0').split('x').map(Number);out.push({url:u.href,w:w||0,h:h||0,b:Number(a.BANDWIDTH)||0});}return out.sort((a,b)=>b.h-a.h||b.w-a.w||b.b-a.b);}
async function resolve(id){
 const signal=AbortSignal.timeout(25000);const tmdb=await movieId(id,signal);
 return remember('stream:'+tmdb,15000,async()=>{
  const embed='https://videoapp.mov/e/movie/'+tmdb;const html=await read(embed,'https://pelisjuanita.org/',signal);const player=find(html,u=>u.origin==='https://vimeos.net'&&/^\/embed-[a-z0-9]+\.html$/i.test(u.pathname));if(!player)throw Error('player_not_found');
  const body=await read(player,'https://videoapp.mov/',signal);const master=find(body,u=>/^s[0-9]+\.vimeos\.net$/.test(u.hostname)&&/\/master\.m3u8$/.test(u.pathname));if(!master)throw Error('hls_not_found');
  const fallback={name:'Juanita / Videoapp',title:'HLS original | calidad automática',url:master,behaviorHints:{notWebReady:true}};
  try{const text=await read(master,'https://vimeos.net/',signal,262144);if(!text.trimStart().startsWith('#EXTM3U'))return [fallback];const streams=qualities(text,master).map((v,i)=>({name:'Juanita / Videoapp'+(v.h?' '+v.h+'p':''),title:(i===0?'Mayor calidad entre las variantes directas':'Calidad alternativa')+(v.h?' | '+v.w+'x'+v.h:''),url:v.url,behaviorHints:{notWebReady:true}}));return [...streams,fallback];}catch{return [fallback];}
 });
}
module.exports=async(req,res)=>{
 res.setHeader('Access-Control-Allow-Origin','*');res.setHeader('Access-Control-Allow-Methods','GET, HEAD, OPTIONS');res.setHeader('Access-Control-Allow-Headers','Content-Type');res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('X-Content-Type-Options','nosniff');const send=(status,data)=>{res.statusCode=status;res.end(req.method==='HEAD'?undefined:JSON.stringify(data));};
 if(req.method==='OPTIONS'){res.statusCode=204;return res.end();}if(!['GET','HEAD'].includes(req.method)){res.setHeader('Allow','GET, HEAD, OPTIONS');return send(405,{error:'method_not_allowed'});}
 let route;try{route=decodeURIComponent(String(req.query?.route||'')).replace(/^\/+|\/+$/g,'');}catch{return send(400,{streams:[],error:'invalid_route'});}if(route==='manifest.json')return send(200,manifest);
 if(route.startsWith('catalog/'))return send(200,{metas:[]});
 const match=route.match(/^stream\/movie\/(tt[0-9]{5,12}|tmdb:(?:movie:)?[1-9][0-9]{0,9})\.json$/);if(!match)return send(404,{streams:[],error:'unsupported_route_or_id'});
 try{return send(200,{streams:await resolve(match[1])});}catch(e){const codes=new Set(['unsupported_id','movie_id_not_found','player_not_found','hls_not_found','upstream_unavailable','unsupported_origin','empty_body','response_too_large']);return send(200,{streams:[],error:codes.has(e.message)?e.message:e.name==='TimeoutError'?'upstream_timeout':'source_unavailable'});}
};
