"use strict";

const http = require("node:http");
const https = require("node:https");
const net = require("node:net");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const PORT_VALUE = process.env.ZIMAMOD_API_PORT || process.env.PORT || "8090";
const PORT = Number(PORT_VALUE);
const DATA_DIR = process.env.DATA_DIR || "/data";
const MOD_DIR = path.join(DATA_DIR, "mod");
const CONFIG_DIR = path.join(DATA_DIR, "config");
const STORE_DIR = path.join(DATA_DIR, "store");
const BING_GALLERY_DIR = process.env.BING_GALLERY_DIR || "/gallery";
const HOST_PROC_DIR = process.env.HOST_PROC_DIR || "/host/proc";
const HOST_SYS_DIR = process.env.HOST_SYS_DIR || "/host/sys";
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
const RESOURCE_ALERTS_ID = "resource-alerts";
const RESOURCE_ALERTS_STATE_FILE = path.join(CONFIG_DIR, RESOURCE_ALERTS_ID + "-state.json");
const RESOURCE_ALERTS_MONITOR_MIN_MS = 10000;
const RESOURCE_ALERTS_EVENT_LIMIT = 1000;
let updateCache = null;
let updateRequest = null;
let lastCpuSample = null;
let lastNetworkSample = null;
let resourceAlertsTimer = null;
let resourceAlertsRunning = false;
let resourceAlertsSnapshot = null;
let resourceAlertsNextDelay = 30000;

if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
  throw new Error(`Invalid API port: ${PORT_VALUE}`);
}

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(CONFIG_DIR, { recursive: true });
fs.mkdirSync(STORE_DIR, { recursive: true });
fs.mkdirSync(BING_GALLERY_DIR, { recursive: true });

function existingSystemPath(preferred, fallback) {
  try {
    return fs.statSync(preferred).isDirectory() ? preferred : fallback;
  } catch (_) {
    return fallback;
  }
}

const PROC_DIR = existingSystemPath(HOST_PROC_DIR, "/proc");
const SYS_DIR = existingSystemPath(HOST_SYS_DIR, "/sys");
const HOST_PROC_MOUNTED = PROC_DIR === HOST_PROC_DIR;

function generateApiToken() {
  const generated = crypto.randomBytes(32).toString("hex");
  fs.writeFileSync(TOKEN_FILE, generated + "\n", { mode: 0o600 });
  fs.rmSync(path.join(DATA_DIR, "api-token.txt"), { force: true });
  fs.rmSync(path.join(DATA_DIR, "api-token"), { force: true });
  console.log("Generated ZimaMOD API token at /data/config/api_token");
  return generated;
}

const API_TOKEN = generateApiToken();
try {
  lastCpuSample = readCpuSample();
} catch (_) {
  lastCpuSample = null;
}
try {
  lastNetworkSample = readNetworkSample();
} catch (_) {
  lastNetworkSample = null;
}

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

function decodeMountPath(value) {
  return value.replace(/\\040/g, " ").replace(/\\011/g, "\t").replace(/\\012/g, "\n").replace(/\\134/g, "\\");
}

function galleryMounted() {
  if (process.platform !== "linux") return false;
  try {
    const expected = path.resolve(BING_GALLERY_DIR);
    return fs.readFileSync("/proc/self/mountinfo", "utf8")
      .split("\n")
      .some(line => decodeMountPath(line.split(" - ")[0]?.split(" ")[4] || "") === expected);
  } catch (_) {
    return false;
  }
}

function readText(file) {
  return fs.readFileSync(file, "utf8").trim();
}

function readNumber(file) {
  const value = Number(readText(file));
  return Number.isFinite(value) ? value : null;
}

