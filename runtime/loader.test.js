"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

test("MOD Store mutations reuse one token per session and Copy key uses ZimaOS session validation", async () => {
  const requests = [];
  const session = new Map();
  const elements = {};
  let copied = "";
  function control(selector, properties = {}) {
    return {
      hidden: false,
      listeners: {},
      textContent: "",
      value: "",
      addEventListener(type, listener) {
        this.listeners[type] = listener;
      },
      focus() {},
      setAttribute() {},
      ...properties
    };
  }
  function modalElement() {
    const controls = {
      "#zimamod-token-input": control("#zimamod-token-input", { type: "password" }),
      ".zimamod-token-error": control(".zimamod-token-error", { hidden: true }),
      ".zimamod-token-form": control(".zimamod-token-form"),
      ".zimamod-token-cancel": control(".zimamod-token-cancel"),
      ".zimamod-token-backdrop": control(".zimamod-token-backdrop"),
      ".zimamod-token-show": control(".zimamod-token-show"),
      ".zimamod-token-paste": control(".zimamod-token-paste")
    };
    return {
      controls,
      dataset: {},
      id: "",
      listeners: {},
      set innerHTML(_) {},
      addEventListener(type, listener) {
        this.listeners[type] = listener;
      },
      querySelector: selector => controls[selector],
      remove() {
        delete elements[this.id];
      }
    };
  }
  const document = {
    currentScript: {
      getRootNode: () => ({}),
      closest: () => null
    },
    documentElement: { dataset: {} },
    getElementById: id => elements[id] || null,
    querySelector: () => null,
    createElement: tagName => tagName === "div" ? modalElement() : ({ dataset: {} }),
    head: { appendChild: () => {} },
    body: {
      appendChild(element) {
        if (element.id) elements[element.id] = element;
      }
    }
  };
  const window = {
    location: { origin: "http://zimamod.test" }
  };
  window.top = window;

  const context = {
    console,
    document,
    fetch: async (url, options = {}) => {
      requests.push({ url, options });
      const isTokenRequest = String(url).endsWith("/token");
      return {
        ok: true,
        status: 200,
        json: async () => isTokenRequest
          ? { token: "copied-api-token-that-is-at-least-32-characters" }
          : { mods: [] }
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

  const install = window.ZimaMOD.installMod("test-mod");
  await new Promise(resolve => setImmediate(resolve));
  const tokenModal = elements["zimamod-token-modal"];
  assert.ok(tokenModal);
  tokenModal.controls["#zimamod-token-input"].value = "session-token";
  tokenModal.controls[".zimamod-token-form"].listeners.submit({ preventDefault() {} });
  await install;
  await window.ZimaMOD.uninstallMod("test-mod");
  await window.ZimaMOD.saveBingWallpaper("https://www.bing.com/th?id=OHR.Test.jpg");
  await window.ZimaMOD.copyApiToken();

  const writes = requests.filter(request => request.options.method);
  assert.equal(writes[0].options.headers.Authorization, "Bearer session-token");
  assert.equal(writes[1].options.headers.Authorization, "Bearer session-token");
  assert.equal(writes[2].options.headers.Authorization, "Bearer session-token");
  assert.equal(writes[2].url, "/zimamod-api/bing-wallpaper/save");
  assert.deepEqual(JSON.parse(writes[2].options.body), {
    imageUrl: "https://www.bing.com/th?id=OHR.Test.jpg"
  });
  assert.equal(session.get("zimamod-api-token"), "session-token");
  const copyRequest = requests.find(request => String(request.url).endsWith("/token"));
  assert.equal(copyRequest.options.headers.Authorization, "zimaos-session-token");
  assert.equal(copyRequest.url, "/zimamod-api/token");
  assert.equal(copied, "copied-api-token-that-is-at-least-32-characters");
  assert.equal(elements["zimamod-token-modal"], undefined);
});

test("write authorization uses a modal rather than a native prompt", () => {
  const source = fs.readFileSync(path.join(__dirname, "loader.js"), "utf8");

  assert.doesNotMatch(source, /window\.prompt|prompt\(/);
  assert.match(source, /zimamod-token-modal/);
  assert.match(source, /Authorize this change/);
  assert.match(source, /navigator\.clipboard\.readText/);
});
