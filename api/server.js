"use strict";

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const PORT = Number(process.env.PORT || 8090);
const DATA_DIR = process.env.DATA_DIR || "/data";
const MOD_DIR = path.join(DATA_DIR, "mod");
const CONFIG_DIR = path.join(DATA_DIR, "config");
const STORE_DIR = path.join(DATA_DIR, "store");
const MAX_BODY_BYTES = 64 * 1024;
const ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;
const VERSION = process.env.VERSION || "dev";
const UPDATE_URL = process.env.UPDATE_URL || "https://api.github.com/repos/metisro/ZimaMOD/releases/latest";
const UPDATE_CACHE_MS = 8 * 60 * 60 * 1000;
let updateCache = null;
let updateRequest = null;

fs.mkdirSync(CONFIG_DIR, { recursive: true });
fs.mkdirSync(STORE_DIR, { recursive: true });

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

  return {
    id: modId,
    name: typeof manifest.name === "string" ? manifest.name : modId,
    enabled: manifest.enabled !== false,
    version: typeof manifest.version === "string" ? manifest.version : "1",
    description: typeof manifest.description === "string" ? manifest.description : "",
    authors,
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

  if (request.method === "GET" && url.pathname === "/update") {
    send(response, 200, await updateStatus(url.searchParams.get("refresh") === "1"));
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

  const configMatch = url.pathname.match(/^\/config\/([a-z0-9][a-z0-9-]{0,63})$/);
  if (configMatch && request.method === "GET") {
    const file = configPath(configMatch[1]);
    const stored = readJson(file, null);
    const config = normalizeConfig(configMatch[1], stored);
    if (config !== stored && JSON.stringify(config) !== JSON.stringify(stored)) writeConfig(file, config);
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
