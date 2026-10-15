// ============================================================
// SERVER-SIDE ONLY — api/admin-auth.js
// Admin authentication handler using Vercel environment variables.
// Password, JWT secret — NEVER exposed to frontend.
// ============================================================

const crypto = require("crypto");

// ── All secrets come ONLY from environment variables ──
// Set these in Vercel Dashboard → Project → Settings → Environment Variables
// ADMIN_PASSWORD : The master admin password
// JWT_SECRET     : A strong random 96-char hex string (server-generated)
// If env vars are missing in production, login returns 503 (server misconfigured).
const JWT_SECRET = process.env.JWT_SECRET;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

// ── Timing-safe password hash (SHA-256 + salt) ──
// Salt is fixed per-project so hashes are consistent across cold starts.
function hashPassword(pass) {
  // NOTE: Salt is not a secret — it just prevents rainbow table attacks.
  return crypto.createHash("sha256").update(pass + "_garena_salt_2026").digest("hex");
}

// ── JWT sign & verify (HS256, server-side only) ──
function signJWT(payload) {
  if (!JWT_SECRET) throw new Error("JWT_SECRET not configured");
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const body   = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig    = crypto.createHmac("sha256", JWT_SECRET).update(`${header}.${body}`).digest("base64url");
  return `${header}.${body}.${sig}`;
}

function verifyJWT(token) {
  if (!JWT_SECRET) return null;
  try {
    const [header, body, sig] = token.split(".");
    if (!header || !body || !sig) return null;
    const expected = crypto.createHmac("sha256", JWT_SECRET).update(`${header}.${body}`).digest("base64url");
    if (sig.length !== expected.length) return null;
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
    const payload = JSON.parse(Buffer.from(body, "base64url").toString());
    if (payload.exp && Date.now() / 1000 > payload.exp) return null;
    return payload;
  } catch { return null; }
}

// ── Extract JWT token from HttpOnly cookie or Authorization header ──
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

// ── Rate limiting — max 5 login attempts per IP per 15 minutes ──
const rateLimitStore = {};
function checkRateLimit(ip) {
  const now = Date.now(), windowMs = 15 * 60 * 1000, maxAttempts = 5;
  if (!rateLimitStore[ip]) rateLimitStore[ip] = { count: 0, resetAt: now + windowMs };
  if (now > rateLimitStore[ip].resetAt) rateLimitStore[ip] = { count: 0, resetAt: now + windowMs };
  rateLimitStore[ip].count++;
  return rateLimitStore[ip].count <= maxAttempts;
}
function resetRateLimit(ip) { delete rateLimitStore[ip]; }

// ── Main handler ──
module.exports = async function handler(req, res) {
  // Security headers — prevent caching, framing, indexing
  res.setHeader("Cache-Control", "no-store,no-cache,must-revalidate,max-age=0");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Access-Control-Allow-Origin", req.headers.origin || "*");
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
  res.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive, nosnippet");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-Content-Type-Options", "nosniff");

  if (req.method === "OPTIONS") return res.status(200).end();

  // Block AI crawlers and automated scrapers
  const ua = (req.headers["user-agent"] || "").toLowerCase();
  const BOT_PATTERNS = ["gptbot","chatgpt","claudebot","anthropic-ai","perplexitybot","google-extended","ccbot","bytespider","diffbot","facebookexternalhit","amazonbot","ia_archiver","semrushbot","ahrefsbot","mj12bot","dotbot","scrapy","python-requests"];
  if (BOT_PATTERNS.some(p => ua.includes(p))) {
    return res.status(403).json({ error: "Access Denied" });
  }

  const qs  = req.url.split("?")[1] || "";
  const qp  = new URLSearchParams(qs);
  const action = qp.get("action") || (req.body && req.body.action) || "verify";
  const rawIp  = ((req.headers["x-forwarded-for"] || "").split(",")[0] || req.socket?.remoteAddress || "0.0.0.0").trim();

  // ── verify: check if current session token is valid ──
  if (action === "verify") {
    const token = getTokenFromReq(req);
    if (!token) return res.status(401).json({ valid: false, error: "Not authenticated" });
    const payload = verifyJWT(token);
    if (!payload) return res.status(401).json({ valid: false, error: "Session expired" });
    return res.status(200).json({ valid: true, admin: payload.admin });
  }

  // ── logout: clear the HttpOnly cookie ──
  if (action === "logout") {
    res.setHeader("Set-Cookie", "admin_token=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0");
    return res.status(200).json({ success: true });
  }

  // ── login: verify password server-side, issue JWT cookie ──
  if (action === "login" && req.method === "POST") {
    // Guard: env vars must be configured in production
    if (!ADMIN_PASSWORD || !JWT_SECRET) {
      console.error("SECURITY: ADMIN_PASSWORD or JWT_SECRET env var is not set.");
      return res.status(503).json({ success: false, error: "Server authentication not configured. Contact admin." });
    }

    if (!checkRateLimit(rawIp)) {
      return res.status(429).json({ success: false, error: "Too many login attempts. Please wait 15 minutes." });
    }

    let body = {};
    try { body = JSON.parse(await getRawBody(req)); } catch {}
    const password = (body.password || "").trim();
    if (!password) return res.status(400).json({ success: false, error: "Password required" });

    // Compare submitted password hash against env var password hash (timing-safe)
    const inputHash  = hashPassword(password);
    const correctHash = hashPassword(ADMIN_PASSWORD);

    let isValid = false;
    try {
      isValid = crypto.timingSafeEqual(Buffer.from(inputHash), Buffer.from(correctHash));
    } catch { isValid = false; }

    if (!isValid) {
      return res.status(401).json({ success: false, error: "Incorrect password" });
    }

    // Password correct — sign JWT and set as HttpOnly cookie (JS cannot read this)
    resetRateLimit(rawIp);
    const now = Math.floor(Date.now() / 1000);
    const token = signJWT({ admin: "master", iat: now, exp: now + 28800 }); // 8 hours

    const cookieParts = [`admin_token=${token}`, "Path=/", "HttpOnly", "SameSite=Strict", "Max-Age=28800"];
    if ((req.headers["x-forwarded-proto"] || "https") === "https") cookieParts.push("Secure");
    res.setHeader("Set-Cookie", cookieParts.join("; "));
    return res.status(200).json({ success: true });
  }

  return res.status(400).json({ error: "Unknown action" });
};
