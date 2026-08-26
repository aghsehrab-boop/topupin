const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3456;
const DB_FILE = path.join(__dirname, 'db.json');

// Initialize db.json if it doesn't exist
if (!fs.existsSync(DB_FILE)) {
  fs.writeFileSync(DB_FILE, JSON.stringify({ settings: null, ids: null, banners: null, leads: null }));
}

const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.mp4': 'video/mp4',
};

const server = http.createServer((req, res) => {
  // CORS Headers so any client (like mobile phone on Wi-Fi) can access without blocks
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // API Route to GET Free Fire Player Info (Proxy to bypass browser CORS)
  if (req.url.startsWith('/api/ff-info') && req.method === 'GET') {
    const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const uidParam = urlObj.searchParams.get('uid') || '';
    if (!uidParam) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'UID parameter is required' }));
      return;
    }

    const targetUrl = `https://ob54-info-by-najmi-admin.vercel.app/info?uid=${encodeURIComponent(uidParam)}`;
    const https = require('https');
    https.get(targetUrl, (apiRes) => {
      let rawData = '';
      apiRes.on('data', (chunk) => { rawData += chunk; });
      apiRes.on('end', () => {
        try {
          res.writeHead(apiRes.statusCode || 200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
          res.end(rawData);
        } catch (e) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Failed to process API response' }));
        }
      });
    }).on('error', (err) => {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Proxy connection to OB54 API failed: ' + err.message }));
    });
    return;
  }

  // API Route to GET data
  if (req.url === '/api/data' && req.method === 'GET') {
    fs.readFile(DB_FILE, 'utf8', (err, data) => {
      if (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to read database' }));
      } else {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(data);
      }
    });
    return;
  }

  // API Route to POST data
  if (req.url === '/api/data' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const parsed = JSON.parse(body);
        fs.writeFile(DB_FILE, JSON.stringify(parsed, null, 2), 'utf8', err => {
          if (err) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Failed to write database' }));
          } else {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true }));
          }
        });
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON' }));
      }
    });
    return;
  }

  // Static File Serving
  let urlPath = req.url.split('?')[0];
  let filePath = path.join(__dirname, urlPath === '/' ? 'index.html' : urlPath);
  const extname = path.extname(filePath);
  let contentType = MIME_TYPES[extname] || 'application/octet-stream';

  fs.readFile(filePath, (error, content) => {
    if (error) {
      if (error.code === 'ENOENT') {
        res.writeHead(404, { 'Content-Type': 'text/html' });
        res.end('<h1>404 Not Found</h1>', 'utf-8');
      } else {
        res.writeHead(500);
        res.end(`Error: ${error.code}\n`);
      }
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content, 'utf-8');
    }
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running at http://localhost:${PORT}/`);
});
