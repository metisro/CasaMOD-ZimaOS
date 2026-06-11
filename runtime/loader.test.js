"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

test("MOD Store mutations reuse one token per session and Copy key uses the ZimaOS file API", async () => {
  const requests = [];
  const prompts = ["session-token"];
  const session = new Map();
  let copied = "";
  const document = {
    currentScript: {
      getRootNode: () => ({}),
      closest: () => null
    },
    documentElement: { dataset: {} },
    querySelector: () => null,
    createElement: () => ({ dataset: {} }),
    head: { appendChild: () => {} },
    body: { appendChild: () => {} }
  };
  const window = {
    location: { origin: "http://zimamod.test" },
    prompt: () => prompts.shift()
  };
  window.top = window;

  const context = {
    console,
    document,
    fetch: async (url, options = {}) => {
      requests.push({ url, options });
      return {
        ok: true,
        status: 200,
        json: async () => ({ mods: [] }),
        text: async () => "copied-api-token-that-is-at-least-32-characters"
      };
    },
    localStorage: {
      getItem: key => key === "access_token" ? "zimaos-session-token" : null
    },
    navigator: {
      clipboard: {
        writeText: async value => {
          copied = value;
        }
      }
    },
    sessionStorage: {
      getItem: key => session.get(key) || null,
      setItem: (key, value) => session.set(key, value),
      removeItem: key => session.delete(key)
    },
    ShadowRoot: class ShadowRoot {},
    URL,
    window
  };

  vm.runInNewContext(
    fs.readFileSync(path.join(__dirname, "loader.js"), "utf8"),
    context
  );

  await window.ZimaMOD.installMod("test-mod");
  await window.ZimaMOD.uninstallMod("test-mod");
  await window.ZimaMOD.copyApiToken();

  const writes = requests.filter(request => request.options.method);
  assert.equal(writes[0].options.headers.Authorization, "Bearer session-token");
  assert.equal(writes[1].options.headers.Authorization, "Bearer session-token");
  assert.equal(session.get("zimamod-api-token"), "session-token");
  const copyRequest = requests.find(request => String(request.url).startsWith("/v1/file?"));
  assert.equal(copyRequest.options.headers.Authorization, "zimaos-session-token");
  assert.match(copyRequest.url, /%2FDATA%2FAppData%2Fzimamod%2Fconfig%2Fapi_token/);
  assert.equal(copied, "copied-api-token-that-is-at-least-32-characters");
  assert.deepEqual(prompts, []);
});
