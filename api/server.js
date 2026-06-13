"use strict";

const http = require("node:http");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const PORT_VALUE = process.env.ZIMAMOD_API_PORT || process.env.PORT || "8090";
const PORT = Number(PORT_VALUE);
const DATA_DIR = process.env.DATA_DIR || "/data";
const MOD_DIR = path.join(DATA_DIR, "mod");
const CONFIG_DIR = path.join(DATA_DIR, "config");
const STORE_DIR = path.join(DATA_DIR, "store");
const BING_GALLERY_DIR = process.env.BING_GALLERY_DIR || "/gallery";
const MAX_BODY_BYTES = 64 * 1024;
const MAX_WALLPAPER_BYTES = 25 * 1024 * 1024;
const ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;
const ASSET_PATH_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._/-]*$/;
const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const VERSION = process.env.VERSION || "dev";
const TOKEN_FILE = path.join(CONFIG_DIR, "api_token");
const DASHBOARD_URL = process.env.ZIMAMOD_DASHBOARD_URL || "http://127.0.0.1:80";
const UPDATE_URL = process.env.UPDATE_URL || "https://api.github.com/repos/metisro/ZimaMOD/releases/latest";
const UPDATE_CACHE_MS = 8 * 60 * 60 * 1000;
let updateCache = null;
let updateRequest = null;

if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
  throw new Error(`Invalid API port: ${PORT_VALUE}`);
}

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(CONFIG_DIR, { recursive: true });
fs.mkdirSync(STORE_DIR, { recursive: true });
fs.mkdirSync(BING_GALLERY_DIR, { recursive: true });

function generateApiToken() {
  const generated = crypto.randomBytes(32).toString("hex");
  fs.writeFileSync(TOKEN_FILE, generated + "\n", { mode: 0o600 });
  fs.rmSync(path.join(DATA_DIR, "api-token.txt"), { force: true });
  fs.rmSync(path.join(DATA_DIR, "api-token"), { force: true });
  console.log("Generated ZimaMOD API token at /data/config/api_token");
  return generated;
}

const API_TOKEN = generateApiToken();

function send(response, status, body) {
  const content = JSON.stringify(body);
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(content),
    "Cache-Control": "no-store"
  });
  response.end(content);
}

function validId(value) {
  return typeof value === "string" && ID_PATTERN.test(value);
}

function authorized(request) {
  const prefix = "Bearer ";
  const authorization = request.headers.authorization || "";
  if (!authorization.startsWith(prefix)) return false;
  const supplied = Buffer.from(authorization.slice(prefix.length), "utf8");
  const expected = Buffer.from(API_TOKEN, "utf8");
  return supplied.length === expected.length && crypto.timingSafeEqual(supplied, expected);
}

function requireAuthorization(request, response) {
  if (authorized(request)) return true;
  response.setHeader("WWW-Authenticate", 'Bearer realm="ZimaMOD write API"');
  send(response, 401, { error: "Authentication required" });
  return false;
}

function dashboardSessionValid(request) {
  return new Promise(resolve => {
    const authorization = request.headers.authorization || "";
    if (!authorization) {
      resolve(false);
      return;
    }
    const url = new URL("/v1/users/current", DASHBOARD_URL);
    const validation = http.get(url, {
      headers: {
        Authorization: authorization,
        "X-Real-IP": request.headers["x-real-ip"] || request.socket.remoteAddress || ""
      }
    }, response => {
      response.resume();
      resolve(response.statusCode >= 200 && response.statusCode < 300);
    });
    validation.setTimeout(5000, () => validation.destroy());
    validation.on("error", () => resolve(false));
  });
}

function contentType(file) {
  return ({
    ".css": "text/css; charset=utf-8",
    ".gif": "image/gif",
    ".jpeg": "image/jpeg",
    ".jpg": "image/jpeg",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".webp": "image/webp"
  })[path.extname(file).toLowerCase()] || "application/octet-stream";
}

function sendFile(response, file) {
  const stat = fs.statSync(file);
  if (!stat.isFile()) throw new Error("Store asset not found");
  response.writeHead(200, {
    "Content-Type": contentType(file),
    "Content-Length": stat.size,
    "Cache-Control": "no-store"
  });
  fs.createReadStream(file).pipe(response);
}

function storeAssetPath(modId, relativePath) {
  if (!validId(modId) || !ASSET_PATH_PATTERN.test(relativePath) || relativePath.includes("..")) {
    throw new Error("Invalid store asset path");
  }
  const root = path.resolve(STORE_DIR, modId);
  const file = path.resolve(root, relativePath);
  if (!file.startsWith(root + path.sep)) throw new Error("Invalid store asset path");
  return file;
}

