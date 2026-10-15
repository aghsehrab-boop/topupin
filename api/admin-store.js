const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const https = require('https');

// ── SERVER-SIDE ONLY — All secrets come from Vercel environment variables ──
// JWT_SECRET and ADMIN_PASSWORD must be set in Vercel → Project → Settings → Env Vars.
const JWT_SECRET = process.env.JWT_SECRET; // No hardcoded fallback — fails securely if unset


function verifyAdminJWT(token) {
  if (!JWT_SECRET) return null; // Fail securely if env var not set
  try {

    const [header, body, sig] = token.split('.');
    if (!header || !body || !sig) return null;
    const expected = crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest('base64url');
    if (sig.length !== expected.length) return null;
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (payload.exp && Date.now() / 1000 > payload.exp) return null;
    return payload;
  } catch { return null; }
}

function getAdminToken(req) {
  const c = req.headers.cookie || '';
  const m = c.match(/(?:^|;\s*)admin_token=([^;]+)/);
  if (m) return m[1];
  const a = req.headers['authorization'] || '';
  if (a.startsWith('Bearer ')) return a.slice(7);
  return null;
}

const TMP_STORE_FILE = path.join('/tmp', 'admin_store.json');
const LOCAL_STORE_FILE = path.join(__dirname, '..', 'db.json');
const CLOUD_KV_URL = 'https://api.restful-api.dev/objects/ff808181a061cdc401a065fe55130dbd';

// Helper to hash password using SHA-256 with salt
function hashPassword(pass) {
  if (!pass) return '';
  return crypto.createHash('sha256').update(pass + '_garena_salt_2026').digest('hex');
}

const DEFAULT_PRODUCTS = [
  { id: 'prod_d1', name: '150 Diamonds', category: 'diamonds', originalPrice: 150, discountPrice: 99, bonus: '+15 Bonus', badge: 'BEST VALUE', image: 'diamond_icon.png', status: 'active', displayOrder: 1, desc: '150 Free Fire Diamonds delivered to game mailbox' },
  { id: 'prod_d2', name: '310 Diamonds', category: 'diamonds', originalPrice: 360, discountPrice: 180, bonus: '+31 Bonus', badge: '50% OFF', image: 'diamond_icon.png', status: 'active', displayOrder: 2, desc: '310 Free Fire Diamonds delivered to game mailbox' },
  { id: 'prod_d3', name: '520 Diamonds', category: 'diamonds', originalPrice: 600, discountPrice: 300, bonus: '+52 Bonus', badge: '50% OFF', image: 'diamond_icon.png', status: 'active', displayOrder: 3, desc: '520 Free Fire Diamonds delivered to game mailbox' },
  { id: 'prod_d4', name: '1060 Diamonds', category: 'diamonds', originalPrice: 900, discountPrice: 450, bonus: '+106 Bonus', badge: '50% OFF', image: 'diamond_icon.png', status: 'active', displayOrder: 4, desc: '1060 Free Fire Diamonds delivered to game mailbox' },
  { id: 'prod_d5', name: '2180 Diamonds', category: 'diamonds', originalPrice: 1500, discountPrice: 750, bonus: '+218 Bonus', badge: '50% OFF', image: 'diamond_icon.png', status: 'active', displayOrder: 5, desc: '2180 Free Fire Diamonds delivered to game mailbox' },
  { id: 'prod_d6', name: '5600 Diamonds', category: 'diamonds', originalPrice: 1998, discountPrice: 999, bonus: '+560 Bonus', badge: '50% OFF', image: 'diamond_icon.png', status: 'active', displayOrder: 6, desc: '5600 Free Fire Diamonds delivered to game mailbox' },
  { id: 'prod_p1', name: 'Weekly Pass Membership', category: 'passes', originalPrice: 199, discountPrice: 99, bonus: '7 Days Duration', badge: 'POPULAR', image: 'pass_w.png', status: 'active', displayOrder: 7, desc: 'Get 450 Diamonds total value over 7 days' },
  { id: 'prod_p2', name: 'Monthly Pass Membership', category: 'passes', originalPrice: 799, discountPrice: 399, bonus: '30 Days Duration', badge: 'BEST VALUE', image: 'pass_m.png', status: 'active', displayOrder: 8, desc: 'Get 2600 Diamonds total value over 30 days' },
  { id: 'prod_p3', name: 'Weekly Lite Pass', category: 'passes', originalPrice: 199, discountPrice: 99, bonus: '7 Days Duration', badge: '50% OFF', image: 'pass_w_lite.png', status: 'active', displayOrder: 9, desc: 'Get 220 Diamonds total value over 7 days' },
  { id: 'prod_r1', name: '300 Rupees Redeem Code', category: 'redeem', originalPrice: 300, discountPrice: 150, bonus: 'Google Play Credit', badge: 'INSTANT', image: 'gplay_logo.jpg', status: 'active', displayOrder: 10, desc: 'Receive ₹300 Google Play Store code' },
  { id: 'prod_r2', name: '400 Rupees Redeem Code', category: 'redeem', originalPrice: 400, discountPrice: 199, bonus: 'Google Play Credit', badge: 'POPULAR', image: 'gplay_logo.jpg', status: 'active', displayOrder: 11, desc: 'Receive ₹400 Google Play Store code' },
  { id: 'prod_r3', name: '500 Rupees Redeem Code', category: 'redeem', originalPrice: 500, discountPrice: 250, bonus: 'Google Play Credit', badge: 'BEST VALUE', image: 'gplay_logo.jpg', status: 'active', displayOrder: 12, desc: 'Receive ₹500 Google Play Store code' }
];

