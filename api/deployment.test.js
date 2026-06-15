"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

test("ZimaOS import metadata uses literal default ports", () => {
  for (const composeFile of ["docker-compose.yml", "docker-compose.build.yml"]) {
    const compose = read(composeFile);
    assert.doesNotMatch(compose, /\$\{ZIMAMOD_(?:DASHBOARD|API)_PORT/);
    assert.match(compose, /ZIMAMOD_DASHBOARD_PORT: "8088"/);
    assert.match(compose, /ZIMAMOD_API_PORT: "8090"/);
    assert.match(compose, /port_map: "8088"/);
  }
});

test("API startup refreshes the catalog without installing bundled mods", () => {
  const entrypoint = read("api/entrypoint.sh");
  assert.match(entrypoint, /\/data\/store\/\$mod_id/);
  assert.doesNotMatch(entrypoint, /\/data\/mod\/\$mod_id/);
  assert.doesNotMatch(entrypoint, /bundled-mods-seeded|Initially installed bundled mod/);
});

test("Weather Widget includes its supported themes", () => {
  const mod = read("mods/weather-widget/mod.js");
  const manifest = JSON.parse(read("mods/weather-widget/zimamod.json"));
  const liquidTheme = read("mods/weather-widget/themes/liquid-glass.css");

  assert.match(mod, /label: "CasaOS"/);
  assert.match(mod, /label: "Aero"/);
  assert.match(mod, /label: "Liquid Glass"/);
  assert.doesNotMatch(mod, /Pure Liquid Glass|pure-liquid-glass/);
  assert.doesNotMatch(mod, /backdrop-filter:\s*blur/);
  assert.doesNotMatch(liquidTheme, /backdrop-filter:\s*blur/);
  assert.match(mod, /feDisplacementMap/);
  assert.match(mod, /feTurbulence/);
  assert.match(liquidTheme, /filter:\s*url\("#zimamod-weather-liquid-distortion"\)/);
  assert.match(mod, /mutationTouchesWeather/);
  assert.match(mod, /beginStartupMount/);
  assert.match(mod, /startupObserver\?\.disconnect/);
  assert.doesNotMatch(mod, /setInterval\(enforceSingleWidget/);
  assert.equal(manifest.version, "1.3.9");
});