function trustedBingUrl(value) {
  const url = new URL(value);
  const hostname = url.hostname.toLowerCase();
  if (url.protocol !== "https:" || (hostname !== "bing.com" && !hostname.endsWith(".bing.com"))) {
    throw new Error("Only HTTPS Bing image URLs can be saved");
  }
  return url;
}

function wallpaperFilename(url) {
  const source = url.searchParams.get("id") || path.basename(url.pathname) || "bing-wallpaper";
  const decoded = decodeURIComponent(source).replace(/^OHR\./i, "").replace(/\?.*$/, "");
  const extension = path.extname(decoded).toLowerCase();
  const safeExtension = [".jpg", ".jpeg", ".png", ".webp"].includes(extension) ? extension : ".jpg";
  const base = path.basename(decoded, extension)
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^[.-]+|[.-]+$/g, "")
    .slice(0, 120) || "bing-wallpaper";
  return base + safeExtension;
}

function downloadBingWallpaper(sourceUrl, destination, redirects = 0) {
  return new Promise((resolve, reject) => {
    const url = trustedBingUrl(sourceUrl);
    const request = require("node:https").get(url, {
      headers: { "User-Agent": `ZimaMOD/${VERSION}` }
    }, response => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        response.resume();
        if (redirects >= 3) {
          reject(new Error("Too many Bing image redirects"));
          return;
        }
        downloadBingWallpaper(new URL(response.headers.location, url).toString(), destination, redirects + 1)
          .then(resolve, reject);
        return;
      }
      if (response.statusCode < 200 || response.statusCode >= 300) {
        response.resume();
        reject(new Error(`Bing image download failed: HTTP ${response.statusCode}`));
        return;
      }
      if (!String(response.headers["content-type"] || "").toLowerCase().startsWith("image/")) {
        response.resume();
        reject(new Error("Bing response was not an image"));
        return;
      }

      const temporary = destination + ".tmp-" + process.pid + "-" + Date.now();
      const output = fs.createWriteStream(temporary, { flags: "wx" });
      let size = 0;
      let settled = false;
      const fail = error => {
        if (settled) return;
        settled = true;
        response.destroy();
        output.destroy();
        fs.rm(temporary, { force: true }, () => reject(error));
      };
      response.on("data", chunk => {
        size += chunk.length;
        if (size > MAX_WALLPAPER_BYTES) fail(new Error("Bing image exceeds the 25 MB limit"));
      });
      response.on("error", fail);
      output.on("error", fail);
      output.on("finish", () => {
        if (settled) return;
        settled = true;
        fs.link(temporary, destination, error => {
          fs.rm(temporary, { force: true }, () => error ? reject(error) : resolve(size));
        });
      });
      response.pipe(output);
    });
    request.setTimeout(15000, () => request.destroy(new Error("Bing image download timed out")));
    request.on("error", reject);
  });
}

async function saveBingWallpaper(imageUrl) {
  const url = trustedBingUrl(imageUrl);
  const filename = wallpaperFilename(url);
  const destination = path.join(BING_GALLERY_DIR, filename);
  if (fs.existsSync(destination)) return { filename, saved: false, exists: true };
  await downloadBingWallpaper(url.toString(), destination);
  return { filename, saved: true, exists: false };
}

function versionParts(value) {
  const match = String(value || "").trim().match(/^v?(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/);
  return match ? match.slice(1).map(Number) : null;
}

function versionIsNewer(candidate, current) {
  const candidateParts = versionParts(candidate);
  const currentParts = versionParts(current);
  if (!candidateParts || !currentParts) return false;
  for (let index = 0; index < candidateParts.length; index++) {
    if (candidateParts[index] !== currentParts[index]) return candidateParts[index] > currentParts[index];
  }
  return false;
}

function requestJson(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith("https:") ? require("node:https") : http;
    const request = client.get(url, {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": `ZimaMOD/${VERSION}`
      }
    }, response => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location && redirects < 3) {
        response.resume();
        resolve(requestJson(new URL(response.headers.location, url).toString(), redirects + 1));
        return;
      }
      const chunks = [];
      response.on("data", chunk => chunks.push(chunk));
      response.on("end", () => {
        if (response.statusCode < 200 || response.statusCode >= 300) {
          reject(new Error(`Update check failed: HTTP ${response.statusCode}`));
          return;
        }
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
        } catch (_) {
          reject(new Error("Update check returned invalid JSON"));
        }
      });
    });
    request.setTimeout(10000, () => request.destroy(new Error("Update check timed out")));
    request.on("error", reject);
  });
}