function round(value, precision = 1) {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

function readCpuSample() {
  const line = readText(path.join(PROC_DIR, "stat")).split("\n")[0] || "";
  const parts = line.trim().split(/\s+/);
  if (parts[0] !== "cpu") throw new Error("Invalid /proc/stat CPU line");
  const values = parts.slice(1).map(Number).filter(Number.isFinite);
  if (values.length < 5) throw new Error("Invalid /proc/stat CPU values");
  const idle = values[3] + (values[4] || 0);
  const total = values.reduce((sum, value) => sum + value, 0);
  return { idle, total };
}

function cpuMetrics() {
  try {
    const current = readCpuSample();
    const previous = lastCpuSample;
    lastCpuSample = current;
    if (!previous) return { percent: null, available: false };

    const totalDelta = current.total - previous.total;
    const idleDelta = current.idle - previous.idle;
    if (totalDelta <= 0) return { percent: null, available: false };
    return {
      percent: round(((totalDelta - idleDelta) / totalDelta) * 100),
      available: true
    };
  } catch (error) {
    return { percent: null, available: false, error: error.message };
  }
}

function memoryMetrics() {
  try {
    const values = {};
    for (const line of readText(path.join(PROC_DIR, "meminfo")).split("\n")) {
      const match = line.match(/^([^:]+):\s+(\d+)/);
      if (match) values[match[1]] = Number(match[2]) * 1024;
    }
    const total = values.MemTotal || 0;
    const available = values.MemAvailable || values.MemFree || 0;
    if (!total) throw new Error("MemTotal unavailable");
    const used = Math.max(0, total - available);
    return {
      percent: round((used / total) * 100),
      usedBytes: used,
      totalBytes: total,
      availableBytes: available,
      available: true
    };
  } catch (error) {
    return { percent: null, available: false, error: error.message };
  }
}

function diskMetrics() {
  try {
    const stat = fs.statfsSync(DATA_DIR);
    const total = stat.blocks * stat.bsize;
    const available = stat.bavail * stat.bsize;
    const used = Math.max(0, total - available);
    if (!total) throw new Error("Disk total unavailable");
    return {
      path: DATA_DIR,
      percent: round((used / total) * 100),
      usedBytes: used,
      totalBytes: total,
      availableBytes: available,
      available: true
    };
  } catch (error) {
    return { path: DATA_DIR, percent: null, available: false, error: error.message };
  }
}

function readNetworkSample() {
  const ignored = new Set(["lo"]);
  const interfaces = [];
  let rxBytes = 0;
  let txBytes = 0;

  for (const line of readText(path.join(PROC_DIR, "net", "dev")).split("\n").slice(2)) {
    const [namePart, valuesPart] = line.split(":");
    if (!namePart || !valuesPart) continue;
    const name = namePart.trim();
    if (!name || ignored.has(name)) continue;

    const values = valuesPart.trim().split(/\s+/).map(Number);
    if (values.length < 16 || values.some(value => !Number.isFinite(value))) continue;
    const rx = values[0];
    const tx = values[8];
    rxBytes += rx;
    txBytes += tx;
    interfaces.push({ name, rxBytes: rx, txBytes: tx });
  }

  return { at: Date.now(), rxBytes, txBytes, interfaces };
}

function networkMetrics() {
  try {
    const current = readNetworkSample();
    const previous = lastNetworkSample;
    lastNetworkSample = current;
    if (!previous) return { downloadBytesPerSecond: null, uploadBytesPerSecond: null, available: false };

    const elapsed = (current.at - previous.at) / 1000;
    if (elapsed <= 0) return { downloadBytesPerSecond: null, uploadBytesPerSecond: null, available: false };

    return {
      downloadBytesPerSecond: round(Math.max(0, current.rxBytes - previous.rxBytes) / elapsed),
      uploadBytesPerSecond: round(Math.max(0, current.txBytes - previous.txBytes) / elapsed),
      interfaces: current.interfaces,
      available: true
    };
  } catch (error) {
    return { downloadBytesPerSecond: null, uploadBytesPerSecond: null, available: false, error: error.message };
  }
}

function systemInfo() {
  const info = {
    uptimeSeconds: null,
    bootTime: null,
    available: false
  };

  try {
    const uptime = Number(readText(path.join(PROC_DIR, "uptime")).split(/\s+/)[0]);
    if (Number.isFinite(uptime)) {
      info.uptimeSeconds = round(uptime, 0);
      info.available = true;
    }
  } catch (_) {
    // uptime is optional in constrained containers.
  }

  try {
    const bootLine = readText(path.join(PROC_DIR, "stat")).split("\n").find(line => line.startsWith("btime "));
    const bootSeconds = Number(bootLine?.split(/\s+/)[1]);
    if (Number.isFinite(bootSeconds)) {
      info.bootTime = new Date(bootSeconds * 1000).toISOString();
      info.available = true;
    }
  } catch (_) {
    // btime is optional in constrained containers.
  }

  return info;
}

function topMemoryProcesses(limit = 5) {
  if (!HOST_PROC_MOUNTED) return [];

  const processes = [];

  try {
    for (const entry of fs.readdirSync(PROC_DIR)) {
      if (!/^\d+$/.test(entry)) continue;
      try {
        const statusFile = path.join(PROC_DIR, entry, "status");
        const status = readText(statusFile);
        const name = status.match(/^Name:\s+(.+)$/m)?.[1] || entry;
        const rssKb = Number(status.match(/^VmRSS:\s+(\d+)/m)?.[1]);
        if (!Number.isFinite(rssKb)) continue;

        let command = name;
        try {
          const cmdline = fs.readFileSync(path.join(PROC_DIR, entry, "cmdline"), "utf8")
            .replace(/\0/g, " ")
            .trim();
          if (cmdline) command = cmdline.slice(0, 160);
        } catch (_) {
          // cmdline can be hidden for kernel/system processes.
        }

        processes.push({
          pid: Number(entry),
          name,
          command,
          memoryBytes: rssKb * 1024
        });
      } catch (_) {
        // Processes can exit while /proc is being scanned.
      }
    }
  } catch (_) {
    return [];
  }

  return processes
    .sort((left, right) => right.memoryBytes - left.memoryBytes)
    .slice(0, limit);
}

function raidHealth() {
  try {
    const mdstat = readText(path.join(PROC_DIR, "mdstat"));
    const arrays = [];
    let degraded = false;

    for (const block of mdstat.split(/\n(?=md\d+\s*:)/)) {
      const name = block.match(/^(md\d+)\s*:/)?.[1];
      if (!name) continue;
      const state = block.includes("[U_") || block.includes("[_U") || /\(F\)/.test(block)
        ? "degraded"
        : "healthy";
      degraded = degraded || state !== "healthy";
      arrays.push({ name, state, detail: block.replace(/\s+/g, " ").trim().slice(0, 220) });
    }

    return {
      available: arrays.length > 0,
      state: arrays.length ? (degraded ? "degraded" : "healthy") : "unavailable",
      arrays
    };
  } catch (_) {
    return { available: false, state: "unavailable", arrays: [] };
  }
}

function zfsHealth() {
  try {
    const output = execFileSync("zpool", ["status", "-x"], {
      encoding: "utf8",
      timeout: 2500,
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
    const healthy = /all pools are healthy/i.test(output);
    return {
      available: true,
      state: healthy ? "healthy" : "degraded",
      detail: output.slice(0, 500)
    };
  } catch (_) {
    return { available: false, state: "unavailable", detail: "" };
  }
}

function storageHealth() {
  const raid = raidHealth();
  const zfs = zfsHealth();
  const states = [raid.state, zfs.state].filter(state => state !== "unavailable");
  const state = states.includes("degraded") ? "degraded" : states.includes("healthy") ? "healthy" : "unavailable";
  return {
    state,
    raid,
    zfs
  };
}

function sensorTemperature(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.abs(number) > 1000 ? number / 1000 : number;
}

function readSensors() {
  const sensors = [];

  try {
    for (const entry of fs.readdirSync(path.join(SYS_DIR, "class", "thermal"))) {
      if (!entry.startsWith("thermal_zone")) continue;
      const root = path.join(SYS_DIR, "class", "thermal", entry);
      const temp = sensorTemperature(readNumber(path.join(root, "temp")));
      if (temp === null) continue;
      sensors.push({
        id: entry,
        label: fs.existsSync(path.join(root, "type")) ? readText(path.join(root, "type")) : entry,
        celsius: round(temp),
        source: "thermal"
      });
    }
  } catch (_) {
    // Thermal zones are platform-dependent.
  }

  try {
    for (const entry of fs.readdirSync(path.join(SYS_DIR, "class", "hwmon"))) {
      const root = path.join(SYS_DIR, "class", "hwmon", entry);
      const device = fs.existsSync(path.join(root, "name")) ? readText(path.join(root, "name")) : entry;
      for (const file of fs.readdirSync(root).filter(item => /^temp\d+_input$/.test(item))) {
        const id = file.match(/^temp(\d+)_input$/)?.[1] || "";
        const labelFile = path.join(root, `temp${id}_label`);
        const temp = sensorTemperature(readNumber(path.join(root, file)));
        if (temp === null) continue;
        sensors.push({
          id: `${entry}:temp${id}`,
          label: fs.existsSync(labelFile) ? readText(labelFile) : `${device} temp${id}`,
          celsius: round(temp),
          source: "hwmon"
        });
      }
    }
  } catch (_) {
    // hwmon is also platform-dependent.
  }

  return sensors.slice(0, 24);
}

function systemMetrics() {
  return {
    ok: true,
    checkedAt: new Date().toISOString(),
    source: {
      proc: PROC_DIR,
      sys: SYS_DIR,
      disk: DATA_DIR,
      hostProcMounted: HOST_PROC_MOUNTED
    },
    cpu: cpuMetrics(),
    memory: memoryMetrics(),
    disk: diskMetrics(),
    network: networkMetrics(),
    system: systemInfo(),
    topProcesses: topMemoryProcesses(),
    storageHealth: storageHealth(),
    sensors: readSensors()
  };
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
  if (!galleryMounted()) {
    throw new Error(
      "Bing Wallpapers Gallery is not mounted. Add /DATA/Gallery/Bing Wallpapers:/gallery " +
      "to zimamod-api volumes and recreate the container."
    );
  }
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
  if (modId === RESOURCE_ALERTS_ID) return normalizeResourceAlertsConfig(config);
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

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function deepMerge(base, incoming) {
  const result = clone(base);
  if (!incoming || typeof incoming !== "object") return result;

  for (const [key, value] of Object.entries(incoming)) {
    if (
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      result[key] &&
      typeof result[key] === "object" &&
      !Array.isArray(result[key])
    ) {
      result[key] = deepMerge(result[key], value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

function clamp(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

const RESOURCE_ALERTS_DEFAULT_CONFIG = {
  theme: "sanded-glass",
  notes: "",
  refreshInterval: 30,
  cooldownMinutes: 15,
  thresholds: {
    cpuWarn: 75,
    cpuCritical: 90,
    ramWarn: 80,
    ramCritical: 92,
    diskWarn: 80,
    diskCritical: 92,
    tempWarn: 75,
    tempCritical: 90
  },
  events: {
    defaultShown: 20,
    loadAllLimit: 200
  },
  notifications: {
    browser: true,
    sound: false,
    telegram: {
      enabled: false,
      botToken: "",
      chatId: ""
    },
    gotify: {
      enabled: false,
      url: "",
      token: ""
    }
  },
  checks: []
};

function normalizeResourceAlertsConfig(value) {
  const merged = deepMerge(RESOURCE_ALERTS_DEFAULT_CONFIG, value);
  merged.refreshInterval = clamp(merged.refreshInterval, 10, 3600, RESOURCE_ALERTS_DEFAULT_CONFIG.refreshInterval);
  merged.cooldownMinutes = clamp(merged.cooldownMinutes, 1, 1440, RESOURCE_ALERTS_DEFAULT_CONFIG.cooldownMinutes);
  for (const key of Object.keys(RESOURCE_ALERTS_DEFAULT_CONFIG.thresholds)) {
    const max = key.startsWith("temp") ? 140 : 100;
    merged.thresholds[key] = clamp(merged.thresholds[key], 1, max, RESOURCE_ALERTS_DEFAULT_CONFIG.thresholds[key]);
  }
  merged.events = {
    defaultShown: clamp(merged.events?.defaultShown, 5, 100, RESOURCE_ALERTS_DEFAULT_CONFIG.events.defaultShown),
    loadAllLimit: clamp(merged.events?.loadAllLimit, 40, 1000, RESOURCE_ALERTS_DEFAULT_CONFIG.events.loadAllLimit)
  };
  merged.notifications.browser = Boolean(merged.notifications.browser);
  merged.notifications.sound = Boolean(merged.notifications.sound);
  merged.notifications.telegram.enabled = Boolean(merged.notifications.telegram.enabled);
  merged.notifications.gotify.enabled = Boolean(merged.notifications.gotify.enabled);
  merged.checks = Array.isArray(merged.checks)
    ? merged.checks.map(check => {
      const method = ["HTTP", "TCP", "Process"].includes(check?.method) ? check.method : "HTTP";
      return {
        name: String(check?.name || "").trim().slice(0, 48),
        url: String(check?.url || "").trim().slice(0, 500),
        method,
        target: String(check?.target || check?.url || "").trim().slice(0, 500),
        enabled: check?.enabled !== false
      };
    }).filter(check => check.name && (check.url || check.target))
    : [];
  return merged;
}

function resourceAlertsConfig() {
  return normalizeResourceAlertsConfig(readJson(configPath(RESOURCE_ALERTS_ID), RESOURCE_ALERTS_DEFAULT_CONFIG));
}

function resourceAlertsState() {
  const saved = readJson(RESOURCE_ALERTS_STATE_FILE, {});
  return {
    events: Array.isArray(saved.events) ? saved.events.slice(0, RESOURCE_ALERTS_EVENT_LIMIT) : [],
    active: saved.active && typeof saved.active === "object" ? saved.active : {},
    lastSent: saved.lastSent && typeof saved.lastSent === "object" ? saved.lastSent : {}
  };
}

function writeResourceAlertsState(state) {
  writeConfig(RESOURCE_ALERTS_STATE_FILE, {
    events: Array.isArray(state.events) ? state.events.slice(0, RESOURCE_ALERTS_EVENT_LIMIT) : [],
    active: state.active && typeof state.active === "object" ? state.active : {},
    lastSent: state.lastSent && typeof state.lastSent === "object" ? state.lastSent : {}
  });
}

function resourceMetricStatus(value, warn, critical) {
  if (value === null || value === undefined || Number.isNaN(value)) return "unknown";
  if (value >= critical) return "critical";
  if (value >= warn) return "warn";
  return "ok";
}

function primaryTemperature(sensors) {
  return (Array.isArray(sensors) ? sensors : [])
    .map(sensor => Number(sensor?.celsius))
    .filter(Number.isFinite)
    .sort((left, right) => right - left)[0] ?? null;
}

function resourceMetricsSnapshot(config) {
  const payload = systemMetrics();
  const cpu = Number(payload.cpu?.percent);
  const ram = Number(payload.memory?.percent);
  const disk = Number(payload.disk?.percent);
  const temp = primaryTemperature(payload.sensors);
  return {
    raw: payload,
    metrics: {
      cpu: {
        value: Number.isFinite(cpu) ? cpu : null,
        status: resourceMetricStatus(cpu, config.thresholds.cpuWarn, config.thresholds.cpuCritical)
      },
      ram: {
        value: Number.isFinite(ram) ? ram : null,
        status: resourceMetricStatus(ram, config.thresholds.ramWarn, config.thresholds.ramCritical)
      },
      disk: {
        value: Number.isFinite(disk) ? disk : null,
        status: resourceMetricStatus(disk, config.thresholds.diskWarn, config.thresholds.diskCritical)
      },
      temp: {
        value: temp,
        status: resourceMetricStatus(temp, config.thresholds.tempWarn, config.thresholds.tempCritical)
      }
    }
  };
}

function httpCheck(url) {
  return new Promise(resolve => {
    let parsed;
    try {
      parsed = new URL(url);
    } catch (_) {
      resolve({ ok: false, state: "stopped", error: "invalid URL" });
      return;
    }

    const started = Date.now();
    const client = parsed.protocol === "https:" ? https : http;
    const request = client.request(parsed, { method: "GET", timeout: 6000 }, response => {
      response.resume();
      const ok = response.statusCode >= 200 && response.statusCode < 400;
      resolve({
        ok,
        state: ok ? "running" : response.statusCode >= 500 ? "stopped" : "degraded",
        statusCode: response.statusCode,
        latencyMs: Date.now() - started
      });
    });
    request.on("timeout", () => request.destroy(new Error("timeout")));
    request.on("error", error => resolve({ ok: false, state: "stopped", error: error.message || "unreachable" }));
    request.end();
  });
}

function tcpTarget(value) {
  const source = String(value || "").trim();
  if (!source) return null;
  try {
    const url = new URL(source.includes("://") ? source : "tcp://" + source);
    const port = Number(url.port);
    if (Number.isInteger(port) && port > 0 && port <= 65535) {
      return { host: url.hostname || "127.0.0.1", port };
    }
  } catch (_) {
    // Fall through to host:port or bare port parsing.
  }
  const hostPort = source.match(/^(.+):(\d+)$/);
  if (hostPort) return { host: hostPort[1], port: Number(hostPort[2]) };
  const port = Number(source);
  return Number.isInteger(port) && port > 0 && port <= 65535 ? { host: "127.0.0.1", port } : null;
}

function tcpCheck(value) {
  return new Promise(resolve => {
    const target = tcpTarget(value);
    if (!target) {
      resolve({ ok: false, state: "stopped", error: "invalid TCP target" });
      return;
    }
    const started = Date.now();
    const socket = net.createConnection(target);
    socket.setTimeout(6000);
    socket.on("connect", () => {
      socket.destroy();
      resolve({ ok: true, state: "running", latencyMs: Date.now() - started });
    });
    socket.on("timeout", () => socket.destroy(new Error("timeout")));
    socket.on("error", error => resolve({ ok: false, state: "stopped", error: error.message || "unreachable" }));
  });
}

function processCheck(value) {
  const needle = String(value || "").trim().toLowerCase();
  if (!needle) return { ok: false, state: "stopped", error: "missing process name" };
  if (!HOST_PROC_MOUNTED) return { ok: false, state: "degraded", error: "host /proc not mounted" };

  try {
    for (const entry of fs.readdirSync(PROC_DIR)) {
      if (!/^\d+$/.test(entry)) continue;
      try {
        const status = readText(path.join(PROC_DIR, entry, "status"));
        const name = status.match(/^Name:\s+(.+)$/m)?.[1] || "";
        const command = fs.existsSync(path.join(PROC_DIR, entry, "cmdline"))
          ? fs.readFileSync(path.join(PROC_DIR, entry, "cmdline"), "utf8").replace(/\0/g, " ").trim()
          : "";
        if (name.toLowerCase().includes(needle) || command.toLowerCase().includes(needle)) {
          return { ok: true, state: "running", pid: Number(entry) };
        }
      } catch (_) {
        // Processes can exit while /proc is being scanned.
      }
    }
  } catch (error) {
    return { ok: false, state: "degraded", error: error.message || "process scan failed" };
  }
  return { ok: false, state: "stopped", error: "process not found" };
}

async function checkResourceService(check) {
  const method = check.method || "HTTP";
  const target = check.target || check.url;
  const result = method === "TCP"
    ? await tcpCheck(target)
    : method === "Process"
      ? processCheck(target || check.name)
      : await httpCheck(check.url || target);
  return {
    name: check.name,
    url: target || check.url,
    method,
    ...result
  };
}

function postForm(targetUrl, fields) {
  return new Promise((resolve, reject) => {
    const url = new URL(targetUrl);
    const body = new URLSearchParams(fields).toString();
    const client = url.protocol === "https:" ? https : http;
    const request = client.request(url, {
      method: "POST",
      timeout: 10000,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Content-Length": Buffer.byteLength(body)
      }
    }, response => {
      response.resume();
      response.on("end", () => {
        if (response.statusCode >= 200 && response.statusCode < 300) {
          resolve();
        } else {
          reject(new Error(`HTTP ${response.statusCode}`));
        }
      });
    });
    request.on("timeout", () => request.destroy(new Error("timeout")));
    request.on("error", reject);
    request.end(body);
  });
}

async function sendServerTelegram(config, message) {
  const telegram = config.notifications.telegram;
  if (!telegram.enabled || !telegram.botToken || !telegram.chatId) return;
  await postForm(`https://api.telegram.org/bot${encodeURIComponent(telegram.botToken)}/sendMessage`, {
    chat_id: telegram.chatId,
    text: message
  });
}

async function sendServerGotify(config, title, message) {
  const gotify = config.notifications.gotify;
  if (!gotify.enabled || !gotify.url || !gotify.token) return;
  const endpoint = new URL("/message", gotify.url);
  endpoint.searchParams.set("token", gotify.token);
  await postForm(endpoint.toString(), { title, message, priority: "5" });
}

function addResourceEvent(state, level, title, message, category = "system") {
  const event = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
    at: new Date().toISOString(),
    level,
    title,
    message,
    category
  };
  state.events.unshift(event);
  state.events = state.events.slice(0, RESOURCE_ALERTS_EVENT_LIMIT);
  return event;
}

function shouldSendResourceNotification(state, config, key, level) {
  if (level === "ok" || level === "unknown") return false;
  const now = Date.now();
  const cooldown = config.cooldownMinutes * 60 * 1000;
  return !state.lastSent[key] || now - state.lastSent[key] >= cooldown;
}

async function dispatchServerAlert(state, config, key, level, title, message) {
  if (!shouldSendResourceNotification(state, config, key, level)) return;
  state.lastSent[key] = Date.now();
  await Promise.allSettled([
    sendServerTelegram(config, `${title}\n${message}`),
    sendServerGotify(config, title, message)
  ]);
}

function resourceLevelRank(level) {
  return { ok: 0, unknown: 0, running: 0, warn: 1, degraded: 1, critical: 2, stopped: 2 }[level] || 0;
}

function resourceOverallLevel(metrics, services) {
  const levels = [
    metrics.cpu.status,
    metrics.ram.status,
    metrics.disk.status,
    metrics.temp.status,
    ...services.map(service => service.ok ? "ok" : service.state === "degraded" ? "warn" : "critical")
  ];
  return levels.sort((left, right) => resourceLevelRank(right) - resourceLevelRank(left))[0] || "unknown";
}

async function evaluateResourceAlerts() {
  const config = resourceAlertsConfig();
  const state = resourceAlertsState();
  const snapshot = resourceMetricsSnapshot(config);
  const services = await Promise.all(config.checks.filter(check => check.enabled).map(checkResourceService));
  const metricLabels = { cpu: "CPU", ram: "RAM", disk: "Storage", temp: "Temperature" };

  for (const key of Object.keys(metricLabels)) {
    const metric = snapshot.metrics[key];
    if (!metric || metric.status === "unknown" || metric.status === "ok") {
      delete state.active[key];
      continue;
    }
    const title = `${metricLabels[key]} ${metric.status === "critical" ? "critical" : "warning"}`;
    const unit = key === "temp" ? "°C" : "%";
    const message = `${metricLabels[key]} is at ${round(metric.value)}${unit}.`;
    if (state.active[key] !== metric.status) addResourceEvent(state, metric.status, title, message, key);
    state.active[key] = metric.status;
    await dispatchServerAlert(state, config, key + ":" + metric.status, metric.status, `ZimaMOD ${title}`, message);
  }

  for (const service of services) {
    const key = "service:" + service.name;
    if (service.ok) {
      if (state.active[key] && state.active[key] !== "running") {
        addResourceEvent(state, "ok", `Service recovered: ${service.name}`, `${service.url} is running.`, "service");
      }
      delete state.active[key];
      continue;
    }

    const level = service.state === "degraded" ? "warn" : "critical";
    const title = service.state === "degraded" ? `Service degraded: ${service.name}` : `Service down: ${service.name}`;
    const message = `${service.url || service.method} is ${service.error || service.state || "unreachable"}.`;
    if (state.active[key] !== level) addResourceEvent(state, level, title, message, "service");
    state.active[key] = level;
    await dispatchServerAlert(state, config, key + ":" + level, level, `ZimaMOD ${title}`, message);
  }

  writeResourceAlertsState(state);
  resourceAlertsSnapshot = {
    at: new Date().toISOString(),
    metrics: {
      ...snapshot.metrics,
      network: snapshot.raw.network,
      system: snapshot.raw.system,
      topProcesses: snapshot.raw.topProcesses,
      storageHealth: snapshot.raw.storageHealth,
      sensors: snapshot.raw.sensors,
      source: snapshot.raw.source
    },
    services,
    level: resourceOverallLevel(snapshot.metrics, services)
  };
  resourceAlertsNextDelay = Math.max(RESOURCE_ALERTS_MONITOR_MIN_MS, config.refreshInterval * 1000);
  return { state, snapshot: resourceAlertsSnapshot };
}

function scheduleResourceAlertsMonitor(delay = resourceAlertsNextDelay) {
  clearTimeout(resourceAlertsTimer);
  resourceAlertsTimer = setTimeout(runResourceAlertsMonitor, Math.max(1000, delay));
}

async function runResourceAlertsMonitor() {
  if (resourceAlertsRunning) {
    scheduleResourceAlertsMonitor(RESOURCE_ALERTS_MONITOR_MIN_MS);
    return;
  }
  resourceAlertsRunning = true;
  try {
    await evaluateResourceAlerts();
  } catch (error) {
    console.error("[ZimaMOD Resource Alerts] monitor failed:", error);
  } finally {
    resourceAlertsRunning = false;
    scheduleResourceAlertsMonitor();
  }
}

function resourceAlertsResponse() {
  return {
    ok: true,
    checkedAt: new Date().toISOString(),
    state: resourceAlertsState(),
    snapshot: resourceAlertsSnapshot,
    monitor: {
      running: Boolean(resourceAlertsTimer),
      nextDelayMs: resourceAlertsNextDelay,
      hostProcMounted: HOST_PROC_MOUNTED
    }
  };
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
    send(response, 200, { ok: true, galleryMounted: galleryMounted() });
    return;
  }

  if (request.method === "GET" && url.pathname === "/metrics") {
    send(response, 200, systemMetrics());
    return;
  }

  if (request.method === "GET" && url.pathname === "/resource-alerts") {
    send(response, 200, resourceAlertsResponse());
    return;
  }

  if (request.method === "POST" && url.pathname === "/resource-alerts/check") {
    const result = await evaluateResourceAlerts();
    send(response, 200, { ok: true, ...result });
    return;
  }

  if (request.method === "DELETE" && url.pathname === "/resource-alerts/events") {
    const state = resourceAlertsState();
    state.events = [];
    state.active = {};
    state.lastSent = {};
    writeResourceAlertsState(state);
    send(response, 200, { ok: true, state });
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
    if (configMatch[1] === RESOURCE_ALERTS_ID) scheduleResourceAlertsMonitor(1000);
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
  scheduleResourceAlertsMonitor(1000);
});
