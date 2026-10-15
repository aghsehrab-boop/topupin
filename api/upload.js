const crypto = require("crypto");
const https  = require("https");
const path   = require("path");
const fs     = require("fs");

const JWT_SECRET     = process.env.JWT_SECRET || "garena_admin_jwt_2026_xK9mP2qR7wN4sT";
const CLOUD_KV_URL   = "https://kvdb.io/A8vB5k2W8G3L4x1N/garena_topup_db_2026";
const CLOUD_IMG_URL  = "https://kvdb.io/A8vB5k2W8G3L4x1N/garena_topup_imgs_2026";
const TMP_IMGS_FILE  = "/tmp/admin_images.json";

function verifyJWT(token) {
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

function getToken(req) {
  const c = req.headers.cookie || "";
  const m = c.match(/(?:^|;\s*)admin_token=([^;]+)/);
  if (m) return m[1];
  const a = req.headers.authorization || "";
  if (a.startsWith("Bearer ")) return a.slice(7);
  return null;
}

function getRawBody(req) {
  return new Promise(res => {
    const chunks = [];
    req.on("data", c => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    req.on("end", () => res(Buffer.concat(chunks)));
    req.on("error", () => res(Buffer.alloc(0)));
  });
}

function loadImages() {
  try { if (fs.existsSync(TMP_IMGS_FILE)) return JSON.parse(fs.readFileSync(TMP_IMGS_FILE, "utf8")); } catch {}
  return {};
}

function saveImages(imgs) {
  try { fs.writeFileSync(TMP_IMGS_FILE, JSON.stringify(imgs), "utf8"); } catch {}
  // Also persist to KV
  try {
    const payload = JSON.stringify(imgs);
    const req2 = https.request(CLOUD_IMG_URL, { method: "POST", headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } });
    req2.on("error", () => {});
    req2.write(payload);
    req2.end();
  } catch {}
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store,no-cache,must-revalidate,max-age=0");
  res.setHeader("Access-Control-Allow-Origin", req.headers.origin || "*");
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization,X-Filename");
  if (req.method === "OPTIONS") return res.status(200).end();

  // Auth check
  const token = getToken(req);
  if (!token || !verifyJWT(token)) return res.status(401).json({ error: "Unauthorized" });

  if (req.method === "POST") {
    const body = await getRawBody(req);
    let parsed;
    try { parsed = JSON.parse(body.toString("utf8")); } catch { return res.status(400).json({ error: "Invalid JSON" }); }

    // Expected: { filename, data: "data:image/png;base64,..." }
    const { filename, data } = parsed;
    if (!filename || !data) return res.status(400).json({ error: "filename and data required" });

    // Validate size (max 1.5 MB base64 = ~1.1 MB raw)
    if (data.length > 2 * 1024 * 1024) return res.status(413).json({ error: "Image too large (max ~1.5MB)" });

    // Sanitize filename
    const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);

    const imgs = loadImages();
    imgs[safeName] = { data, uploadedAt: new Date().toISOString() };
    saveImages(imgs);

    return res.status(200).json({ success: true, url: `/api/img?name=${encodeURIComponent(safeName)}` });
  }

  return res.status(405).json({ error: "Method not allowed" });
};
