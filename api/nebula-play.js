'use strict';
const original = require('./juanita-demo');
const logo = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAIAAAACABAMAAAAxEHz4AAAAGFBMVEWAqFUQGxwPGxwOFxkMEBIMEBEHEBYHDRN32+4DAAAFC0lEQVR42u2Z72scRRjHv7PJXTTF3u6FRGjBbC69+tJLAr5tgn2l0F6FiLVgrkJS8JVB6L9RXwm+0VOoBcXkGqiCiFRfCL6wpi/8QUIum4KKaZKdK2mT7KU3vtjb293Zmd3Z3DvJvLn9MfuZZ57nmed5Zo6cR3dNwzHgGHAMEAMMXd6bGJFHvXwXVo8bb8cw7FiAbu9Y8SKPGiwGoK/Xk+a8VsgzqQ7ITj1Za/V7UiWS1q8qem9RXQLI3VOz3NqGGEDWVG1f14WAk5YqoLUhApC6uvsFRPABOaEAxEwQwQdsC8cafiB8vB4FECrseW5X+JhFAeIZgB6K1diIAMQz0GqtcvwctPgZ9FImXt2dxz2F9sUf4n57WBG/yKtFpAvRiNFuDQ6QE3fLAVQtpO2IQ1gVaJqxWoyfQi8AVlKRQGKEGPk9M8RLcBoAlrrIC+cAYDdWOI337VC7CwASZ1aRIGMBgMSZVQCuapmeCkAC1/3uz6fBzJEIYG9Mdzxnkks+2vQsTcqNMD8ytLmt72lAtfQEAJAzU99+aQ+0eInbpe62F08ymwCMzNWtBZCWOx4pWShObdZsAFdr3pcTEgBmPnCz/GD5h5/bj97fbS66SbmvH4kAzYtNRPcyucG8qY9ZPEBgRk/RrFMJ2FRgIqkftC7JjT5oqTjSHV3oFADIFSVPbFY6l9lK6E22qubKt3yv+ibkee8qrgXHH9d5UY8XQLyYfvQvVwIqfU55NTYCw96e76jwgjIgaEl20wuqgzX1ePB1QITmP+2bKykCihM0n3NWB4C+apqIdCt4s3oJAN5KFdJCIuD2PECW08XE+6Eo9dl7omUQCwjns9GqNEdJAJnF0N0KRbOcCnA6OKD2GgXYnVSAUKZ6+xMAeGimAGSDKn/9hssspQBcDlwPfdW++FwdEFy3mX89dRxUlAGv0rAC2+2mKkBb5BXotodlRcALnUGfFm8ETbOkCHjJz5wriRWTFqvCg/AnTytKgMvyxPKhCiBTlQOcigLAsxsZuOY9uj6mewEy0t2r1ve82WZ+2wdAjJnxxz/17buoJw+mX/n9mX0AT9780/vylCS96+uAUZz8bh3ARXc2PScB5M8fLtiAv3GekJQ4OhmsbC+sBnNrLwDsfIHimFMjLKnE0SoLFAFpAPh1ETnTtJIKjNbHvu0fd3Ydni+uWulqZV1cGyoD3CqZ3D0ygFX8ivlo5X4jcQYJgCV5ua8G6AWAmS4Ah7p8O6UEaJUBUuvyLC3T1WHcfemeVhHwV3vrl7zxlDvzZPzICRIcyh1ZaecKVslaSlOQbu0aTLYlVDRj7YTsTXjrizxSthFOggb3/qxZzMzNZubeGdKHBsvArHR36/3D8UvY/Zy9Z81llJZJLutgr9+oz3P5ZoI/BjIjKioRYhHmautiaP8LQNM5QMQMB6FQwrwAGzk561ghqsVlZpvMtZZW1SU69AGPuCquRNH3svU8ax9oUcfkz4c4AD8HgpKzik2YlFYcB4SF1kSPHl2N3Bz+BpgNRiYPAGaT6+HyZIRGzAiyFfJ6wnQKoLjhZB2AS4naFI1KwArBLnmmNQoFrbDqFE+RQmE47PMFGnWkiAhxK3CKiiJSWIS4FhAgJNmjcbXvB4YlMZEZptIERqgsqNJRBYI2zuSnOHRUSzrf5v5e4GskWjBsyBl53eCLJML/4+kfvYiafxwjPYhicd/DPkJuTNLpMeAY8P8A/Adsxm6TTCtf6gAAAABJRU5ErkJggg==','base64');
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
    data.name='Nebula Play';data.version='0.4.2';data.description='Fuentes de reproducción para las películas que abres en Nuvio. Sin catálogo propio.';data.logo='https://mi-addon-cine.vercel.app/juanita-demo/logo.png?v=0.4.2';
   }
   if(Array.isArray(data.streams))data.streams=data.streams.map(stream=>({...stream,name:'Nebula Play'+((String(stream.name||'').match(/\s\d+p$/)||[])[0]||'')}));
   chunk=JSON.stringify(data);res.removeHeader('Content-Length');
  }catch{}}
  return end.call(this,chunk,...args);
 };
 return original(req,res);
};
