"use strict";

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const PORT = Number(process.env.PORT || 8090);
const DATA_DIR = process.env.DATA_DIR || "/data";
const MOD_DIR = path.join(DATA_DIR, "mod");
const CONFIG_DIR = path.join(DATA_DIR, "config");
const MAX_BODY_BYTES = 64 * 1024;
const ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;

fs.mkdirSync(CONFIG_DIR, { recursive: true });

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
  const directory = path.join(MOD_DIR, modId);
  const stat = fs.statSync(directory);
  if (!stat.isDirectory()) return null;

  const manifest = readJson(path.join(directory, "zimamod.json"), {});
  const scripts = Array.isArray(manifest.scripts)
    ? manifest.scripts
    : fs.existsSync(path.join(directory, "mod.js")) ? ["mod.js"] : [];
  const styles = Array.isArray(manifest.styles)
    ? manifest.styles
    : fs.existsSync(path.join(directory, "mod.css")) ? ["mod.css"] : [];

  return {
    id: modId,
    name: typeof manifest.name === "string" ? manifest.name : modId,
    enabled: manifest.enabled !== false,
    version: typeof manifest.version === "string" ? manifest.version : "1",
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
