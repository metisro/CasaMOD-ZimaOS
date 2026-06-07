"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "casamod-zimaos-"));
const modDir = path.join(dataDir, "mod", "test-mod");
fs.mkdirSync(modDir, { recursive: true });
fs.writeFileSync(path.join(modDir, "mod.js"), "");
fs.writeFileSync(path.join(modDir, "casamod.json"), JSON.stringify({
  name: "Test Mod",
  enabled: true
}));

const child = spawn(process.execPath, [path.join(__dirname, "server.js")], {
  env: { ...process.env, DATA_DIR: dataDir, PORT: "18090" },
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
      response.on("end", () => resolve({
        status: response.statusCode,
        body: JSON.parse(Buffer.concat(chunks).toString("utf8"))
      }));
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

    assert.equal((await request("PUT", "/config/test-mod", { enabled: true })).status, 200);
    const config = await request("GET", "/config/test-mod");
    assert.deepEqual(config.body.config, { enabled: true });

    assert.equal((await request("GET", "/config/../bad")).status, 404);
    console.log("CasaMOD-ZimaOS API integration test passed");
  } finally {
    child.kill();
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
