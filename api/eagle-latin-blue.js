'use strict';
const original=require('./pelis-host-test');
module.exports=async(req,res)=>{
 const end=res.end;
 res.end=function(chunk,...args){
  if(chunk!==undefined&&res.statusCode===200){
   try{
    const data=JSON.parse(Buffer.isBuffer(chunk)?chunk.toString('utf8'):String(chunk));let changed=false;
    if(data.id==='org.nebulaplay.pelis.isolated'){
     data.id='org.eaglelatinblue.pelis';data.name='Eagle Latin Blue';data.version='0.4.1';
     data.description='Películas de PelisPlusHD con portada y búsqueda. Fuentes experimentales según disponibilidad del servidor. Resolución máxima y compatibilidad de todas las fuentes todavía no verificadas.';
     if(Array.isArray(data.catalogs))data.catalogs=data.catalogs.map(c=>({...c,name:c.id==='pelis-isolated'?'Eagle Latin Blue - Pruebas':c.id==='pelis-live'?'Eagle Latin Blue - Películas':c.name}));
     changed=true;
    }
    if(Array.isArray(data.streams)){data.streams=data.streams.map(s=>({...s,name:String(s.name||'').startsWith('Pelis - ')?'Eagle Latin Blue - '+s.name.slice(8):s.name}));changed=true;}
    if(changed){chunk=JSON.stringify(data);res.removeHeader('Content-Length');}
   }catch{}
  }
  return end.call(this,chunk,...args);
 };
 return original(req,res);
};
