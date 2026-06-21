// ZimaMOD Dashboard Themes

(function ZimaMODDashboardThemes() {
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

  const MOD_ID = "zimamod-dashboard-themes";
  const ASSET_MOD_ID = "dashboard-themes";
  const CONFIG_ID = "dashboard-themes";
  const FILTER_SVG_ID = MOD_ID + "-svg";
  const FILTER_ID = MOD_ID + "-distortion";
  const MODAL_ID = MOD_ID + "-modal";
  const SHADOW_STYLE_ID = MOD_ID + "-shadow-style";
  const SHADOW_THEME_STYLE_ID = MOD_ID + "-shadow-theme-style";
  const SURFACE_CLASS = MOD_ID + "-surface";
  const APP_CLASS = MOD_ID + "-app";
  const HANDLE_CLASS = MOD_ID + "-handle";
  const WIDGET_CLASS = MOD_ID + "-widget";
  const SEARCH_CLASS = MOD_ID + "-search";
  const HEADER_CLASS = MOD_ID + "-header";
  const DEFAULT_THEME = "sanded-glass";

  const THEMES = {
    "sanded-glass": {
      label: "Sanded Glass",
      description: "Soft brushed glass with the flicker fixes from the original dashboard mod.",
      file: "themes/sanded-glass.css",
      shadowFile: "themes/sanded-glass.css"
    },
    "liquid-glass": {
      label: "Liquid Glass",
      description: "macOS-inspired refractive glass adapted from the Weather Widget Liquid Glass theme.",
      file: "themes/liquid-glass.css",
      shadowFile: "themes/liquid-glass.css"
    },
    aero: {
      label: "Aero",
      description: "Windows 7 style blue glass adapted from the Weather Widget Aero theme.",
      file: "themes/aero.css",
      shadowFile: "themes/aero.css"
    },
    casaos: {
      label: "CasaOS",
      description: "Dark CasaOS-style dashboard material adapted from the Weather Widget CasaOS theme.",
      file: "themes/casaos.css",
      shadowFile: "themes/casaos.css"
    },
    chaos: {
      label: "Chaos",
      description: "A high-energy neon glass theme created for Dashboard Themes.",
      file: "themes/chaos.css",
      shadowFile: "themes/chaos.css"
    }
  };

  const configuredShadowRoots = new WeakSet();
  let state = { theme: DEFAULT_THEME };

  if (document.documentElement.dataset.zimamodDashboardThemes === "true") return;
  document.documentElement.dataset.zimamodDashboardThemes = "true";
  delete document.documentElement.dataset.zimamodBrushedGlassDashboard;
  delete document.documentElement.dataset.zimamodLiquidGlassDashboard;

  function validTheme(theme) {
    return THEMES[theme] ? theme : DEFAULT_THEME;
  }

  function injectFilter() {
    if (document.getElementById(FILTER_SVG_ID)) return;

    const namespace = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(namespace, "svg");
    const defs = document.createElementNS(namespace, "defs");
    const filter = document.createElementNS(namespace, "filter");
    const turbulence = document.createElementNS(namespace, "feTurbulence");
    const displacement = document.createElementNS(namespace, "feDisplacementMap");

    svg.id = FILTER_SVG_ID;
    svg.setAttribute("aria-hidden", "true");
    Object.assign(svg.style, {
      height: "0",
      overflow: "hidden",
      pointerEvents: "none",
      position: "absolute",
      width: "0"
    });

    filter.id = FILTER_ID;
    filter.setAttribute("x", "-12%");
    filter.setAttribute("y", "-12%");
    filter.setAttribute("width", "124%");
    filter.setAttribute("height", "124%");
    filter.setAttribute("color-interpolation-filters", "sRGB");

    turbulence.setAttribute("type", "fractalNoise");
    turbulence.setAttribute("baseFrequency", "0.012 0.028");
    turbulence.setAttribute("numOctaves", "2");
    turbulence.setAttribute("seed", "17");
    turbulence.setAttribute("result", "dashboard-theme-noise");

    displacement.setAttribute("in", "SourceGraphic");
    displacement.setAttribute("in2", "dashboard-theme-noise");
    displacement.setAttribute("scale", "7");
    displacement.setAttribute("xChannelSelector", "R");
    displacement.setAttribute("yChannelSelector", "B");

    filter.appendChild(turbulence);
    filter.appendChild(displacement);
    defs.appendChild(filter);
    svg.appendChild(defs);
    document.body.appendChild(svg);
  }

  function findAll(root, selector) {
    const matches = [];
    if (root.nodeType === Node.ELEMENT_NODE && root.matches?.(selector)) matches.push(root);
    root.querySelectorAll?.(selector).forEach(element => matches.push(element));
    return matches;
  }

  function setThemeAttributes(theme) {
    const selected = validTheme(theme);
    const root = document.documentElement;
    root.dataset.zimamodDashboardTheme = selected;
    Object.keys(THEMES).forEach(item => root.classList.remove(`${MOD_ID}-theme-${item}`));
    root.classList.add(`${MOD_ID}-theme-${selected}`);

    document.querySelectorAll("wujie-app").forEach(host => {
      host.dataset.zimamodDashboardTheme = selected;
    });
  }

  function assetUrl(relativePath) {
    return window.ZimaMOD?.assetUrl
      ? window.ZimaMOD.assetUrl(ASSET_MOD_ID, relativePath)
      : `/mod/${encodeURIComponent(ASSET_MOD_ID)}/${String(relativePath).replace(/^\/+/, "")}`;
  }

  function loadThemeCss(theme) {
    const selected = validTheme(theme);
    const id = `${MOD_ID}-theme-css`;
    const link = document.getElementById(id) || document.createElement("link");
    const href = assetUrl(THEMES[selected].file);

    if (!link.id) {
      link.id = id;
      link.rel = "stylesheet";
      link.dataset.zimamodDashboardThemes = "theme";
      document.head.appendChild(link);
    }

    if (link.getAttribute("href") !== href) link.setAttribute("href", href);
  }

  function loadShadowThemeCss(shadowRoot, theme) {
    const selected = validTheme(theme);
    const host = shadowRoot.host;
    const id = SHADOW_THEME_STYLE_ID;
    const link = shadowRoot.getElementById(id) || document.createElement("link");
    const href = assetUrl(THEMES[selected].shadowFile || THEMES[selected].file);

    host.dataset.zimamodDashboardTheme = selected;
    if (!link.id) {
      link.id = id;
      link.rel = "stylesheet";
      link.dataset.zimamodDashboardThemes = "theme";
      shadowRoot.prepend(link);
    }

    if (link.getAttribute("href") !== href) link.setAttribute("href", href);
  }

  function applyTheme(theme) {
    const selected = validTheme(theme);
    setThemeAttributes(selected);
    loadThemeCss(selected);
    document.querySelectorAll("wujie-app").forEach(element => {
      if (element.shadowRoot) loadShadowThemeCss(element.shadowRoot, selected);
    });
    updateSettingsSelection(selected);
    return selected;
  }

  function hasDashboardContext(element) {
    return Boolean(
      element.closest("#app") ||
      element.closest("[class*='dashboard']") ||
      element.closest("[class*='desktop']")
    );
  }

  const BG_HEX_RE = /^bg-\[#[0-9a-fA-F]+\]$/;

  function getNativeBgClass(element) {
    return [...element.classList].find(className => BG_HEX_RE.test(className));
  }

  function isNativeWidgetSurface(element) {
    return (
      element.classList.contains("rounded-lg") &&
      getNativeBgClass(element) !== undefined &&
      element.classList.contains("shadow-pale-blur") &&
      element.classList.contains("backdrop-blur-sm") &&
      element.classList.contains("backdrop-saturate-180")
    );
  }

  function markAppSurfaces(root) {
    findAll(root, ".blur-background").forEach(element => {
      if (element.closest(".zimamod-weather")) return;

      const card = element.parentElement;
      if (card && card !== root.body) {
        card.classList.add(SURFACE_CLASS, APP_CLASS);
      }

      const handle = card?.parentElement;
      if (handle && handle !== root.body) {
        handle.classList.add(HANDLE_CLASS);
      }

      element.remove();
    });
  }

  function markWidgetSurfaces(root = document) {
    findAll(root, ".rounded-lg").forEach(element => {
      if (!hasDashboardContext(element)) return;
      if (!isNativeWidgetSurface(element)) return;
      if (element.closest(".zimamod-weather")) return;

      const bgClass = getNativeBgClass(element);
      if (bgClass) element.classList.remove(bgClass);
      element.classList.remove(
        "rounded-lg",
        "shadow-pale-blur",
        "backdrop-blur-sm",
        "backdrop-saturate-180"
      );

      element.classList.add(SURFACE_CLASS, WIDGET_CLASS);
    });
  }

  function markSearchSurfaces(root = document) {
    findAll(root, ".bg-blur").forEach(element => {
      if (!hasDashboardContext(element)) return;
      element.classList.remove("bg-blur");
      element.classList.add(SURFACE_CLASS, SEARCH_CLASS);
    });
  }

  function markHeaderSurface() {
    const header = document.getElementById("page-header");
    if (!header) return;
    header.classList.remove("bg-white", "dark:bg-neutral-700");
    header.classList.add(SURFACE_CLASS, HEADER_CLASS);
  }

  function injectShadowStyles(shadowRoot) {
    if (shadowRoot.getElementById(SHADOW_STYLE_ID)) return;

    const style = document.createElement("style");
    style.id = SHADOW_STYLE_ID;
    style.textContent = `
      .${HANDLE_CLASS} {
        position: relative;
        border-radius: var(--dtm-radius);
        isolation: isolate;
      }

      .${HANDLE_CLASS}::before {
        content: "";
        position: absolute;
        inset: 1px;
        z-index: 1;
        border-radius: inherit;
        background:
          radial-gradient(ellipse 85% 24% at 45% -2%, var(--dtm-gloss-a), transparent 70%),
          radial-gradient(ellipse 28% 105% at -4% 52%, var(--dtm-gloss-b), transparent 72%),
          radial-gradient(ellipse 32% 95% at 104% 48%, var(--dtm-gloss-c), transparent 74%),
          linear-gradient(118deg, rgba(255, 255, 255, .22), transparent 20% 74%, rgba(255, 255, 255, .10));
        pointer-events: none;
      }

      .${APP_CLASS} {
        position: relative !important;
        overflow: hidden !important;
        color: var(--dtm-text) !important;
        border: 1px solid var(--dtm-border) !important;
        border-radius: var(--dtm-card-radius) !important;
        background: var(--dtm-frame) !important;
        box-shadow:
          inset 1px 1px 0 rgba(255, 255, 255, .58),
          inset -1px -1px 0 rgba(255, 255, 255, .10),
          inset 0 0 20px rgba(255, 255, 255, .045),
          0 14px 34px rgba(0, 13, 35, .22) !important;
      }

      .${APP_CLASS}::before {
        content: "";
        position: absolute;
        inset: 1px;
        z-index: 1;
        border-radius: inherit;
        background:
          radial-gradient(ellipse 85% 24% at 45% -2%, var(--dtm-gloss-a), transparent 70%),
          radial-gradient(ellipse 28% 105% at -4% 52%, var(--dtm-gloss-b), transparent 72%),
          radial-gradient(ellipse 32% 95% at 104% 48%, var(--dtm-gloss-c), transparent 74%),
          linear-gradient(118deg, rgba(255, 255, 255, .22), transparent 20% 74%, rgba(255, 255, 255, .10));
        pointer-events: none;
      }

      .${APP_CLASS} > .cards-content {
        position: relative;
        z-index: 2;
      }

      .aspect-square.${APP_CLASS},
      .${APP_CLASS}.aspect-square {
        backdrop-filter: var(--dtm-app-filter, var(--dtm-blur) saturate(165%));
        -webkit-backdrop-filter: var(--dtm-app-filter, var(--dtm-blur) saturate(165%));
        transform: translateZ(0);
        will-change: transform;
      }
    `;

    shadowRoot.prepend(style);
  }

  function setupShadowRoot(shadowRoot) {
    const host = shadowRoot.host;
    const selected = validTheme(state.theme);
    host.dataset.zimamodDashboardTheme = selected;
    injectShadowStyles(shadowRoot);
    loadShadowThemeCss(shadowRoot, selected);
    markAppSurfaces(shadowRoot);

    if (configuredShadowRoots.has(shadowRoot)) return;
    configuredShadowRoots.add(shadowRoot);

    const observer = new MutationObserver(records => {
      for (const record of records) {
        record.addedNodes.forEach(node => {
          if (node.nodeType === Node.ELEMENT_NODE) markAppSurfaces(node);
        });
      }
    });
    observer.observe(shadowRoot, { childList: true, subtree: true });
  }

  function attachToWujieApps() {
    let attached = false;
    document.querySelectorAll("wujie-app").forEach(element => {
      if (!element.shadowRoot) return;
      setupShadowRoot(element.shadowRoot);
      attached = true;
    });
    return attached;
  }

  function refreshTopDocument(root = document) {
    markWidgetSurfaces(root);
    markSearchSurfaces(root);
    markHeaderSurface();
  }

  function observeTopDocument() {
    const observer = new MutationObserver(records => {
      for (const record of records) {
        record.addedNodes.forEach(node => {
          if (node.nodeType !== Node.ELEMENT_NODE) return;
          refreshTopDocument(node);
          if (node.tagName === "WUJIE-APP" || node.querySelector?.("wujie-app")) attachToWujieApps();
        });
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  function themeOption([value, theme]) {
    return `
      <label class="${MOD_ID}-theme-card">
        <input type="radio" name="${MOD_ID}-theme" value="${escapeHtml(value)}">
        <span class="${MOD_ID}-preview ${MOD_ID}-preview-${escapeHtml(value)}"></span>
        <span class="${MOD_ID}-theme-copy">
          <strong>${escapeHtml(theme.label)}</strong>
          <small>${escapeHtml(theme.description)}</small>
        </span>
      </label>
    `;
  }

  function updateSettingsSelection(theme) {
    const modal = document.getElementById(MODAL_ID);
    if (!modal) return;
    modal.querySelectorAll(`input[name="${MOD_ID}-theme"]`).forEach(input => {
      input.checked = input.value === theme;
    });
  }

  function closeSettings(revertTheme = false) {
    if (revertTheme) applyTheme(state.theme);
    document.getElementById(MODAL_ID)?.remove();
  }

  function openSettings() {
    let modal = document.getElementById(MODAL_ID);
    if (modal) {
      updateSettingsSelection(document.documentElement.dataset.zimamodDashboardTheme || state.theme);
      return modal;
    }

    modal = document.createElement("div");
    modal.id = MODAL_ID;
    modal.innerHTML = `
      <div class="${MOD_ID}-backdrop"></div>
      <section class="${MOD_ID}-dialog" role="dialog" aria-modal="true" aria-labelledby="${MOD_ID}-title">
        <header>
          <div>
            <span class="${MOD_ID}-kicker">Dashboard Theme Manager</span>
            <h2 id="${MOD_ID}-title">DTM Settings</h2>
            <p>Choose a dashboard-wide visual theme for native widgets, apps, search, and header surfaces.</p>
          </div>
          <button type="button" class="${MOD_ID}-close" aria-label="Close DTM Settings">&times;</button>
        </header>
        <form class="${MOD_ID}-form">
          <div class="${MOD_ID}-theme-grid">
            ${Object.entries(THEMES).map(themeOption).join("")}
          </div>
          <p class="${MOD_ID}-status" aria-live="polite">Theme changes are previewed immediately. Save to keep them after reload.</p>
          <div class="${MOD_ID}-actions">
            <button type="button" class="${MOD_ID}-cancel">Cancel</button>
            <button type="submit" class="${MOD_ID}-save">Save theme</button>
          </div>
        </form>
      </section>
    `;

    modal.querySelector(`.${MOD_ID}-backdrop`).addEventListener("click", () => closeSettings(true));
    modal.querySelector(`.${MOD_ID}-close`).addEventListener("click", () => closeSettings(true));
    modal.querySelector(`.${MOD_ID}-cancel`).addEventListener("click", () => closeSettings(true));
    modal.addEventListener("keydown", event => {
      if (event.key === "Escape") closeSettings(true);
    });
    modal.querySelectorAll(`input[name="${MOD_ID}-theme"]`).forEach(input => {
      input.addEventListener("change", () => applyTheme(input.value));
    });
    modal.querySelector(`.${MOD_ID}-form`).addEventListener("submit", async event => {
      event.preventDefault();
      const selected = validTheme(modal.querySelector(`input[name="${MOD_ID}-theme"]:checked`)?.value);
      const status = modal.querySelector(`.${MOD_ID}-status`);
      status.textContent = "Saving theme...";
      try {
        if (!window.ZimaMOD?.setConfig) throw new Error("ZimaMOD configuration API is unavailable");
        await window.ZimaMOD.setConfig(CONFIG_ID, { theme: selected });
        state.theme = selected;
        applyTheme(selected);
        status.textContent = `${THEMES[selected].label} saved.`;
        setTimeout(() => closeSettings(false), 650);
      } catch (error) {
        status.textContent = error.message || "Theme save failed.";
      }
    });

    document.body.appendChild(modal);
    updateSettingsSelection(document.documentElement.dataset.zimamodDashboardTheme || state.theme);
    modal.querySelector(`input[name="${MOD_ID}-theme"]:checked`)?.focus();
    return modal;
  }

  async function loadConfig() {
    try {
      const config = await window.ZimaMOD?.getConfig?.(CONFIG_ID, { theme: DEFAULT_THEME });
      state.theme = validTheme(config?.theme);
    } catch (error) {
      console.warn("[ZimaMOD Dashboard Themes] Failed to load theme config:", error);
      state.theme = DEFAULT_THEME;
    }
    applyTheme(state.theme);
  }

  function escapeHtml(value) {
    return String(value || "").replace(/[&<>"']/g, character => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[character]);
  }

  function start() {
    window.ZimaMODDashboardThemes = {
      themes: THEMES,
      openSettings,
      applyTheme,
      currentTheme: () => document.documentElement.dataset.zimamodDashboardTheme || state.theme
    };

    injectFilter();
    applyTheme(state.theme);
    void loadConfig();
    refreshTopDocument();
    attachToWujieApps();
    observeTopDocument();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
