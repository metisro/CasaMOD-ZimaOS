(function CasaMODZimaOSLoader() {
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

  if (document.documentElement.dataset.casamodZimaosLoaded === "true") return;
  document.documentElement.dataset.casamodZimaosLoaded = "true";

  const API_BASE = "/casamod-api";
  const MOD_BASE = "/mod";

  window.CasaMODZimaOS = {
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
    }
  };

  function loadStyle(url, modId) {
    if (document.querySelector(`link[data-casamod-zimaos="${modId}"][href="${url}"]`)) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = url;
    link.dataset.casamodZimaos = modId;
    document.head.appendChild(link);
  }

  function loadScript(url, modId) {
    if (document.querySelector(`script[data-casamod-zimaos="${modId}"][src="${url}"]`)) return;
    const script = document.createElement("script");
    script.src = url;
    script.dataset.casamodZimaos = modId;
    document.body.appendChild(script);
  }

  fetch(`${API_BASE}/mods`, { credentials: "include", cache: "no-store" })
    .then(response => {
      if (!response.ok) throw new Error(`Mod registry failed: ${response.status}`);
      return response.json();
    })
    .then(({ mods }) => {
      for (const mod of mods || []) {
        for (const style of mod.styles || []) {
          loadStyle(window.CasaMODZimaOS.assetUrl(mod.id, style), mod.id);
        }
        for (const script of mod.scripts || []) {
          loadScript(window.CasaMODZimaOS.assetUrl(mod.id, script), mod.id);
        }
      }
    })
    .catch(error => console.error("[CasaMOD-ZimaOS]", error));
})();
