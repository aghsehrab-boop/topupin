// ═══════════════════════════════════════════════════════
//  Visitor & UID Tracking API — /api/track
//  Logs: IP, UID, timestamp, userAgent, page event
//  Storage: Vercel KV (if available) + in-memory ring buffer
//  Admin view: GET /api/track?admin=1&key=<ADMIN_KEY>
// ═══════════════════════════════════════════════════════

// In-memory ring buffer (survives hot reloads, lost on cold start)
// For persistent storage across cold starts, set TRACK_WEBHOOK env var
// to a Discord webhook URL or similar.
const MAX_LOGS = 500;
if (!global._visitLogs) {
  global._visitLogs = [];
  try {
    const fs = require('fs');
    const path = require('path');
    const trackFile = path.join('/tmp', 'visitor_track.json');
    if (fs.existsSync(trackFile)) {
      const data = JSON.parse(fs.readFileSync(trackFile, 'utf8'));
      if (Array.isArray(data)) global._visitLogs = data;
    }
  } catch (e) {}
}

function getRealIp(req) {
  // Try all headers in order of reliability
  const headers = [
    'cf-connecting-ip',        // Cloudflare
    'x-real-ip',               // Nginx proxy
    'x-forwarded-for',         // Standard proxy (may be comma-separated list)
    'x-client-ip',
    'x-cluster-client-ip',
    'forwarded-for',
    'forwarded',
  ];
  for (const h of headers) {
    const val = req.headers[h];
    if (val) {
      // x-forwarded-for can be "client, proxy1, proxy2" — take first
      return val.split(',')[0].trim();
    }
  }
  // Fallback to socket remote address
  return (
    req.socket?.remoteAddress ||
    req.connection?.remoteAddress ||
    'unknown'
  );
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const ADMIN_KEY = process.env.ADMIN_TRACK_KEY || 'garena_admin_2024';

  // ── Admin View: GET /api/track?admin=1&key=xxx ──────────────────
  if (req.method === 'GET') {
    const { admin, key } = req.query || {};
    if (admin === '1' && key === ADMIN_KEY) {
      const logs = global._visitLogs.slice().reverse(); // newest first
      return res.status(200).json({
        success: true,
        total: logs.length,
        logs
      });
    }
    // Unauthorized
    return res.status(403).json({ success: false, error: 'Forbidden' });
  }

  // ── Log Event: POST /api/track ───────────────────────────────────
  if (req.method === 'POST') {
    const ip = getRealIp(req);
    const body = req.body || {};

    const logEntry = {
      ts:        new Date().toISOString(),
      ip,
      uid:       body.uid       || null,
      event:     body.event     || 'visit',    // 'visit' | 'uid_check' | 'payment_init'
      nickname:  body.nickname  || null,
      pack:      body.pack      || null,
      amount:    body.amount    || null,
      userAgent: req.headers['user-agent'] || 'unknown',
      referer:   req.headers['referer']    || null,
    };

    // Push to ring buffer
    global._visitLogs.push(logEntry);
    if (global._visitLogs.length > MAX_LOGS) {
      global._visitLogs.shift(); // remove oldest
    }

    // Persist to disk (/tmp/visitor_track.json)
    try {
      const fs = require('fs');
      const path = require('path');
      const trackFile = path.join('/tmp', 'visitor_track.json');
      fs.writeFileSync(trackFile, JSON.stringify(global._visitLogs, null, 2), 'utf8');
    } catch (e) {}

    // Optional: send to Discord webhook for persistent logging
    const webhook = process.env.TRACK_WEBHOOK;
    if (webhook) {
      try {
        const https = require('https');
        const message = JSON.stringify({
          content: null,
          embeds: [{
            title: `🔍 ${logEntry.event.toUpperCase()} — ${ip}`,
            color: logEntry.event === 'uid_check' ? 0xf59e0b : 0x22c55e,
            fields: [
              { name: '🌐 IP Address', value: ip, inline: true },
              { name: '🎮 UID', value: logEntry.uid || 'N/A', inline: true },
              { name: '👤 Nickname', value: logEntry.nickname || 'N/A', inline: true },
              { name: '📦 Pack', value: logEntry.pack || 'N/A', inline: true },
              { name: '💰 Amount', value: logEntry.amount ? '₹' + logEntry.amount : 'N/A', inline: true },
              { name: '⏰ Time (IST)', value: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }), inline: true },
              { name: '📱 User Agent', value: (logEntry.userAgent || 'unknown').substring(0, 100), inline: false },
            ],
            timestamp: new Date().toISOString()
          }]
        });

        const url = new URL(webhook);
        const postData = message;
        const options = {
          hostname: url.hostname,
          path: url.pathname + url.search,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(postData)
          }
        };
        const reqHttp = https.request(options);
        reqHttp.write(postData);
        reqHttp.end();
      } catch (e) {
        // Silent fail — don't break the main response
      }
    }

    return res.status(200).json({ success: true, ip });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