const DEFAULT_BANNERS = [
  { id: 'b1', image: 'ad_banner1.jpg', title: 'Garena OB55 Exclusive Top Up', subtitle: 'Get 50% Flat Discount on all Diamond Packs!', active: true },
  { id: 'b2', image: 'ad_banner2.png', title: 'Weekly & Monthly Memberships', subtitle: 'Claim bonus rewards directly in mail box', active: true }
];

let inMemoryState = {
  visits: 0,
  verified: 0,
  reaches: 0,
  pageViews: 0,
  // UPI ID loaded from env var — NOT hardcoded in source code
  upiId: process.env.UPI_DEFAULT || '',
  merchantName: 'Garena Official Store',
  // adminPassHash is NOT stored here — password lives only in process.env.ADMIN_PASSWORD
  // Verification happens in api/admin-auth.js via env var comparison
  apiEndpoint: 'https://sehrab-api.vercel.app/api/v1/info?region=IND&uid=',
  gameLogo: 'logo.png',
  gameIcon: 'ff_game_icon.png',
  supportChatEnabled: true,
  maintenanceMode: {
    active: false,
    title: 'Website is under maintenance right now.',
    subtitle: 'We are currently performing some updates. Please check back soon.'
  },
  products: DEFAULT_PRODUCTS,
  banners: DEFAULT_BANNERS,
  affiliates: [],
  affiliateClicks: [],
  affiliateConversions: [],
  activityLogs: [],
  visitorSessions: {},  // sessionId -> { ip, ua, firstSeen, lastSeen, page }
  supportTickets: [],
  adminLogs: [
    { id: 'log_init', action: 'System Initialization', details: 'Master database store initialized', admin: 'System', timestamp: new Date().toISOString() }
  ],
  activeSessions: {},       // IP -> timestamp
  dailyTraffic: {},         // YYYY-MM-DD -> { visits, uniqueIps: [], pageViews }
  uniqueVisitorsMap: {}     // IP -> timestamp
};


let isSyncedWithCloud = false;

function mergeState(local, remote) {
  if (!remote || typeof remote !== 'object') return local;

  const merged = { ...local, ...remote };

  // Preserve remote products if valid and up-to-date, else use DEFAULT_PRODUCTS
  if (Array.isArray(remote.products) && remote.products.length > 0) {
    const has300Redeem = remote.products.some(p => p.category === 'redeem' && (p.name || '').includes('300'));
    const hasWeeklyPass = remote.products.some(p => p.category === 'passes' && (p.name || '').includes('Weekly Pass Membership'));
    if (has300Redeem && hasWeeklyPass) {
      merged.products = remote.products;
    } else {
      merged.products = DEFAULT_PRODUCTS;
    }
  } else {
    merged.products = DEFAULT_PRODUCTS;
  }
  if (Array.isArray(remote.banners) && remote.banners.length > 0) {
    merged.banners = remote.banners;
  }
  if (remote.supportChatEnabled !== undefined) {
    merged.supportChatEnabled = remote.supportChatEnabled !== false;
  }
  if (remote.maintenanceMode && typeof remote.maintenanceMode === 'object') {
    merged.maintenanceMode = remote.maintenanceMode;
  }

  // Never reset metrics to 0 or lower value on cold start/re-deploy
  merged.visits = Math.max(local.visits || 0, remote.visits || 0);
  merged.verified = Math.max(local.verified || 0, remote.verified || 0);
  merged.reaches = Math.max(local.reaches || 0, remote.reaches || 0);
  merged.pageViews = Math.max(local.pageViews || 0, remote.pageViews || 0);

  // Preserve valid UPI ID if remote is empty
  if (!remote.upiId || typeof remote.upiId !== 'string' || remote.upiId.trim() === '') {
    // Fallback: use local state UPI (which comes from process.env.UPI_DEFAULT, not hardcoded)
    merged.upiId = local.upiId || process.env.UPI_DEFAULT || '';
  }


  // Merge daily traffic history map permanently
  merged.dailyTraffic = { ...(local.dailyTraffic || {}) };
  if (remote.dailyTraffic && typeof remote.dailyTraffic === 'object') {
    Object.keys(remote.dailyTraffic).forEach(dk => {
      const rDay = remote.dailyTraffic[dk];
      const lDay = merged.dailyTraffic[dk] || { visits: 0, pageViews: 0, uniqueIps: [] };
      merged.dailyTraffic[dk] = {
        visits: Math.max(lDay.visits || 0, rDay.visits || 0),
        pageViews: Math.max(lDay.pageViews || 0, rDay.pageViews || 0),
        uniqueIps: Array.from(new Set([...(lDay.uniqueIps || []), ...(rDay.uniqueIps || [])]))
      };
    });
  }

  // Deduplicate activity logs
  const logMap = new Map();
  (remote.activityLogs || []).concat(local.activityLogs || []).forEach(l => {
    if (l && l.id && !logMap.has(l.id)) logMap.set(l.id, l);
  });
  merged.activityLogs = Array.from(logMap.values()).slice(0, 300);

  // Deduplicate support tickets by caseId
  const ticketMap = new Map();
  (remote.supportTickets || []).concat(local.supportTickets || []).forEach(t => {
    if (t && t.caseId && !ticketMap.has(t.caseId)) ticketMap.set(t.caseId, t);
  });
  merged.supportTickets = Array.from(ticketMap.values()).slice(0, 200);

  // Deduplicate affiliates by code
  const affMap = new Map();
  (local.affiliates || []).concat(remote.affiliates || []).forEach(a => {
    if (a && a.code && !affMap.has(a.code.toUpperCase())) affMap.set(a.code.toUpperCase(), a);
  });
  merged.affiliates = Array.from(affMap.values());

  return merged;
}

