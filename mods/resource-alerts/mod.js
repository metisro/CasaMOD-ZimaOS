// ZimaMOD Resource Alerts v0.1.0

(function ZimaMODResourceAlerts() {
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

  const MOD_ID = "resource-alerts";
  const SCRIPT_URL = document.currentScript?.src || "";
  const WRAPPER_ID = "zimamod-resource-alerts-widget";
  const MODAL_ID = "zimamod-resource-alerts-modal";
  const CONFIG_FALLBACK = "zimamod-resource-alerts-config";
  const STATE_FALLBACK = "zimamod-resource-alerts-state";
  const THEME_STYLE_ID = "zimamod-resource-alerts-theme-css";
  const CHECK_TIMEOUT_MS = 6000;
  const THEMES = {
    "sanded-glass": {
      label: "Sanded Glass",
      file: "themes/sanded-glass.css"
    },
    "liquid-glass": {
      label: "Liquid Glass",
      file: "themes/liquid-glass.css"
    },
    aero: {
      label: "Aero",
      file: "themes/aero.css"
    },
    casaos: {
      label: "CasaOS",
      file: "themes/casaos.css"
    },
    chaos: {
      label: "Chaos",
      file: "themes/chaos.css"
    }
  };
  const DEFAULT_CONFIG = {
    theme: "sanded-glass",
    notes: "",
    refreshInterval: 30,
    cooldownMinutes: 15,
    thresholds: {
      cpuWarn: 75,
      cpuCritical: 90,
      ramWarn: 80,
      ramCritical: 92,
      diskWarn: 80,
      diskCritical: 92,
      tempWarn: 75,
      tempCritical: 90
    },
    events: {
      defaultShown: 20,
      loadAllLimit: 200
    },
    notifications: {
      browser: true,
      sound: false,
      telegram: {
        enabled: false,
        botToken: "",
        chatId: ""
      },
      gotify: {
        enabled: false,
        url: "",
        token: ""
      }
    },
    checks: []
  };

  let config = clone(DEFAULT_CONFIG);
  let state = { events: [], active: {}, lastSent: {} };
  let widget = null;
  let timer = null;
  let lastSnapshot = null;
  let activeTab = "status";
  let eventsPage = 1;
  let eventsExpanded = false;

  if (document.documentElement.dataset.zimamodResourceAlerts === "true") return;
  document.documentElement.dataset.zimamodResourceAlerts = "true";

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function clamp(value, min, max, fallback) {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.min(max, Math.max(min, number));
  }

  function deepMerge(base, incoming) {
    const result = clone(base);
    if (!incoming || typeof incoming !== "object") return result;

    for (const [key, value] of Object.entries(incoming)) {
      if (
        value &&
        typeof value === "object" &&
        !Array.isArray(value) &&
        result[key] &&
        typeof result[key] === "object" &&
        !Array.isArray(result[key])
      ) {
        result[key] = deepMerge(result[key], value);
      } else {
        result[key] = value;
      }
    }
    return result;
  }

  function normalizeConfig(value) {
    const merged = deepMerge(DEFAULT_CONFIG, value);
    merged.theme = THEMES[merged.theme] ? merged.theme : DEFAULT_CONFIG.theme;
    merged.notes = String(merged.notes || "").slice(0, 2000);
    merged.refreshInterval = clamp(merged.refreshInterval, 10, 3600, DEFAULT_CONFIG.refreshInterval);
    merged.cooldownMinutes = clamp(merged.cooldownMinutes, 1, 1440, DEFAULT_CONFIG.cooldownMinutes);
    for (const key of Object.keys(DEFAULT_CONFIG.thresholds)) {
      const max = key.startsWith("temp") ? 140 : 100;
      merged.thresholds[key] = clamp(merged.thresholds[key], 1, max, DEFAULT_CONFIG.thresholds[key]);
    }
    merged.events = {
      defaultShown: clamp(merged.events?.defaultShown, 5, 100, DEFAULT_CONFIG.events.defaultShown),
      loadAllLimit: clamp(merged.events?.loadAllLimit, 40, 1000, DEFAULT_CONFIG.events.loadAllLimit)
    };
    merged.notifications.sound = Boolean(merged.notifications.sound);
    merged.checks = Array.isArray(merged.checks)
      ? merged.checks.map(check => ({
        name: String(check?.name || "").trim().slice(0, 48),
        url: String(check?.url || "").trim().slice(0, 500),
        method: ["HTTP", "TCP", "Process"].includes(check?.method) ? check.method : "HTTP",
        target: String(check?.target || check?.url || "").trim().slice(0, 500),
        enabled: check?.enabled !== false
      })).filter(check => check.name && (check.method !== "HTTP" || /^https?:\/\//i.test(check.url)))
      : [];
    return merged;
  }

  function assetUrl(relativePath) {
    if (window.ZimaMOD?.assetUrl) return window.ZimaMOD.assetUrl(MOD_ID, relativePath);
    try {
      return new URL(relativePath, SCRIPT_URL.replace(/mod\.js(?:\?.*)?$/, "")).href;
    } catch (_) {
      return relativePath;
    }
  }

  function applyTheme(theme) {
    const selected = THEMES[theme] ? theme : DEFAULT_CONFIG.theme;
    document.documentElement.dataset.zimamodResourceAlertsTheme = selected;

    const link = document.getElementById(THEME_STYLE_ID) || document.createElement("link");
    const href = assetUrl(THEMES[selected].file);
    if (!link.id) {
      link.id = THEME_STYLE_ID;
      link.rel = "stylesheet";
      link.dataset.zimamodResourceAlerts = "theme";
      document.head.appendChild(link);
    }
    if (link.getAttribute("href") !== href) link.setAttribute("href", href);
  }

  function saveLocal(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (_) {
      // Browser storage can be unavailable in hardened sessions.
    }
  }

  function loadLocal(key, fallback) {
    try {
      return JSON.parse(localStorage.getItem(key) || "null") ?? fallback;
    } catch (_) {
      return fallback;
    }
  }

  async function loadConfig() {
    const fallback = loadLocal(CONFIG_FALLBACK, DEFAULT_CONFIG);
    if (!window.ZimaMOD?.getConfig) {
      config = normalizeConfig(fallback);
      applyTheme(config.theme);
      return config;
    }

    try {
      config = normalizeConfig(await window.ZimaMOD.getConfig(MOD_ID, fallback));
    } catch (error) {
      console.warn("[ZimaMOD Resource Alerts] Failed to load config", error);
      config = normalizeConfig(fallback);
    }
    applyTheme(config.theme);
    saveLocal(CONFIG_FALLBACK, config);
    return config;
  }

  async function saveConfig(nextConfig) {
    config = normalizeConfig(nextConfig);
    applyTheme(config.theme);
    saveLocal(CONFIG_FALLBACK, config);
    if (window.ZimaMOD?.setConfig) await window.ZimaMOD.setConfig(MOD_ID, config);
    schedule();
    await evaluateNow();
  }

  function loadState() {
    const saved = loadLocal(STATE_FALLBACK, state);
    state = {
      events: Array.isArray(saved?.events) ? saved.events.slice(0, 1000) : [],
      active: saved?.active && typeof saved.active === "object" ? saved.active : {},
      lastSent: saved?.lastSent && typeof saved.lastSent === "object" ? saved.lastSent : {}
    };
  }

  function saveState() {
    saveLocal(STATE_FALLBACK, state);
  }

  async function loadMonitorState() {
    try {
      if (!window.ZimaMOD?.getResourceAlertsState) return null;
      const body = await window.ZimaMOD.getResourceAlertsState();
      if (body?.state) {
        state = {
          events: Array.isArray(body.state.events) ? body.state.events.slice(0, 1000) : [],
          active: body.state.active && typeof body.state.active === "object" ? body.state.active : {},
          lastSent: body.state.lastSent && typeof body.state.lastSent === "object" ? body.state.lastSent : {}
        };
        saveState();
      }
      return body;
    } catch (error) {
      console.warn("[ZimaMOD Resource Alerts] Server monitor state unavailable", error);
      return null;
    }
  }

  function metricStatus(value, warn, critical) {
    if (value === null || value === undefined || Number.isNaN(value)) return "unknown";
    if (value >= critical) return "critical";
    if (value >= warn) return "warn";
    return "ok";
  }

  function metricValue(metric) {
    const value = Number(metric?.percent);
    return Number.isFinite(value) ? value : null;
  }

  async function collectMetrics() {
    let payload = null;
    try {
      if (window.ZimaMOD?.getSystemMetrics) {
        payload = await window.ZimaMOD.getSystemMetrics();
      } else {
        const response = await fetch("/zimamod-api/metrics", {
          credentials: "include",
          cache: "no-store"
        });
        if (!response.ok) throw new Error(`Metrics request failed: ${response.status}`);
        payload = await response.json();
      }
    } catch (error) {
      console.warn("[ZimaMOD Resource Alerts] Metrics API unavailable", error);
    }
    const cpu = metricValue(payload?.cpu);
    const ram = metricValue(payload?.memory);
    const disk = metricValue(payload?.disk);
    const sensors = Array.isArray(payload?.sensors) ? payload.sensors : [];
    const primaryTemp = sensors
      .map(sensor => Number(sensor?.celsius))
      .filter(Number.isFinite)
      .sort((left, right) => right - left)[0] ?? null;
    return {
      cpu: { value: cpu, status: metricStatus(cpu, config.thresholds.cpuWarn, config.thresholds.cpuCritical) },
      ram: { value: ram, status: metricStatus(ram, config.thresholds.ramWarn, config.thresholds.ramCritical) },
      disk: { value: disk, status: metricStatus(disk, config.thresholds.diskWarn, config.thresholds.diskCritical) },
      temp: { value: primaryTemp, status: metricStatus(primaryTemp, config.thresholds.tempWarn, config.thresholds.tempCritical) },
      network: payload?.network || { downloadBytesPerSecond: null, uploadBytesPerSecond: null, available: false },
      system: payload?.system || { uptimeSeconds: null, bootTime: null, available: false },
      topProcesses: Array.isArray(payload?.topProcesses) ? payload.topProcesses : [],
      storageHealth: payload?.storageHealth || { state: "unavailable" },
      sensors,
      source: payload?.source || null
    };
  }

  function timeoutSignal(ms) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), ms);
    return { signal: controller.signal, done: () => clearTimeout(timeout) };
  }

  async function checkService(check) {
    if (check.method && check.method !== "HTTP") {
      return {
        name: check.name,
        url: check.target || check.url,
        method: check.method,
        state: "degraded",
        ok: false,
        error: "api-side checks pending"
      };
    }

    const timer = timeoutSignal(CHECK_TIMEOUT_MS);
    const started = performance.now();
    try {
      await fetch(check.url, {
        method: "GET",
        mode: "no-cors",
        cache: "no-store",
        signal: timer.signal
      });
      return {
        name: check.name,
        url: check.url,
        method: "HTTP",
        state: "running",
        ok: true,
        latencyMs: Math.round(performance.now() - started)
      };
    } catch (error) {
      return {
        name: check.name,
        url: check.url,
        method: "HTTP",
        state: "stopped",
        ok: false,
        error: error.name === "AbortError" ? "timeout" : "unreachable"
      };
    } finally {
      timer.done();
    }
  }

  function levelRank(level) {
    return { ok: 0, unknown: 0, warn: 1, critical: 2 }[level] || 0;
  }

  function overallLevel(metrics, services) {
    const levels = [
      metrics.cpu.status,
      metrics.ram.status,
      metrics.disk.status,
      metrics.temp.status,
      ...services.map(service => service.ok ? "ok" : "critical")
    ];
    return levels.sort((left, right) => levelRank(right) - levelRank(left))[0] || "unknown";
  }

  function addEvent(level, title, message, category = "system") {
    const event = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      at: new Date().toISOString(),
      level,
      title,
      message,
      category
    };
    state.events.unshift(event);
    state.events = state.events.slice(0, 1000);
    saveState();
    return event;
  }

  function shouldNotify(key, level) {
    if (level === "ok" || level === "unknown") return false;
    const now = Date.now();
    const cooldown = config.cooldownMinutes * 60 * 1000;
    return !state.lastSent[key] || now - state.lastSent[key] >= cooldown;
  }

  function markNotified(key) {
    state.lastSent[key] = Date.now();
    saveState();
  }

  async function browserNotify(title, message) {
    if (!config.notifications.browser || !("Notification" in window)) return;
    if (Notification.permission === "default") await Notification.requestPermission();
    if (Notification.permission === "granted") new Notification(title, { body: message });
  }

  function playSoundAlert(level) {
    if (!config.notifications.sound) return;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      const context = new AudioContext();
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = level === "critical" ? 880 : 660;
      gain.gain.value = 0.08;
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + 0.16);
      oscillator.addEventListener("ended", () => context.close());
    } catch (_) {
      // Browsers may block audio until the user has interacted with the page.
    }
  }

  async function sendTelegram(message) {
    const telegram = config.notifications.telegram;
    if (!telegram.enabled || !telegram.botToken || !telegram.chatId) return;
    const body = new URLSearchParams({ chat_id: telegram.chatId, text: message });
    await fetch(`https://api.telegram.org/bot${encodeURIComponent(telegram.botToken)}/sendMessage`, {
      method: "POST",
      mode: "no-cors",
      body
    });
  }

  async function sendGotify(title, message) {
    const gotify = config.notifications.gotify;
    if (!gotify.enabled || !gotify.url || !gotify.token) return;
    const endpoint = new URL("/message", gotify.url);
    endpoint.searchParams.set("token", gotify.token);
    await fetch(endpoint.toString(), {
      method: "POST",
      mode: "no-cors",
      body: new URLSearchParams({ title, message, priority: "5" })
    });
  }

  async function dispatchNotification(key, level, title, message) {
    if (!shouldNotify(key, level)) return;
    markNotified(key);
    playSoundAlert(level);
    await Promise.allSettled([
      browserNotify(title, message),
      sendTelegram(`${title}\n${message}`),
      sendGotify(title, message)
    ]);
  }

  async function processAlerts(snapshot) {
    const metricLabels = { cpu: "CPU", ram: "RAM", disk: "Storage", temp: "Temperature" };
    for (const key of Object.keys(metricLabels)) {
      const metric = snapshot.metrics[key];
      if (!metric) continue;
      if (metric.status === "ok" || metric.status === "unknown") {
        delete state.active[key];
        continue;
      }
      const title = `${metricLabels[key]} ${metric.status === "critical" ? "critical" : "warning"}`;
      const message = `${metricLabels[key]} is at ${key === "temp" ? formatTemperature(metric.value) : formatValue(metric.value)}.`;
      if (state.active[key] !== metric.status) addEvent(metric.status, title, message, key);
      state.active[key] = metric.status;
      await dispatchNotification(key + ":" + metric.status, metric.status, `ZimaMOD ${title}`, message);
    }

    for (const service of snapshot.services) {
      const key = "service:" + service.name;
      if (service.ok) {
        if (state.active[key] && state.active[key] !== "running") {
          addEvent("ok", `Service recovered: ${service.name}`, `${service.url} is running.`, "service");
        }
        delete state.active[key];
        continue;
      }
      const level = service.state === "degraded" ? "warn" : "critical";
      const title = service.state === "degraded" ? `Service degraded: ${service.name}` : `Service down: ${service.name}`;
      const message = `${service.url} is ${service.error || service.state || "unreachable"}.`;
      if (state.active[key] !== level) addEvent(level, title, message, "service");
      state.active[key] = level;
      await dispatchNotification(key, level, `ZimaMOD ${title}`, message);
    }
    saveState();
  }

  function formatValue(value) {
    return value === null || value === undefined || Number.isNaN(value) ? "--" : `${Math.round(value * 10) / 10}%`;
  }

  function formatTemperature(value) {
    return value === null || value === undefined || Number.isNaN(value) ? "--" : `${Math.round(value * 10) / 10}°C`;
  }

  function formatBytesPerSecond(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return "--";
    const units = ["B/s", "KB/s", "MB/s", "GB/s"];
    let scaled = number;
    let unit = 0;
    while (scaled >= 1024 && unit < units.length - 1) {
      scaled /= 1024;
      unit++;
    }
    return `${Math.round(scaled * 10) / 10} ${units[unit]}`;
  }

  function formatBytes(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return "--";
    const units = ["B", "KB", "MB", "GB", "TB"];
    let scaled = number;
    let unit = 0;
    while (scaled >= 1024 && unit < units.length - 1) {
      scaled /= 1024;
      unit++;
    }
    return `${Math.round(scaled * 10) / 10} ${units[unit]}`;
  }

  function formatDuration(seconds) {
    const value = Number(seconds);
    if (!Number.isFinite(value)) return "--";
    const days = Math.floor(value / 86400);
    const hours = Math.floor((value % 86400) / 3600);
    const minutes = Math.floor((value % 3600) / 60);
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  }

  function formatDate(value) {
    if (!value) return "--";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "--" : date.toLocaleString();
  }

  function statusLabel(level) {
    if (level === "critical") return "Critical";
    if (level === "warn") return "Warning";
    if (level === "ok") return "Healthy";
    return "Waiting";
  }

  function defaultMetrics() {
    return {
      cpu: { value: null, status: "unknown" },
      ram: { value: null, status: "unknown" },
      disk: { value: null, status: "unknown" },
      temp: { value: null, status: "unknown" },
      network: { downloadBytesPerSecond: null, uploadBytesPerSecond: null, available: false },
      system: { uptimeSeconds: null, bootTime: null, available: false },
      topProcesses: [],
      storageHealth: { state: "unavailable" },
      sensors: [],
      source: null
    };
  }

  function metricHtml(name, metric) {
    const status = metric.status === "unknown" ? "" : metric.status;
    const value = metric.value === null ? 0 : Math.max(0, Math.min(100, metric.value));
    return `
      <div class="zimamod-resource-alerts-metric ${status}" style="--value:${value}%">
        <div class="zimamod-resource-alerts-label">${name}</div>
        <div class="zimamod-resource-alerts-value">${formatValue(metric.value)}</div>
        <div class="zimamod-resource-alerts-bar"><span></span></div>
      </div>
    `;
  }

  function renderWidget(snapshot) {
    if (!widget) return;
    const level = snapshot ? snapshot.level : "unknown";
    const servicesDown = snapshot ? snapshot.services.filter(service => !service.ok).length : 0;
    const metrics = snapshot?.metrics || defaultMetrics();

    widget.innerHTML = `
      <header>
        <div>
          <div class="zimamod-resource-alerts-kicker">ZimaMOD Monitor</div>
          <h2>Resource Alerts</h2>
        </div>
        <div class="zimamod-resource-alerts-status ${level}">${statusLabel(level)}</div>
      </header>
      <div class="zimamod-resource-alerts-grid">
        ${metricHtml("CPU", metrics.cpu)}
        ${metricHtml("RAM", metrics.ram)}
        ${metricHtml("Storage", metrics.disk)}
      </div>
      <div class="zimamod-resource-alerts-footer">
        <span>${servicesDown ? `${servicesDown} service alert${servicesDown === 1 ? "" : "s"}` : `${config.checks.length} service checks`}</span>
        <button class="zimamod-resource-alerts-button" type="button">Details</button>
      </div>
    `;
    widget.querySelector("button")?.addEventListener("click", openModal);
  }

  function widgetColumn() {
    const weather = document.querySelector("#zimamod-weather-widget, [widget-id='weather'].zimamod-weather");
    if (weather) {
      const mount = weather.closest("#zimamod-weather-zimaos-mount");
      const column = mount?.parentElement;
      if (column && column !== document.body && hasDashboardWidgets(column)) return column;
    }

    return findDashboardWidgetContainer();
  }

  function visibleLeafText(element) {
    if (!element || element.children.length !== 0) return "";
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return "";
    const style = getComputedStyle(element);
    if (style.visibility === "hidden" || style.display === "none") return "";
    return (element.textContent || "").trim().toLowerCase();
  }

  function hasWidgetTitle(element, title) {
    return Array.from(element?.querySelectorAll?.("*") || [])
      .some(child => visibleLeafText(child) === title);
  }

  function hasDashboardWidgets(element) {
    const nativeCount = ["system", "storage", "network"].filter(title => hasWidgetTitle(element, title)).length;
    return nativeCount >= 2 || hasWidgetTitle(element, "widget settings");
  }

  function findDashboardWidgetContainer() {
    if (!document.querySelector("#app") || location.hash.includes("login")) return null;

    return Array.from(document.querySelectorAll("#app div, #app aside, #app section"))
      .map(element => ({ element, rect: element.getBoundingClientRect() }))
      .filter(({ element, rect }) => (
        rect.width >= 260 &&
        rect.width <= 540 &&
        rect.height >= 450 &&
        rect.left < window.innerWidth * .35 &&
        hasDashboardWidgets(element)
      ))
      .sort((left, right) => left.rect.width - right.rect.width)[0]?.element || null;
  }

  function mountWidget() {
    const column = widgetColumn();
    if (!column) {
      widget?.remove();
      return false;
    }

    if (widget?.isConnected && widget.parentElement === column) return true;

    widget = document.getElementById(WRAPPER_ID) || document.createElement("section");
    widget.id = WRAPPER_ID;
    widget.className = "zimamod-resource-alerts";
    widget.setAttribute("widget-id", "resource-alerts");
    column.appendChild(widget);
    renderWidget(lastSnapshot);
    return true;
  }

  async function evaluateNow() {
    if (!mountWidget()) return;
    const monitor = await loadMonitorState();
    if (monitor?.snapshot) {
      lastSnapshot = monitor.snapshot;
    } else {
      const metrics = await collectMetrics();
      const services = await Promise.all(config.checks.filter(check => check.enabled).map(checkService));
      lastSnapshot = {
        at: new Date().toISOString(),
        metrics,
        services,
        level: overallLevel(metrics, services)
      };
    }
    renderWidget(lastSnapshot);
    updateModalStatus();
  }

  function schedule() {
    clearInterval(timer);
    timer = setInterval(evaluateNow, config.refreshInterval * 1000);
  }

  function inputValue(selector, fallback = "") {
    return document.querySelector(selector)?.value ?? fallback;
  }

  function checkboxValue(selector) {
    return Boolean(document.querySelector(selector)?.checked);
  }

  function checksFromModal() {
    const rows = Array.from(document.querySelectorAll(".zimamod-resource-alerts-row"));
    if (!rows.length) return config.checks;
    return rows.map(row => {
      const method = row.querySelector("[data-field='method']")?.value || "HTTP";
      const url = row.querySelector("[data-field='url']")?.value || "";
      const target = row.querySelector("[data-field='target']")?.value || "";
      return {
        name: row.querySelector("[data-field='name']")?.value || "",
        url,
        method,
        target: method === "HTTP" ? url : target,
        enabled: row.querySelector("[data-field='enabled']")?.checked !== false
      };
    });
  }

  function configValue(key, fallback) {
    const element = document.querySelector(`[data-config='${key}']`);
    return element ? element.value : fallback;
  }

  function icon(name) {
    const paths = {
      activity: "M4 12h4l2-7 4 14 2-7h4",
      timeline: "M6 5v14M6 7h10M6 12h7M6 17h12",
      note: "M6 3h9l3 3v15H6zM14 3v4h4M9 11h6M9 15h6",
      cog: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm8 4a8 8 0 0 1-.1 1.2l2 1.5-2 3.5-2.4-1a8 8 0 0 1-2.1 1.2L15 21h-6l-.4-2.6a8 8 0 0 1-2.1-1.2l-2.4 1-2-3.5 2-1.5A8 8 0 0 1 4 12c0-.4 0-.8.1-1.2l-2-1.5 2-3.5 2.4 1a8 8 0 0 1 2.1-1.2L9 3h6l.4 2.6a8 8 0 0 1 2.1 1.2l2.4-1 2 3.5-2 1.5c.1.4.1.8.1 1.2Z",
      cpu: "M9 3v3m6-3v3M9 18v3m6-3v3M3 9h3m-3 6h3m12-6h3m-3 6h3M7 7h10v10H7z",
      memory: "M5 6h14v12H5zM8 9h8m-8 3h8m-8 3h5",
      disk: "M6 4h12l2 5v11H4V9zM7 15h10",
      temp: "M10 14.5V5a2 2 0 0 1 4 0v9.5a4 4 0 1 1-4 0Z",
      down: "M12 4v14m0 0-5-5m5 5 5-5",
      up: "M12 20V6m0 0-5 5m5-5 5 5",
      trash: "M4 7h16M10 11v6m4-6v6M6 7l1 14h10l1-14M9 7V4h6v3",
      plus: "M12 5v14M5 12h14"
    };
    return `<svg class="zra-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="${paths[name] || paths.activity}"></path></svg>`;
  }

  function tabButton(id, label, iconName, badge = "") {
    return `
      <button class="zimamod-resource-alerts-tab ${activeTab === id ? "active" : ""}" type="button" data-tab="${id}">
        ${icon(iconName)}<span>${label}</span>${badge}
      </button>
    `;
  }

  function statusDot(level) {
    return `<span class="zimamod-resource-alerts-dot ${level || "unknown"}"></span>`;
  }

  function metricCardHtml(id, label, metric, iconName, formatter = formatValue, unit = "%") {
    if (!metric || metric.value === null || metric.value === undefined || Number.isNaN(metric.value)) return "";
    const status = metric.status === "warn" ? "warn" : metric.status === "critical" ? "critical" : "ok";
    const value = Math.max(0, Math.min(100, Number(metric.value)));
    return `
      <div class="zimamod-resource-alerts-metric-card ${status}">
        <div class="zimamod-resource-alerts-metric-top">
          <span>${icon(iconName)} ${label}</span>
          ${statusDot(status)}
        </div>
        <div class="zimamod-resource-alerts-metric-big">${formatter(metric.value)}</div>
        <div class="zimamod-resource-alerts-bar"><span style="width:${value}%"></span></div>
        <div class="zimamod-resource-alerts-sub">State: ${statusLabel(status)}${unit ? ` · ${escapeHtml(id)}` : ""}</div>
      </div>
    `;
  }

  function serviceState(service) {
    if (service.ok) return "running";
    return service.state === "degraded" ? "degraded" : "stopped";
  }

  function serviceBadge(service) {
    const state = serviceState(service);
    const label = state === "running" ? "Running" : state === "degraded" ? "Degraded" : "Stopped";
    return `<span class="zimamod-resource-alerts-badge ${state}">${label}</span>`;
  }

  function healthBadge(health) {
    const state = health?.state || "unavailable";
    const label = state === "healthy" ? "Healthy" : state === "degraded" ? "Degraded" : "Unavailable";
    const badgeState = state === "healthy" ? "running" : state === "degraded" ? "degraded" : "stopped";
    return `<span class="zimamod-resource-alerts-badge ${badgeState}">${label}</span>`;
  }

  function statusTabHtml() {
    const metrics = lastSnapshot?.metrics || defaultMetrics();
    const services = lastSnapshot?.services || [];
    const network = metrics.network || {};
    const system = metrics.system || {};
    const storageHealth = metrics.storageHealth || { state: "unavailable" };
    const topProcesses = metrics.topProcesses || [];
    const hostProcMounted = lastSnapshot?.metrics?.source?.hostProcMounted !== false;
    return `
      <section class="zimamod-resource-alerts-section">
        <h3>${icon("activity")} System resources</h3>
        <div class="zimamod-resource-alerts-metric-grid">
          ${metricCardHtml("cpu", "CPU", metrics.cpu, "cpu")}
          ${metricCardHtml("memory", "Memory", metrics.ram, "memory")}
          ${metricCardHtml("disk", "Disk", metrics.disk, "disk")}
          ${metricCardHtml("temp", "Temperature", metrics.temp, "temp", formatTemperature, "°C")}
        </div>
        ${metrics.temp?.value === null ? `<p>No temperature sensor is exposed by this hardware/API yet.</p>` : ""}
      </section>

      <section class="zimamod-resource-alerts-section">
        <h3>${icon("timeline")} Service Checks</h3>
        <div class="zimamod-resource-alerts-card-list">
          ${services.length ? services.map(service => `
            <div class="zimamod-resource-alerts-list-row">
              <span>${statusDot(serviceState(service))}${escapeHtml(service.name)}</span>
              <span>${escapeHtml(service.method || "HTTP")} ${escapeHtml(service.url || "")}</span>
              ${serviceBadge(service)}
            </div>
          `).join("") : `<div class="zimamod-resource-alerts-empty">No service checks configured.</div>`}
        </div>
      </section>

      <section class="zimamod-resource-alerts-section">
        <h3>${icon("down")} Network</h3>
        <div class="zimamod-resource-alerts-network">
          <div>${icon("down")}<strong>${formatBytesPerSecond(network.downloadBytesPerSecond)}</strong><span>Download</span></div>
          <div>${icon("up")}<strong>${formatBytesPerSecond(network.uploadBytesPerSecond)}</strong><span>Upload</span></div>
        </div>
        ${network.available ? "" : `<p>Waiting for the next metrics sample to calculate throughput.</p>`}
      </section>

      <section class="zimamod-resource-alerts-section">
        <h3>${icon("timeline")} Host Runtime</h3>
        <div class="zimamod-resource-alerts-info-grid">
          <div><span>Uptime</span><strong>${formatDuration(system.uptimeSeconds)}</strong></div>
          <div><span>Last reboot</span><strong>${formatDate(system.bootTime)}</strong></div>
        </div>
        ${system.available ? "" : `<p>Host uptime is unavailable from the current API mount.</p>`}
      </section>

      <section class="zimamod-resource-alerts-section">
        <h3>${icon("memory")} Top Memory Processes</h3>
        <div class="zimamod-resource-alerts-card-list">
          ${topProcesses.length ? topProcesses.map(process => `
            <div class="zimamod-resource-alerts-list-row zimamod-resource-alerts-process-row">
              <span>${escapeHtml(process.name || process.pid)}</span>
              <span title="${escapeHtml(process.command || "")}">${escapeHtml(process.command || process.name || "")}</span>
              <span>${formatBytes(process.memoryBytes)}</span>
            </div>
          `).join("") : `<div class="zimamod-resource-alerts-empty">${hostProcMounted ? "No process memory data available." : "Host /proc is not mounted at /host/proc. Recreate the API container with the updated long-form compose mounts."}</div>`}
        </div>
      </section>

      <section class="zimamod-resource-alerts-section">
        <h3>${icon("disk")} ZFS / RAID Health</h3>
        <div class="zimamod-resource-alerts-card-list">
          <div class="zimamod-resource-alerts-list-row">
            <span>${statusDot(storageHealth.state === "healthy" ? "running" : storageHealth.state === "degraded" ? "degraded" : "unknown")} Overall storage health</span>
            <span>ZFS and Linux mdraid detection</span>
            ${healthBadge(storageHealth)}
          </div>
          <div class="zimamod-resource-alerts-list-row">
            <span>ZFS</span>
            <span>${escapeHtml(storageHealth.zfs?.detail || "zpool status unavailable")}</span>
            ${healthBadge(storageHealth.zfs)}
          </div>
          <div class="zimamod-resource-alerts-list-row">
            <span>RAID</span>
            <span>${escapeHtml(storageHealth.raid?.arrays?.[0]?.detail || "mdraid arrays unavailable")}</span>
            ${healthBadge(storageHealth.raid)}
          </div>
        </div>
      </section>
    `;
  }

  function eventLimit() {
    return eventsExpanded ? Math.min(config.events.loadAllLimit, 40 * eventsPage) : config.events.defaultShown;
  }

  function visibleEvents() {
    return state.events.slice(0, eventLimit());
  }

  function eventIcon(level) {
    if (level === "critical") return "!";
    if (level === "warn") return "!";
    if (level === "ok") return "✓";
    return "i";
  }

  function eventsHtml() {
    const events = visibleEvents();
    if (!events.length) return `<div class="zimamod-resource-alerts-empty">No alerts recorded yet.</div>`;
    return events.map(event => `
      <div class="zimamod-resource-alerts-event ${event.level}">
        <div class="zimamod-resource-alerts-event-icon">${eventIcon(event.level)}</div>
        <div>
          <strong>${escapeHtml(event.title || event.message)}</strong>
          <p>${escapeHtml(event.message || "")}</p>
          <div class="zimamod-resource-alerts-event-meta">
            <span>${new Date(event.at).toLocaleString()}</span>
            <span class="zimamod-resource-alerts-tag">${escapeHtml(event.category || "system")}</span>
          </div>
        </div>
      </div>
    `).join("");
  }

  function eventsTabHtml() {
    const shown = visibleEvents().length;
    const total = state.events.length;
    const canLoadMore = shown < Math.min(total, config.events.loadAllLimit);
    return `
      <section class="zimamod-resource-alerts-section">
        <div class="zimamod-resource-alerts-toolbar">
          <span>Showing <strong>${shown}</strong> of <strong>${total}</strong></span>
          <div>
            <button class="secondary zimamod-resource-alerts-toolbar-button" type="button" data-action="load-events" ${canLoadMore ? "" : "disabled"}>${icon("plus")} Load all</button>
            <button class="danger zimamod-resource-alerts-toolbar-button" type="button" data-action="clear-events">${icon("trash")} Clear events</button>
          </div>
        </div>
        <div class="zimamod-resource-alerts-events" data-live-section="events">${eventsHtml()}</div>
        ${total > config.events.defaultShown ? `
          <div class="zimamod-resource-alerts-pagination">
            <span>Page ${eventsPage} · ${eventsExpanded ? "expanded by 40" : `default ${config.events.defaultShown}`}</span>
          </div>
        ` : ""}
      </section>
    `;
  }

  function settingsTabHtml() {
    return `
      <section class="zimamod-resource-alerts-section">
        <h3>${icon("cog")} Theme</h3>
        <div class="zimamod-resource-alerts-fields">
          <label class="zimamod-resource-alerts-field">Widget theme
            <select data-config="theme">
              ${Object.entries(THEMES).map(([value, theme]) => `
                <option value="${value}" ${config.theme === value ? "selected" : ""}>${theme.label}</option>
              `).join("")}
            </select>
          </label>
          ${numberField("refreshInterval", "Refresh seconds", config.refreshInterval, 10, 3600)}
          ${numberField("cooldownMinutes", "Alert cooldown minutes", config.cooldownMinutes, 1, 1440)}
        </div>
      </section>

      <section class="zimamod-resource-alerts-section">
        <h3>Thresholds</h3>
        <div class="zimamod-resource-alerts-fields">
          ${thresholdField("cpuWarn", "CPU warning")}
          ${thresholdField("cpuCritical", "CPU critical")}
          ${thresholdField("ramWarn", "Memory warning")}
          ${thresholdField("ramCritical", "Memory critical")}
          ${thresholdField("diskWarn", "Disk warning")}
          ${thresholdField("diskCritical", "Disk critical")}
          ${numberField("tempWarn", "Temperature warning °C", config.thresholds.tempWarn, 1, 140)}
          ${numberField("tempCritical", "Temperature critical °C", config.thresholds.tempCritical, 1, 140)}
        </div>
      </section>

      <section class="zimamod-resource-alerts-section">
        <h3>Events</h3>
        <div class="zimamod-resource-alerts-fields">
          ${numberField("eventsDefaultShown", "Default events shown", config.events.defaultShown, 5, 100)}
          ${numberField("eventsLoadAllLimit", "Maximum events loaded", config.events.loadAllLimit, 40, 1000)}
        </div>
      </section>

      <section class="zimamod-resource-alerts-section">
        <h3>Notifications</h3>
        <div class="zimamod-resource-alerts-fields">
          ${selectField("browser", "Browser notifications", config.notifications.browser)}
          ${selectField("sound", "Sound alerts", config.notifications.sound)}
          ${selectField("telegramEnabled", "Telegram enabled", config.notifications.telegram.enabled)}
          ${selectField("gotifyEnabled", "Gotify enabled", config.notifications.gotify.enabled)}
          ${textField("telegramBotToken", "Telegram bot token", config.notifications.telegram.botToken)}
          ${textField("telegramChatId", "Telegram chat ID", config.notifications.telegram.chatId)}
          ${textField("gotifyUrl", "Gotify URL", config.notifications.gotify.url)}
          ${textField("gotifyToken", "Gotify app token", config.notifications.gotify.token)}
        </div>
      </section>

      <section class="zimamod-resource-alerts-section">
        <h3>Service checks</h3>
        <p>HTTP, TCP, and process checks run in zimamod-api, so alerts continue even when the dashboard is closed.</p>
        <div class="zimamod-resource-alerts-checks">
          ${config.checks.map(checkRow).join("")}
        </div>
        <button class="zimamod-resource-alerts-add-check" type="button" data-action="add-check">${icon("plus")} Add service</button>
      </section>
    `;
  }

  function notesTabHtml() {
    return `
      <section class="zimamod-resource-alerts-section">
        <h3>${icon("note")} Notes</h3>
        <p>Use this space for maintenance context, investigation notes, or reminders tied to this ZimaOS machine.</p>
        <label class="zimamod-resource-alerts-field zimamod-resource-alerts-notes-field">Widget notes
          <textarea data-config="notes" maxlength="2000" placeholder="Write reminders, investigation notes, or maintenance context here.">${escapeHtml(config.notes)}</textarea>
        </label>
      </section>
    `;
  }

  function modalSectionHtml() {
    const eventBadge = state.events.length ? `<span class="zimamod-resource-alerts-tab-badge">${state.events.length}</span>` : "";
    return `
      <nav class="zimamod-resource-alerts-tabs" aria-label="Resource alerts tabs">
        ${tabButton("status", "Status", "activity")}
        ${tabButton("events", "Events", "timeline", eventBadge)}
        ${tabButton("notes", "Notes", "note")}
        ${tabButton("settings", "Settings", "cog")}
      </nav>
      <div class="zimamod-resource-alerts-panel" data-live-section="tab">
        ${activeTab === "events" ? eventsTabHtml() : activeTab === "notes" ? notesTabHtml() : activeTab === "settings" ? settingsTabHtml() : statusTabHtml()}
      </div>
    `;
  }

  function thresholdField(key, label) {
    return numberField(key, label, config.thresholds[key], 1, 100);
  }

  function numberField(key, label, value, min, max) {
    return `
      <label class="zimamod-resource-alerts-field">${label}
        <input data-config="${key}" type="number" min="${min}" max="${max}" value="${escapeHtml(value)}">
      </label>
    `;
  }

  function selectField(key, label, enabled) {
    return `
      <label class="zimamod-resource-alerts-field">${label}
        <select data-config="${key}">
          <option value="true" ${enabled ? "selected" : ""}>Enabled</option>
          <option value="false" ${!enabled ? "selected" : ""}>Disabled</option>
        </select>
      </label>
    `;
  }

  function textField(key, label, value) {
    return `
      <label class="zimamod-resource-alerts-field">${label}
        <input data-config="${key}" type="text" value="${escapeHtml(value)}">
      </label>
    `;
  }

  function checkRow(check = { name: "", url: "", enabled: true }) {
    const method = check.method || "HTTP";
    const target = check.target || check.url || "";
    return `
      <div class="zimamod-resource-alerts-row" data-method="${escapeHtml(method)}">
        <input data-field="name" type="text" placeholder="Name" value="${escapeHtml(check.name)}">
        <select data-field="method">
          ${["HTTP", "TCP", "Process"].map(value => `<option value="${value}" ${method === value ? "selected" : ""}>${value}</option>`).join("")}
        </select>
        <input data-field="url" type="url" placeholder="https://service.local/health" value="${escapeHtml(check.url)}">
        <input data-field="target" type="text" placeholder="Port, URL, or process name" value="${escapeHtml(target)}">
        <label><input data-field="enabled" type="checkbox" ${check.enabled ? "checked" : ""}> Enabled</label>
        <button type="button" data-action="remove-check">Remove</button>
      </div>
    `;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function modalConfig() {
    return normalizeConfig({
      theme: configValue("theme", config.theme),
      notes: configValue("notes", config.notes),
      refreshInterval: configValue("refreshInterval", config.refreshInterval),
      cooldownMinutes: configValue("cooldownMinutes", config.cooldownMinutes),
      thresholds: {
        cpuWarn: configValue("cpuWarn", config.thresholds.cpuWarn),
        cpuCritical: configValue("cpuCritical", config.thresholds.cpuCritical),
        ramWarn: configValue("ramWarn", config.thresholds.ramWarn),
        ramCritical: configValue("ramCritical", config.thresholds.ramCritical),
        diskWarn: configValue("diskWarn", config.thresholds.diskWarn),
        diskCritical: configValue("diskCritical", config.thresholds.diskCritical),
        tempWarn: configValue("tempWarn", config.thresholds.tempWarn),
        tempCritical: configValue("tempCritical", config.thresholds.tempCritical)
      },
      events: {
        defaultShown: configValue("eventsDefaultShown", config.events.defaultShown),
        loadAllLimit: configValue("eventsLoadAllLimit", config.events.loadAllLimit)
      },
      notifications: {
        browser: configValue("browser", config.notifications.browser ? "true" : "false") === "true",
        sound: configValue("sound", config.notifications.sound ? "true" : "false") === "true",
        telegram: {
          enabled: configValue("telegramEnabled", config.notifications.telegram.enabled ? "true" : "false") === "true",
          botToken: configValue("telegramBotToken", config.notifications.telegram.botToken),
          chatId: configValue("telegramChatId", config.notifications.telegram.chatId)
        },
        gotify: {
          enabled: configValue("gotifyEnabled", config.notifications.gotify.enabled ? "true" : "false") === "true",
          url: configValue("gotifyUrl", config.notifications.gotify.url),
          token: configValue("gotifyToken", config.notifications.gotify.token)
        }
      },
      checks: checksFromModal()
    });
  }

  function renderModalBody() {
    const modal = document.getElementById(MODAL_ID);
    const body = modal?.querySelector("[data-modal-body]");
    if (body) body.innerHTML = modalSectionHtml();
    bindModalActions();
  }

  function updateModalStatus() {
    const modal = document.getElementById(MODAL_ID);
    if (!modal) return;
    if (activeTab === "settings" || activeTab === "notes") return;
    const body = modal.querySelector("[data-modal-body]");
    if (body) {
      body.innerHTML = modalSectionHtml();
      bindModalActions();
    }
  }

  function bindModalActions() {
    const modal = document.getElementById(MODAL_ID);
    if (!modal) return;
    modal.querySelectorAll(".zimamod-resource-alerts-row").forEach(row => {
      const method = row.querySelector("[data-field='method']");
      const syncRowMethod = () => {
        row.dataset.method = method?.value || "HTTP";
      };
      syncRowMethod();
      method?.addEventListener("change", syncRowMethod);
    });
    modal.querySelectorAll("[data-action='remove-check']").forEach(button => {
      button.addEventListener("click", () => button.closest(".zimamod-resource-alerts-row")?.remove());
    });
    modal.querySelectorAll("[data-tab]").forEach(button => {
      button.addEventListener("click", () => {
        activeTab = button.dataset.tab || "status";
        if (activeTab !== "events") eventsExpanded = false;
        renderModalBody();
      });
    });
    modal.querySelector("[data-action='load-events']")?.addEventListener("click", () => {
      activeTab = "events";
      eventsPage = eventsExpanded ? eventsPage + 1 : 1;
      eventsExpanded = true;
      renderModalBody();
    });
    modal.querySelector("[data-action='clear-events']")?.addEventListener("click", () => {
      if (!window.confirm("Clear all Resource Alerts events? This cannot be undone.")) return;
      Promise.resolve()
        .then(() => window.ZimaMOD?.clearResourceAlertsEvents ? window.ZimaMOD.clearResourceAlertsEvents() : null)
        .catch(error => console.warn("[ZimaMOD Resource Alerts] Failed to clear server events", error))
        .finally(async () => {
          state.events = [];
          state.active = {};
          state.lastSent = {};
          eventsPage = 1;
          eventsExpanded = false;
          saveState();
          await evaluateNow();
          renderModalBody();
          renderWidget(lastSnapshot);
        });
    });
    modal.querySelector("[data-action='add-check']")?.addEventListener("click", () => {
      const list = modal.querySelector(".zimamod-resource-alerts-checks");
      list?.insertAdjacentHTML("beforeend", checkRow());
      const row = list?.lastElementChild;
      const method = row?.querySelector("[data-field='method']");
      method?.addEventListener("change", () => {
        row.dataset.method = method.value || "HTTP";
      });
      row?.querySelector("[data-action='remove-check']")?.addEventListener("click", () => row.remove());
    });
    modal.querySelector("[data-action='save']")?.addEventListener("click", async () => {
      await saveConfig(modalConfig());
      closeModal();
    });
    modal.querySelector("[data-action='refresh']")?.addEventListener("click", async () => {
      try {
        if (window.ZimaMOD?.runResourceAlertsCheck) await window.ZimaMOD.runResourceAlertsCheck();
      } catch (error) {
        console.warn("[ZimaMOD Resource Alerts] Server refresh failed", error);
      }
      await evaluateNow();
    });
    modal.querySelector("[data-action='close']")?.addEventListener("click", closeModal);
    modal.querySelector(".zimamod-resource-alerts-backdrop")?.addEventListener("click", closeModal);
  }

  function openModal() {
    document.getElementById(MODAL_ID)?.remove();
    const modal = document.createElement("div");
    modal.id = MODAL_ID;
    modal.className = "zimamod-resource-alerts-modal";
    modal.innerHTML = `
      <div class="zimamod-resource-alerts-backdrop"></div>
      <div class="zimamod-resource-alerts-dialog" role="dialog" aria-modal="true" aria-labelledby="zimamod-resource-alerts-title">
        <header>
          <div>
            <div class="zimamod-resource-alerts-kicker">System health</div>
            <h2 id="zimamod-resource-alerts-title">Resource Alerts</h2>
            <p>Monitor host resources from the ZimaMOD metrics API, simple service checks, and alert delivery settings.</p>
          </div>
          <button class="zimamod-resource-alerts-close" type="button" data-action="close" aria-label="Close">×</button>
        </header>
        <div data-modal-body>${modalSectionHtml()}</div>
        <div class="zimamod-resource-alerts-actions">
          <button class="secondary" type="button" data-action="refresh">Refresh now</button>
          <button type="button" data-action="save">Save</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    bindModalActions();
  }

  function closeModal() {
    document.getElementById(MODAL_ID)?.remove();
  }

  async function start() {
    loadState();
    await loadConfig();
    mountWidget();
    renderWidget(null);
    await evaluateNow();
    schedule();

    const observer = new MutationObserver(() => {
      mountWidget();
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  start().catch(error => {
    console.error("[ZimaMOD Resource Alerts] Failed to start", error);
  });
})();
