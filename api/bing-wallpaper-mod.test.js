"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "mods", "bing-wallpaper-v2", "mod.js"), "utf8");

function loadMod(image) {
  const errors = [];
  const requests = [];
  const listeners = {};
  const elements = {};
  const appended = [];
  const saves = [];
  function element(tagName) {
    return {
      children: [],
      disabled: false,
      id: "",
      isConnected: false,
      listeners: {},
      style: {},
      tagName,
      textContent: "",
      addEventListener(type, listener) {
        this.listeners[type] = listener;
      },
      appendChild(child) {
        this.children.push(child);
      },
      remove() {
        delete elements[this.id];
      }
    };
  }
  const background = {
    dataset: {},
    style: {},
    addEventListener(type, listener) {
      listeners[type] = listener;
    }
  };
  const window = {
    __POWERED_BY_WUJIE__: false,
    addEventListener() {},
    innerHeight: 800,
    innerWidth: 1200,
    localStorage: { getItem: () => "en_us" },
    ZimaMOD: {
      async saveBingWallpaper(imageUrl) {
        saves.push(imageUrl);
        return { saved: true, exists: false };
      }
    }
  };
  window.top = window;

  const context = {
    URL,
    console: {
      error: (...args) => errors.push(args.map(value => value instanceof Error ? value.stack : String(value)))
    },
    document: {
      addEventListener() {},
      body: {
        appendChild(child) {
          appended.push(child);
          child.isConnected = true;
          if (child.id) elements[child.id] = child;
        }
      },
      createElement: element,
      documentElement: {},
      getElementById: id => elements[id] || null,
      head: {
        appendChild(element) {
          element.isConnected = true;
          elements[element.id] = element;
        }
      },
      querySelector: selector => selector === "#wallpaper" ? background : null,
      querySelectorAll: () => []
    },
    fetch: async url => {
      requests.push(String(url));
      return {
        ok: true,
        status: 200,
        json: async () => image
      };
    },
    MutationObserver: class {
      observe() {}
    },
    window
  };

  vm.runInNewContext(source, context);
  return { appended, background, elements, errors, listeners, requests, saves };
}

async function waitFor(predicate) {
  for (let attempt = 0; attempt < 10; attempt++) {
    if (predicate()) return;
    await new Promise(resolve => setImmediate(resolve));
  }
}

test("applies a trusted Bing wallpaper and registers its information menu", async () => {
  const loaded = loadMod({
    url: "/th?id=test-wallpaper",
    copyright: "Test image",
    copyrightlink: "https://www.bing.com/search?q=test"
  });
  await waitFor(() => loaded.background.dataset.zimamodBingWallpaper === "true");

  assert.match(
    loaded.background.style.backgroundImage,
    /^url\("https:\/\/www\.bing\.com\/th\?id=test-wallpaper"\)$/,
    JSON.stringify(loaded.errors)
  );
  assert.equal(loaded.background.dataset.zimamodBingWallpaper, "true");
  assert.equal(typeof loaded.listeners.contextmenu, "function");
  assert.equal(loaded.requests.length, 1);
  assert.match(loaded.requests[0], /^https:\/\/bing\.biturl\.top\/\?/);
  assert.match(loaded.requests[0], /mkt=en-US/);
  assert.match(loaded.elements["zimamod-bing-wallpaper-v2-style"].textContent, /#wallpaper/);
  assert.match(loaded.elements["zimamod-bing-wallpaper-v2-style"].textContent, /!important/);
});

test("rejects wallpaper URLs outside Bing domains", async () => {
  const loaded = loadMod({
    url: "https://example.com/untrusted.jpg",
    copyright: "Untrusted image",
    copyrightlink: "https://example.com/"
  });
  await waitFor(() => loaded.background.style.backgroundImage !== undefined);

  assert.equal(loaded.background.style.backgroundImage, undefined);
  assert.equal(loaded.background.dataset.zimamodBingWallpaper, undefined);
});

test("offers Save in the information bubble and saves the current image", async () => {
  const loaded = loadMod({
    url: "/th?id=OHR.Test.jpg",
    copyright: "Test image",
    copyrightlink: "https://www.bing.com/search?q=test"
  });
  await waitFor(() => loaded.background.dataset.zimamodBingWallpaper === "true");

  loaded.listeners.contextmenu({
    clientX: 10,
    clientY: 20,
    preventDefault() {},
    target: { closest: () => null }
  });
  const card = loaded.elements["zimamod-bing-wallpaper-v2-info"];
  const actions = card.children[1];
  const save = actions.children[0];
  const status = actions.children[1];
  assert.equal(save.textContent, "Save");

  await save.listeners.click({ preventDefault() {}, stopPropagation() {} });
  assert.deepEqual(loaded.saves, ["https://www.bing.com/th?id=OHR.Test.jpg"]);
  assert.equal(save.textContent, "Saved");
  assert.equal(status.textContent, "Saved to Gallery");
});
