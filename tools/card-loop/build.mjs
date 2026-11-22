#!/usr/bin/env node
/* Собирает зацикленную карточку с аватарками из актуальных файлов сайта.
 *
 *   node tools/card-loop/build.mjs
 *
 * Источник правды — index.html и папка avatars/: разметка .plate, ники,
 * названия сетей и картинки берутся оттуда, поэтому после замены аватарки
 * достаточно запустить скрипт (или запушить — тогда это сделает GitHub Actions).
 *
 * Нужны: Chrome/Chromium и ffmpeg в PATH (или CHROME_PATH / FFMPEG).
 */

import { createServer } from "node:http";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const PREVIEW = path.join(ROOT, "preview");

const VIEW = { width: 900, height: 1200, dpr: 2 };
const OUT_MP4 = path.join(PREVIEW, "card-loop.mp4");
const OUT_GIF = path.join(PREVIEW, "card-loop.gif");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".mp3": "audio/mpeg",
  ".woff2": "font/woff2"
};

const log = (...a) => console.log("[card]", ...a);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function findChrome() {
  const list = [
    process.env.CHROME_PATH,
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    path.join(process.env.LOCALAPPDATA || "", "Google/Chrome/Application/chrome.exe"),
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
  ].filter(Boolean);
  for (const p of list) if (fs.existsSync(p)) return p;
  throw new Error("Chrome не найден. Укажи путь через CHROME_PATH.");
}

function findFfmpeg() {
  const bin = process.env.FFMPEG || "ffmpeg";
  const probe = spawnSync(bin, ["-version"], { encoding: "utf8" });
  if (probe.status !== 0) throw new Error("ffmpeg не найден. Установи его или укажи FFMPEG.");
  return bin;
}

function run(bin, args) {
  return new Promise((resolve, reject) => {
    const p = spawn(bin, args, { stdio: ["ignore", "ignore", "pipe"] });
    let err = "";
    p.stderr.on("data", (d) => { err += d.toString(); });
    p.on("error", reject);
    p.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${path.basename(bin)} exit ${code}\n${err.slice(-1200)}`));
    });
  });
}

/* ── статический сервер + сгенерированная страница ─────────── */

let loopHTML = null;
const server = createServer((req, res) => {
  const url = decodeURIComponent((req.url || "/").split("?")[0]);
  if (url === "/__loop.html") {
    if (!loopHTML) { res.writeHead(503); res.end("not ready"); return; }
    res.writeHead(200, { "Content-Type": MIME[".html"] });
    res.end(loopHTML);
    return;
  }
  const base = path.resolve(ROOT);
  const file = path.resolve(path.join(base, url === "/" ? "index.html" : url));
  if (!file.startsWith(base + path.sep)) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end("no"); return; }
    res.writeHead(200, { "Content-Type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream" });
    res.end(data);
  });
});

await new Promise((r) => server.listen(0, "127.0.0.1", r));
const PORT = server.address().port;
const ORIGIN = `http://127.0.0.1:${PORT}`;
log("сервер", ORIGIN);

/* ── Chrome + CDP ──────────────────────────────────────────── */

const chromePath = findChrome();
const ffmpeg = findFfmpeg();
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "card-chrome-"));
const chrome = spawn(chromePath, [
  "--headless=new",
  "--remote-debugging-port=0",
  `--user-data-dir=${profile}`,
  "--no-first-run",
  "--no-default-browser-check",
  "--hide-scrollbars",
  "--no-sandbox",
  "--disable-dev-shm-usage",
  "--disable-gpu",
  "about:blank"
], { stdio: ["ignore", "ignore", "pipe"] });

const portFile = path.join(profile, "DevToolsActivePort");
let chromeErr = "";
chrome.stderr.on("data", (d) => { chromeErr += d.toString(); });
let cdpPort = 0;
for (let i = 0; i < 300; i++) {
  if (fs.existsSync(portFile)) {
    const txt = fs.readFileSync(portFile, "utf8").split("\n");
    if (txt[0]) { cdpPort = Number(txt[0]); break; }
  }
  await wait(100);
}
if (!cdpPort) throw new Error("Chrome не запустился\n" + chromeErr.slice(-800));
const CDP = `http://127.0.0.1:${cdpPort}`;
for (let i = 0; i < 50; i++) {
  try { const r = await fetch(`${CDP}/json/version`); if (r.ok) break; } catch {}
  await wait(100);
}

async function json(u, o) { const r = await fetch(u, o); const t = await r.text(); try { return JSON.parse(t); } catch { return t; } }
const target = await json(`${CDP}/json/new?${encodeURIComponent("about:blank")}`, { method: "PUT" });
const ws = new WebSocket(target.webSocketDebuggerUrl);
let msgId = 0;
const waiting = new Map();
ws.addEventListener("message", (e) => {
  const m = JSON.parse(e.data);
  if (m.id && waiting.has(m.id)) {
    const w = waiting.get(m.id); waiting.delete(m.id);
    m.error ? w.reject(new Error(JSON.stringify(m.error))) : w.resolve(m.result);
  }
});
await new Promise((res, rej) => { ws.addEventListener("open", res); ws.addEventListener("error", rej); });
const send = (method, params = {}) => {
  const id = ++msgId;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => waiting.set(id, { resolve, reject }));
};
const evaluate = async (expression) => {
  const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 800));
  return r.result.value;
};

await send("Page.enable");
await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride", {
  width: VIEW.width, height: VIEW.height, deviceScaleFactor: VIEW.dpr, mobile: false
});

