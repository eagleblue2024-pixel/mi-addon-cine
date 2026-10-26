'use strict';
const original = require('./juanita-demo');
const logo = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAIAAAACACAMAAAD04JH5AAAASFBMVEX///9B3f88zv85wv04vfj5Uf/pS/3KUffZRu83ufMxmdCJW/EeYYfXRey/P9aIMKBWJ3cVL08hFz4ODycJDSIIDSEIDSATDCk6UXd9AAAE7UlEQVR42u2a63bqIBCFCbkUEMI15P3f9Awx9bQ2FwZj+wd12WWt5WPPZpghkvjHN1IBKkAFqAAVoAJUgApQASpABagAFeCv6Y7GIARPEOB+//n59JsKLAO6KKO03kqfXk3kFz1go+VCUN7whra0abiQLqkYwtsBYARpZcMp5S3cu67jXXpuP27EuOgPgkGuGBymLmDay6i8SwJQ2nSUdrf19lYAmHyaehq7pS2MDloIKdNz+wlw028DsEKIZp045daCGPBbv747G70S2PcATLKFqEOsYeoyOv+5Eia4P5bhiuAuB1giD06jMHlr5c6yD9G5oygUA3jZCIg8WE1K4Y9dak0iMJcCSDA9aN81wmZEKoIVmHLXAYD2MDoEnsqQlXHdx8B6fRmAhLgvk5c29yOmZ6p31wB8Tl+iPjUOarxEAS+T9dqs2H8LAsTAXACQzAfqc4kFN70aBv8qwKo+JR4dOMcYGzf8SorMhy9VwswUG9wrCgTHH+YjeALwgGLhJQUcbPSr+QjBIoQ4qhdDIDl9mI8QPMJOJiII+3EqffwGgNGvV6x8GYb74m+/1Ms4hBA1U8McSgHksu2C/uEHQB4CWACWYXEmdGLZdl3cUCBXhIENxZsRlD1P2y4hWIS7BcpCsOgvnnsmFEGIZmczzABwou1SxXcIcIqgIQRlFVHafX7sPYSgEMIy/rhZuZwBWEi/XGy0rTgRYA0MpgTAS2i1GnGvss8A9hCCH/udNXACECxtNvd+QnAISilW1BfYLf0PAcjOGhx6F9AAUH21oP/WHkowCE4PSs0FrZlNTZ+MOAV+IrgeNkI1BzSAhQRAeSwA+P5PDThgLOmOUwaEBDwVAHxFgI4AKgEfkAATZKAWdoD4sgKwDzNdckQj6H7jlz++gxTQQw4ISIAAW2DXioMDvFwD9GAAhz+kmmI6bZKbBsDkAcP2mtKzEHjovhuLV+B7IQ/6Qw72BQAB9gBuIxbguR0b1O4ecAIAOYg2dsIB/GgHFeg/muPzgx0ASTn3EafAcyN1138uOaoNUfCuOzpdzNkBkv5j6WE1VMEiIhTYaMfHQfXKnJ7fbAM4sIBEAGxsgP2gBu1ioQJggdaHXICN6cPyZ0zl9Atk2wIQgjhlAmyUwGA/1jOdc362rQBvDy1w0hvOWkEFlKP/HoBvDtLwaXdsVL8s/1gOYKETt1OGAlv+heWvlM5u28lmKQClkD0PwZZ2ekj2680rAGABKAXkGcCm+uNiP5U//l4IzhXYUh8WP2TfIdN+BwBQDVI+YT+VzMcQ9jtSgHYt9ih02XvS9JGf28uELUcchoaH+VDq7wJMPhXE+RKYcGY+glbgsCB7znv9eGK+o9Z95x3R8NstHiXDrytPwf3QfGgFouW7V5m+Gs/M68rDm++MzRxfbkyj35P+svKcc/FiAL9ebpzj00Wp5cWcks6iPQMIk/dNAWR01suNN238Y9z07JepawYVn0qRL1h5eQAh6sel59E4H03Ubo56XEyfDv/7Zd29NvzxAUVYET76dMiWJIc6c536kCoO/eroxwDpqu/ixRTptNLSUVN6LFNHpvwiBdbvhBii+mT3PjWaaom6dtHHXwBIDFPKY7PRIzy01s7Ei6aef1j9+Bsf33DLvegS4v/vCP0JwNtuFaACVIAKUAEqQAWoABWgAlSAClAB/gFG1gu+hlnXRgAAAABJRU5ErkJggg==','base64');
module.exports = async (req,res) => {
 let route;try{route=decodeURIComponent(String(req.query?.route||'')).replace(/^\/+|\/+$/g,'');}catch{return original(req,res);}
 if(route==='logo.png'){
  res.setHeader('Access-Control-Allow-Origin','*');res.setHeader('Content-Type','image/png');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Cache-Control','public, max-age=86400');
  if(req.method==='OPTIONS'){res.setHeader('Access-Control-Allow-Methods','GET, HEAD, OPTIONS');res.statusCode=204;return res.end();}
  if(!['GET','HEAD'].includes(req.method)){res.setHeader('Allow','GET, HEAD, OPTIONS');res.statusCode=405;return res.end();}
  res.statusCode=200;res.setHeader('Content-Length',String(logo.length));return res.end(req.method==='HEAD'?undefined:logo);
 }
 const end=res.end;
 res.end=function(chunk,...args){
  if(chunk!==undefined){try{
   const data=JSON.parse(Buffer.isBuffer(chunk)?chunk.toString('utf8'):String(chunk));
   if(route==='manifest.json'&&data.id==='org.nebulaplay.juanita.demo'){
    data.name='Nebula Play';data.version='0.4.1';data.description='Fuentes de reproducción para las películas que abres en Nuvio. Sin catálogo propio.';data.logo='https://mi-addon-cine.vercel.app/juanita-demo/logo.png?v=0.4.1';
   }
   if(Array.isArray(data.streams))data.streams=data.streams.map(stream=>({...stream,name:'Nebula Play'+((String(stream.name||'').match(/\s\d+p$/)||[])[0]||'')}));
   chunk=JSON.stringify(data);res.removeHeader('Content-Length');
  }catch{}}
  return end.call(this,chunk,...args);
 };
 return original(req,res);
};
