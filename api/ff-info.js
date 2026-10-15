const https = require('https');
const fs = require('fs');
const path = require('path');

const STORE_FILE = path.join('/tmp', 'admin_store.json');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const uid = req.query.uid || '';
  if (!uid) {
    return res.status(400).json({ error: 'UID parameter is required' });
  }

  let baseUrl = 'https://sehrab-api.vercel.app/api/v1/info?region=IND&uid=';
  try {
    if (fs.existsSync(STORE_FILE)) {
      const data = fs.readFileSync(STORE_FILE, 'utf8');
      if (data && data.trim().startsWith('{')) {
        const parsed = JSON.parse(data);
        if (parsed.apiEndpoint) baseUrl = parsed.apiEndpoint;
      }
    }
  } catch (e) {}

  let targetUrl;
  if (baseUrl.includes('sehrab-api.vercel.app')) {
    targetUrl = `https://sehrab-api.vercel.app/api/v1/info?region=IND&uid=${encodeURIComponent(uid)}`;
  } else if (baseUrl.includes('danger-player-info.vercel.app') && !baseUrl.includes('key=')) {
    targetUrl = `https://danger-player-info.vercel.app/accinfo?key=DANGERxINFO&uid=${encodeURIComponent(uid)}`;
  } else {
    targetUrl = baseUrl.endsWith('=') ? `${baseUrl}${encodeURIComponent(uid)}` : `${baseUrl}${encodeURIComponent(uid)}`;
  }

  return new Promise((resolve) => {
    https.get(targetUrl, (apiRes) => {
      let rawData = '';
      apiRes.on('data', (chunk) => { rawData += chunk; });
      apiRes.on('end', () => {
        try {
          const parsed = JSON.parse(rawData);
          res.status(apiRes.statusCode || 200).json(parsed);
        } catch (e) {
          res.status(500).json({ error: 'Failed to parse API response' });
        }
        resolve();
      });
    }).on('error', (err) => {
      res.status(502).json({ error: 'Proxy failed: ' + err.message });
      resolve();
    });
  });
};
