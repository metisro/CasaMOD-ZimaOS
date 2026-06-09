(function ZimaMODStore() {
  "use strict";

  if (window !== window.top || document.documentElement.dataset.zimamodStoreLoaded === "true") return;
  document.documentElement.dataset.zimamodStoreLoaded = "true";

  const BUTTON_CLASS = "zimamod-store-launcher";
  const MODAL_ID = "zimamod-store-modal";

  function allRoots() {
    const roots = [document];
    for (const element of document.querySelectorAll("*")) {
      if (element.shadowRoot) roots.push(element.shadowRoot);
    }
    return roots;
  }

  function allElements(selector) {
    return allRoots().flatMap(root => Array.from(root.querySelectorAll(selector)));
  }

  function tileCandidate(element) {
    let candidate = element.parentElement;
    const candidates = [];
    for (let depth = 0; candidate && depth < 6; depth++, candidate = candidate.parentElement) {
      const rect = candidate.getBoundingClientRect();
      if (
        rect.width >= 130 &&
        rect.width <= 420 &&
        rect.height >= 130 &&
        rect.height <= 360 &&
        Math.abs(rect.width - rect.height) <= Math.max(rect.width, rect.height) * .45
      ) {
        candidates.push(candidate);
      }
    }
    return candidates[0] || null;
  }

  function titleElement() {
    return allElements("a.block.one-line.max-w-36")
      .find(element => /^zimamod$/i.test((element.textContent || "").trim())) || null;
  }

  function findAppTile() {
    const title = titleElement();
    if (title) return tileCandidate(title);

    const icon = allElements("img")
      .find(image => /zimamod-icon|metisro\/zimamod/i.test(image.src));
    if (icon) return tileCandidate(icon);

    const labeled = allElements("[title], [aria-label]")
      .find(element => /^zimamod$/i.test(element.getAttribute("title") || element.getAttribute("aria-label") || ""));
    if (labeled) return tileCandidate(labeled);

    return allElements("span, div, p")
      .filter(element => element.children.length === 0 && /^zimamod$/i.test((element.textContent || "").trim()))
      .map(tileCandidate)
      .find(Boolean) || null;
  }

  function showLauncher(button) {
    button.style.opacity = "1";
    button.style.pointerEvents = "auto";
    button.style.transform = "translate(-50%, 0)";
  }

  function hideLauncher(button) {
    if (document.activeElement === button) return;
    button.style.opacity = "0";
    button.style.pointerEvents = "none";
    button.style.transform = "translate(-50%, 5px)";
  }

  function mountLauncher() {
    const launchers = allElements("." + BUTTON_CLASS);
    if (launchers.length) {
      launchers.slice(1).forEach(element => element.remove());
      return;
    }
    const tile = findAppTile();
    if (!tile) return;
    const title = titleElement();

    tile.style.position = "relative";
    const button = document.createElement("button");
    button.className = BUTTON_CLASS;
    button.type = "button";
    button.textContent = "MOD Store";
    button.style.cssText = [
      "position:absolute",
      "z-index:20",
      "left:50%",
      "bottom:25px",
      "padding:6px 13px",
      "border:1px solid rgba(112,225,255,.55)",
      "border-radius:999px",
      "color:#effcff",
      "background:rgba(5,16,40,.9)",
      "box-shadow:0 5px 20px rgba(0,0,0,.35)",
      "font:600 12px/1.2 system-ui,sans-serif",
      "white-space:nowrap",
      "cursor:pointer",
      "opacity:0",
      "pointer-events:none",
      "transform:translate(-50%,5px)",
      "transition:opacity .18s ease,transform .18s ease,background .18s ease"
    ].join(";");
    button.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      void openStore();
    });
    button.addEventListener("focus", () => showLauncher(button));
    button.addEventListener("blur", () => hideLauncher(button));
    tile.addEventListener("mouseenter", () => showLauncher(button));
    tile.addEventListener("mouseleave", () => hideLauncher(button));
    if (title && title.parentElement === tile) tile.insertBefore(button, title);
    else tile.appendChild(button);
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

  window.ZimaMOD.openStore = openStore;
  window.ZimaMOD.closeStore = closeStore;

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