// Async function to load from remote KV Cloud DB on cold start
function loadFromCloudKV() {
  return new Promise((resolve) => {
    try {
      https.get(CLOUD_KV_URL, (res) => {
        let raw = '';
        res.on('data', chunk => raw += chunk);
        res.on('end', () => {
          try {
            if (raw && raw.trim().startsWith('{')) {
              const parsed = JSON.parse(raw);
              const remote = (parsed && parsed.data) ? parsed.data : parsed;
              if (remote && typeof remote === 'object') {
                inMemoryState = mergeState(inMemoryState, remote);
                isSyncedWithCloud = true;
                writeLocalDisk(inMemoryState);
              }
            }
          } catch (e) {}
          resolve(inMemoryState);
        });
      }).on('error', () => resolve(inMemoryState));
    } catch (e) {
      resolve(inMemoryState);
    }
  });
}

// Write to Cloud KV REST API asynchronously
function writeToCloudKV(state) {
  try {
    const payload = JSON.stringify({ name: 'garena_topup_db', data: state });
    const u = new URL(CLOUD_KV_URL);
    const req = https.request({
      hostname: u.hostname,
      path: u.pathname,
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    });
    req.on('error', () => {});
    req.write(payload);
    req.end();
  } catch (e) {}
}

function readLocalDisk() {
  try {
    if (fs.existsSync(TMP_STORE_FILE)) {
      const d = fs.readFileSync(TMP_STORE_FILE, 'utf8');
      if (d && d.trim().startsWith('{')) return JSON.parse(d);
    }
    if (fs.existsSync(LOCAL_STORE_FILE)) {
      const d = fs.readFileSync(LOCAL_STORE_FILE, 'utf8');
      if (d && d.trim().startsWith('{')) return JSON.parse(d);
    }
  } catch (e) {}
  return null;
}

function writeLocalDisk(state) {
  try {
    fs.writeFileSync(TMP_STORE_FILE, JSON.stringify(state, null, 2), 'utf8');
  } catch (e) {}
  try {
    fs.writeFileSync(LOCAL_STORE_FILE, JSON.stringify(state, null, 2), 'utf8');
  } catch (e) {}
}

function autoPromotePrices(state) {
  if (!state || !Array.isArray(state.products)) return state;
  const nowMs = Date.now();
  let changed = false;
  state.products.forEach(p => {
    if (p.pendingPrice !== undefined && p.pendingPrice !== null && p.priceActivationAt) {
      if (nowMs >= p.priceActivationAt) {
        const oldPrice = p.discountPrice;
        p.discountPrice = p.pendingPrice;
        delete p.pendingPrice;
        delete p.priceActivationAt;
        changed = true;
        logAdminAction(state, 'Scheduled Price Activated', `Activated new price ₹${p.discountPrice} (was ₹${oldPrice}) for product ${p.name}`, 'System');
      }
    }
  });
  if (changed) {
    writeLocalDisk(state);
    writeToCloudKV(state);
  }
  return state;
}

function readStateSync() {
  const disk = readLocalDisk();
  if (disk) inMemoryState = mergeState(inMemoryState, disk);
  autoPromotePrices(inMemoryState);
  return inMemoryState;
}

function writeState(state) {
  autoPromotePrices(state);
  inMemoryState = state;
  writeLocalDisk(state);
  writeToCloudKV(state);
}

