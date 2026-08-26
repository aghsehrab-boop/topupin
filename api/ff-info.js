const https = require('https');

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

  const targetUrl = `https://ob54-info-by-najmi-admin.vercel.app/info?uid=${encodeURIComponent(uid)}`;

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
