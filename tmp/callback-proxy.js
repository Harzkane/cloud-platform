const http = require('http');
const https = require('https');

const server = http.createServer((req, res) => {
  console.log(`Proxying ${req.method} ${req.url}`);
  
  const headers = { ...req.headers };
  headers['host'] = 'cloud-platform-5vf4.onrender.com';
  
  const proxyReq = https.request({
    hostname: 'cloud-platform-5vf4.onrender.com',
    port: 443,
    path: req.url,
    method: req.method,
    headers: headers
  }, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res);
  });
  
  req.pipe(proxyReq);
  
  proxyReq.on('error', (err) => {
    console.error('Proxy request error:', err);
    res.writeHead(500);
    res.end();
  });
});

server.listen(3000, '127.0.0.1', () => {
  console.log('Proxy listening on 127.0.0.1:3000');
});
