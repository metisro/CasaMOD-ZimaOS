(function ZimaMODStore() {
  "use strict";

  if (window !== window.top || document.documentElement.dataset.zimamodStoreLoaded === "true") return;
  document.documentElement.dataset.zimamodStoreLoaded = "true";

  const BUTTON_CLASS = "zimamod-store-launcher";
  const MODAL_ID = "zimamod-store-modal";

  function tileCandidate(element) {
    let candidate = element.parentElement;
    for (let depth = 0; candidate && depth < 6; depth++, candidate = candidate.parentElement) {
      const rect = candidate.getBoundingClientRect();
      if (rect.width >= 70 && rect.width <= 420 && rect.height >= 70 && rect.height <= 360) return candidate;
    }
    return null;
  }

  function findAppTile() {
    const icon = Array.from(document.querySelectorAll("img"))
      .find(image => /zimamod-icon|metisro\/zimamod/i.test(image.src));
    if (icon) return tileCandidate(icon);

    const labeled = Array.from(document.querySelectorAll("[title], [aria-label]"))
      .find(element => /^zimamod$/i.test(element.getAttribute("title") || element.getAttribute("aria-label") || ""));
    if (labeled) return tileCandidate(labeled);

    return Array.from(document.querySelectorAll("span, div, p"))
      .filter(element => element.children.length === 0 && /^zimamod$/i.test((element.textContent || "").trim()))
      .map(tileCandidate)
      .find(Boolean) || null;
  }

  function mountLauncher() {
    if (document.querySelector("." + BUTTON_CLASS)) return;
    const tile = findAppTile();
    if (!tile) return;

    tile.classList.add("zimamod-store-tile");
    const button = document.createElement("button");
    button.className = BUTTON_CLASS;
    button.type = "button";
    button.textContent = "MOD Store";
    button.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      void openStore();
    });
    tile.appendChild(button);
  }

  function storeAsset(mod, relativePath) {
    return `/store/${encodeURIComponent(mod.id)}/${String(relativePath).replace(/^\/+/, "")}`;
  }

  function modalShell() {
    let modal = document.getElementById(MODAL_ID);
    if (modal) return modal;

    modal = document.createElement("div");
    modal.id = MODAL_ID;
    modal.innerHTML = `
      <div class="zimamod-store-backdrop"></div>
      <section class="zimamod-store-dialog" role="dialog" aria-modal="true" aria-labelledby="zimamod-store-title">
        <header>
          <div>
            <span class="zimamod-store-kicker">ZimaMOD</span>
            <h2 id="zimamod-store-title">MOD Store</h2>
          </div>
          <button class="zimamod-store-close" type="button" aria-label="Close MOD Store">&times;</button>
        </header>
        <div class="zimamod-store-status">Loading available mods...</div>
        <div class="zimamod-store-grid"></div>
      </section>
    `;
    modal.querySelector(".zimamod-store-backdrop").addEventListener("click", closeStore);
    modal.querySelector(".zimamod-store-close").addEventListener("click", closeStore);
    document.body.appendChild(modal);
    return modal;
  }

  function closeStore() {
    document.getElementById(MODAL_ID)?.remove();
  }

  function modCard(mod) {
    const card = document.createElement("article");
    card.className = "zimamod-store-card";
    const media = mod.screenshot
      ? `<img src="${storeAsset(mod, mod.screenshot)}" alt="${escapeHtml(mod.name)} screenshot">`
      : `<div class="zimamod-store-fallback">${escapeHtml(mod.name.slice(0, 1).toUpperCase())}</div>`;
    card.innerHTML = `
      <div class="zimamod-store-media">${media}</div>
      <div class="zimamod-store-copy">
        <div class="zimamod-store-card-heading">
          <h3>${escapeHtml(mod.name)}</h3>
          <span>v${escapeHtml(mod.version)}</span>
        </div>
        <p>${escapeHtml(mod.description || "A ZimaMOD dashboard extension.")}</p>
        <button type="button" class="${mod.installed ? "is-installed" : ""}">
          ${mod.installed ? "Uninstall" : "Install"}
        </button>
      </div>
    `;
    card.querySelector("button").addEventListener("click", () => void changeInstallation(mod, card));
    return card;
  }

  async function changeInstallation(mod, card) {
    const button = card.querySelector("button");
    button.disabled = true;
    button.textContent = mod.installed ? "Uninstalling..." : "Installing...";
    try {
      if (mod.installed) await window.ZimaMOD.uninstallMod(mod.id);
      else await window.ZimaMOD.installMod(mod.id);
      mod.installed = !mod.installed;
      button.classList.toggle("is-installed", mod.installed);
      button.textContent = mod.installed ? "Uninstall" : "Install";
      modalShell().querySelector(".zimamod-store-status").textContent =
        "Reload the dashboard to apply the MOD Store change.";
    } catch (error) {
      button.textContent = mod.installed ? "Uninstall" : "Install";
      modalShell().querySelector(".zimamod-store-status").textContent = error.message;
    } finally {
      button.disabled = false;
    }
  }

  async function openStore() {
    const modal = modalShell();
    const status = modal.querySelector(".zimamod-store-status");
    const grid = modal.querySelector(".zimamod-store-grid");
    try {
      const mods = await window.ZimaMOD.listStore();
      grid.replaceChildren(...mods.map(modCard));
      status.textContent = mods.length
        ? `${mods.length} mod${mods.length === 1 ? "" : "s"} available`
        : "No mods are available in the store.";
    } catch (error) {
      status.textContent = error.message;
    }
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

  const observer = new MutationObserver(() => {
    clearTimeout(observer.timer);
    observer.timer = setTimeout(mountLauncher, 200);
  });
  observer.observe(document.body, { childList: true, subtree: true });
  mountLauncher();
})();
