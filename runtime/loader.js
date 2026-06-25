(function ZimaMODLoader() {
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

  if (document.documentElement.dataset.zimamodLoaded === "true") return;
  document.documentElement.dataset.zimamodLoaded = "true";

  const API_BASE = "/zimamod-api";
  const MOD_BASE = "/mod";
  const TOKEN_KEY = "zimamod-api-token";
  const TOKEN_MODAL_ID = "zimamod-token-modal";
  let tokenRequest = null;

  function writeToken() {
    return sessionStorage.getItem(TOKEN_KEY) || "";
  }

  function requestWriteToken() {
    if (tokenRequest) return tokenRequest;

    tokenRequest = new Promise((resolve, reject) => {
      document.getElementById(TOKEN_MODAL_ID)?.remove();

      const modal = document.createElement("div");
      modal.id = TOKEN_MODAL_ID;
      modal.innerHTML = `
        <div class="zimamod-token-backdrop"></div>
        <section class="zimamod-token-dialog" role="dialog" aria-modal="true" aria-labelledby="zimamod-token-title">
          <div class="zimamod-token-mark" aria-hidden="true">
            <svg viewBox="0 0 24 24"><circle cx="8" cy="15" r="4"></circle><path d="m11 12 8-8m-3 3 2 2m-5 1 2 2"></path></svg>
          </div>
          <div class="zimamod-token-copy">
            <span class="zimamod-token-kicker">Secure ZimaMOD action</span>
            <h2 id="zimamod-token-title">Authorize this change</h2>
            <p>Paste the current API key to install, uninstall, or change MOD settings. The key is kept only for this browser session.</p>
          </div>
          <form class="zimamod-token-form">
            <label for="zimamod-token-input">API key</label>
            <div class="zimamod-token-input-row">
              <input id="zimamod-token-input" type="password" autocomplete="off" spellcheck="false" placeholder="Paste API key">
              <button class="zimamod-token-show" type="button" aria-label="Show API key">Show</button>
              <button class="zimamod-token-paste" type="button">Paste</button>
            </div>
            <span class="zimamod-token-help">Use <strong>Copy key</strong> in the MOD Store, then paste it here.</span>
            <span class="zimamod-token-error" role="alert" hidden>Enter an API key to continue.</span>
            <div class="zimamod-token-actions">
              <button class="zimamod-token-cancel" type="button">Cancel</button>
              <button class="zimamod-token-authorize" type="submit">Authorize</button>
            </div>
          </form>
        </section>
      `;

      const input = modal.querySelector("#zimamod-token-input");
      const error = modal.querySelector(".zimamod-token-error");
      const finish = (token, cancelled = false) => {
        modal.remove();
        tokenRequest = null;
        if (cancelled) {
          reject(new Error("ZimaMOD write authorization cancelled"));
          return;
        }
        sessionStorage.setItem(TOKEN_KEY, token);
        resolve(token);
      };
      const cancel = () => finish("", true);

      modal.querySelector(".zimamod-token-form").addEventListener("submit", event => {
        event.preventDefault();
        const token = input.value.trim();
        if (!token) {
          error.hidden = false;
          input.focus();
          return;
        }
        finish(token);
      });
      modal.querySelector(".zimamod-token-cancel").addEventListener("click", cancel);
      modal.querySelector(".zimamod-token-backdrop").addEventListener("click", cancel);
      modal.querySelector(".zimamod-token-show").addEventListener("click", event => {
        const show = input.type === "password";
        input.type = show ? "text" : "password";
        event.currentTarget.textContent = show ? "Hide" : "Show";
        event.currentTarget.setAttribute("aria-label", show ? "Hide API key" : "Show API key");
        input.focus();
      });
      modal.querySelector(".zimamod-token-paste").addEventListener("click", async () => {
        try {
          input.value = await navigator.clipboard.readText();
          error.hidden = true;
          input.focus();
        } catch (_) {
          error.textContent = "Clipboard access is unavailable. Paste the key manually.";
          error.hidden = false;
        }
      });
      modal.addEventListener("keydown", event => {
        if (event.key === "Escape") cancel();
      });

      document.body.appendChild(modal);
      input.focus();
    });

    return tokenRequest;
  }

  async function writeRequest(url, options) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const token = writeToken() || await requestWriteToken();
      const response = await fetch(url, {
        ...options,
        credentials: "include",
        headers: {
          ...options.headers,
          Authorization: `Bearer ${token}`
        }
      });
      if (response.status !== 401) return response;
      sessionStorage.removeItem(TOKEN_KEY);
    }
    throw new Error("Invalid ZimaMOD API token");
  }

  async function copyText(value) {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return;
    }
    const textarea = document.createElement("textarea");
    textarea.value = value;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand("copy");
    textarea.remove();
    if (!copied) throw new Error("Clipboard access unavailable");
  }

  window.ZimaMOD = {
    platform: "zimaos",
    clearWriteToken() {
      sessionStorage.removeItem(TOKEN_KEY);
    },
    async copyApiToken() {
      const dashboardToken = (() => {
        try {
          return document.querySelector("#app").__vue__.$store.state.access_token || "";
        } catch (_) {
          return localStorage.getItem("access_token") || "";
        }
      })();
      if (!dashboardToken) throw new Error("Copy key failed: sign in to ZimaOS first");
      const response = await fetch(`${API_BASE}/token`, {
        credentials: "include",
        cache: "no-store",
        headers: { Authorization: dashboardToken }
      });
      if (!response.ok) throw new Error(`Copy key failed: ${response.status}`);
      const token = String((await response.json()).token || "").trim();
      if (token.length < 32) throw new Error("Copy key failed: invalid API token");
      await copyText(token);
      return token;
    },
    assetUrl(modId, relativePath) {
      return `${MOD_BASE}/${encodeURIComponent(modId)}/${String(relativePath).replace(/^\/+/, "")}`;
    },
    async getConfig(modId, fallback = null) {
      const response = await fetch(`${API_BASE}/config/${encodeURIComponent(modId)}`, {
        credentials: "include",
        cache: "no-store"
      });
      if (!response.ok) return fallback;
      const body = await response.json();
      return body.config ?? fallback;
    },
    async setConfig(modId, config) {
      const response = await writeRequest(`${API_BASE}/config/${encodeURIComponent(modId)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config)
      });
      if (!response.ok) throw new Error(`Config write failed: ${response.status}`);
      return config;
    },
    async saveBingWallpaper(imageUrl) {
      const response = await writeRequest(`${API_BASE}/bing-wallpaper/save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrl })
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || `Wallpaper save failed: ${response.status}`);
      return body;
    },
    async listStore() {
      const response = await fetch(`${API_BASE}/store`, { credentials: "include", cache: "no-store" });
      if (!response.ok) throw new Error(`MOD Store failed: ${response.status}`);
      return (await response.json()).mods || [];
    },
    async getUpdateStatus(force = false) {
      const suffix = force ? "?refresh=1" : "";
      const response = await fetch(`${API_BASE}/update${suffix}`, { credentials: "include", cache: "no-store" });
      if (!response.ok) throw new Error(`Update check failed: ${response.status}`);
      return response.json();
    },
    async getSystemMetrics() {
      const response = await fetch(`${API_BASE}/metrics`, { credentials: "include", cache: "no-store" });
      if (!response.ok) throw new Error(`Metrics request failed: ${response.status}`);
      return response.json();
    },
    async getResourceAlertsState() {
      const response = await fetch(`${API_BASE}/resource-alerts`, { credentials: "include", cache: "no-store" });
      if (!response.ok) throw new Error(`Resource Alerts state failed: ${response.status}`);
      return response.json();
    },
    async runResourceAlertsCheck() {
      const response = await writeRequest(`${API_BASE}/resource-alerts/check`, { method: "POST" });
      if (!response.ok) throw new Error(`Resource Alerts check failed: ${response.status}`);
      return response.json();
    },
    async clearResourceAlertsEvents() {
      const response = await writeRequest(`${API_BASE}/resource-alerts/events`, { method: "DELETE" });
      if (!response.ok) throw new Error(`Resource Alerts clear failed: ${response.status}`);
      return response.json();
    },
    async installMod(modId) {
      const response = await writeRequest(`${API_BASE}/store/${encodeURIComponent(modId)}`, { method: "POST" });
      if (!response.ok) throw new Error(`Mod installation failed: ${response.status}`);
    },
    async uninstallMod(modId) {
      const response = await writeRequest(`${API_BASE}/store/${encodeURIComponent(modId)}`, { method: "DELETE" });
      if (!response.ok) throw new Error(`Mod uninstall failed: ${response.status}`);
    }
  };

  function loadStyle(url, modId) {
    if (document.querySelector(`link[data-zimamod="${modId}"][href="${url}"]`)) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = url;
    link.dataset.zimamod = modId;
    document.head.appendChild(link);
  }

  function loadScript(url, modId) {
    if (document.querySelector(`script[data-zimamod="${modId}"][src="${url}"]`)) return;
    const script = document.createElement("script");
    script.src = url;
    script.dataset.zimamod = modId;
    document.body.appendChild(script);
  }

  function versionedAssetUrl(mod, relativePath) {
    const url = new URL(window.ZimaMOD.assetUrl(mod.id, relativePath), window.location.origin);
    url.searchParams.set("v", mod.version || "1");
    return url.pathname + url.search;
  }

  loadStyle("/zimamod-runtime/store.css?v=1.1.35", "zimamod-store");
  loadScript("/zimamod-runtime/store.js?v=1.1.35", "zimamod-store");

  fetch(`${API_BASE}/mods`, { credentials: "include", cache: "no-store" })
    .then(response => {
      if (!response.ok) throw new Error(`Mod registry failed: ${response.status}`);
      return response.json();
    })
    .then(({ mods }) => {
      for (const mod of mods || []) {
        for (const style of mod.styles || []) {
          loadStyle(versionedAssetUrl(mod, style), mod.id);
        }
        for (const script of mod.scripts || []) {
          loadScript(versionedAssetUrl(mod, script), mod.id);
        }
      }
    })
    .catch(error => console.error("[ZimaMOD]", error));
})();
