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

  function writeToken() {
    return sessionStorage.getItem(TOKEN_KEY) || "";
  }

  function requestWriteToken() {
    const token = window.prompt("Enter the ZimaMOD API token to authorize this change:");
    if (!token) throw new Error("ZimaMOD write authorization cancelled");
    sessionStorage.setItem(TOKEN_KEY, token);
    return token;
  }

  async function writeRequest(url, options) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const token = writeToken() || requestWriteToken();
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

  loadStyle("/zimamod-runtime/store.css?v=1.1.22", "zimamod-store");
  loadScript("/zimamod-runtime/store.js?v=1.1.22", "zimamod-store");

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
