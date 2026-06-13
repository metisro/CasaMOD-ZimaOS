// ZimaMOD adaptation of Cp0204's CasaMOD Bing Wallpaper v2 idea.

(function ZimaMODBingWallpaper() {
  "use strict";

  if (window !== window.top || window.__POWERED_BY_WUJIE__) return;

  const MOD_ID = "zimamod-bing-wallpaper-v2";
  const INFO_ID = MOD_ID + "-info";
  const STYLE_ID = MOD_ID + "-style";
  const STANDALONE_API = "https://bing.biturl.top/";
  const languageMarkets = {
    de_de: "de-DE",
    en_us: "en-US",
    fr_fr: "fr-FR",
    ja_jp: "ja-JP",
    zh_cn: "zh-CN"
  };
  let wallpaper = null;
  let wallpaperRequest = null;
  let failureReported = false;

  function dashboardBackground() {
    const identified = document.querySelector("#wallpaper") || document.querySelector("#background");
    if (identified) return identified;
    return Array.from(document.querySelectorAll('[class*="wallpaper"], [class*="background"]'))
      .sort((left, right) => {
        const leftRect = left.getBoundingClientRect();
        const rightRect = right.getBoundingClientRect();
        return rightRect.width * rightRect.height - leftRect.width * leftRect.height;
      })[0] || null;
  }

  function market() {
    return languageMarkets[String(window.localStorage.getItem("lang") || "").toLowerCase()] || "en-US";
  }

  function trustedBingUrl(value) {
    try {
      const url = new URL(value, "https://www.bing.com");
      const hostname = url.hostname.toLowerCase();
      if (url.protocol !== "https:" || (hostname !== "bing.com" && !hostname.endsWith(".bing.com"))) {
        return "";
      }
      return url.toString();
    } catch (_) {
      return "";
    }
  }

  function closeInfo() {
    document.getElementById(INFO_ID)?.remove();
  }

  function setWallpaperOverride(imageUrl) {
    const escapedUrl = imageUrl.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    const style = document.getElementById(STYLE_ID) || document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `#wallpaper { background-image: url("${escapedUrl}") !important; }`;
    if (!style.isConnected) document.head.appendChild(style);
  }

  function showInfo(event) {
    if (!wallpaper) return;
    if (event.target?.closest?.("a, button, input, textarea, select, [role='button']")) return;
    event.preventDefault();
    closeInfo();

    const card = document.createElement("div");
    card.id = INFO_ID;
    Object.assign(card.style, {
      background: "rgba(9, 18, 35, .92)",
      border: "1px solid rgba(255, 255, 255, .2)",
      borderRadius: "10px",
      boxShadow: "0 12px 32px rgba(0, 0, 0, .35)",
      color: "#fff",
      font: "14px/1.4 system-ui, sans-serif",
      left: Math.min(event.clientX, window.innerWidth - 300) + "px",
      maxWidth: "280px",
      padding: "10px 12px",
      position: "fixed",
      top: Math.min(event.clientY, window.innerHeight - 120) + "px",
      zIndex: "2147483647"
    });
    const link = document.createElement("a");
    link.href = wallpaper.link;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = wallpaper.description;
    Object.assign(link.style, { color: "#fff", display: "block", textDecoration: "none" });

    const actions = document.createElement("div");
    Object.assign(actions.style, { alignItems: "center", display: "flex", gap: "8px", marginTop: "10px" });
    const save = document.createElement("button");
    save.type = "button";
    save.textContent = "Save";
    Object.assign(save.style, {
      background: "#3974ff",
      border: "0",
      borderRadius: "7px",
      color: "#fff",
      cursor: "pointer",
      font: "600 13px system-ui, sans-serif",
      padding: "6px 12px"
    });
    const status = document.createElement("span");
    Object.assign(status.style, { color: "rgba(255,255,255,.75)", fontSize: "12px" });
    save.addEventListener("click", async click => {
      click.preventDefault();
      click.stopPropagation();
      save.disabled = true;
      status.textContent = "Saving...";
      try {
        if (typeof window.ZimaMOD?.saveBingWallpaper !== "function") {
          throw new Error("Update ZimaMOD to use Save");
        }
        const result = await window.ZimaMOD.saveBingWallpaper(wallpaper.imageUrl);
        status.textContent = result.exists ? "Already in Gallery" : "Saved to Gallery";
        save.textContent = "Saved";
      } catch (error) {
        status.textContent = error.message || "Save failed";
        save.disabled = false;
      }
    });
    actions.appendChild(save);
    actions.appendChild(status);
    card.appendChild(link);
    card.appendChild(actions);
    document.body.appendChild(card);
  }

  function applyWallpaper(target, image) {
    const imageUrl = trustedBingUrl(image.url);
    if (!imageUrl) throw new Error("Bing returned an invalid wallpaper URL");

    wallpaper = {
      description: String(image.copyright || "Bing image of the day"),
      link: trustedBingUrl(image.copyrightlink) || imageUrl,
      imageUrl
    };
    setWallpaperOverride(imageUrl);
    target.style.backgroundImage = `url("${imageUrl}")`;
    target.style.backgroundPosition = "center";
    target.style.backgroundSize = "cover";
    target.dataset.zimamodBingWallpaper = "true";
    target.addEventListener("contextmenu", showInfo);
  }

  function loadWallpaper() {
    if (!wallpaperRequest) {
      const url = new URL(STANDALONE_API);
      url.searchParams.set("resolution", "1920");
      url.searchParams.set("format", "json");
      url.searchParams.set("index", "0");
      url.searchParams.set("mkt", market());
      wallpaperRequest = fetch(url, { cache: "no-store" })
        .then(response => {
          if (!response.ok) throw new Error(`Wallpaper metadata request failed: ${response.status}`);
          return response.json();
        })
        .then(image => {
          if (!image?.url) throw new Error("Bing returned no wallpaper");
          return {
            ...image,
            copyrightlink: image.copyrightlink || image.copyright_link
          };
        });
    }
    return wallpaperRequest;
  }

  async function start() {
    const target = dashboardBackground();
    if (!target || target.dataset.zimamodBingWallpaper === "true") return;
    applyWallpaper(target, await loadWallpaper());
  }

  function tryStart() {
    start()
      .catch(error => {
        if (!failureReported) console.error("[ZimaMOD Bing Wallpaper]", error);
        failureReported = true;
      });
  }

  document.addEventListener("click", event => {
    if (!event.target.closest("#" + INFO_ID)) closeInfo();
  });
  window.addEventListener("blur", closeInfo);
  window.addEventListener("resize", closeInfo);

  const observer = new MutationObserver(tryStart);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  tryStart();
})();
