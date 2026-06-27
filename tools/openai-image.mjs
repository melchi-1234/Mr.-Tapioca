// Generate (or edit, with reference images) art via OpenAI gpt-image-1.
// The API key is read from ~/.openai-mrtapioca (a private file outside the repo)
// or the OPENAI_API_KEY env var — never hard-coded or committed.
//
// Usage:
//   node tools/openai-image.mjs "<prompt>" <out.png> [size] [refImg1 refImg2 ...]
//   size: 1024x1024 | 1024x1536 (portrait) | 1536x1024 (landscape) | auto   (default 1024x1536)
//   If refImgs are given, uses the image-EDIT endpoint so the result matches
//   those references (this is how we keep skins/character on-model across poses).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

function getKey() {
  if (process.env.OPENAI_API_KEY) return process.env.OPENAI_API_KEY.trim();
  const f = path.join(os.homedir(), ".openai-mrtapioca");
  if (fs.existsSync(f)) return fs.readFileSync(f, "utf8").trim();
  throw new Error("No API key found. Put it in ~/.openai-mrtapioca or set OPENAI_API_KEY.");
}

const [, , prompt, outPath, size = "1024x1536", ...refs] = process.argv;
if (!prompt || !outPath) {
  console.error('Usage: node tools/openai-image.mjs "<prompt>" <out.png> [size] [refImages...]');
  process.exit(1);
}

const key = getKey();
let res;
try {
  if (refs.length) {
    const form = new FormData();
    form.append("model", "gpt-image-1");
    form.append("prompt", prompt);
    form.append("size", size);
    for (const r of refs) {
      const buf = fs.readFileSync(r);
      form.append("image[]", new Blob([buf], { type: "image/png" }), path.basename(r));
    }
    res = await fetch("https://api.openai.com/v1/images/edits", {
      method: "POST", headers: { Authorization: `Bearer ${key}` }, body: form,
    });
  } else {
    res = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "gpt-image-1", prompt, size, n: 1 }),
    });
  }
} catch (e) {
  console.error("Network error:", e.message);
  process.exit(1);
}

const data = await res.json().catch(() => ({}));
if (!res.ok) {
  console.error("OpenAI error", res.status, ":", JSON.stringify(data).slice(0, 600));
  process.exit(1);
}
const b64 = data?.data?.[0]?.b64_json;
if (!b64) { console.error("No image returned:", JSON.stringify(data).slice(0, 400)); process.exit(1); }
fs.mkdirSync(path.dirname(path.resolve(outPath)), { recursive: true });
fs.writeFileSync(outPath, Buffer.from(b64, "base64"));
console.log("Wrote", outPath, "(" + fs.statSync(outPath).size + " bytes)");
