// ============================================================
// PROTECTED SERVERLESS API — api/admin/products.js
// Admin Product Management Endpoint (CRUD for Diamonds, Passes, Redeem Codes)
// STRICT SECURITY: Requires valid JWT HttpOnly Cookie or Bearer Token.
// Rejects unauthenticated requests with HTTP 401.
// ============================================================

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const https = require("https");

const JWT_SECRET = process.env.JWT_SECRET;
const TMP_STORE_FILE = path.join("/tmp", "admin_store.json");
const LOCAL_STORE_FILE = path.join(__dirname, "..", "..", "db.json");
const CLOUD_KV_URL = process.env.UPSTASH_REDIS_REST_URL || "https://api.restful-api.dev/objects/ff808181a061cdc401a0661f02fd0dee";

const DEFAULT_PRODUCTS = [
  { id: "prod_d1", name: "150 Diamonds", category: "diamonds", originalPrice: 150, discountPrice: 99, bonus: "+15 Bonus", badge: "BEST VALUE", image: "diamond_icon.png", status: "active", displayOrder: 1, desc: "150 Free Fire Diamonds delivered to game mailbox" },
  { id: "prod_d2", name: "310 Diamonds", category: "diamonds", originalPrice: 360, discountPrice: 180, bonus: "+31 Bonus", badge: "50% OFF", image: "diamond_icon.png", status: "active", displayOrder: 2, desc: "310 Free Fire Diamonds delivered to game mailbox" },
  { id: "prod_d3", name: "520 Diamonds", category: "diamonds", originalPrice: 600, discountPrice: 300, bonus: "+52 Bonus", badge: "50% OFF", image: "diamond_icon.png", status: "active", displayOrder: 3, desc: "520 Free Fire Diamonds delivered to game mailbox" },
  { id: "prod_d4", name: "1060 Diamonds", category: "diamonds", originalPrice: 900, discountPrice: 450, bonus: "+106 Bonus", badge: "50% OFF", image: "diamond_icon.png", status: "active", displayOrder: 4, desc: "1060 Free Fire Diamonds delivered to game mailbox" },
  { id: "prod_d5", name: "2180 Diamonds", category: "diamonds", originalPrice: 1500, discountPrice: 750, bonus: "+218 Bonus", badge: "50% OFF", image: "diamond_icon.png", status: "active", displayOrder: 5, desc: "2180 Free Fire Diamonds delivered to game mailbox" },
  { id: "prod_d6", name: "5600 Diamonds", category: "diamonds", originalPrice: 1998, discountPrice: 999, bonus: "+560 Bonus", badge: "50% OFF", image: "diamond_icon.png", status: "active", displayOrder: 6, desc: "5600 Free Fire Diamonds delivered to game mailbox" },
  { id: "prod_d7", name: "10000 Diamonds", category: "diamonds", originalPrice: 2500, discountPrice: 1700, bonus: "+1000 Bonus", badge: "50% OFF", image: "diamond_icon.png", status: "active", displayOrder: 7, desc: "10000 Free Fire Diamonds delivered to game mailbox" },
  { id: "prod_d8", name: "15000 Diamonds", category: "diamonds", originalPrice: 5999, discountPrice: 2999, bonus: "+1500 Bonus", badge: "MEGA OFFER", image: "diamond_icon.png", status: "active", displayOrder: 8, desc: "15000 Free Fire Diamonds delivered to game mailbox" },
  { id: "prod_p1", name: "Weekly Pass Membership", category: "passes", originalPrice: 199, discountPrice: 99, bonus: "7 Days Duration", badge: "POPULAR", image: "pass_w.png", status: "active", displayOrder: 9, desc: "Get 450 Diamonds total value over 7 days" },
  { id: "prod_p2", name: "Monthly Pass Membership", category: "passes", originalPrice: 799, discountPrice: 399, bonus: "30 Days Duration", badge: "BEST VALUE", image: "pass_m.png", status: "active", displayOrder: 10, desc: "Get 2600 Diamonds total value over 30 days" },
  { id: "prod_p3", name: "Weekly Lite Pass", category: "passes", originalPrice: 199, discountPrice: 99, bonus: "7 Days Duration", badge: "50% OFF", image: "pass_w_lite.png", status: "active", displayOrder: 11, desc: "Get 220 Diamonds total value over 7 days" },
  { id: "prod_r1", name: "300 Rupees Redeem Code", category: "redeem", originalPrice: 300, discountPrice: 150, bonus: "Google Play Credit", badge: "INSTANT", image: "gplay_logo.jpg", status: "active", displayOrder: 12, desc: "Receive Rs 300 Google Play Store code" },
  { id: "prod_r2", name: "400 Rupees Redeem Code", category: "redeem", originalPrice: 400, discountPrice: 199, bonus: "Google Play Credit", badge: "POPULAR", image: "gplay_logo.jpg", status: "active", displayOrder: 13, desc: "Receive Rs 400 Google Play Store code" },
  { id: "prod_r3", name: "500 Rupees Redeem Code", category: "redeem", originalPrice: 500, discountPrice: 250, bonus: "Google Play Credit", badge: "BEST VALUE", image: "gplay_logo.jpg", status: "active", displayOrder: 14, desc: "Receive Rs 500 Google Play Store code" },
  { id: "prod_l1", name: "500 Profile Likes", category: "likes", originalPrice: 400, discountPrice: 200, bonus: "+500 Likes", badge: "50% OFF", image: "likes_icon.png", status: "active", displayOrder: 14, desc: "500 Real Free Fire Profile Likes delivered instantly" },
  { id: "prod_l2", name: "1000 Profile Likes", category: "likes", originalPrice: 800, discountPrice: 400, bonus: "+1000 Likes", badge: "POPULAR", image: "likes_icon.png", status: "active", displayOrder: 15, desc: "1000 Real Free Fire Profile Likes delivered instantly" },
  { id: "prod_l3", name: "1500 Profile Likes", category: "likes", originalPrice: 1200, discountPrice: 600, bonus: "+1500 Likes", badge: "HOT", image: "likes_icon.png", status: "active", displayOrder: 16, desc: "1500 Real Free Fire Profile Likes delivered instantly" },
  { id: "prod_l4", name: "2000 Profile Likes", category: "likes", originalPrice: 1600, discountPrice: 800, bonus: "+2000 Likes", badge: "BEST VALUE", image: "likes_icon.png", status: "active", displayOrder: 17, desc: "2000 Real Free Fire Profile Likes delivered instantly" }
];

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
    const leanState = {
      upiId: state.upiId || process.env.UPI_DEFAULT || "paytm.s2sr8jx@pty",
      merchantName: state.merchantName || "Garena Official Store",
      supportChatEnabled: state.supportChatEnabled !== false,
      products: Array.isArray(state.products) ? state.products : [],
      banners: Array.isArray(state.banners) ? state.banners : []
    };
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

