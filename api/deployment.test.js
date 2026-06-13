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

test("Weather Widget includes the Pure Liquid Glass theme", () => {
  const mod = read("mods/weather-widget/mod.js");
  const theme = read("mods/weather-widget/themes/pure-liquid-glass.css");
  const manifest = JSON.parse(read("mods/weather-widget/zimamod.json"));

  assert.match(mod, /label: "Pure Liquid Glass"/);
  assert.match(mod, /themes\/pure-liquid-glass\.css/);
  assert.match(mod, /ensurePureLiquidGlassFilter/);
  assert.match(theme, /filter: url\("#zimamod-weather-pure-liquid-filter"\)/);
  assert.match(theme, /backdrop-filter:/);
  assert.equal(manifest.version, "1.3.0");
});