async function updateStatus(force = false) {
  if (!force && updateCache && Date.now() - updateCache.cachedAt < UPDATE_CACHE_MS) return updateCache.body;
  if (updateRequest) return updateRequest;

  updateRequest = requestJson(UPDATE_URL)
    .then(release => {
      const latestVersion = String(release.tag_name || "").replace(/^v/, "");
      if (!versionParts(latestVersion)) throw new Error("Latest release has an invalid version");
      const body = {
        currentVersion: VERSION,
        latestVersion,
        updateAvailable: versionIsNewer(latestVersion, VERSION),
        checkAvailable: true,
        releaseUrl: typeof release.html_url === "string" ? release.html_url : "",
        checkedAt: new Date().toISOString()
      };
      updateCache = { cachedAt: Date.now(), body };
      return body;
    })
    .catch(error => {
      const body = {
        currentVersion: VERSION,
        latestVersion: "",
        updateAvailable: false,
        checkAvailable: false,
        error: error.message || "Update check unavailable",
        releaseUrl: "",
        checkedAt: new Date().toISOString()
      };
      updateCache = { cachedAt: Date.now(), body };
      return body;
    })
    .finally(() => {
      updateRequest = null;
    });

  return updateRequest;
}

function configPath(modId) {
  if (!validId(modId)) throw new Error("Invalid mod id");
  return path.join(CONFIG_DIR, modId + ".json");
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (_) {
    return fallback;
  }
}

function stableWidgetId(value) {
  const normalized = String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64);

  if (normalized.includes("weather")) return "weather";
  if (normalized.includes("storage")) return "storage";
  if (normalized.includes("network")) return "network";
  if (normalized.includes("system")) return "system";
  if (normalized.includes("widget-settings") || normalized === "settings") return "widget-settings";
  if (
    /(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)/.test(normalized) ||
    /(?:january|february|march|april|may|june|july|august|september|october|november|december)/.test(normalized)
  ) {
    return "clock";
  }
  return normalized;
}

function normalizeConfig(modId, config) {
  if (modId !== "sortable-widgets" || !Array.isArray(config?.order)) return config;
  return {
    ...config,
    order: Array.from(new Set(config.order.map(stableWidgetId).filter(Boolean)))
  };
}

function writeConfig(file, config) {
  const temporary = file + ".tmp-" + Date.now();
  fs.writeFileSync(temporary, JSON.stringify(config, null, 2) + "\n", { mode: 0o600 });
  fs.renameSync(temporary, file);
}

function modManifest(modId) {
  return readModManifest(MOD_DIR, modId);
}

function readModManifest(root, modId) {
  const directory = path.join(root, modId);
  const stat = fs.statSync(directory);
  if (!stat.isDirectory()) return null;

  const manifest = readJson(path.join(directory, "zimamod.json"), {});
  const scripts = Array.isArray(manifest.scripts)
    ? manifest.scripts
    : fs.existsSync(path.join(directory, "mod.js")) ? ["mod.js"] : [];
  const styles = Array.isArray(manifest.styles)
    ? manifest.styles
    : fs.existsSync(path.join(directory, "mod.css")) ? ["mod.css"] : [];
  const authors = Array.isArray(manifest.authors)
    ? manifest.authors.map(author => {
      if (typeof author === "string") return { name: author, url: "" };
      return {
        name: typeof author?.name === "string" ? author.name : "",
        url: typeof author?.url === "string" && /^https?:\/\//.test(author.url) ? author.url : ""
      };
    }).filter(author => author.name)
    : [];
  const origin = manifest.origin && typeof manifest.origin === "object" ? {
    type: ["adapted", "compatible"].includes(manifest.origin.type) ? manifest.origin.type : "native",
    adapter: typeof manifest.origin.adapter === "string" ? manifest.origin.adapter : "",
    source: typeof manifest.origin.source === "string" && /^https?:\/\//.test(manifest.origin.source)
      ? manifest.origin.source
      : ""
  } : {
    type: typeof manifest.source === "string" && /^https?:\/\//.test(manifest.source) ? "adapted" : "native",
    adapter: "",
    source: typeof manifest.source === "string" && /^https?:\/\//.test(manifest.source) ? manifest.source : ""
  };

  return {
    id: modId,
    name: typeof manifest.name === "string" ? manifest.name : modId,
    enabled: manifest.enabled !== false,
    version: typeof manifest.version === "string" ? manifest.version : "1",
    description: typeof manifest.description === "string" ? manifest.description : "",
    category: typeof manifest.category === "string" ? manifest.category : "",
    authors,
    origin,
    authorUrl: typeof manifest.authorUrl === "string" && /^https?:\/\//.test(manifest.authorUrl)
      ? manifest.authorUrl
      : "",
    screenshot: typeof manifest.screenshot === "string" && !manifest.screenshot.includes("..")
      ? manifest.screenshot
      : "",
    scripts: scripts.filter(item => typeof item === "string" && !item.includes("..")),
    styles: styles.filter(item => typeof item === "string" && !item.includes(".."))
  };
}

function listMods() {
  fs.mkdirSync(MOD_DIR, { recursive: true });
  return fs.readdirSync(MOD_DIR)
    .filter(validId)
    .map(modId => {
      try {
        return modManifest(modId);
      } catch (_) {
        return null;
      }
    })
    .filter(mod => mod?.enabled);
}

