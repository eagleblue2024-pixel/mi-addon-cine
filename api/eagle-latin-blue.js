'use strict';
const original=require('./pelis-host-test'),sources=require('../lib/eagle-latin-blue-sources');
module.exports=async(req,res)=>{
 const q=new URL(req.url,'https://addon.local').searchParams,raw=req.query?.addonRoute??q.get('addonRoute');let route='';try{route=decodeURIComponent(String(raw||'')).replace(/^\/+|\/+$/g,'');}catch{}
 const match=route.match(/^stream\/movie\/(pelisprobe-live-[a-z0-9]+(?:-[a-z0-9]+)*)\.json$/);
 if(match){
  res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Access-Control-Allow-Origin','*');res.setHeader('Access-Control-Allow-Methods','GET, HEAD, OPTIONS');res.setHeader('Access-Control-Allow-Headers','Content-Type');
  const send=(status,data)=>{res.statusCode=status;res.end(req.method==='HEAD'?undefined:JSON.stringify(data));};
  if(req.method==='OPTIONS'){res.statusCode=204;return res.end();}
  if(!['GET','HEAD'].includes(req.method)){res.setHeader('Allow','GET, HEAD, OPTIONS');return send(405,{streams:[],error:'only_get_or_head'});}
  if(req.method==='HEAD')return send(200,{});
  try{return send(200,await sources(match[1]));}catch(e){return send(200,{streams:[],error:e.name==='TimeoutError'||e.name==='AbortError'?'source_timeout':e.name==='TypeError'?'source_fetch_or_parse_failed':e.message});}
 }
 const end=res.end;
 res.end=function(chunk,...args){
  if(chunk!==undefined&&res.statusCode===200){
   try{
    const data=JSON.parse(Buffer.isBuffer(chunk)?chunk.toString('utf8'):String(chunk));let changed=false;
    if(data.id==='org.nebulaplay.pelis.isolated'){
     data.id='org.eaglelatinblue.pelis';data.name='Eagle Latin Blue';data.version='0.5.0';
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
