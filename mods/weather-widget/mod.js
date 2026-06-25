// ZimaMOD: Weather Widget v1.3.9-zimaos
// Based on CasaOS-UI PR #257's Weather.vue idea, adapted as an injected ZimaMOD.

(function ZimaMODWeatherWidget() {
  "use strict";

  const rootNode = document.currentScript?.getRootNode?.();
  if (
    window !== window.top ||
    rootNode instanceof ShadowRoot ||
    document.currentScript?.closest?.("wujie-app") ||
    window.__POWERED_BY_WUJIE__
  ) {
    return;
  }

  const MOD_ID = "zimamod-weather";
  const WIDGET_ID = "weather";
  const WRAPPER_ID = MOD_ID + "-widget";
  const CASAOS_ANCHOR = ".ps-container";
  const ZIMAOS_MOUNT_ID = MOD_ID + "-zimaos-mount";
  const LIQUID_FILTER_SVG_ID = MOD_ID + "-liquid-filter-svg";
  const LIQUID_FILTER_ID = MOD_ID + "-liquid-distortion";
  const CONFIG_PATH = "/var/lib/casaos/1/weather-widget.json";
  const LOCAL_CONFIG_KEY = MOD_ID + "-config";
  const IS_ZIMAOS =
    Boolean(window.ZimaMOD) ||
    window.__ZIMAMOD_PLATFORM__ === "zimaos" ||
    /^ZimaOS$/i.test(document.title) ||
    Boolean(document.querySelector('link[href*="zimaos-logo"]'));
  const SCRIPT_URL = document.currentScript?.src || "";
  const MOD_BASE_URL = window.__ZIMAMOD_BASE_URL__ || SCRIPT_URL.replace(/mod\.js(?:\?.*)?$/, "");
  const THEMES = {
    casa: {
      label: "CasaOS",
      file: "themes/casa.css",
      className: MOD_ID + "-theme-casa"
    },
    win7: {
      label: "Aero",
      file: "themes/aero.css",
      className: MOD_ID + "-theme-win7"
    },
    liquid: {
      label: "Liquid Glass",
      file: "themes/liquid-glass.css",
      className: MOD_ID + "-theme-liquid"
    },
    sanded: {
      label: "Sanded Glass",
      file: "themes/sanded-glass.css",
      className: MOD_ID + "-theme-sanded"
    }
  };

  const DEFAULT_CONFIG = {
    city: "Prague",
    latitude: 50.0755,
    longitude: 14.4378,
    refreshInterval: 30,
    clockFormat: "24h",
    tempUnit: "C",
    theme: "casa"
  };

  let refreshTimer = null;
  let clockTimer = null;
  let currentClockFormat = DEFAULT_CONFIG.clockFormat;
  let lastForecast = [];
  let lastDailyForecast = [];
  let activeView = "current";
  let lastWeatherVisual = null;
  let startupObserver = null;
  let startupMountPromise = null;
  let startupDeadline = 0;
  let chartState = {
    points: [],
    hitPoints: [],
    hoverIndex: null
  };

  function existingWidgets() {
    return Array.from(document.querySelectorAll(
      `#${WRAPPER_ID}, [widget-id="${WIDGET_ID}"], .${MOD_ID}[widget-id]`
    )).filter((widget, index, widgets) => widgets.indexOf(widget) === index);
  }

  function removeDuplicateWidgets(preferred) {
    for (const widget of existingWidgets()) {
      if (widget !== preferred) widget.remove();
    }

    for (const mount of document.querySelectorAll("#" + ZIMAOS_MOUNT_ID)) {
      if (!mount.contains(preferred) && !mount.querySelector("." + MOD_ID)) mount.remove();
    }
  }

  function preferredExistingWidget() {
    const widgets = existingWidgets();
    return widgets.sort((left, right) => {
      const leftConnected = left.isConnected ? 0 : 1;
      const rightConnected = right.isConnected ? 0 : 1;
      if (leftConnected !== rightConnected) return leftConnected - rightConnected;

      const leftOverlay = isOverlayContainer(left) ? 1 : 0;
      const rightOverlay = isOverlayContainer(right) ? 1 : 0;
      if (leftOverlay !== rightOverlay) return leftOverlay - rightOverlay;

      const leftFixed = left.closest("#" + ZIMAOS_MOUNT_ID)?.classList.contains(MOD_ID + "-zimaos-embedded")
        ? 0
        : getComputedStyle(left.closest("#" + ZIMAOS_MOUNT_ID) || left).position === "fixed" ? 1 : 0;
      const rightFixed = right.closest("#" + ZIMAOS_MOUNT_ID)?.classList.contains(MOD_ID + "-zimaos-embedded")
        ? 0
        : getComputedStyle(right.closest("#" + ZIMAOS_MOUNT_ID) || right).position === "fixed" ? 1 : 0;
      if (leftFixed !== rightFixed) return leftFixed - rightFixed;
      return left.getBoundingClientRect().left - right.getBoundingClientRect().left;
    })[0];
  }

  function enforceSingleWidget() {
    const preferred = preferredExistingWidget();
    if (preferred) removeDuplicateWidgets(preferred);
  }

  const existingWidget = preferredExistingWidget();
  if (document.documentElement.dataset.zimamodWeatherLoaded === "true" && existingWidget) {
    removeDuplicateWidgets(existingWidget);
    return;
  }
  document.documentElement.dataset.zimamodWeatherLoaded = "true";
  window.__zimamodWeatherLoaded = true;

  function assetUrl(path) {
    if (window.ZimaMOD) {
      return window.ZimaMOD.assetUrl("weather-widget", path);
    }

    const scriptUrl = MOD_BASE_URL || SCRIPT_URL || document.currentScript?.src;
    if (!scriptUrl) return path;

    try {
      return new URL(path, new URL(scriptUrl, window.location.origin)).href;
    } catch (_) {
      return path;
    }
  }

  function token() {
    try {
      return document.querySelector("#app").__vue__.$store.state.access_token || "";
    } catch (_) {
      return localStorage.getItem("access_token") || "";
    }
  }

  function authHeaders() {
    return {
      "Content-Type": "application/json",
      "Accept": "application/json, text/plain, */*",
      "Authorization": token(),
      "Language": "en_us"
    };
  }

  async function createConfigFile() {
    return fetch("/v1/file", {
      method: "POST",
      headers: authHeaders(),
      credentials: "include",
      body: JSON.stringify({ path: CONFIG_PATH })
    });
  }

  async function readConfigFile() {
    const url = "/v1/file?path=" + encodeURIComponent(CONFIG_PATH) + "&timestamp=" + Date.now();
    const response = await fetch(url, {
      method: "GET",
      headers: authHeaders(),
      credentials: "include"
    });
    const text = await response.text();

    if (!response.ok) {
      throw new Error("Read config failed: " + response.status + " - " + text);
    }

    return text;
  }

  async function writeConfigFile(config) {
    const response = await fetch("/v1/file", {
      method: "PUT",
      headers: authHeaders(),
      credentials: "include",
      body: JSON.stringify({
        path: CONFIG_PATH,
        content: JSON.stringify(config, null, 2)
      })
    });

    if (!response.ok) {
      throw new Error("Write config failed: " + response.status);
    }

    return true;
  }

  function normalizeConfig(config) {
    return {
      ...DEFAULT_CONFIG,
      ...(config || {}),
      latitude: Number(config?.latitude ?? DEFAULT_CONFIG.latitude),
      longitude: Number(config?.longitude ?? DEFAULT_CONFIG.longitude),
      refreshInterval: Number(config?.refreshInterval || DEFAULT_CONFIG.refreshInterval),
      clockFormat: config?.clockFormat === "12h" ? "12h" : "24h",
      tempUnit: config?.tempUnit === "F" ? "F" : "C",
      theme: THEMES[config?.theme] ? config.theme : "casa"
    };
  }

  async function getConfig() {
    if (window.ZimaMOD) {
      return normalizeConfig(await window.ZimaMOD.getConfig("weather-widget", DEFAULT_CONFIG));
    }

    if (IS_ZIMAOS) {
      try {
        return normalizeConfig(JSON.parse(localStorage.getItem(LOCAL_CONFIG_KEY) || "null"));
      } catch (_) {
        return normalizeConfig(DEFAULT_CONFIG);
      }
    }

    try {
      const raw = await readConfigFile();

      if (!raw || !raw.trim()) {
        await writeConfigFile(DEFAULT_CONFIG);
        return DEFAULT_CONFIG;
      }

      return normalizeConfig(JSON.parse(raw));
    } catch (error) {
      try {
        const localConfig = localStorage.getItem(LOCAL_CONFIG_KEY);
        if (localConfig) return normalizeConfig(JSON.parse(localConfig));
      } catch (_) {
        // Ignore invalid or unavailable browser storage.
      }

      console.warn("[ZimaMOD Weather] Using browser-local settings:", error);
      return normalizeConfig(DEFAULT_CONFIG);
    }
  }

  async function saveConfig(config) {
    const normalized = normalizeConfig(config);

    if (window.ZimaMOD) {
      await window.ZimaMOD.setConfig("weather-widget", normalized);
      return;
    }

    if (IS_ZIMAOS) {
      localStorage.setItem(LOCAL_CONFIG_KEY, JSON.stringify(normalized));
      return;
    }

    try {
      await writeConfigFile(normalized);
    } catch (error) {
      localStorage.setItem(LOCAL_CONFIG_KEY, JSON.stringify(normalized));
      console.warn("[ZimaMOD Weather] Saved settings in browser storage:", error);
    }
  }

  function findZimaosWidgetContainer() {
    return Array.from(document.querySelectorAll("div, aside, section"))
      .map(element => ({ element, rect: element.getBoundingClientRect() }))
      .filter(({ element, rect }) => {
        return (
          rect.width >= 260 &&
          rect.width <= 520 &&
          rect.height >= 450 &&
          rect.left < window.innerWidth * .35 &&
          hasDashboardWidgets(element)
        );
      })
      .sort((left, right) => left.rect.width - right.rect.width)[0]?.element || null;
  }

  function hasWidgetTitle(element, title) {
    return Array.from(element?.querySelectorAll?.("*") || []).some(child => (
      child.children.length === 0 &&
      (child.textContent || "").trim().toLowerCase() === title &&
      child.getBoundingClientRect().width > 0 &&
      child.getBoundingClientRect().height > 0 &&
      getComputedStyle(child).visibility !== "hidden" &&
      getComputedStyle(child).display !== "none"
    ));
  }

  function hasDashboardWidgets(element) {
    const nativeCount = ["system", "storage", "network"].filter(title => hasWidgetTitle(element, title)).length;
    return nativeCount >= 2 || hasWidgetTitle(element, "widget settings");
  }

  function closestOverlay(element) {
    return element?.closest?.(
      '[role="dialog"], [aria-modal="true"], [class*="modal" i], [class*="drawer" i], [class*="dialog" i], [class*="sheet" i], [class*="overlay" i]'
    ) || null;
  }

  function isOverlayContainer(element) {
    const overlay = closestOverlay(element);
    return Boolean(overlay && !hasDashboardWidgets(overlay));
  }

  function mountContainer() {
    const casaosContainer = document.querySelector(CASAOS_ANCHOR);
    if (casaosContainer) return casaosContainer;

    if (!document.querySelector("#app") || !document.body || location.hash.includes("login")) {
      for (const widget of existingWidgets()) widget.remove();
      document.getElementById(ZIMAOS_MOUNT_ID)?.remove();
      return null;
    }

    const existingMount = document.getElementById(ZIMAOS_MOUNT_ID);
    const widgetContainer = findZimaosWidgetContainer();
    if (IS_ZIMAOS && !widgetContainer) {
      if (existingMount) existingMount.hidden = true;
      return null;
    }

    let zimaosContainer = existingMount;
    if (!zimaosContainer) {
      zimaosContainer = document.createElement("div");
      zimaosContainer.id = ZIMAOS_MOUNT_ID;
      zimaosContainer.setAttribute("aria-label", "ZimaMOD widgets");
    }

    if (widgetContainer && widgetContainer !== zimaosContainer.parentElement) {
      zimaosContainer.classList.add(MOD_ID + "-zimaos-embedded");
      widgetContainer.appendChild(zimaosContainer);
    } else if (!IS_ZIMAOS && !zimaosContainer.parentElement) {
      document.body.appendChild(zimaosContainer);
    }

    zimaosContainer.hidden = false;
    return zimaosContainer;
  }

  async function getWeather(config) {
    const url =
      "https://api.open-meteo.com/v1/forecast" +
      "?latitude=" + encodeURIComponent(config.latitude) +
      "&longitude=" + encodeURIComponent(config.longitude) +
      "&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,weather_code,wind_speed_10m" +
      "&hourly=temperature_2m" +
      "&daily=weather_code,temperature_2m_max,temperature_2m_min" +
      "&forecast_days=10" +
      "&timezone=auto";

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error("Weather API failed: " + response.status);
    }

    return await response.json();
  }

  async function geocodeCity(city) {
    const url =
      "https://geocoding-api.open-meteo.com/v1/search" +
      "?count=1&language=en&format=json&name=" +
      encodeURIComponent(city);

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error("City lookup failed: " + response.status);
    }

    const data = await response.json();
    const hit = data?.results?.[0];
    if (!hit) throw new Error("City not found");

    return {
      city: hit.name,
      latitude: hit.latitude,
      longitude: hit.longitude
    };
  }

  function weatherIcon(code, isDay) {
    if (code === 0) return isDay ? "sunny-outline" : "moon-outline";
    if (code === 1 || code === 2) return isDay ? "weather-outline" : "cloud-outline";
    if (code === 3) return "cloud-outline";
    if (code === 45 || code === 48) return "view-dashboard-outline";
    if ([51, 53, 55, 56, 57].includes(code)) return "weather-outline";
    if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return "cloud-outline";
    if ([71, 73, 75, 77, 85, 86].includes(code)) return "protection-outline";
    if ([95, 96, 99].includes(code)) return "alert-outline";
    return "weather-outline";
  }

  function weatherScene(code, isDay, windSpeed) {
    if (Number(windSpeed) >= 40) {
      return { scene: "wind", icon: "wind.svg" };
    }

    if (code === 0) {
      return isDay
        ? { scene: "sun", icon: "clear-day.svg" }
        : { scene: "moon", icon: "clear-night.svg" };
    }

    if (code === 1 || code === 2) {
      return isDay
        ? { scene: "partly-cloudy", icon: "partly-cloudy-day.svg" }
        : { scene: "moon-cloudy", icon: "partly-cloudy-night.svg" };
    }

    if (code === 3) {
      return { scene: "cloudy", icon: "overcast.svg" };
    }

    if (code === 45 || code === 48) {
      return { scene: "fog", icon: "fog.svg" };
    }

    if ([51, 53, 55, 56, 57, 80, 81].includes(code)) {
      return { scene: "showers", icon: "drizzle.svg" };
    }

    if ([61, 63, 65, 66, 67, 82].includes(code)) {
      return { scene: "rain", icon: "rain.svg" };
    }

    if ([71, 73, 75, 77, 85, 86].includes(code)) {
      return { scene: "snow", icon: "snow.svg" };
    }

    if (code === 96 || code === 99) {
      return { scene: "hail", icon: "hail.svg" };
    }

    if (code === 95) {
      return {
        scene: "thunderstorm",
        icon: isDay ? "thunderstorms-day.svg" : "thunderstorms-night.svg"
      };
    }

    return isDay
      ? { scene: "partly-cloudy", icon: "partly-cloudy-day.svg" }
      : { scene: "moon-cloudy", icon: "partly-cloudy-night.svg" };
  }

  function weatherLabel(code) {
    const labels = {
      0: "Clear sky",
      1: "Mainly clear",
      2: "Partly cloudy",
      3: "Cloudy",
      45: "Fog",
      48: "Depositing rime fog",
      51: "Light drizzle",
      53: "Drizzle",
      55: "Heavy drizzle",
      56: "Freezing drizzle",
      57: "Freezing drizzle",
      61: "Light rain",
      63: "Rain",
      65: "Heavy rain",
      66: "Freezing rain",
      67: "Freezing rain",
      71: "Light snow",
      73: "Snow",
      75: "Heavy snow",
      77: "Snow grains",
      80: "Rain showers",
      81: "Rain showers",
      82: "Heavy showers",
      85: "Snow showers",
      86: "Heavy snow showers",
      95: "Thunderstorm",
      96: "Thunderstorm with hail",
      99: "Thunderstorm with hail"
    };

    return labels[code] || "Weather";
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  }

  function setIcon(id, icon, keepClass) {
    const el = document.getElementById(id);
    if (!el) return;
    el.className = (keepClass ? keepClass + " " : "") + "casa casa-" + icon;
  }

  function clearError() {
    const el = document.getElementById(MOD_ID + "-error");
    if (!el) return;
    el.style.display = "none";
    el.textContent = "";
  }

  function showError(message) {
    const el = document.getElementById(MOD_ID + "-error");
    if (!el) return;
    el.style.display = "block";
    el.textContent = message;
  }

  function injectStyles() {
    if (document.getElementById(MOD_ID + "-css")) return;

    const style = document.createElement("style");
    style.id = MOD_ID + "-css";
    style.textContent = `
      [widget-id="${WIDGET_ID}"] {
        margin-bottom: 12px;
      }

      #${ZIMAOS_MOUNT_ID} {
        position: fixed;
        z-index: 9999;
        top: 76px;
        right: 20px;
        width: min(420px, calc(100vw - 32px));
      }

      #${ZIMAOS_MOUNT_ID}.${MOD_ID}-zimaos-embedded {
        position: relative;
        z-index: auto;
        inset: auto;
        width: 100%;
        min-width: 280px;
      }

      #${ZIMAOS_MOUNT_ID} [widget-id="${WIDGET_ID}"] {
        margin: 0;
      }

      .${MOD_ID}-icon-fallback {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font-size: 16px;
        line-height: 1;
      }

      .ps-container .${MOD_ID}-icon-fallback {
        display: none;
      }

      .${MOD_ID} {
        position: relative;
      }

      .${MOD_ID}-card {
        position: relative;
        overflow: hidden;
        min-height: 238px;
        padding: 16px;
        border-radius: 16px;
        color: var(--text-1, #e0e4f0);
        background: var(--background-2, rgba(30, 32, 48, .88));
        border: 1px solid var(--background-4, rgba(255, 255, 255, .08));
        box-shadow: 0 8px 26px rgba(0, 0, 0, .22);
        backdrop-filter: none;
        -webkit-backdrop-filter: none;
      }

      .${MOD_ID}-bg-icon {
        position: absolute;
        right: -20px;
        bottom: -26px;
        font-size: 118px;
        opacity: .08;
        pointer-events: none;
      }

      .${MOD_ID}-header,
      .${MOD_ID}-body,
      .${MOD_ID}-stats,
      .${MOD_ID}-chart-wrap {
        position: relative;
        z-index: 1;
      }

      .${MOD_ID}-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
      }

      .${MOD_ID}-title {
        display: flex;
        align-items: center;
        gap: 8px;
        min-width: 0;
      }

      .${MOD_ID}-main-icon {
        width: 28px;
        min-width: 28px;
        height: 28px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font-size: 24px;
        color: var(--primary, #49b3ff);
      }

      .${MOD_ID}-city {
        font-size: 14px;
        font-weight: 700;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .${MOD_ID}-status {
        margin-top: 2px;
        font-size: 11px;
        color: var(--text-3, #7880a0);
      }

      .${MOD_ID}-controls {
        display: flex;
        align-items: center;
        gap: 5px;
        flex-shrink: 0;
      }

      .${MOD_ID}-clock {
        min-width: 58px;
        height: 28px;
        border: 0;
        outline: 0;
        border-radius: 999px;
        padding: 0 10px;
        color: var(--text-1, #e0e4f0);
        background: rgba(255, 255, 255, .08);
        font-size: 12px;
        font-weight: 700;
        cursor: pointer;
      }

      .${MOD_ID}-clock:hover {
        background: rgba(255, 255, 255, .14);
      }

      .${MOD_ID}-icon-btn {
        width: 28px;
        height: 28px;
        border: 0;
        border-radius: 50%;
        cursor: pointer;
        background: rgba(255, 255, 255, .08);
        color: var(--text-2, #a0a8c0);
        transition: background .15s, color .15s, transform .15s;
      }

      .${MOD_ID}-icon-btn:hover {
        background: rgba(255, 255, 255, .14);
        color: var(--text-1, #e0e4f0);
        transform: translateY(-1px);
      }

      .${MOD_ID}-body {
        margin-top: 14px;
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 14px;
      }

      .${MOD_ID}-temp {
        font-size: 42px;
        font-weight: 800;
        line-height: 1;
      }

      .${MOD_ID}-unit {
        font-size: 18px;
        opacity: .85;
      }

      .${MOD_ID}-meta {
        text-align: right;
        font-size: 12px;
        line-height: 1.55;
        color: var(--text-2, #a0a8c0);
        white-space: nowrap;
      }

      .${MOD_ID}-chart-wrap {
        position: relative;
        height: 88px;
        margin: 13px -4px 12px;
      }

      .${MOD_ID}-chart {
        display: block;
        width: 100%;
        height: 88px;
        cursor: crosshair;
      }

      .${MOD_ID}-chart-tip {
        position: absolute;
        z-index: 2;
        left: 0;
        top: 0;
        display: none;
        min-width: 68px;
        padding: 6px 8px;
        border-radius: 8px;
        background: rgba(10, 13, 22, .92);
        color: #fff;
        font-size: 11px;
        line-height: 1.3;
        text-align: center;
        pointer-events: none;
        box-shadow: 0 8px 20px rgba(0, 0, 0, .28);
        transform: translate(-50%, -100%);
      }

      .${MOD_ID}-chart-tip strong {
        display: block;
        font-size: 13px;
      }

      .${MOD_ID}-stats {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 8px;
      }

      .${MOD_ID}-stat {
        min-width: 0;
        padding: 8px;
        border-radius: 10px;
        background: rgba(255, 255, 255, .06);
      }

      .${MOD_ID}-stat-label {
        display: block;
        font-size: 10px;
        color: var(--text-3, #7880a0);
        text-transform: uppercase;
      }

      .${MOD_ID}-stat-value {
        display: block;
        margin-top: 3px;
        font-size: 13px;
        font-weight: 700;
        color: var(--text-1, #e0e4f0);
      }

      .${MOD_ID}-error {
        position: relative;
        z-index: 1;
        margin-top: 10px;
        color: #ff6b6b;
        font-size: 12px;
      }

      .${MOD_ID}-overlay {
        position: fixed;
        inset: 0;
        z-index: 100000;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(10, 10, 10, .68);
      }

      .${MOD_ID}-modal {
        width: 420px;
        max-width: calc(100vw - 32px);
        border-radius: 14px;
        padding: 24px;
        background: var(--background-2, #1e2030);
        border: 1px solid var(--background-4, #2e3148);
        color: var(--text-1, #e0e4f0);
        box-shadow: 0 24px 64px rgba(0, 0, 0, .5);
      }

      .${MOD_ID}-modal h3 {
        margin: 0 0 18px;
        font-size: 16px;
      }

      .${MOD_ID}-field {
        margin-bottom: 14px;
      }

      .${MOD_ID}-field label {
        display: block;
        margin-bottom: 6px;
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: .06em;
        color: var(--text-3, #7880a0);
      }

      .${MOD_ID}-field input {
        width: 100%;
        box-sizing: border-box;
        padding: 9px 11px;
        border-radius: 8px;
        border: 1px solid var(--background-4, #2e3148);
        background: var(--background-3, #252840);
        color: var(--text-1, #e0e4f0);
        outline: none;
      }

      .${MOD_ID}-field input:focus {
        border-color: var(--primary, #49b3ff);
      }

      .${MOD_ID}-switch-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 14px;
        padding: 10px 0 2px;
      }

      .${MOD_ID}-switch-label {
        font-size: 13px;
        color: var(--text-2, #a0a8c0);
      }

      .${MOD_ID}-unit-switch {
        display: inline-flex;
        padding: 3px;
        border-radius: 999px;
        background: var(--background-3, #252840);
        border: 1px solid var(--background-4, #2e3148);
      }

      .${MOD_ID}-unit-switch label {
        display: block;
        margin: 0;
      }

      .${MOD_ID}-unit-switch input {
        position: absolute;
        width: 1px;
        height: 1px;
        margin: 0;
        padding: 0;
        opacity: 0;
        pointer-events: none;
      }

      .${MOD_ID}-unit-option {
        min-width: 44px;
        padding: 6px 10px;
        border-radius: 999px;
        color: var(--text-3, #7880a0);
        font-size: 12px;
        font-weight: 700;
        text-align: center;
        cursor: pointer;
      }

      .${MOD_ID}-unit-switch input:checked + .${MOD_ID}-unit-option {
        background: var(--primary, #49b3ff);
        color: #fff;
      }

      .${MOD_ID}-theme-row {
        align-items: stretch;
        flex-direction: column;
        gap: 8px;
      }

      .${MOD_ID}-theme-switch {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(92px, 1fr));
        width: 100%;
        box-sizing: border-box;
        border-radius: 16px;
      }

      .${MOD_ID}-theme-switch label {
        min-width: 0;
      }

      .${MOD_ID}-theme-switch .${MOD_ID}-unit-option {
        display: block;
        min-width: 0;
        padding: 7px 8px;
        overflow: hidden;
        font-size: 11px;
        line-height: 1.15;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .${MOD_ID}-footer {
        display: flex;
        justify-content: flex-end;
        gap: 10px;
        margin-top: 20px;
      }

      .${MOD_ID}-btn {
        padding: 8px 16px;
        border-radius: 8px;
        border: 0;
        cursor: pointer;
        font-size: 13px;
      }

      .${MOD_ID}-btn-cancel {
        background: var(--background-3, #252840);
        color: var(--text-2, #a0a8c0);
      }

      .${MOD_ID}-btn-save {
        background: var(--primary, #49b3ff);
        color: #fff;
      }

    `;

    document.head.appendChild(style);
    injectLiquidGlassFilter();
    loadCss("base", "themes/base.css", true);
  }

  function injectLiquidGlassFilter() {
    if (document.getElementById(LIQUID_FILTER_SVG_ID)) return;

    const namespace = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(namespace, "svg");
    const defs = document.createElementNS(namespace, "defs");
    const filter = document.createElementNS(namespace, "filter");
    const turbulence = document.createElementNS(namespace, "feTurbulence");
    const displacement = document.createElementNS(namespace, "feDisplacementMap");

    svg.id = LIQUID_FILTER_SVG_ID;
    svg.setAttribute("aria-hidden", "true");
    Object.assign(svg.style, {
      height: "0",
      overflow: "hidden",
      pointerEvents: "none",
      position: "absolute",
      width: "0"
    });

    filter.id = LIQUID_FILTER_ID;
    filter.setAttribute("x", "-12%");
    filter.setAttribute("y", "-12%");
    filter.setAttribute("width", "124%");
    filter.setAttribute("height", "124%");
    filter.setAttribute("color-interpolation-filters", "sRGB");

    turbulence.setAttribute("type", "fractalNoise");
    turbulence.setAttribute("baseFrequency", "0.012 0.028");
    turbulence.setAttribute("numOctaves", "2");
    turbulence.setAttribute("seed", "17");
    turbulence.setAttribute("result", "liquid-noise");

    displacement.setAttribute("in", "SourceGraphic");
    displacement.setAttribute("in2", "liquid-noise");
    displacement.setAttribute("scale", "7");
    displacement.setAttribute("xChannelSelector", "R");
    displacement.setAttribute("yChannelSelector", "B");

    filter.appendChild(turbulence);
    filter.appendChild(displacement);
    defs.appendChild(filter);
    svg.appendChild(defs);
    document.body.appendChild(svg);
  }

  function loadCss(id, href, persistent) {
    const linkId = MOD_ID + "-css-" + id;
    const existing = document.getElementById(linkId);
    const resolvedHref = assetUrl(href);

    if (existing) {
      if (existing.getAttribute("href") !== resolvedHref) {
        existing.setAttribute("href", resolvedHref);
      }
      return existing;
    }

    const link = document.createElement("link");
    link.id = linkId;
    link.rel = "stylesheet";
    link.href = resolvedHref;
    link.dataset.zimamodWeatherCss = persistent ? "base" : "theme";
    document.head.appendChild(link);
    return link;
  }

  function loadThemeCss(theme) {
    const selectedTheme = THEMES[theme] || THEMES.casa;
    const link = loadCss("theme", selectedTheme.file, false);
    const refreshVisuals = () => {
      applyWeatherVisuals(lastWeatherVisual);
      if (lastForecast.length) drawChart(lastForecast);
    };

    if (link.sheet) {
      setTimeout(refreshVisuals, 0);
    } else {
      link.addEventListener("load", refreshVisuals, { once: true });
    }

    return link;
  }

  async function renderShell(config) {
    const container = mountContainer();
    if (!container) return null;

    let wrapper = document.getElementById(WRAPPER_ID) ||
      document.querySelector(`[widget-id="${WIDGET_ID}"].${MOD_ID}`);
    if (wrapper && !wrapper.querySelector("#" + MOD_ID + "-forecast-btn")) {
      wrapper.remove();
      wrapper = null;
    }

    if (wrapper) {
      wrapper.id = WRAPPER_ID;
      removeDuplicateWidgets(wrapper);
      ensureSceneArt(wrapper);
      applyTheme(wrapper, config.theme);
      return wrapper;
    }

    wrapper = document.createElement("div");
    wrapper.id = WRAPPER_ID;
    wrapper.setAttribute("widget-id", WIDGET_ID);
    wrapper.className = `widget has-text-white is-relative ${MOD_ID}`;
    applyTheme(wrapper, config.theme);

    wrapper.innerHTML = `
      <div class="${MOD_ID}-card">
        <i class="${MOD_ID}-bg-icon casa casa-weather-outline" id="${MOD_ID}-bg-icon"></i>
        <img class="${MOD_ID}-scene-art" id="${MOD_ID}-scene-art" alt="" aria-hidden="true">

        <div class="${MOD_ID}-header">
          <div class="${MOD_ID}-title">
            <i class="${MOD_ID}-main-icon casa casa-weather-outline" id="${MOD_ID}-icon"></i>
            <div>
              <div class="${MOD_ID}-city" id="${MOD_ID}-city">Weather</div>
              <div class="${MOD_ID}-status" id="${MOD_ID}-label">Loading...</div>
            </div>
          </div>

          <div class="${MOD_ID}-controls">
            <button class="${MOD_ID}-clock" id="${MOD_ID}-clock" title="Toggle 12/24-hour time" aria-label="Toggle 12/24-hour time">--:--</button>
            <button class="${MOD_ID}-icon-btn" id="${MOD_ID}-settings" title="Settings" aria-label="Weather settings">
              <i class="casa casa-settings-outline"></i><span class="${MOD_ID}-icon-fallback">&#9881;</span>
            </button>
            <button class="${MOD_ID}-icon-btn" id="${MOD_ID}-refresh" title="Refresh" aria-label="Refresh weather">
              <i class="casa casa-sync-outline"></i><span class="${MOD_ID}-icon-fallback">&#8635;</span>
            </button>
          </div>
        </div>

        <div class="${MOD_ID}-current-view" id="${MOD_ID}-current-view">
          <div class="${MOD_ID}-body">
            <div class="${MOD_ID}-temp">
              <span id="${MOD_ID}-temp">--</span><span class="${MOD_ID}-unit">&deg;<span id="${MOD_ID}-unit-main">C</span></span>
            </div>

            <div class="${MOD_ID}-meta">
              Updated: <span id="${MOD_ID}-time">--</span><br>
              Next 8h: <span id="${MOD_ID}-range">--</span>
            </div>
          </div>

          <div class="${MOD_ID}-chart-wrap">
            <canvas class="${MOD_ID}-chart" id="${MOD_ID}-chart"></canvas>
            <div class="${MOD_ID}-chart-tip" id="${MOD_ID}-chart-tip"></div>
          </div>

          <div class="${MOD_ID}-stats">
            <div class="${MOD_ID}-stat">
              <span class="${MOD_ID}-stat-label">Feels</span>
              <span class="${MOD_ID}-stat-value"><span id="${MOD_ID}-feels">--</span>&deg;<span id="${MOD_ID}-unit-feels">C</span></span>
            </div>
            <div class="${MOD_ID}-stat">
              <span class="${MOD_ID}-stat-label">Humidity</span>
              <span class="${MOD_ID}-stat-value"><span id="${MOD_ID}-humidity">--</span>%</span>
            </div>
            <div class="${MOD_ID}-stat">
              <span class="${MOD_ID}-stat-label">Wind</span>
              <span class="${MOD_ID}-stat-value"><span id="${MOD_ID}-wind">--</span> km/h</span>
            </div>
            <button class="${MOD_ID}-stat ${MOD_ID}-forecast-btn" id="${MOD_ID}-forecast-btn" type="button">
              <span class="${MOD_ID}-stat-label">Forecast</span>
              <span class="${MOD_ID}-stat-value">10 days</span>
            </button>
          </div>
        </div>

        <div class="${MOD_ID}-forecast-view" id="${MOD_ID}-forecast-view" hidden>
          <div class="${MOD_ID}-forecast-grid" id="${MOD_ID}-forecast-grid"></div>
          <button class="${MOD_ID}-back-btn" id="${MOD_ID}-back-btn" type="button">
            <span class="${MOD_ID}-icon-fallback">&#8592;</span> Current weather
          </button>
        </div>

        <div id="${MOD_ID}-error" class="${MOD_ID}-error" style="display:none;"></div>
      </div>
    `;

    container.insertBefore(wrapper, container.firstChild);
    removeDuplicateWidgets(wrapper);

    wrapper.querySelector("#" + MOD_ID + "-refresh").addEventListener("click", updateWeather);
    wrapper.querySelector("#" + MOD_ID + "-settings").addEventListener("click", openSettings);
    wrapper.querySelector("#" + MOD_ID + "-clock").addEventListener("click", toggleClockFormat);
    wrapper.querySelector("#" + MOD_ID + "-forecast-btn").addEventListener("click", () => setActiveView("forecast"));
    wrapper.querySelector("#" + MOD_ID + "-back-btn").addEventListener("click", () => setActiveView("current"));
    bindChartHover(wrapper);

    return wrapper;
  }

  function ensureSceneArt(wrapper) {
    if (!wrapper || wrapper.querySelector("#" + MOD_ID + "-scene-art")) return;

    const image = document.createElement("img");
    image.className = MOD_ID + "-scene-art";
    image.id = MOD_ID + "-scene-art";
    image.alt = "";
    image.setAttribute("aria-hidden", "true");
    wrapper.querySelector("." + MOD_ID + "-card")?.prepend(image);
  }

  function applyTheme(wrapper, theme) {
    if (!wrapper) return;
    const selectedTheme = THEMES[theme] || THEMES.casa;
    Object.values(THEMES).forEach(item => wrapper.classList.remove(item.className));
    wrapper.classList.add(selectedTheme.className);
    loadThemeCss(theme);
  }

  function setWeatherScene(artwork) {
    const wrapper = document.querySelector(`[widget-id="${WIDGET_ID}"]`);
    if (!wrapper || !artwork) return;

    Array.from(wrapper.classList)
      .filter(name => name.startsWith(MOD_ID + "-scene-"))
      .forEach(name => wrapper.classList.remove(name));

    wrapper.classList.add(MOD_ID + "-scene-" + artwork.scene);

    const image = document.getElementById(MOD_ID + "-scene-art");
    if (image && artwork.icon) {
      image.src = assetUrl("icons/meteocons-fill/" + artwork.icon);
    }
  }

  function applyWeatherVisuals(visual) {
    if (!visual) return;
    setIcon(MOD_ID + "-icon", visual.icon, MOD_ID + "-main-icon");
    setIcon(MOD_ID + "-bg-icon", visual.icon, MOD_ID + "-bg-icon");
    setWeatherScene(visual.scene);
  }

  function formatTime(date, clockFormat) {
    return date.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      hour12: clockFormat === "12h"
    });
  }

  async function updateClock(config) {
    const clock = document.getElementById(MOD_ID + "-clock");
    if (!clock) return;

    const nextConfig = config || await getConfig();
    currentClockFormat = nextConfig.clockFormat;
    clock.textContent = formatTime(new Date(), nextConfig.clockFormat);
    clock.title = nextConfig.clockFormat === "12h" ? "Switch to 24-hour time" : "Switch to 12-hour time";

    if (clockTimer) clearInterval(clockTimer);
    clockTimer = setInterval(() => updateClock(), 30 * 1000);
  }

  async function toggleClockFormat() {
    const config = await getConfig();
    const next = {
      ...config,
      clockFormat: config.clockFormat === "12h" ? "24h" : "12h"
    };

    await saveConfig(next);
    updateClock(next);
    setText(MOD_ID + "-time", formatTime(new Date(), next.clockFormat));
    drawChart(lastForecast);
  }

  function unitSymbol(config) {
    return config.tempUnit === "F" ? "F" : "C";
  }

  function convertTemp(value, config) {
    const celsius = Number(value);
    if (!Number.isFinite(celsius)) return null;
    return config.tempUnit === "F" ? Math.round((celsius * 9) / 5 + 32) : Math.round(celsius);
  }

  function formatTemp(value, config) {
    const temp = convertTemp(value, config);
    return temp === null ? "--" : String(temp);
  }

  function buildForecast(data, config) {
    const times = data?.hourly?.time || [];
    const temps = data?.hourly?.temperature_2m || [];
    const now = Date.now();
    const points = [];

    for (let i = 0; i < times.length && points.length < 8; i += 1) {
      const date = new Date(times[i]);
      if (date.getTime() + 60 * 60 * 1000 < now) continue;
      points.push({
        date,
        temp: convertTemp(temps[i], config),
        unit: unitSymbol(config)
      });
    }

    return points;
  }

  function buildDailyForecast(data, config) {
    const daily = data?.daily || {};
    const dates = daily.time || [];
    const codes = daily.weather_code || [];
    const highs = daily.temperature_2m_max || [];
    const lows = daily.temperature_2m_min || [];

    return dates.slice(0, 10).map((date, index) => {
      const artwork = weatherScene(codes[index], true, 0);
      return {
        date: new Date(date + "T12:00:00"),
        code: codes[index],
        high: convertTemp(highs[index], config),
        low: convertTemp(lows[index], config),
        unit: unitSymbol(config),
        icon: artwork.icon
      };
    });
  }

  function renderDailyForecast(days) {
    const grid = document.getElementById(MOD_ID + "-forecast-grid");
    if (!grid) return;

    grid.innerHTML = days.map((day, index) => {
      const name = index === 0
        ? "Today"
        : day.date.toLocaleDateString([], { weekday: "short" });

      return `
        <div class="${MOD_ID}-day" title="${escapeHtml(weatherLabel(day.code))}">
          <span class="${MOD_ID}-day-name">${escapeHtml(name)}</span>
          <img class="${MOD_ID}-day-icon" src="${assetUrl("icons/meteocons-fill/" + day.icon)}" alt="">
          <span class="${MOD_ID}-day-temp">
            <strong>${day.high}&deg;</strong>
            <span class="${MOD_ID}-day-low">${day.low}&deg;</span>
          </span>
        </div>
      `;
    }).join("");
  }

  function setActiveView(view) {
    activeView = view === "forecast" ? "forecast" : "current";
    const wrapper = document.querySelector(`[widget-id="${WIDGET_ID}"]`);
    const currentView = document.getElementById(MOD_ID + "-current-view");
    const forecastView = document.getElementById(MOD_ID + "-forecast-view");

    wrapper?.classList.toggle(MOD_ID + "-forecast-active", activeView === "forecast");
    if (currentView) currentView.hidden = activeView !== "current";
    if (forecastView) forecastView.hidden = activeView !== "forecast";

    if (activeView === "forecast") {
      renderDailyForecast(lastDailyForecast);
      setText(MOD_ID + "-label", "10-day forecast");
    } else if (lastWeatherVisual?.label) {
      setText(MOD_ID + "-label", lastWeatherVisual.label);
      setTimeout(() => drawChart(lastForecast), 0);
    }
  }


  function showChartTip(point, x, y) {
    const tip = document.getElementById(MOD_ID + "-chart-tip");
    if (!tip || !point) return;

    tip.innerHTML = `<strong>${point.temp}&deg;${point.unit || "C"}</strong>`;
    tip.style.display = "block";
    tip.style.left = x + "px";
    tip.style.top = Math.max(10, y - 10) + "px";
  }

  function hideChartTip() {
    const tip = document.getElementById(MOD_ID + "-chart-tip");
    if (tip) tip.style.display = "none";
  }

  function bindChartHover(wrapper) {
    const canvas = wrapper.querySelector("#" + MOD_ID + "-chart");
    if (!canvas) return;

    canvas.addEventListener("mousemove", event => {
      if (!chartState.hitPoints.length) return;

      const rect = canvas.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      let nearest = null;
      let nearestDistance = Infinity;

      chartState.hitPoints.forEach(point => {
        const dx = point.x - x;
        const dy = point.y - y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance < nearestDistance) {
          nearest = point;
          nearestDistance = distance;
        }
      });

      if (!nearest || nearestDistance > 28) {
        chartState.hoverIndex = null;
        hideChartTip();
        drawChart(chartState.points);
        return;
      }

      if (chartState.hoverIndex !== nearest.index) {
        chartState.hoverIndex = nearest.index;
        drawChart(chartState.points);
      }

      showChartTip(nearest.point, nearest.x, nearest.y);
    });

    canvas.addEventListener("mouseleave", () => {
      chartState.hoverIndex = null;
      hideChartTip();
      drawChart(chartState.points);
    });
  }

  function drawChart(points, hoverIndex = chartState.hoverIndex) {
    const canvas = document.getElementById(MOD_ID + "-chart");
    if (!canvas || !points.length) return;
    const wrapper = document.querySelector(`[widget-id="${WIDGET_ID}"]`);
    const css = wrapper ? getComputedStyle(wrapper) : null;
    const chartLine = css?.getPropertyValue("--zimamod-weather-chart-line").trim() || "rgb(73,179,255)";
    const chartFill = css?.getPropertyValue("--zimamod-weather-chart-fill").trim() || "rgba(73,179,255,.32)";
    const chartGrid = css?.getPropertyValue("--zimamod-weather-chart-grid").trim() || "rgba(255,255,255,.10)";
    const chartText = css?.getPropertyValue("--zimamod-weather-chart-text").trim() || "rgba(255,255,255,.62)";

    chartState.points = points;
    chartState.hitPoints = [];

    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));

    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, rect.width, rect.height);

    const padX = 8;
    const padTop = 8;
    const padBottom = 20;
    const temps = points.map(point => point.temp);
    const min = Math.min(...temps) - 1;
    const max = Math.max(...temps) + 1;
    const span = Math.max(1, max - min);

    function xAt(index) {
      if (points.length === 1) return rect.width / 2;
      return padX + (index / (points.length - 1)) * (rect.width - padX * 2);
    }

    function yAt(temp) {
      return padTop + ((max - temp) / span) * (rect.height - padTop - padBottom);
    }

    ctx.lineWidth = 1;
    ctx.strokeStyle = chartGrid;
    ctx.beginPath();
    ctx.moveTo(padX, rect.height - padBottom);
    ctx.lineTo(rect.width - padX, rect.height - padBottom);
    ctx.stroke();

    const gradient = ctx.createLinearGradient(0, padTop, 0, rect.height - padBottom);
    gradient.addColorStop(0, chartFill);
    gradient.addColorStop(1, "rgba(73,179,255,0)");

    ctx.beginPath();
    points.forEach((point, index) => {
      const x = xAt(index);
      const y = yAt(point.temp);
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.lineTo(xAt(points.length - 1), rect.height - padBottom);
    ctx.lineTo(xAt(0), rect.height - padBottom);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();

    ctx.beginPath();
    points.forEach((point, index) => {
      const x = xAt(index);
      const y = yAt(point.temp);
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.lineWidth = 2;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.strokeStyle = chartLine;
    ctx.stroke();

    ctx.fillStyle = "rgba(255,255,255,.7)";
    ctx.font = "10px sans-serif";
    ctx.textAlign = "center";
    points.forEach((point, index) => {
      const x = xAt(index);
      const y = yAt(point.temp);
      const isHover = index === hoverIndex;
      chartState.hitPoints.push({ index, x, y, point });

      ctx.beginPath();
      ctx.arc(x, y, isHover ? 4.2 : 2.4, 0, Math.PI * 2);
      ctx.fillStyle = isHover ? "#ffffff" : chartLine;
      ctx.fill();

      if (isHover) {
        ctx.lineWidth = 2;
        ctx.strokeStyle = chartLine;
        ctx.stroke();
      }

      if (index % 2 === 0 || index === points.length - 1) {
        ctx.fillStyle = chartText;
        ctx.fillText(formatTime(point.date, currentClockFormat), x, rect.height - 6);
      }
    });
  }

  async function updateWeather() {
    try {
      clearError();

      const config = await getConfig();
      const wrapper = await renderShell(config);
      if (!wrapper) return;
      await updateClock(config);

      const data = await getWeather(config);
      const current = data.current;

      if (!current) {
        throw new Error("No current weather data returned");
      }

      const icon = weatherIcon(current.weather_code, current.is_day);
      const scene = weatherScene(current.weather_code, current.is_day, current.wind_speed_10m);
      const label = weatherLabel(current.weather_code);
      lastWeatherVisual = { icon, scene, label };
      const forecast = buildForecast(data, config);
      lastForecast = forecast;
      lastDailyForecast = buildDailyForecast(data, config);
      const symbol = unitSymbol(config);

      setText(MOD_ID + "-city", config.city || "Weather");
      setText(MOD_ID + "-label", activeView === "forecast" ? "10-day forecast" : label);
      setText(MOD_ID + "-temp", formatTemp(current.temperature_2m, config));
      setText(MOD_ID + "-feels", formatTemp(current.apparent_temperature, config));
      setText(MOD_ID + "-unit-main", symbol);
      setText(MOD_ID + "-unit-feels", symbol);
      setText(MOD_ID + "-humidity", Math.round(current.relative_humidity_2m));
      setText(MOD_ID + "-wind", Math.round(current.wind_speed_10m));
      setText(MOD_ID + "-time", formatTime(new Date(), config.clockFormat));

      if (forecast.length) {
        const temps = forecast.map(point => point.temp);
        setText(MOD_ID + "-range", Math.min(...temps) + "-" + Math.max(...temps) + " " + symbol);
      }

      applyWeatherVisuals(lastWeatherVisual);
      renderDailyForecast(lastDailyForecast);
      setActiveView(activeView);
      if (activeView === "current") drawChart(forecast);

      if (refreshTimer) clearInterval(refreshTimer);
      refreshTimer = setInterval(updateWeather, Math.max(1, Number(config.refreshInterval || 30)) * 60 * 1000);
    } catch (error) {
      console.error("[ZimaMOD Weather]", error);
      showError(error.message || "Weather update failed");
    }
  }

  function renderThemeOptions(selectedTheme) {
    return Object.entries(THEMES).map(([value, theme]) => `
      <label>
        <input type="radio" name="${MOD_ID}-theme" value="${value}" ${selectedTheme === value ? "checked" : ""}>
        <span class="${MOD_ID}-unit-option">${escapeHtml(theme.label)}</span>
      </label>
    `).join("");
  }

  async function openSettings() {
    const existing = document.getElementById(MOD_ID + "-overlay");
    if (existing) existing.remove();

    const config = await getConfig();
    const overlay = document.createElement("div");
    overlay.className = `${MOD_ID} ${MOD_ID}-overlay ${(THEMES[config.theme] || THEMES.casa).className}`;
    overlay.id = MOD_ID + "-overlay";

    overlay.innerHTML = `
      <div class="${MOD_ID}-modal" role="dialog" aria-modal="true">
        <h3>Weather Settings</h3>

        <div class="${MOD_ID}-field">
          <label for="${MOD_ID}-city-input">City</label>
          <input id="${MOD_ID}-city-input" value="${escapeHtml(config.city)}" spellcheck="false">
        </div>

        <div class="${MOD_ID}-field">
          <label for="${MOD_ID}-lat-input">Latitude</label>
          <input id="${MOD_ID}-lat-input" value="${config.latitude}" type="number" step="0.0001">
        </div>

        <div class="${MOD_ID}-field">
          <label for="${MOD_ID}-lon-input">Longitude</label>
          <input id="${MOD_ID}-lon-input" value="${config.longitude}" type="number" step="0.0001">
        </div>

        <div class="${MOD_ID}-field">
          <label for="${MOD_ID}-refresh-input">Refresh interval minutes</label>
          <input id="${MOD_ID}-refresh-input" value="${config.refreshInterval}" type="number" min="1">
        </div>

        <div class="${MOD_ID}-field ${MOD_ID}-switch-row">
          <span class="${MOD_ID}-switch-label">Temperature unit</span>
          <div class="${MOD_ID}-unit-switch" role="radiogroup" aria-label="Temperature unit">
            <label>
              <input type="radio" name="${MOD_ID}-unit" value="C" ${config.tempUnit === "F" ? "" : "checked"}>
              <span class="${MOD_ID}-unit-option">&deg;C</span>
            </label>
            <label>
              <input type="radio" name="${MOD_ID}-unit" value="F" ${config.tempUnit === "F" ? "checked" : ""}>
              <span class="${MOD_ID}-unit-option">&deg;F</span>
            </label>
          </div>
        </div>

        <div class="${MOD_ID}-field ${MOD_ID}-switch-row ${MOD_ID}-theme-row">
          <span class="${MOD_ID}-switch-label">Theme</span>
          <div class="${MOD_ID}-unit-switch ${MOD_ID}-theme-switch" role="radiogroup" aria-label="Theme">
            ${renderThemeOptions(config.theme)}
          </div>
        </div>

        <div class="${MOD_ID}-footer">
          <button class="${MOD_ID}-btn ${MOD_ID}-btn-cancel" id="${MOD_ID}-lookup">Look Up City</button>
          <button class="${MOD_ID}-btn ${MOD_ID}-btn-cancel" id="${MOD_ID}-cancel">Cancel</button>
          <button class="${MOD_ID}-btn ${MOD_ID}-btn-save" id="${MOD_ID}-save">Save</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const cityInput = overlay.querySelector("#" + MOD_ID + "-city-input");
    const latInput = overlay.querySelector("#" + MOD_ID + "-lat-input");
    const lonInput = overlay.querySelector("#" + MOD_ID + "-lon-input");
    const refreshInput = overlay.querySelector("#" + MOD_ID + "-refresh-input");
    const lookupButton = overlay.querySelector("#" + MOD_ID + "-lookup");
    const saveButton = overlay.querySelector("#" + MOD_ID + "-save");

    overlay.querySelector("#" + MOD_ID + "-cancel").addEventListener("click", () => overlay.remove());
    overlay.addEventListener("click", event => {
      if (event.target === overlay) overlay.remove();
    });

    lookupButton.addEventListener("click", async () => {
      const label = lookupButton.textContent;
      lookupButton.disabled = true;
      lookupButton.textContent = "Looking up...";

      try {
        const result = await geocodeCity(cityInput.value.trim());
        cityInput.value = result.city;
        latInput.value = result.latitude;
        lonInput.value = result.longitude;
      } catch (error) {
        alert(error.message || "City lookup failed");
      } finally {
        lookupButton.disabled = false;
        lookupButton.textContent = label;
      }
    });

    saveButton.addEventListener("click", async () => {
      const next = {
        city: cityInput.value.trim() || "Weather",
        latitude: Number(latInput.value),
        longitude: Number(lonInput.value),
        refreshInterval: Number(refreshInput.value || 30),
        clockFormat: config.clockFormat,
        tempUnit: overlay.querySelector(`input[name="${MOD_ID}-unit"]:checked`)?.value === "F" ? "F" : "C",
        theme: THEMES[overlay.querySelector(`input[name="${MOD_ID}-theme"]:checked`)?.value]
          ? overlay.querySelector(`input[name="${MOD_ID}-theme"]:checked`).value
          : "casa"
      };

      if (!Number.isFinite(next.latitude) || !Number.isFinite(next.longitude)) {
        alert("Latitude and longitude must be valid numbers.");
        return;
      }

      await saveConfig(next);
      overlay.remove();
      await updateWeather();
    });

    setTimeout(() => cityInput.focus(), 50);
  }

  function moduleFunction() {
    injectStyles();
    return getConfig()
      .then(renderShell)
      .then(updateWeather)
      .catch(error => {
        console.error("[ZimaMOD Weather] boot failed", error);
        showError(error.message || "Weather widget failed to start");
      });
  }

  function debounce(func, wait) {
    let timeout;
    return (...args) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => func.apply(this, args), wait);
    };
  }

  const debouncedViewSync = debounce(() => {
    if (document.querySelector(`[widget-id="${WIDGET_ID}"]`)) {
      mountContainer();
    } else {
      beginStartupMount();
    }
  }, 120);
  const debouncedDedupe = debounce(enforceSingleWidget, 40);

  function mutationTouchesWeather(records) {
    const selector = `#${WRAPPER_ID}, #${ZIMAOS_MOUNT_ID}, [widget-id="${WIDGET_ID}"]`;
    return records.some(record => (
      [...record.addedNodes, ...record.removedNodes].some(node => (
        node instanceof Element &&
        (node.matches(selector) || node.querySelector(selector))
      ))
    ));
  }

  const observer = new MutationObserver(records => {
    if (!mutationTouchesWeather(records)) return;
    debouncedDedupe();
    debouncedViewSync();
  });

  function stopStartupObserver() {
    startupObserver?.disconnect();
    startupObserver = null;
    startupDeadline = 0;
  }

  function tryStartupMount() {
    if (document.querySelector(`#${WRAPPER_ID}[widget-id="${WIDGET_ID}"]`)) {
      stopStartupObserver();
      return;
    }
    if (Date.now() > startupDeadline) {
      stopStartupObserver();
      return;
    }
    if (startupMountPromise) return;

    startupMountPromise = moduleFunction()
      .finally(() => {
        startupMountPromise = null;
        if (document.querySelector(`#${WRAPPER_ID}[widget-id="${WIDGET_ID}"]`)) {
          stopStartupObserver();
        }
      });
  }

  function beginStartupMount() {
    if (document.querySelector(`#${WRAPPER_ID}[widget-id="${WIDGET_ID}"]`)) return;
    startupDeadline = Date.now() + 15000;
    if (!startupObserver) {
      startupObserver = new MutationObserver(debounce(tryStartupMount, 120));
      startupObserver.observe(document.body, { childList: true, subtree: true });
    }
    tryStartupMount();
  }

  window.addEventListener("resize", debounce(() => drawChart(lastForecast), 120));
  window.addEventListener("hashchange", debouncedViewSync);
  window.addEventListener("popstate", debouncedViewSync);

  if (document.querySelector(CASAOS_ANCHOR) || document.querySelector("#app")) {
    beginStartupMount();
  }

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
})();