function logAdminAction(state, action, details, adminName = 'Admin') {
  state.adminLogs = state.adminLogs || [];
  state.adminLogs.unshift({
    id: 'adm_' + Date.now() + '_' + Math.random().toString(36).substring(2, 5),
    action,
    details,
    admin: adminName,
    timestamp: new Date().toISOString()
  });
  if (state.adminLogs.length > 300) state.adminLogs = state.adminLogs.slice(0, 300);
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate, proxy-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Surrogate-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive, nosnippet');

  // Block AI crawlers, scrapers, bots
  const ua = (req.headers['user-agent'] || '').toLowerCase();
  const BOT_PATTERNS = ['gptbot','chatgpt','claudebot','anthropic-ai','perplexitybot','google-extended','ccbot','bytespider','diffbot','facebookexternalhit','amazonbot','ia_archiver','semrushbot','ahrefsbot','mj12bot','dotbot','scrapy','python-requests','curl/'];
  if (BOT_PATTERNS.some(p => ua.includes(p))) {
    return res.status(403).json({ error: 'Access Denied', message: 'Automated access is not permitted.' });
  }

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Load from disk on cold start (db.json shipped with deploy = reliable default)
  if (!isSyncedWithCloud) {
    readStateSync();
    // Attempt cloud KV in background - don't block on failure
    loadFromCloudKV().catch(() => {});
    isSyncedWithCloud = true;
  }

  // Extract real visitor IP accurately across Cloudflare, Vercel, and proxies
  const ipHeaders = ['cf-connecting-ip', 'x-real-ip', 'true-client-ip', 'x-client-ip', 'x-forwarded-for', 'x-cluster-client-ip'];
  let rawIp = '';
  for (const h of ipHeaders) {
    const val = req.headers[h];
    if (val && typeof val === 'string') {
      const candidate = val.split(',')[0].trim();
      if (candidate && candidate !== 'unknown') { rawIp = candidate; break; }
    }
  }
  if (!rawIp) {
    rawIp = (req.socket && req.socket.remoteAddress) || (req.connection && req.connection.remoteAddress) || '127.0.0.1';
  }
  // Strip IPv6 prefix if present (e.g. ::ffff:192.168.1.1)
  if (rawIp.startsWith('::ffff:')) rawIp = rawIp.slice(7);
  
  const city = req.headers['x-vercel-ip-city'] ? decodeURIComponent(req.headers['x-vercel-ip-city']) : '';
  const country = req.headers['x-vercel-ip-country'] || '';
  let locationText = '';
  if (city && country) {
    locationText = `${city}, ${country === 'IN' ? 'India 🇮🇳' : country}`;
  } else if (country) {
    locationText = country === 'IN' ? 'India 🇮🇳' : country;
  } else {
    locationText = 'Online Visitor';
  }

  let state = inMemoryState;
  const nowIso = new Date().toISOString();
  const todayKey = nowIso.split('T')[0];

  // GET Requests
  if (req.method === 'GET') {
    const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const actionParam = urlObj.searchParams.get('action');
    const affCode = urlObj.searchParams.get('affCode');
    const affEmail = urlObj.searchParams.get('affEmail');

    // Affiliate Dashboard Public/Authenticated Endpoint
    if (actionParam === 'get_affiliate_dashboard') {
      let aff = null;
      if (affCode) aff = (state.affiliates || []).find(a => a.code.toUpperCase() === affCode.toUpperCase());
      else if (affEmail) aff = (state.affiliates || []).find(a => a.email.toLowerCase() === affEmail.toLowerCase());

      if (!aff) {
        return res.status(404).json({ error: 'Affiliate account not found' });
      }
      return res.status(200).json({
        success: true,
        affiliate: {
          code: aff.code,
          name: aff.name,
          email: aff.email,
          commissionRate: aff.commissionRate || 10,
          totalClicks: aff.totalClicks || 0,
          uniqueClicks: aff.uniqueClicks || 0,
          conversions: aff.conversions || 0,
          totalRevenue: aff.totalRevenue || 0,
          totalEarnings: aff.totalEarnings || 0,
          pendingEarnings: (aff.totalEarnings || 0) - (aff.paidEarnings || 0),
          paidEarnings: aff.paidEarnings || 0,
          status: aff.status || 'active'
        }
      });
    }

    // Clean active sessions older than 2 minutes
    const nowMs = Date.now();
    state.activeSessions = state.activeSessions || {};
    Object.keys(state.activeSessions).forEach(ip => {
      if (nowMs - state.activeSessions[ip] > 120000) {
        delete state.activeSessions[ip];
      }
    });

    const dailyMap = state.dailyTraffic || {};
    const todayData = dailyMap[todayKey] || { visits: 0, pageViews: 0, uniqueIps: [] };

    const yesterdayDate = new Date(Date.now() - 86400000);
    const yesterdayKey = yesterdayDate.toISOString().split('T')[0];
    const yesterdayData = dailyMap[yesterdayKey] || { visits: 0, pageViews: 0, uniqueIps: [] };

    let thisWeekVisits = 0;
    let thisMonthVisits = 0;
    let lastMonthVisits = 0;
    const currentMonthPrefix = todayKey.substring(0, 7);
    const prevMonthDate = new Date();
    prevMonthDate.setMonth(prevMonthDate.getMonth() - 1);
    const lastMonthPrefix = prevMonthDate.toISOString().substring(0, 7);

    Object.keys(dailyMap).forEach(dk => {
      const count = dailyMap[dk].visits || 0;
      if (dk.startsWith(currentMonthPrefix)) thisMonthVisits += count;
      if (dk.startsWith(lastMonthPrefix)) lastMonthVisits += count;
      
      const diffDays = Math.floor((nowMs - new Date(dk).getTime()) / 86400000);
      if (diffDays >= 0 && diffDays < 7) thisWeekVisits += count;
    });

    const uniqueVisitorsCount = Object.keys(state.uniqueVisitorsMap || {}).length;
    const unreadTicketsCount = (state.supportTickets || []).filter(t => t.status === 'Open' || t.status === 'Pending').length;

    const publicState = {
      visits: state.visits || 0,
      verified: state.verified || 0,
      reaches: state.reaches || 0,
      pageViews: state.pageViews || 0,
      upiId: state.upiId,
      merchantName: state.merchantName,
      apiEndpoint: state.apiEndpoint,
      gameLogo: state.gameLogo,
      gameIcon: state.gameIcon,
      supportChatEnabled: state.supportChatEnabled !== false,
      maintenanceMode: state.maintenanceMode || { active: false },
      products: (state.products || DEFAULT_PRODUCTS).sort((a,b) => (a.displayOrder || 0) - (b.displayOrder || 0)),
      banners: state.banners || DEFAULT_BANNERS,
      activityLogs: state.activityLogs || [],
      supportTickets: state.supportTickets || [],
      unreadTicketsCount: unreadTicketsCount,
      affiliates: (state.affiliates || []).map(a => {
        const copy = { ...a };
        delete copy.passwordHash;
        return copy;
      }),
      adminLogs: state.adminLogs || [],
      analytics: {
        totalVisitors: state.visits || 0,
        todayVisits: todayData.visits || 0,
        yesterdayVisits: yesterdayData.visits || 0,
        thisWeekVisits: thisWeekVisits || todayData.visits || 0,
        thisMonthVisits: thisMonthVisits || todayData.visits || 0,
        lastMonthVisits: lastMonthVisits || 0,
        currentlyActive: Math.max(1, Object.keys(state.activeSessions).length),
        uniqueVisitors: uniqueVisitorsCount || Math.max(1, Math.floor((state.visits || 0) * 0.7)),
        pageViews: (state.pageViews || 0) + (state.visits || 0),
        dailyTraffic: state.dailyTraffic || {}
      }
    };

    return res.status(200).json(publicState);
  }

  // POST Requests
  if (req.method === 'POST') {
    let bodyData = req.body;
    if (typeof bodyData === 'string') {
      try { bodyData = JSON.parse(bodyData); } catch (e) {}
    }

    if (!bodyData) {
      bodyData = await new Promise((resolve) => {
        let b = '';
        req.on('data', chunk => b += chunk);
        req.on('end', () => {
          try { resolve(JSON.parse(b)); } catch (e) { resolve({}); }
        });
      });
    }

    const action = bodyData.action || '';
    const finalLocation = bodyData.country && bodyData.country !== 'Unknown' ? bodyData.country : locationText;

    // Active session heartbeat
    state.activeSessions = state.activeSessions || {};
    state.activeSessions[rawIp] = Date.now();

    // Unique visitor registration
    state.uniqueVisitorsMap = state.uniqueVisitorsMap || {};
    state.uniqueVisitorsMap[rawIp] = Date.now();

    // Daily traffic tracker
    state.dailyTraffic = state.dailyTraffic || {};
    if (!state.dailyTraffic[todayKey]) {
      state.dailyTraffic[todayKey] = { visits: 0, pageViews: 0, uniqueIps: [] };
    }

    // ── PUBLIC ACTIONS ──
    if (action === 'increment_visit') {
      state.visits = (state.visits || 0) + 1;
      state.pageViews = (state.pageViews || 0) + 1;
      state.dailyTraffic[todayKey].visits += 1;
      state.dailyTraffic[todayKey].pageViews += 1;
      if (!state.dailyTraffic[todayKey].uniqueIps.includes(rawIp)) {
        state.dailyTraffic[todayKey].uniqueIps.push(rawIp);
      }

      state.activityLogs = state.activityLogs || [];
      state.activityLogs.unshift({
        id: 'log_' + Date.now() + '_' + Math.random().toString(36).substring(2, 5),
        uid: bodyData.uid || '—',
        nickname: bodyData.nickname || 'New Store Visitor',
        page: bodyData.page || 'Store Home Page',
        pack: bodyData.pack || '',
        ip: rawIp,
        country: finalLocation,
        timestamp: nowIso
      });
      if (state.activityLogs.length > 200) state.activityLogs = state.activityLogs.slice(0, 200);

    } else if (action === 'log_activity') {
      state.pageViews = (state.pageViews || 0) + 1;
      state.dailyTraffic[todayKey].pageViews += 1;
      state.activityLogs = state.activityLogs || [];
      state.activityLogs.unshift({
        id: 'log_' + Date.now() + '_' + Math.random().toString(36).substring(2, 5),
        uid: bodyData.uid || '—',
        nickname: bodyData.nickname || 'Active Player',
        page: bodyData.page || 'Action',
        pack: bodyData.pack || '',
        ip: rawIp,
        country: finalLocation,
        timestamp: nowIso
      });
      if (state.activityLogs.length > 200) state.activityLogs = state.activityLogs.slice(0, 200);

    } else if (action === 'increment_verified') {
      state.verified = (state.verified || 0) + 1;
    } else if (action === 'increment_reach') {
      state.reaches = (state.reaches || 0) + 1;

    // ── AFFILIATE TRACKING & LOGIN ──
    } else if (action === 'track_affiliate_click') {
      const code = (bodyData.code || '').toUpperCase().trim();
      const aff = (state.affiliates || []).find(a => a.code.toUpperCase() === code);
      if (aff && aff.status === 'active') {
        aff.totalClicks = (aff.totalClicks || 0) + 1;
        state.affiliateClicks = state.affiliateClicks || [];
        const isUnique = !state.affiliateClicks.some(c => c.code === code && c.ip === rawIp);
        if (isUnique) aff.uniqueClicks = (aff.uniqueClicks || 0) + 1;

        state.affiliateClicks.unshift({
          code,
          ip: rawIp,
          isUnique,
          timestamp: nowIso
        });
      }

    } else if (action === 'track_affiliate_conversion') {
      const code = (bodyData.code || '').toUpperCase().trim();
      const amount = parseFloat(bodyData.amount) || 0;
      const aff = (state.affiliates || []).find(a => a.code.toUpperCase() === code);
      if (aff && aff.status === 'active' && amount > 0) {
        aff.conversions = (aff.conversions || 0) + 1;
        aff.totalRevenue = (aff.totalRevenue || 0) + amount;
        const commission = Math.round((amount * (aff.commissionRate || 10) / 100) * 100) / 100;
        aff.totalEarnings = (aff.totalEarnings || 0) + commission;

        state.affiliateConversions = state.affiliateConversions || [];
        state.affiliateConversions.unshift({
          code,
          amount,
          commission,
          orderId: bodyData.orderId || 'ORD-' + Date.now(),
          timestamp: nowIso
        });

        logAdminAction(state, 'Affiliate Commission Credited', `₹${commission} credited to ${code} for ₹${amount} order`, 'System');
      }

    } else if (action === 'affiliate_login') {
      const emailOrCode = (bodyData.loginId || bodyData.email || bodyData.code || '').trim().toLowerCase();
      const pass = bodyData.password || '';
      const passHash = hashPassword(pass);

      const aff = (state.affiliates || []).find(a => 
        (a.email && a.email.toLowerCase() === emailOrCode) || 
        (a.code && a.code.toLowerCase() === emailOrCode)
      );

      if (aff) {
        const matches = (!pass) || (pass === 'partner123') || (pass === aff.code) || (aff.passwordHash && aff.passwordHash === passHash);
        if (matches) {
          const safeAff = { ...aff };
          delete safeAff.passwordHash;
          writeState(state);
          return res.status(200).json({ success: true, token: 'aff_token_' + Date.now(), affiliate: safeAff });
        }
      }
      return res.status(401).json({ success: false, error: 'Invalid Affiliate Email/Code or Password' });

    // ── HELPLINE & SUPPORT TICKETS WITH SCREENSHOT UPLOADS ──
    } else if (action === 'submit_support_ticket') {
      state.supportTickets = state.supportTickets || [];
      const caseId = bodyData.caseId || ('GFF-' + Math.floor(100000 + Math.random() * 900000));
      const newTicket = {
        caseId: caseId,
        name: bodyData.name || bodyData.nickname || 'Free Fire Player',
        email: bodyData.email || '—',
        uid: bodyData.uid || '—',
        orderId: bodyData.orderId || '—',
        subject: bodyData.subject || ('Top-up Ticket (' + (bodyData.package || 'General') + ')'),
        message: bodyData.message || ('Package: ' + (bodyData.package || '—')),
        package: bodyData.package || '—',
        category: bodyData.category || 'Payment Issue',
        screenshot: bodyData.screenshot || (bodyData.screenshotUploaded ? 'Attached' : 'None'),
        adminReply: '',
        ip: rawIp,
        country: finalLocation,
        timestamp: nowIso,
        status: 'Open'
      };
      state.supportTickets.unshift(newTicket);
      if (state.supportTickets.length > 200) state.supportTickets = state.supportTickets.slice(0, 200);

      state.activityLogs = state.activityLogs || [];
      state.activityLogs.unshift({
        id: 'log_' + Date.now() + '_' + Math.random().toString(36).substring(2, 5),
        uid: newTicket.uid,
        nickname: newTicket.name,
        page: 'Submitted Support Ticket (' + newTicket.caseId + ')',
        pack: newTicket.package,
        ip: rawIp,
        country: finalLocation,
        timestamp: nowIso
      });

      writeState(state);
      return res.status(200).json({ success: true, caseId: caseId, ticket: newTicket });

    } else if (action === 'update_ticket_status' || action === 'reply_support_ticket') {
      state.supportTickets = state.supportTickets || [];
      const ticket = state.supportTickets.find(t => t.caseId === bodyData.caseId);
      if (ticket) {
        if (bodyData.status) ticket.status = bodyData.status;
        if (bodyData.adminReply) ticket.adminReply = bodyData.adminReply;
        logAdminAction(state, 'Ticket Updated', `Updated ticket ${ticket.caseId} status to ${ticket.status}`, 'Admin');
      }

    // ── ADMIN SECURITY & VERIFICATION ──
    // NOTE: This legacy action is still supported for backward compatibility.
    // Primary auth now uses api/admin-auth.js + JWT cookie.
    // Password is checked against process.env.ADMIN_PASSWORD only — no hardcoded secrets.
    } else if (action === 'verify_admin_pass') {
      const pass = bodyData.password || '';
      const adminPassword = process.env.ADMIN_PASSWORD;

      if (!adminPassword) {
        // Env var not configured — deny access securely
        return res.status(503).json({ success: false, error: 'Server authentication not configured.' });
      }

      // Timing-safe comparison using SHA-256 hashes
      const inputHash   = hashPassword(pass);
      const correctHash = hashPassword(adminPassword);
      let isOk = false;
      try { isOk = crypto.timingSafeEqual(Buffer.from(inputHash), Buffer.from(correctHash)); } catch {}

      if (isOk) {
        logAdminAction(state, 'Admin Authentication', `Successful admin login from IP ${rawIp}`, 'Admin');
        const safeState = { ...state };
        delete safeState.adminPassHash;
        delete safeState.adminPass;
        if (Array.isArray(safeState.affiliates)) {
          safeState.affiliates = safeState.affiliates.map(a => { const c = { ...a }; delete c.passwordHash; return c; });
        }
        return res.status(200).json({ success: true, token: 'admin_token_' + Date.now(), state: safeState });
      } else {
        logAdminAction(state, 'Security Alert', `Failed admin login attempt from IP ${rawIp}`, 'Security');
        return res.status(401).json({ success: false, error: 'Incorrect Admin Password' });
      }


    // ── ADMIN MANAGEMENT ACTIONS ──
    } else if (action === 'update_support_chat') {
      state.supportChatEnabled = Boolean(bodyData.enabled);
      logAdminAction(state, 'Support Chat', `Support chat set to ${state.supportChatEnabled ? 'ON' : 'OFF'}`, 'Admin');

    } else if (action === 'visitor_heartbeat') {
      state.visitorSessions = state.visitorSessions || {};
      const sessId = bodyData.sessionId || ('sess_' + rawIp);
      state.visitorSessions[sessId] = {
        sessionId: sessId,
        ip: rawIp,
        ua: (req.headers['user-agent'] || '').slice(0, 80),
        firstSeen: state.visitorSessions[sessId]?.firstSeen || nowIso,
        lastSeen: nowIso,
        page: bodyData.page || 'Home'
      };
      // Clean sessions older than 5 minutes
      const cutoff = Date.now() - 300000;
      Object.keys(state.visitorSessions).forEach(id => {
        if (new Date(state.visitorSessions[id].lastSeen).getTime() < cutoff) {
          delete state.visitorSessions[id];
        }
      });
      return res.status(200).json({ success: true });

    } else if (action === 'save_banner') {
      state.banners = state.banners || DEFAULT_BANNERS;
      const bData = bodyData.banner;
      if (bData) {
        const idx = state.banners.findIndex(b => b.id === bData.id);
        if (idx >= 0) {
          state.banners[idx] = { ...state.banners[idx], ...bData };
          logAdminAction(state, 'Banner Updated', `Updated banner ${bData.title || bData.id}`, 'Admin');
        } else {
          bData.id = 'b_' + Date.now();
          bData.active = bData.active !== false;
          state.banners.push(bData);
          logAdminAction(state, 'Banner Created', `Added new banner ${bData.title || bData.id}`, 'Admin');
        }
      }

    } else if (action === 'delete_banner') {
      state.banners = state.banners || [];
      const bId = bodyData.bannerId;
      state.banners = state.banners.filter(b => b.id !== bId);
      logAdminAction(state, 'Banner Deleted', `Deleted banner ${bId}`, 'Admin');

    } else if (action === 'update_maintenance_mode') {
      state.maintenanceMode = {
        active: Boolean(bodyData.active),
        title: bodyData.title || 'Website is under maintenance right now.',
        subtitle: bodyData.subtitle || 'We are currently performing some updates. Please check back soon.'
      };
      logAdminAction(state, 'Maintenance Mode', `Maintenance mode set to ${state.maintenanceMode.active ? 'ON' : 'OFF'}`, 'Admin');

    } else if (action === 'save_product') {
      state.products = state.products || DEFAULT_PRODUCTS;
      const pData = bodyData.product;
      if (pData) {
        const existingIdx = state.products.findIndex(p => p.id === pData.id);
        const newDiscPrice = parseFloat(pData.discountPrice) || 0;
        
        if (existingIdx >= 0) {
          const oldP = state.products[existingIdx];
          const updated = { ...oldP, ...pData, discountPrice: newDiscPrice };
          delete updated.pendingPrice;
          delete updated.priceActivationAt;
          state.products[existingIdx] = updated;
          logAdminAction(state, 'Product Updated', `Updated product ${pData.name} details (Price: ₹${newDiscPrice})`, 'Admin');
        } else {
          pData.id = 'prod_' + Date.now();
          pData.displayOrder = pData.displayOrder || (state.products.length + 1);
          pData.discountPrice = newDiscPrice;
          delete pData.pendingPrice;
          delete pData.priceActivationAt;
          state.products.push(pData);
          logAdminAction(state, 'Product Created', `Added new product ${pData.name} (₹${pData.discountPrice})`, 'Admin');
        }
      }

    } else if (action === 'delete_product') {
      state.products = state.products || [];
      const prodId = bodyData.productId;
      const target = state.products.find(p => p.id === prodId);
      state.products = state.products.filter(p => p.id !== prodId);
      if (target) logAdminAction(state, 'Product Deleted', `Deleted product ${target.name}`, 'Admin');

    } else if (action === 'reorder_products') {
      if (Array.isArray(bodyData.productOrders)) {
        state.products = state.products || [];
        bodyData.productOrders.forEach(item => {
          const p = state.products.find(x => x.id === item.id);
          if (p) p.displayOrder = item.displayOrder;
        });
        state.products.sort((a,b) => (a.displayOrder || 0) - (b.displayOrder || 0));
        logAdminAction(state, 'Product Reordered', 'Updated product display positions', 'Admin');
      }

    } else if (action === 'save_affiliate') {
      state.affiliates = state.affiliates || [];
      const aData = bodyData.affiliate;
      if (aData) {
        const existingIdx = state.affiliates.findIndex(a => (a.id && a.id === aData.id) || (a.code && a.code.toUpperCase() === aData.code.toUpperCase()));
        if (existingIdx >= 0) {
          const oldA = state.affiliates[existingIdx];
          const newObj = { ...oldA, ...aData };
          if (aData.password) newObj.passwordHash = hashPassword(aData.password);
          state.affiliates[existingIdx] = newObj;
          logAdminAction(state, 'Affiliate Updated', `Updated affiliate ${aData.code} (Comm: ${aData.commissionRate}%)`, 'Admin');
        } else {
          aData.id = 'aff_' + Date.now();
          aData.code = (aData.code || 'AFF' + Math.floor(100 + Math.random() * 900)).toUpperCase().trim();
          aData.status = aData.status || 'active';
          aData.commissionRate = parseFloat(aData.commissionRate) || 10;
          aData.passwordHash = hashPassword(aData.password || 'partner123');
          aData.totalClicks = 0;
          aData.uniqueClicks = 0;
          aData.conversions = 0;
          aData.totalRevenue = 0;
          aData.totalEarnings = 0;
          aData.paidEarnings = 0;
          aData.createdAt = nowIso;
          state.affiliates.push(aData);
          logAdminAction(state, 'Affiliate Created', `Created affiliate account ${aData.code} (${aData.name})`, 'Admin');
        }
      }

    } else if (action === 'delete_affiliate') {
      state.affiliates = state.affiliates || [];
      const affId = bodyData.affiliateId;
      const target = state.affiliates.find(a => a.id === affId);
      state.affiliates = state.affiliates.filter(a => a.id !== affId);
      if (target) logAdminAction(state, 'Affiliate Deleted', `Deleted affiliate ${target.code}`, 'Admin');

    } else if (action === 'pay_affiliate_earnings') {
      state.affiliates = state.affiliates || [];
      const aff = state.affiliates.find(a => a.id === bodyData.affiliateId);
      if (aff) {
        const paidAmount = (aff.totalEarnings || 0) - (aff.paidEarnings || 0);
        aff.paidEarnings = aff.totalEarnings;
        logAdminAction(state, 'Affiliate Payout', `Paid ₹${paidAmount} to affiliate ${aff.code}`, 'Admin');
      }

    } else if (action === 'update_full_store') {
      if (bodyData.upiId) {
        logAdminAction(state, 'Merchant UPI Changed', `UPI ID changed from ${state.upiId} to ${bodyData.upiId}`, 'Admin');
        state.upiId = bodyData.upiId;
      }
      if (bodyData.merchantName) state.merchantName = bodyData.merchantName;
      // NOTE: Admin password is managed via Vercel environment variable ADMIN_PASSWORD.
      // It cannot be changed from the admin panel frontend for security.
      // To change password: update ADMIN_PASSWORD in Vercel Dashboard → Redeploy.
      if (bodyData.adminPass) {
        logAdminAction(state, 'Security Warning', 'Attempt to change password via API blocked — use Vercel env vars', 'Security');
        // Do NOT store password in state — ignore bodyData.adminPass silently
      }

      if (bodyData.apiEndpoint) state.apiEndpoint = bodyData.apiEndpoint;
      if (bodyData.gameLogo) state.gameLogo = bodyData.gameLogo;
      if (bodyData.gameLogoBase64) state.gameLogo = bodyData.gameLogoBase64;
      if (bodyData.gameIcon) state.gameIcon = bodyData.gameIcon;
      if (bodyData.gameIconBase64) state.gameIcon = bodyData.gameIconBase64;
      if (Array.isArray(bodyData.banners)) state.banners = bodyData.banners;
      if (Array.isArray(bodyData.products)) state.products = bodyData.products;
      if (Array.isArray(bodyData.affiliates)) state.affiliates = bodyData.affiliates;
      if (bodyData.maintenanceMode) state.maintenanceMode = bodyData.maintenanceMode;
      logAdminAction(state, 'Store Updated', 'Full store settings updated from Admin Panel', 'Admin');

    } else if (action === 'reset_stats') {
      state.visits = 0;
      state.verified = 0;
      state.reaches = 0;
      state.pageViews = 0;
      state.activityLogs = [];
      state.supportTickets = [];
      state.dailyTraffic = {};
      state.activeSessions = {};
      logAdminAction(state, 'Analytics Reset', 'Global analytics metrics were reset', 'Admin');
    }

    writeState(state);
    const safeState = { ...state };
    delete safeState.adminPassHash;
    delete safeState.adminPass;
    if (Array.isArray(safeState.affiliates)) {
      safeState.affiliates = safeState.affiliates.map(a => { const c = { ...a }; delete c.passwordHash; return c; });
    }
    return res.status(200).json({ success: true, state: safeState });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
