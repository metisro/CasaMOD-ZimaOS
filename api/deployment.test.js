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
  const sandedTheme = read("mods/weather-widget/themes/sanded-glass.css");

  assert.match(mod, /label: "CasaOS"/);
  assert.match(mod, /label: "Aero"/);
  assert.match(mod, /label: "Liquid Glass"/);
  assert.match(mod, /label: "Sanded Glass"/);
  assert.match(mod, /themes\/sanded-glass\.css/);
  assert.doesNotMatch(mod, /Pure Liquid Glass|pure-liquid-glass/);
  assert.match(mod, /-theme-row/);
  assert.match(mod, /-theme-switch/);
  assert.match(mod, /grid-template-columns:\s*repeat\(auto-fit, minmax\(92px, 1fr\)\)/);
  assert.doesNotMatch(mod, /backdrop-filter:\s*blur/);
  assert.doesNotMatch(liquidTheme, /backdrop-filter:\s*blur/);
  assert.match(mod, /feDisplacementMap/);
  assert.match(mod, /feTurbulence/);
  assert.match(liquidTheme, /filter:\s*url\("#zimamod-weather-liquid-distortion"\)/);
  assert.match(sandedTheme, /zimamod-weather-theme-sanded/);
  assert.match(sandedTheme, /filter:\s*url\("#zimamod-weather-liquid-distortion"\)/);
  assert.doesNotMatch(sandedTheme, /theme-brushed|brushed-distortion/);
  assert.match(mod, /mutationTouchesWeather/);
  assert.match(mod, /beginStartupMount/);
  assert.match(mod, /startupObserver\?\.disconnect/);
  assert.doesNotMatch(mod, /setInterval\(enforceSingleWidget/);
  assert.equal(manifest.version, "1.3.9");
});

test("Dashboard Themes ships as an independent theme manager", () => {
  const mod = read("mods/dashboard-themes/mod.js");
  const css = read("mods/dashboard-themes/mod.css");
  const sanded = read("mods/dashboard-themes/themes/sanded-glass.css");
  const liquid = read("mods/dashboard-themes/themes/liquid-glass.css");
  const aero = read("mods/dashboard-themes/themes/aero.css");
  const casaos = read("mods/dashboard-themes/themes/casaos.css");
  const chaos = read("mods/dashboard-themes/themes/chaos.css");
  const manifest = JSON.parse(read("mods/dashboard-themes/zimamod.json"));
  const store = read("runtime/store.js");

  assert.equal(manifest.name, "Dashboard Themes");
  assert.equal(manifest.category, "Visual Effects");
  assert.deepEqual(manifest.scripts, ["mod.js"]);
  assert.deepEqual(manifest.styles, ["mod.css"]);
  assert.match(mod, /const ASSET_MOD_ID = "dashboard-themes"/);
  assert.match(mod, /window\.ZimaMOD\.assetUrl\(ASSET_MOD_ID, relativePath\)/);
  assert.doesNotMatch(mod, /window\.ZimaMOD\.assetUrl\(MOD_ID, relativePath\)/);
  assert.match(mod, /const FILTER_ID = MOD_ID \+ "-distortion"/);
  assert.match(mod, /"sanded-glass"/);
  assert.match(mod, /"liquid-glass"/);
  assert.match(mod, /aero:/);
  assert.match(mod, /casaos:/);
  assert.match(mod, /chaos:/);
  assert.match(mod, /themes\/sanded-glass\.css/);
  assert.match(mod, /themes\/liquid-glass\.css/);
  assert.match(mod, /themes\/aero\.css/);
  assert.match(mod, /themes\/casaos\.css/);
  assert.match(mod, /themes\/chaos\.css/);
  assert.match(mod, /loadThemeCss/);
  assert.match(mod, /loadShadowThemeCss/);
  assert.match(mod, /window\.ZimaMODDashboardThemes/);
  assert.match(mod, /openSettings/);
  assert.match(mod, /window\.ZimaMOD\.setConfig\(CONFIG_ID/);
  assert.match(mod, /setupShadowRoot/);
  assert.match(mod, /overflow:\s*visible !important/);
  assert.match(mod, /\.\$\{APP_CLASS\}\s*\{\s*position:\s*relative !important;\s*overflow:\s*visible !important;/);
  assert.doesNotMatch(mod, /translateZ\(0\)/);
  assert.match(mod, /const APP_BLUR_CLASS = MOD_ID \+ "-app-blur"/);
  assert.match(mod, /element\.classList\.add\(APP_BLUR_CLASS\)/);
  assert.doesNotMatch(mod, /element\.remove\(\)/);
  assert.match(mod, /\[role="menu"\]/);
  assert.doesNotMatch(mod, /\[role="listbox"\]\s*\{\s*position:\s*relative/);
  assert.match(mod, /\[role="listbox"\]\s*\{\s*z-index:\s*50;/);
  assert.match(mod, /\.blur-background/);
  assert.match(mod, /\.bg-blur/);
  assert.match(mod, /BG_HEX_RE/);
  assert.match(mod, /backdrop-blur-sm/);
  assert.match(mod, /backdrop-saturate-180/);
  assert.match(mod, /closest\("\.zimamod-weather"\)/);
  assert.doesNotMatch(css, /data-zimamod-dashboard-theme=/);
  assert.match(css, /#zimamod-dashboard-themes-modal/);
  assert.match(sanded, /data-zimamod-dashboard-theme="sanded-glass"/);
  assert.match(liquid, /data-zimamod-dashboard-theme="liquid-glass"/);
  assert.match(liquid, /zimamod-dashboard-themes-app-blur/);
  assert.match(liquid, /filter:\s*url\("#zimamod-dashboard-themes-distortion"\)/);
  assert.match(liquid, /--dtm-app-filter:\s*none/);
  assert.match(liquid, /\.zimamod-dashboard-themes-header\s*\{\s*background:\s*transparent !important;/);
  assert.match(aero, /data-zimamod-dashboard-theme="aero"/);
  assert.match(casaos, /data-zimamod-dashboard-theme="casaos"/);
  assert.match(casaos, /var\(--background-2/);
  assert.match(chaos, /data-zimamod-dashboard-theme="chaos"/);
  assert.match(store, /DTM Settings/);
  assert.match(store, /const bind = \(selector, eventName, handler\)/);
  assert.match(store, /ZimaMODDashboardThemes\?\.openSettings/);
});
