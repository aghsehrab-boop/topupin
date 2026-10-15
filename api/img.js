const fs   = require("fs");
const https = require("https");
const TMP_IMGS_FILE = "/tmp/admin_images.json";
const CLOUD_IMG_URL = "https://kvdb.io/A8vB5k2W8G3L4x1N/garena_topup_imgs_2026";

function loadImages() {
  try { if (fs.existsSync(TMP_IMGS_FILE)) return JSON.parse(fs.readFileSync(TMP_IMGS_FILE, "utf8")); } catch {}
  return null;
}

function loadFromCloud() {
  return new Promise(resolve => {
    try {
      https.get(CLOUD_IMG_URL, r => {
        let raw = "";
        r.on("data", c => raw += c);
        r.on("end", () => {
          try {
            if (raw.trim().startsWith("{")) { const d = JSON.parse(raw); resolve(d); return; }
          } catch {}
          resolve(null);
        });
      }).on("error", () => resolve(null));
    } catch { resolve(null); }
  });
}

module.exports = async function handler(req, res) {
  const qs   = req.url.split("?")[1] || "";
  const qp   = new URLSearchParams(qs);
  const name = qp.get("name");
  if (!name) return res.status(400).send("name required");

  // Try local cache first
  let imgs = loadImages();
  if (!imgs) { imgs = await loadFromCloud(); }
  if (!imgs || !imgs[name]) {
    // Fallback: serve from static file if exists
    const staticPath = require("path").join(process.cwd(), name);
    if (fs.existsSync(staticPath)) {
      const buf = fs.readFileSync(staticPath);
      const ext = name.split(".").pop().toLowerCase();
      const mimeMap = { jpg:"image/jpeg",jpeg:"image/jpeg",png:"image/png",gif:"image/gif",webp:"image/webp",svg:"image/svg+xml" };
      res.setHeader("Content-Type", mimeMap[ext] || "application/octet-stream");
      res.setHeader("Cache-Control", "public,max-age=86400");
      return res.status(200).send(buf);
    }
    return res.status(404).send("Image not found");
  }

  const entry = imgs[name];
  const dataUrl = typeof entry === "string" ? entry : entry.data;

  // Parse data URL
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/s);
  if (!match) return res.status(500).send("Invalid image data");

  const [, mime, b64] = match;
  const buf = Buffer.from(b64, "base64");

  res.setHeader("Content-Type", mime);
  res.setHeader("Cache-Control", "public,max-age=3600");
  return res.status(200).send(buf);
};