/* ── берём карточку из живого index.html ───────────────────── */

await send("Page.navigate", { url: `${ORIGIN}/index.html` });
await wait(1500);
const site = await evaluate(`(async () => {
  await document.fonts.ready;
  await Promise.all(Array.from(document.images).map((i) => (i.complete && i.naturalWidth) ? 1 : new Promise((r) => { i.onload = r; i.onerror = r; })));
  const plate = document.querySelector(".plate");
  if (!plate) throw new Error("На странице нет .plate");
  const clip = document.querySelector("#archClip");
  const sheets = Array.from(document.querySelectorAll('link[rel="stylesheet"]')).map((l) => l.href);
  const fonts = Array.from(document.querySelectorAll('link[href*="fonts.googleapis.com"], link[href*="fonts.gstatic.com"]')).map((l) => l.outerHTML);
  return {
    plate: plate.outerHTML,
    clip: clip ? clip.closest("svg").outerHTML : "",
    sheets,
    fonts,
    faces: document.querySelectorAll(".face").length
  };
})()`);

log("аватарок в карточке:", site.faces);
if (!site.faces) throw new Error("В .plate не нашлось .face");

const runtime = fs.readFileSync(path.join(__dirname, "runtime.js"), "utf8");
const sheetTags = site.sheets.map((href) => {
  const u = new URL(href);
  const same = u.origin === ORIGIN;
  return `<link rel="stylesheet" href="${same ? u.pathname : u.href}">`;
}).join("\n");

loopHTML = `<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><title>card loop</title>
${site.fonts.join("\n")}
${sheetTags}
<style>
  html, body { margin: 0; height: 100%; overflow: hidden;
    background: radial-gradient(125% 95% at 26% 4%, #f8f7ff 0%, #ecebfd 38%, #e2e4f9 68%, #d9ddf4 100%); }
  body { display: grid; place-items: center; }
  .stage { transform: scale(1.75); transform-origin: center; }
  .plate { grid-column: auto !important; grid-row: auto !important; justify-self: center !important;
    width: 320px !important; max-width: 320px !important; margin: 0 !important;
    opacity: 1 !important; visibility: visible !important; animation: none !important; }
  .face { transition: none !important; animation: none !important; }
  .face__disc, .face.is-active { animation: none !important; }
  .sparkles { display: none !important; }
  .plate__arch-line, .plate__arch-inner { animation: none !important; stroke-dashoffset: 0 !important; stroke-dasharray: none !important; }
  #defs { position: absolute; width: 0; height: 0; overflow: hidden; }
</style></head>
<body id="top">
<div id="defs">${site.clip}</div>
<div class="stage">${site.plate}</div>
<script>${runtime}</script>
</body></html>`;

await send("Page.navigate", { url: `${ORIGIN}/__loop.html` });
await wait(800);
for (let i = 0; i < 80; i++) {
  if (await evaluate("Boolean(window.__ready)")) break;
  await wait(250);
}
if (!(await evaluate("Boolean(window.__ready)"))) throw new Error("Карточка не прогрузилась");

const total = await evaluate("window.loopFrames");
const fps = await evaluate("window.loopFps");
log("кадров:", total, "·", fps, "fps ·", (total / fps).toFixed(1), "с");

/* ── рендер кадров ─────────────────────────────────────────── */

const framesDir = fs.mkdtempSync(path.join(os.tmpdir(), "card-frames-"));
const started = Date.now();
for (let i = 0; i < total; i++) {
  await evaluate(`window.render(${i}, ${total})`);
  await evaluate("new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))");
  const shot = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  fs.writeFileSync(path.join(framesDir, `f_${String(i).padStart(4, "0")}.png`), Buffer.from(shot.data, "base64"));
  if (i % 50 === 0) log("кадр", i, `${Math.round((Date.now() - started) / 1000)}с`);
}
log("кадры готовы за", `${Math.round((Date.now() - started) / 1000)}с`);

/* ── кодирование ───────────────────────────────────────────── */

fs.mkdirSync(PREVIEW, { recursive: true });
const seq = path.join(framesDir, "f_%04d.png");

await run(ffmpeg, [
  "-y", "-framerate", String(fps), "-i", seq,
  "-vf", `scale=${VIEW.width}:${VIEW.height}:flags=lanczos`,
  "-c:v", "libx264", "-profile:v", "high", "-crf", "20", "-preset", "medium",
  "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-an", OUT_MP4
]);
log("mp4:", (fs.statSync(OUT_MP4).size / 1024).toFixed(0), "КБ");

await run(ffmpeg, [
  "-y", "-framerate", String(fps), "-i", seq,
  "-vf", `fps=${fps / 2},scale=${VIEW.width / 2}:${VIEW.height / 2}:flags=lanczos,split[a][b];[a]palettegen=max_colors=200:stats_mode=full[p];[b][p]paletteuse=dither=bayer:bayer_scale=5`,
  "-loop", "0", OUT_GIF
]);
log("gif:", (fs.statSync(OUT_GIF).size / 1024).toFixed(0), "КБ");

/* ── уборка ────────────────────────────────────────────────── */

if (!process.env.KEEP_FRAMES) fs.rmSync(framesDir, { recursive: true, force: true });
try { await json(`${CDP}/json/close/${target.id}`); } catch {}
ws.close();
chrome.kill();
server.close();
await wait(300);
try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
log("готово");
process.exit(0);
