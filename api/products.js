// ============================================================
// PUBLIC SERVERLESS API — api/products.js
// Serving real-time active products, prices, and public settings.
// ============================================================

const fs = require("fs");
const path = require("path");
const https = require("https");

const TMP_STORE_FILE = path.join("/tmp", "admin_store.json");
const LOCAL_STORE_FILE = path.join(__dirname, "..", "db.json");
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
  { id: "prod_r1", name: "300 Rupees Redeem Code", category: "redeem", originalPrice: 300, discountPrice: 150, bonus: "Google Play Credit", badge: "INSTANT", image: "gplay_logo.jpg", status: "active", displayOrder: 12, desc: "Receive Rs 300 Google Play Store code" },
  { id: "prod_r2", name: "400 Rupees Redeem Code", category: "redeem", originalPrice: 400, discountPrice: 199, bonus: "Google Play Credit", badge: "POPULAR", image: "gplay_logo.jpg", status: "active", displayOrder: 13, desc: "Receive Rs 400 Google Play Store code" },
  { id: "prod_r3", name: "500 Rupees Redeem Code", category: "redeem", originalPrice: 500, discountPrice: 250, bonus: "Google Play Credit", badge: "BEST VALUE", image: "gplay_logo.jpg", status: "active", displayOrder: 14, desc: "Receive Rs 500 Google Play Store code" },
  { id: "prod_l1", name: "500 Profile Likes", category: "likes", originalPrice: 400, discountPrice: 200, bonus: "+500 Likes", badge: "50% OFF", image: "likes_icon.png", status: "active", displayOrder: 14, desc: "500 Real Free Fire Profile Likes delivered instantly" },
  { id: "prod_l2", name: "1000 Profile Likes", category: "likes", originalPrice: 800, discountPrice: 400, bonus: "+1000 Likes", badge: "POPULAR", image: "likes_icon.png", status: "active", displayOrder: 15, desc: "1000 Real Free Fire Profile Likes delivered instantly" },
  { id: "prod_l3", name: "1500 Profile Likes", category: "likes", originalPrice: 1200, discountPrice: 600, bonus: "+1500 Likes", badge: "HOT", image: "likes_icon.png", status: "active", displayOrder: 16, desc: "1500 Real Free Fire Profile Likes delivered instantly" },
  { id: "prod_l4", name: "2000 Profile Likes", category: "likes", originalPrice: 1600, discountPrice: 800, bonus: "+2000 Likes", badge: "BEST VALUE", image: "likes_icon.png", status: "active", displayOrder: 17, desc: "2000 Real Free Fire Profile Likes delivered instantly" }
];

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

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate, max-age=0");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive, nosnippet");

  const ua = (req.headers["user-agent"] || "").toLowerCase();
  const BOT_PATTERNS = ["gptbot","chatgpt","claudebot","anthropic-ai","perplexitybot","google-extended","ccbot","bytespider","diffbot","facebookexternalhit","amazonbot","ia_archiver","semrushbot","ahrefsbot","mj12bot","dotbot","scrapy","python-requests"];
  if (BOT_PATTERNS.some(p => ua.includes(p))) {
    return res.status(403).json({ error: "Access Denied" });
  }

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  let state = readLocalDisk() || {};
  const cloud = await loadCloudKV();
  if (cloud && typeof cloud === "object") {
    state = Object.assign({}, state, cloud);
  }

  const savedProductsMap = new Map();
  if (state && Array.isArray(state.products)) {
    state.products.forEach(p => { if (p && p.id) savedProductsMap.set(p.id, p); });
  }

  const products = DEFAULT_PRODUCTS.map(defP => {
    const savedP = savedProductsMap.get(defP.id);
    return savedP ? Object.assign({}, defP, savedP) : defP;
  });

  if (state && Array.isArray(state.products)) {
    state.products.forEach(p => {
      if (p && p.id && !DEFAULT_PRODUCTS.some(dp => dp.id === p.id)) {
        products.push(p);
      }
    });
  }

  const upiId = (state && state.upiId) ? state.upiId : (process.env.UPI_DEFAULT || "paytm.s2sr8jx@pty");
  const merchantName = (state && state.merchantName) ? state.merchantName : "Garena Official Store";
  const supportChatEnabled = (state && state.supportChatEnabled !== undefined)
    ? (state.supportChatEnabled === true || state.supportChatEnabled === "true")
    : true;
  const banners = (state && Array.isArray(state.banners)) ? state.banners : [];

  return res.status(200).json({
    success: true,
    upiId,
    merchantName,
    supportChatEnabled,
    banners,
    products: products.sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0))
  });
};
