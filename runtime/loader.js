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

  window.ZimaMOD = {
    platform: "zimaos",
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
      const response = await fetch(`${API_BASE}/config/${encodeURIComponent(modId)}`, {
        method: "PUT",
        credentials: "include",
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
    async installMod(modId) {
      const response = await fetch(`${API_BASE}/store/${encodeURIComponent(modId)}`, {
        method: "POST",
        credentials: "include"
      });
      if (!response.ok) throw new Error(`Mod installation failed: ${response.status}`);
    },
    async uninstallMod(modId) {
      const response = await fetch(`${API_BASE}/store/${encodeURIComponent(modId)}`, {
        method: "DELETE",
        credentials: "include"
      });
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

  loadStyle("/zimamod-runtime/store.css?v=1.1.3", "zimamod-store");
  loadScript("/zimamod-runtime/store.js?v=1.1.3", "zimamod-store");

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
