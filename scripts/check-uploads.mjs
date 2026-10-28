// Run against dev or start, after the build: node scripts/check-uploads.mjs
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rmdir, symlink, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import puppeteer from "puppeteer";
import sharp from "sharp";

const base = "http://127.0.0.1:3000";
const id = `regression-${crypto.randomUUID()}`;
const files = [];
let browser;
const outside = await mkdtemp(path.join(os.tmpdir(), "slides-upload-"));
const link = path.resolve("public/uploads", `${id}-link`);
let linked = false;
try {
  const png = await sharp({ create: { width: 20, height: 20, channels: 3, background: "#ff0000" } }).png().toBuffer();
  const form = new FormData();
  form.append("file", new Blob([png], { type: "image/png" }), "regression.png");
  const uploadResponse = await fetch(base + "/api/upload", { method: "POST", body: form });
  assert.equal(uploadResponse.status, 200);
  const upload = await uploadResponse.json();
  files.push(path.resolve("public", upload.url.slice(1)));
  const image = await fetch(base + upload.url);
  assert.equal(image.status, 200, "an image uploaded after build/start is served");
  assert.equal(image.headers.get("content-type"), "image/png");
  assert.equal(image.headers.get("x-content-type-options"), "nosniff");
  assert.match(image.headers.get("content-security-policy"), /img-src 'self' data: blob:/);
  assert.equal((await sharp(Buffer.from(await image.arrayBuffer())).metadata()).width, 20);

  await mkdir("public/uploads/fonts", { recursive: true });
  for (const [ext, type, bytes] of [
    ["png", "image/png", png],
    ["jpg", "image/jpeg", await sharp(png).jpeg().toBuffer()],
    ["jpeg", "image/jpeg", await sharp(png).jpeg().toBuffer()],
    ["webp", "image/webp", await sharp(png).webp().toBuffer()],
    ["woff2", "font/woff2", Buffer.from("wOF2-test-font")],
    ["ttf", "font/ttf", Buffer.from([0, 1, 0, 0])],
  ]) {
    const url = `/uploads/${ext === "woff2" || ext === "ttf" ? "fonts/" : ""}${id}.${ext}`;
    const file = path.resolve("public", url.slice(1));
    files.push(file);
    await writeFile(file, bytes); // Same disk location used by image generation.
    const res = await fetch(base + url);
    assert.equal(res.status, 200, url);
    assert.equal(res.headers.get("content-type"), type);
    assert.deepEqual(Buffer.from(await res.arrayBuffer()), await readFile(file));
    assert.equal((await fetch(base + url, { method: "HEAD" })).status, 200);
  }

  await writeFile(path.join(outside, "private.png"), png);
  await symlink(outside, link, process.platform === "win32" ? "junction" : "dir");
  linked = true;
  assert.equal((await fetch(`${base}/uploads/${id}-link/private.png`)).status, 404, "symlinks cannot serve outside uploads");
  for (const url of ["/api/uploads/..%2f..%2fpackage.json", "/api/uploads/..%5c..%5cpackage.json", "/uploads/missing.png", "/uploads/private.html", "/api/uploads/%00.png"]) {
    assert.ok([400, 404].includes((await fetch(base + url)).status), `reject ${url}`);
  }

  browser = await puppeteer.launch({ headless: true, args: ["--disable-gpu"] });
  const page = await browser.newPage();
  await page.goto(base, { waitUntil: "domcontentloaded" });
  assert.equal(await page.evaluate((url) => new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img.naturalWidth);
    img.onerror = () => resolve(0);
    img.src = url;
    document.body.append(img);
  }), upload.url), 20, "the browser loads a new upload under the existing CSP");
  console.log("uploads: post-build upload/generated files, MIME, HEAD, CSP, traversal and symlinks pass");
} finally {
  if (browser) await browser.close();
  if (linked) await unlink(link);
  for (const file of files) await unlink(file);
  await unlink(path.join(outside, "private.png")).catch((error) => { if (error.code !== "ENOENT") throw error; });
  await rmdir(outside);
}
