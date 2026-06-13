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
