'use strict';
const http = require('node:http');
const handler = require('./api/index');
const port = Number(process.env.PORT || 7000);
http.createServer(handler).listen(port, '0.0.0.0', () => {
  console.log(`Addon iniciado en el puerto ${port}; manifiesto /manifest.json`);
});
