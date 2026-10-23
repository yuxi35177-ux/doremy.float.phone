// All code and API handlers run on the device. No original-site fallback.
const { File } = require('node:buffer');
const { toUSVString } = require('node:util');
globalThis.File ||= File;
String.prototype.toWellFormed ||= function () { return toUSVString(this); };
String.prototype.isWellFormed ||= function () { return toUSVString(this) === String(this); };
process.env.NEXT_PUBLIC_SELF_HOSTED_MODE = '1';
process.env.NEXT_TELEMETRY_DISABLED = '1';
const http = require('node:http');
const originalEmit = http.Server.prototype.emit;
http.Server.prototype.emit = function (event, ...args) {
  if (event === 'request') {
    const [req, res] = args;
    if (req.headers['x-phone-local-token'] !== process.env.PHONE_LOCAL_TOKEN) {
      res.writeHead(403); res.end('Forbidden'); return true;
    }
    if (req.url === '/phone-local-health') {
      res.writeHead(200, {'content-type':'application/json'});
      res.end(JSON.stringify({local:true})); return true;
    }
  }
  return originalEmit.call(this, event, ...args);
};
require('./server.js');