function listStore() {
  return fs.readdirSync(STORE_DIR)
    .filter(validId)
    .map(modId => {
      try {
        const manifest = readModManifest(STORE_DIR, modId);
        return manifest ? {
          ...manifest,
          installed: fs.existsSync(path.join(MOD_DIR, modId))
        } : null;
      } catch (_) {
        return null;
      }
    })
    .filter(Boolean);
}

function copyDirectory(source, destination) {
  const temporary = destination + ".tmp-" + Date.now();
  fs.rmSync(temporary, { recursive: true, force: true });
  fs.cpSync(source, temporary, { recursive: true });
  fs.rmSync(destination, { recursive: true, force: true });
  fs.renameSync(temporary, destination);
}

function installMod(modId) {
  if (!validId(modId)) throw new Error("Invalid mod id");
  const source = path.join(STORE_DIR, modId);
  if (!fs.statSync(source).isDirectory()) throw new Error("Store mod not found");
  copyDirectory(source, path.join(MOD_DIR, modId));
}

function uninstallMod(modId) {
  if (!validId(modId)) throw new Error("Invalid mod id");
  const source = path.join(STORE_DIR, modId);
  if (!fs.statSync(source).isDirectory()) throw new Error("Store mod not found");
  fs.rmSync(path.join(MOD_DIR, modId), { recursive: true, force: true });
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;

    request.on("data", chunk => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error("Request body too large"));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    request.on("error", reject);
  });
}

async function handle(request, response) {
  const url = new URL(request.url, "http://localhost");
  if (WRITE_METHODS.has(request.method) && !requireAuthorization(request, response)) return;

  if (request.method === "GET" && url.pathname === "/health") {
    send(response, 200, { ok: true });
    return;
  }

  if (request.method === "GET" && url.pathname === "/mods") {
    send(response, 200, { mods: listMods() });
    return;
  }

  if (request.method === "GET" && url.pathname === "/store") {
    send(response, 200, { mods: listStore() });
    return;
  }

  const storeAssetMatch = url.pathname.match(/^\/store-assets\/([a-z0-9][a-z0-9-]{0,63})\/(.+)$/);
  if (storeAssetMatch && request.method === "GET") {
    sendFile(response, storeAssetPath(storeAssetMatch[1], decodeURIComponent(storeAssetMatch[2])));
    return;
  }

  if (request.method === "GET" && url.pathname === "/update") {
    send(response, 200, await updateStatus(url.searchParams.get("refresh") === "1"));
    return;
  }

  if (request.method === "GET" && url.pathname === "/token") {
    if (!await dashboardSessionValid(request)) {
      send(response, 401, { error: "Valid ZimaOS session required" });
      return;
    }
    send(response, 200, { token: API_TOKEN });
    return;
  }

  const storeMatch = url.pathname.match(/^\/store\/([a-z0-9][a-z0-9-]{0,63})$/);
  if (storeMatch && request.method === "POST") {
    installMod(storeMatch[1]);
    send(response, 200, { ok: true, installed: true });
    return;
  }

  if (storeMatch && request.method === "DELETE") {
    uninstallMod(storeMatch[1]);
    send(response, 200, { ok: true, installed: false });
    return;
  }

  if (request.method === "POST" && url.pathname === "/bing-wallpaper/save") {
    const raw = await readBody(request);
    const body = JSON.parse(raw);
    if (typeof body.imageUrl !== "string") throw new Error("A Bing image URL is required");
    const result = await saveBingWallpaper(body.imageUrl);
    send(response, 200, {
      ok: true,
      ...result,
      path: `/DATA/Gallery/Bing Wallpapers/${result.filename}`
    });
    return;
  }

  const configMatch = url.pathname.match(/^\/config\/([a-z0-9][a-z0-9-]{0,63})$/);
  if (configMatch && request.method === "GET") {
    const file = configPath(configMatch[1]);
    const stored = readJson(file, null);
    const config = normalizeConfig(configMatch[1], stored);
    send(response, 200, { config });
    return;
  }

  if (configMatch && request.method === "PUT") {
    const raw = await readBody(request);
    const config = normalizeConfig(configMatch[1], JSON.parse(raw));
    const file = configPath(configMatch[1]);
    writeConfig(file, config);
    send(response, 200, { ok: true });
    return;
  }

  send(response, 404, { error: "Not found" });
}

http.createServer((request, response) => {
  handle(request, response).catch(error => {
    console.error(error);
    send(response, error.message === "Request body too large" ? 413 : 400, {
      error: error.message || "Bad request"
    });
  });
}).listen(PORT, "127.0.0.1", () => {
  console.log(`ZimaMOD API listening on 127.0.0.1:${PORT}`);
});