function getMergedProducts(stateProducts) {
  const savedMap = new Map();
  if (Array.isArray(stateProducts)) {
    stateProducts.forEach(p => { if (p && p.id) savedMap.set(p.id, p); });
  }

  const result = DEFAULT_PRODUCTS.map(defP => {
    const savedP = savedMap.get(defP.id);
    return savedP ? Object.assign({}, defP, savedP) : defP;
  });

  if (Array.isArray(stateProducts)) {
    stateProducts.forEach(p => {
      if (p && p.id && !DEFAULT_PRODUCTS.some(dp => dp.id === p.id)) {
        result.push(p);
      }
    });
  }

  return result.sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0));
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", req.headers.origin || "*");
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive, nosnippet");

  if (req.method === "OPTIONS") return res.status(200).end();

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

  const allProducts = getMergedProducts(state.products);

  if (req.method === "GET") {
    return res.status(200).json({
      success: true,
      count: allProducts.length,
      products: allProducts
    });
  }

  if (req.method === "POST") {
    let body = {};
    try { body = JSON.parse(await getRawBody(req)); } catch (e) {}

    const action = body.action || "save_product";
    let currentList = getMergedProducts(state.products);

    if (action === "save_product") {
      const prod = body.product;
      if (!prod || !prod.name) {
        return res.status(400).json({ success: false, error: "Product data invalid. Name is required." });
      }

      if (!prod.id) {
        const catPrefix = prod.category === "passes" ? "prod_p" : (prod.category === "redeem" ? "prod_r" : "prod_d");
        prod.id = catPrefix + "_" + Date.now() + "_" + Math.random().toString(36).substring(2, 5);
        prod.displayOrder = currentList.length + 1;
        currentList.push(prod);
      } else {
        const idx = currentList.findIndex(p => p.id === prod.id);
        if (idx >= 0) {
          currentList[idx] = Object.assign({}, currentList[idx], prod);
        } else {
          currentList.push(prod);
        }
      }
    } else if (action === "delete_product") {
      const prodId = body.productId || body.id;
      if (!prodId) {
        return res.status(400).json({ success: false, error: "Product ID required for deletion." });
      }
      currentList = currentList.filter(p => p.id !== prodId);
    } else if (action === "update_products") {
      if (Array.isArray(body.products)) {
        currentList = body.products;
      }
    }

    state.products = currentList;

    writeLocalDisk(state);
    writeCloudKV(state);

    return res.status(200).json({
      success: true,
      message: "Products updated and persisted successfully.",
      count: currentList.length,
      products: currentList
    });
  }

  return res.status(405).json({ error: "Method not allowed" });
};
