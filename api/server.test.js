"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
let apiToken = "";

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "zimamod-"));
const galleryDir = path.join(dataDir, "gallery");
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
  category: "Compatible with ZimaMOD created for CasaMOD",
  authors: [{ name: "Test Author", url: "https://example.com/author" }],
  origin: {
    type: "compatible",
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

const dashboardServer = http.createServer((request, response) => {
  if (request.url === "/v1/users/current" && request.headers.authorization === "Bearer dashboard-token") {
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end('{"success":200}');
    return;
  }
  response.writeHead(401, { "Content-Type": "application/json" });
  response.end('{"error":"Unauthorized"}');
}).listen(18094, "127.0.0.1");

const child = spawn(process.execPath, [path.join(__dirname, "server.js")], {
  env: {
    ...process.env,
    DATA_DIR: dataDir,
    BING_GALLERY_DIR: galleryDir,
    ZIMAMOD_API_PORT: "18090",
    VERSION: "1.1.8",
    ZIMAMOD_DASHBOARD_URL: "http://127.0.0.1:18094",
    UPDATE_URL: "http://127.0.0.1:18091/latest"
  },
  stdio: "ignore"
});

function request(method, pathname, body, token = "", port = 18090) {
  return new Promise((resolve, reject) => {
    const request = http.request({
      host: "127.0.0.1",
      port,
      method,
      path: pathname,
      headers: {
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token === true ? apiToken : token}` } : {})
      }
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

async function verifyRestartRegeneratesToken() {
  const generatedDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "zimamod-generated-token-"));
  const start = () => spawn(process.execPath, [path.join(__dirname, "server.js")], {
    env: {
      ...process.env,
      DATA_DIR: generatedDataDir,
      BING_GALLERY_DIR: path.join(generatedDataDir, "gallery"),
      ZIMAMOD_API_PORT: "18092"
    },
    stdio: "ignore"
  });
  let generatedChild = start();
  try {
    for (let attempt = 0; attempt < 30; attempt++) {
      try {
        if ((await request("GET", "/health", null, "", 18092)).status === 200) break;
      } catch (_) {
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    }
    const tokenFile = path.join(generatedDataDir, "config", "api_token");
    const firstToken = fs.readFileSync(tokenFile, "utf8").trim();
    assert.ok(firstToken.length >= 32);
    assert.equal((await request("PUT", "/config/test-mod", { generated: true }, firstToken, 18092)).status, 200);
    generatedChild.kill();
    await new Promise(resolve => generatedChild.once("exit", resolve));
    generatedChild = start();
    for (let attempt = 0; attempt < 30; attempt++) {
      try {
        if ((await request("GET", "/health", null, "", 18092)).status === 200) break;
      } catch (_) {
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    }
    const secondToken = fs.readFileSync(tokenFile, "utf8").trim();
    assert.notEqual(secondToken, firstToken);
    assert.equal((await request("PUT", "/config/test-mod", { old: true }, firstToken, 18092)).status, 401);
    assert.equal((await request("PUT", "/config/test-mod", { current: true }, secondToken, 18092)).status, 200);
  } finally {
    generatedChild.kill();
    fs.rmSync(generatedDataDir, { recursive: true, force: true });
  }
}

(async () => {
  try {
    const health = await waitForServer();
    assert.equal(health.status, 200);
    assert.equal(health.body.galleryMounted, false);
    apiToken = fs.readFileSync(path.join(dataDir, "config", "api_token"), "utf8").trim();
    assert.equal((await request("GET", "/token")).status, 401);
    assert.equal((await request("GET", "/token", null, "wrong-dashboard-token")).status, 401);
    const tokenResponse = await request("GET", "/token", null, "dashboard-token");
    assert.equal(tokenResponse.status, 200);
    assert.equal(tokenResponse.body.token, apiToken);

    const mods = await request("GET", "/mods");
    assert.equal(mods.status, 200);
    assert.equal(mods.body.mods[0].id, "test-mod");
    assert.equal(mods.body.mods[0].version, "1");

    const store = await request("GET", "/store");
    assert.equal(store.status, 200);
    assert.equal(store.body.mods[0].id, "store-mod");
    assert.equal(store.body.mods[0].installed, false);
    assert.equal(store.body.mods[0].category, "Compatible with ZimaMOD created for CasaMOD");
    assert.deepEqual(store.body.mods[0].authors, [{ name: "Test Author", url: "https://example.com/author" }]);
    assert.deepEqual(store.body.mods[0].origin, {
      type: "compatible",
      adapter: "",
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

    assert.equal((await request("POST", "/store/store-mod")).status, 401);
    assert.equal((await request("POST", "/bing-wallpaper/save", {
      imageUrl: "https://www.bing.com/th?id=OHR.Test.jpg"
    })).status, 401);
    assert.equal((await request("POST", "/bing-wallpaper/save", {
      imageUrl: "https://example.com/not-bing.jpg"
    }, true)).status, 400);
    const missingGalleryMount = await request("POST", "/bing-wallpaper/save", {
      imageUrl: "https://www.bing.com/th?id=OHR.Test.jpg"
    }, true);
    assert.equal(missingGalleryMount.status, 400);
    assert.match(missingGalleryMount.body.error, /Gallery is not mounted/);
    assert.equal((await request("POST", "/store/store-mod", null, "wrong-token")).status, 401);
    assert.equal((await request("PATCH", "/future-write-route")).status, 401);
    assert.equal((await request("PATCH", "/future-write-route", null, true)).status, 404);
    assert.equal((await request("POST", "/store/store-mod", null, true)).status, 200);
    assert.equal(fs.readFileSync(path.join(dataDir, "mod", "store-mod", "mod.js"), "utf8"), "store");
    assert.equal((await request("DELETE", "/store/store-mod")).status, 401);
    assert.equal((await request("DELETE", "/store/store-mod", null, true)).status, 200);
    assert.equal(fs.existsSync(path.join(dataDir, "mod", "store-mod")), false);

    assert.equal((await request("PUT", "/config/test-mod", { enabled: true })).status, 401);
    assert.equal((await request("PUT", "/config/test-mod", { enabled: true }, true)).status, 200);
    const config = await request("GET", "/config/test-mod");
    assert.deepEqual(config.body.config, { enabled: true });

    const legacySortable = {
      order: ["system-58cpu0-00-c34ram2-79-gbcpuram"]
    };
    const sortableFile = path.join(dataDir, "config", "sortable-widgets.json");
    fs.writeFileSync(sortableFile, JSON.stringify(legacySortable));
    assert.deepEqual((await request("GET", "/config/sortable-widgets")).body.config.order, ["system"]);
    assert.deepEqual(JSON.parse(fs.readFileSync(sortableFile, "utf8")), legacySortable);

    assert.equal((await request("PUT", "/config/sortable-widgets", {
      order: [
        "weather",
        "system-58cpu0-00-c34ram2-79-gbcpuram",
        "storage-healthyused-1-54-gbtotal-1-07-tb",
        "networketh0kb0-b0-b",
        "widget-settings"
      ]
    }, true)).status, 200);
    assert.equal(fs.existsSync(sortableFile), true);
    const sortable = await request("GET", "/config/sortable-widgets");
    assert.deepEqual(sortable.body.config.order, [
      "weather",
      "system",
      "storage",
      "network",
      "widget-settings"
    ]);
    assert.deepEqual(
      JSON.parse(fs.readFileSync(sortableFile, "utf8")).order,
      sortable.body.config.order
    );

    assert.equal((await request("GET", "/config/../bad")).status, 404);
    await verifyRestartRegeneratesToken();
    console.log("ZimaMOD API integration test passed");
  } finally {
    child.kill();
    updateServer.close();
    dashboardServer.close();
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
