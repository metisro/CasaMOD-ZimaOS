(function ZimaMODStore() {
  "use strict";

  if (window !== window.top || document.documentElement.dataset.zimamodStoreLoaded === "true") return;
  document.documentElement.dataset.zimamodStoreLoaded = "true";

  const BUTTON_CLASS = "zimamod-store-launcher";
  const UPDATE_DOT_CLASS = "zimamod-update-dot";
  const UPDATE_TOOLTIP_CLASS = "zimamod-update-tooltip";
  const MODAL_ID = "zimamod-store-modal";
  const UPDATE_CHECK_MS = 8 * 60 * 60 * 1000;
  let updateStatus = null;

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
    if (!element) return null;
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
      .find(element => (element.textContent || "").trim() === "ZimaMOD") || null;
  }

  function findAppHandle() {
    return allElements("#app-zimamod").find(element => element.classList.contains("handle")) || null;
  }

  function findAppTile() {
    const title = titleElement();
    return title ? tileCandidate(title) : tileCandidate(findAppHandle());
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
    const tile = findAppTile();
    launchers.forEach(element => {
      if (!tile || element.parentElement !== tile) element.remove();
    });
    if (!tile || tile.querySelector("." + BUTTON_CLASS)) return;
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

  function mountUpdateDot() {
    const dots = allElements("." + UPDATE_DOT_CLASS);
    const handle = findAppHandle();
    const showUpdate = Boolean(handle && updateStatus?.checkAvailable && updateStatus.updateAvailable);
    dots.forEach(element => {
      if (!showUpdate || element.parentElement !== handle) element.remove();
    });
    if (!showUpdate) {
      hideUpdateTooltip();
      return;
    }

    handle.style.position = "relative";
    let dot = handle.querySelector("." + UPDATE_DOT_CLASS);
    if (!dot) {
      dot = document.createElement("span");
      dot.className = UPDATE_DOT_CLASS;
      dot.setAttribute("role", "button");
      dot.tabIndex = 0;
      dot.style.cssText = [
        "position:absolute",
        "z-index:2147482000",
        "top:10px",
        "left:10px",
        "display:block",
        "width:14px",
        "height:14px",
        "margin:0",
        "padding:0",
        "border:2px solid rgba(255,255,255,.96)",
        "border-radius:50%",
        "background:#2878ff",
        "box-shadow:0 0 0 4px rgba(40,120,255,.22),0 3px 10px rgba(0,45,140,.4)",
        "cursor:pointer"
      ].join(";");
      dot.addEventListener("click", event => {
        event.preventDefault();
        event.stopPropagation();
        void openStore();
      });
      dot.addEventListener("keydown", event => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        event.stopPropagation();
        void openStore();
      });
      dot.addEventListener("mouseenter", showUpdateTooltip);
      dot.addEventListener("mouseleave", hideUpdateTooltip);
      dot.addEventListener("focus", showUpdateTooltip);
      dot.addEventListener("blur", hideUpdateTooltip);
      handle.appendChild(dot);
    }
    dot.setAttribute("aria-label", `ZimaMOD ${updateStatus.latestVersion} is available`);
  }

  function updateTooltip() {
    let tooltip = document.querySelector("." + UPDATE_TOOLTIP_CLASS);
    if (!tooltip) {
      tooltip = document.createElement("div");
      tooltip.className = UPDATE_TOOLTIP_CLASS;
      tooltip.setAttribute("role", "tooltip");
      document.body.appendChild(tooltip);
    }
    tooltip.innerHTML = `
      <strong>ZimaMOD ${escapeHtml(updateStatus.latestVersion)} is available</strong>
      In ZimaOS Settings, edit ZimaMOD, change both API and proxy image tags to
      ${escapeHtml(updateStatus.latestVersion)}, then click Install.
    `;
    return tooltip;
  }

  function showUpdateTooltip(event) {
    if (!updateStatus?.updateAvailable) return;
    const dot = event.currentTarget;
    const rect = dot.getBoundingClientRect();
    const tooltip = updateTooltip();
    tooltip.style.display = "block";
    const tooltipRect = tooltip.getBoundingClientRect();
    const left = Math.max(12, Math.min(window.innerWidth - tooltipRect.width - 12, rect.right - tooltipRect.width));
    const top = Math.min(window.innerHeight - tooltipRect.height - 12, rect.bottom + 10);
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${Math.max(12, top)}px`;
    tooltip.style.opacity = "1";
    tooltip.style.transform = "translateY(0)";
  }

  function hideUpdateTooltip() {
    const tooltip = document.querySelector("." + UPDATE_TOOLTIP_CLASS);
    if (!tooltip) return;
    tooltip.style.opacity = "0";
    tooltip.style.transform = "translateY(-3px)";
    setTimeout(() => {
      if (tooltip.style.opacity === "0") tooltip.style.display = "none";
    }, 170);
  }

  function renderUpdatePanel(modal) {
    const panel = modal?.querySelector(".zimamod-store-update");
    if (!panel) return;

    if (!updateStatus) {
      panel.innerHTML = `<strong>ZimaMOD version</strong><span>Checking for updates...</span>`;
      panel.classList.remove("has-update");
      return;
    }

    if (!updateStatus.checkAvailable) {
      panel.innerHTML = `
        <div class="zimamod-store-update-heading">
          <strong>ZimaMOD ${escapeHtml(updateStatus.currentVersion)}</strong>
          <button type="button" class="zimamod-store-update-refresh">Check again</button>
        </div>
        <p>Update check unavailable. Your installed version is shown above.</p>
      `;
      panel.classList.remove("has-update");
      panel.querySelector(".zimamod-store-update-refresh").addEventListener("click", () => void checkUpdates(true));
      return;
    }

    panel.classList.toggle("has-update", updateStatus.updateAvailable);
    panel.innerHTML = `
      <div class="zimamod-store-update-heading">
        <strong>ZimaMOD ${escapeHtml(updateStatus.currentVersion)}</strong>
        <button type="button" class="zimamod-store-update-refresh">Check again</button>
      </div>
      ${updateStatus.updateAvailable ? `
        <span class="zimamod-store-update-badge">Version ${escapeHtml(updateStatus.latestVersion)} available</span>
        <p>In ZimaOS Settings, edit ZimaMOD and change both API and proxy image tags to
          <code>${escapeHtml(updateStatus.latestVersion)}</code>, then click <strong>Install</strong>.</p>
      ` : `<p>You are using the latest available version.</p>`}
    `;
    panel.querySelector(".zimamod-store-update-refresh").addEventListener("click", () => void checkUpdates(true));
  }

  async function checkUpdates(force = false) {
    try {
      updateStatus = await window.ZimaMOD.getUpdateStatus(force);
      mountUpdateDot();
      renderUpdatePanel(document.getElementById(MODAL_ID));
    } catch (error) {
      console.warn("[ZimaMOD] Update check unavailable:", error);
      const panel = document.getElementById(MODAL_ID)?.querySelector(".zimamod-store-update");
      if (panel) panel.innerHTML = `<strong>ZimaMOD version</strong><span>Update check unavailable.</span>`;
    }
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
        <aside class="zimamod-store-sidebar">
          <div class="zimamod-store-brand">
            <img class="zimamod-store-brand-mark" src="/zimamod-runtime/zimamod-icon.png" alt="">
            <span>
              <strong>ZimaMOD</strong>
              <small>MOD Store</small>
            </span>
          </div>
          <nav aria-label="MOD Store sections">
            <button type="button" class="is-active" data-filter="all">
              <span class="zimamod-store-nav-icon">⌂</span>Discover
            </button>
            <button type="button" data-filter="installed">
              <span class="zimamod-store-nav-icon">✓</span>Installed
            </button>
          </nav>
          <section class="zimamod-store-update" aria-live="polite">
            <strong>ZimaMOD version</strong>
            <span>Checking for updates...</span>
          </section>
          <p class="zimamod-store-sidebar-note">Extend your ZimaOS dashboard with community MODs.</p>
        </aside>
        <main class="zimamod-store-main">
          <header>
            <div>
              <span class="zimamod-store-kicker">ZimaOS extensions</span>
              <h2 id="zimamod-store-title">Discover MODs</h2>
            </div>
            <div class="zimamod-store-header-actions">
              <label class="zimamod-store-search">
                <span aria-hidden="true">⌕</span>
                <input type="search" placeholder="Search MODs" aria-label="Search MODs">
              </label>
              <button class="zimamod-store-close" type="button" aria-label="Close MOD Store">&times;</button>
            </div>
          </header>
          <div class="zimamod-store-toolbar">
            <div>
              <h3>MODs for your ZimaOS</h3>
              <p>Install, explore, and manage dashboard extensions.</p>
            </div>
            <div class="zimamod-store-status">Loading available mods...</div>
          </div>
          <div class="zimamod-store-grid"></div>
          <div class="zimamod-store-empty" hidden>No MODs match this view.</div>
        </main>
      </section>
    `;
    modal.querySelector(".zimamod-store-backdrop").addEventListener("click", closeStore);
    modal.querySelector(".zimamod-store-close").addEventListener("click", closeStore);
    modal.querySelector(".zimamod-store-search input").addEventListener("input", () => filterCards(modal));
    modal.querySelectorAll("[data-filter]").forEach(button => {
      button.addEventListener("click", () => {
        modal.querySelectorAll("[data-filter]").forEach(item => item.classList.toggle("is-active", item === button));
        filterCards(modal);
      });
    });
    document.body.appendChild(modal);
    renderUpdatePanel(modal);
    return modal;
  }

  function closeStore() {
    document.getElementById(MODAL_ID)?.remove();
  }

  function modCard(mod) {
    const card = document.createElement("article");
    card.className = "zimamod-store-card";
    card.dataset.installed = String(mod.installed);
    card.dataset.search = `${mod.name} ${mod.description || ""} ${
      (mod.authors || []).map(author => author.name).join(" ")
    }`.toLowerCase();
    const media = mod.screenshot
      ? `<img src="${storeAsset(mod, mod.screenshot)}" alt="${escapeHtml(mod.name)} screenshot">`
      : `<div class="zimamod-store-fallback">${escapeHtml(mod.name.slice(0, 1).toUpperCase())}</div>`;
    const authors = Array.isArray(mod.authors) && mod.authors.length
      ? mod.authors.map(author => author.url
        ? `<a href="${escapeHtml(author.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(author.name)}</a>`
        : `<span>${escapeHtml(author.name)}</span>`
      ).join('<span class="zimamod-store-author-separator">, </span>')
      : `<span>ZimaMOD contributor</span>`;
    card.innerHTML = `
      <div class="zimamod-store-media">${media}</div>
      <div class="zimamod-store-copy">
        <div class="zimamod-store-card-heading">
          <div>
            <span class="zimamod-store-card-type">ZimaMOD</span>
            <h3>${escapeHtml(mod.name)}</h3>
            <div class="zimamod-store-authors">by ${authors}</div>
          </div>
          <span class="zimamod-store-version">v${escapeHtml(mod.version)}</span>
        </div>
        <p>${escapeHtml(mod.description || "A ZimaMOD dashboard extension.")}</p>
        <div class="zimamod-store-card-footer">
          <span class="zimamod-store-compatibility">For ZimaOS</span>
          <button type="button" class="${mod.installed ? "is-installed" : ""}">
            ${mod.installed ? "Uninstall" : "Install"}
          </button>
        </div>
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
      card.dataset.installed = String(mod.installed);
      button.classList.toggle("is-installed", mod.installed);
      button.textContent = mod.installed ? "Uninstall" : "Install";
      modalShell().querySelector(".zimamod-store-status").textContent =
        "Reload the dashboard to apply the MOD Store change.";
      filterCards(modalShell());
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
      if (!updateStatus) void checkUpdates();
      const mods = await window.ZimaMOD.listStore();
      grid.replaceChildren(...mods.map(modCard));
      status.textContent = mods.length
        ? `${mods.length} mod${mods.length === 1 ? "" : "s"} available`
        : "No mods are available in the store.";
    } catch (error) {
      status.textContent = error.message;
    }
  }

  function filterCards(modal) {
    const query = modal.querySelector(".zimamod-store-search input").value.trim().toLowerCase();
    const filter = modal.querySelector("[data-filter].is-active")?.dataset.filter || "all";
    let visible = 0;

    modal.querySelectorAll(".zimamod-store-card").forEach(card => {
      const matchesSearch = !query || card.dataset.search.includes(query);
      const matchesFilter = filter !== "installed" || card.dataset.installed === "true";
      card.hidden = !(matchesSearch && matchesFilter);
      if (!card.hidden) visible++;
    });

    modal.querySelector(".zimamod-store-empty").hidden = visible !== 0;
  }

  window.ZimaMOD.openStore = openStore;
  window.ZimaMOD.closeStore = closeStore;
  window.ZimaMOD.checkForUpdates = checkUpdates;

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
    observer.timer = setTimeout(() => {
      mountLauncher();
      mountUpdateDot();
    }, 200);
  });
  observer.observe(document.body, { childList: true, subtree: true });
  mountLauncher();
  void checkUpdates();
  setInterval(() => void checkUpdates(), UPDATE_CHECK_MS);
})();
