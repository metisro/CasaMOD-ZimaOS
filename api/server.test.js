"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "zimamod-"));
const modDir = path.join(dataDir, "mod", "test-mod");
const storeDir = path.join(dataDir, "store", "store-mod");
fs.mkdirSync(modDir, { recursive: true });
fs.mkdirSync(storeDir, { recursive: true });
fs.writeFileSync(path.join(modDir, "mod.js"), "");
fs.writeFileSync(path.join(modDir, "zimamod.json"), JSON.stringify({
  name: "Test Mod",
  enabled: true
}));
fs.writeFileSync(path.join(storeDir, "mod.js"), "store");
fs.writeFileSync(path.join(storeDir, "screenshot.jpg"), "jpeg-data");
fs.writeFileSync(path.join(storeDir, "zimamod.json"), JSON.stringify({
  name: "Store Mod",
  description: "Test store mod",
  authors: [{ name: "Test Author", url: "https://example.com/author" }],
  origin: {
    type: "adapted",
    adapter: "Test Adapter",
    source: "https://example.com/original"
  },
  screenshot: "screenshot.png",
  enabled: true
}));

let updateRequestCount = 0;
const updateServer = http.createServer((request, response) => {
  updateRequestCount++;
  const version = updateRequestCount === 1 ? "1.1.9" : "1.1.7";
  response.writeHead(200, { "Content-Type": "application/json" });
  response.end(JSON.stringify({
    tag_name: `v${version}`,
    html_url: `https://github.com/metisro/ZimaMOD/releases/tag/v${version}`
  }));
}).listen(18091, "127.0.0.1");

const child = spawn(process.execPath, [path.join(__dirname, "server.js")], {
  env: {
    ...process.env,
    DATA_DIR: dataDir,
    ZIMAMOD_API_PORT: "18090",
    VERSION: "1.1.8",
    UPDATE_URL: "http://127.0.0.1:18091/latest"
  },
  stdio: "ignore"
});

function request(method, pathname, body) {
  return new Promise((resolve, reject) => {
    const request = http.request({
      host: "127.0.0.1",
      port: 18090,
      method,
      path: pathname,
      headers: body ? { "Content-Type": "application/json" } : {}
    }, response => {
      const chunks = [];
      response.on("data", chunk => chunks.push(chunk));
      response.on("end", () => {
        const raw = Buffer.concat(chunks).toString("utf8");
        let parsed = raw;
        try {
          parsed = JSON.parse(raw);
        } catch (_) {
          // Binary/static asset response.
        }
        resolve({
          status: response.statusCode,
          headers: response.headers,
          body: parsed
        });
      });
    });
    request.on("error", reject);
    if (body) request.write(JSON.stringify(body));
    request.end();
  });
}

async function waitForServer() {
  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      return await request("GET", "/health");
    } catch (_) {
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  }
  throw new Error("API did not start");
}

(async () => {
  try {
    assert.equal((await waitForServer()).status, 200);

    const mods = await request("GET", "/mods");
    assert.equal(mods.status, 200);
    assert.equal(mods.body.mods[0].id, "test-mod");
    assert.equal(mods.body.mods[0].version, "1");

    const store = await request("GET", "/store");
    assert.equal(store.status, 200);
    assert.equal(store.body.mods[0].id, "store-mod");
    assert.equal(store.body.mods[0].installed, false);
    assert.deepEqual(store.body.mods[0].authors, [{ name: "Test Author", url: "https://example.com/author" }]);
    assert.deepEqual(store.body.mods[0].origin, {
      type: "adapted",
      adapter: "Test Adapter",
      source: "https://example.com/original"
    });
    const storeAsset = await request("GET", "/store-assets/store-mod/screenshot.jpg");
    assert.equal(storeAsset.status, 200);
    assert.equal(storeAsset.headers["content-type"], "image/jpeg");
    assert.equal(storeAsset.body, "jpeg-data");
    assert.equal((await request("GET", "/store-assets/store-mod/%2e%2e/server.js")).status, 404);

    const update = await request("GET", "/update");
    assert.equal(update.status, 200);
    assert.equal(update.body.currentVersion, "1.1.8");
    assert.equal(update.body.latestVersion, "1.1.9");
    assert.equal(update.body.updateAvailable, true);
    assert.equal(update.body.checkAvailable, true);
    assert.equal(update.body.releaseUrl, "https://github.com/metisro/ZimaMOD/releases/tag/v1.1.9");
    assert.equal(updateRequestCount, 1);
    assert.equal((await request("GET", "/update")).status, 200);
    assert.equal(updateRequestCount, 1);
    const refreshedUpdate = await request("GET", "/update?refresh=1");
    assert.equal(refreshedUpdate.status, 200);
    assert.equal(refreshedUpdate.body.latestVersion, "1.1.7");
    assert.equal(refreshedUpdate.body.updateAvailable, false);
    assert.equal(updateRequestCount, 2);

    assert.equal((await request("POST", "/store/store-mod")).status, 200);
    assert.equal(fs.readFileSync(path.join(dataDir, "mod", "store-mod", "mod.js"), "utf8"), "store");
    assert.equal((await request("DELETE", "/store/store-mod")).status, 200);
    assert.equal(fs.existsSync(path.join(dataDir, "mod", "store-mod")), false);

    assert.equal((await request("PUT", "/config/test-mod", { enabled: true })).status, 200);
    const config = await request("GET", "/config/test-mod");
    assert.deepEqual(config.body.config, { enabled: true });

    assert.equal((await request("PUT", "/config/sortable-widgets", {
      order: [
        "weather",
        "system-58cpu0-00-c34ram2-79-gbcpuram",
        "storage-healthyused-1-54-gbtotal-1-07-tb",
        "networketh0kb0-b0-b",
        "widget-settings"
      ]
    })).status, 200);
    assert.equal(fs.existsSync(path.join(dataDir, "config", "sortable-widgets.json")), true);
    const sortable = await request("GET", "/config/sortable-widgets");
    assert.deepEqual(sortable.body.config.order, [
      "weather",
      "system",
      "storage",
      "network",
      "widget-settings"
    ]);
    assert.deepEqual(
      JSON.parse(fs.readFileSync(path.join(dataDir, "config", "sortable-widgets.json"), "utf8")).order,
      sortable.body.config.order
    );

    assert.equal((await request("GET", "/config/../bad")).status, 404);
    console.log("ZimaMOD API integration test passed");
  } finally {
    child.kill();
    updateServer.close();
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
