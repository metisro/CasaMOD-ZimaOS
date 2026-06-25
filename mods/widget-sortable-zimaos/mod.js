// ZimaMOD Widget Sortable - ZimaOS reimplementation
// Original authors: LANMIN-X and Cp0204
// Source: https://github.com/Cp0204/CasaMOD/tree/main/app/mod/widget-sortable

(function ZimaMODWidgetSortableZimaOS() {
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

  if (document.documentElement.dataset.zimamodWidgetSortableZimaos === "true") return;
  document.documentElement.dataset.zimamodWidgetSortableZimaos = "true";

  const MOD_ID = "zimamod-widget-sortable-zimaos";
  const CONFIG_ID = "sortable-widgets";
  const SORTABLE_CHILD = "data-zimamod-sortable-child";
  const SORTABLE_ID = "data-zimamod-sortable-id";
  let activeColumn = null;
  let dragged = null;
  let dragColumn = null;
  let dragOrderSaved = false;
  let orderPromise = null;
  let restoreStartedAt = 0;
  let restoreRetryTimer = null;

  function weatherWidget() {
    return document.querySelector("#zimamod-weather-widget, [widget-id='weather'].zimamod-weather");
  }

  function widgetColumn() {
    const weather = weatherWidget();
    if (weather) {
      const mount = weather.closest("#zimamod-weather-zimaos-mount");
      const column = mount?.parentElement;
      if (column && column !== document.body) return column;
    }

    return Array.from(document.querySelectorAll("#app div, #app aside, #app section"))
      .map(element => ({ element, rect: element.getBoundingClientRect() }))
      .filter(({ element, rect }) => (
        rect.width >= 260 &&
        rect.width <= 520 &&
        rect.height >= 450 &&
        rect.left < window.innerWidth * .35 &&
        hasDashboardWidgets(element)
      ))
      .sort((left, right) => left.rect.width - right.rect.width)[0]?.element || null;
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

  function slug(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 48);
  }

  function stableId(value) {
    const normalized = slug(value);
    if (normalized.includes("weather")) return "weather";
    if (normalized.includes("storage")) return "storage";
    if (normalized.includes("network")) return "network";
    if (normalized.includes("system")) return "system";
    if (normalized.includes("widget-settings") || normalized === "settings") return "widget-settings";
    if (
      /(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)/.test(normalized) ||
      /(?:january|february|march|april|may|june|july|august|september|october|november|december)/.test(normalized)
    ) {
      return "clock";
    }
    return normalized;
  }

  function childId(child, index) {
    const existing = child.getAttribute(SORTABLE_ID);
    if (existing) {
      const normalized = stableId(existing);
      if (normalized && normalized !== existing) child.setAttribute(SORTABLE_ID, normalized);
      return normalized || existing;
    }

    const widget = child.matches("[widget-id]") ? child : child.querySelector(":scope > [widget-id]");
    const label = widget?.getAttribute("widget-id") ||
      child.getAttribute("aria-label") ||
      child.querySelector("h1, h2, h3, h4, [class*='title' i]")?.textContent ||
      child.textContent;
    const id = stableId(label) || "widget-" + index;
    child.setAttribute(SORTABLE_ID, id);
    return id;
  }

  function sortableChildren(column) {
    return Array.from(column.children).filter(child => {
      const rect = child.getBoundingClientRect();
      return rect.height >= 35 && !child.matches("script, style");
    });
  }

  async function saveOrder(column) {
    const order = Array.from(new Set(
      sortableChildren(column)
        .map((child, index) => stableId(childId(child, index)))
        .filter(Boolean)
    ));
    orderPromise = Promise.resolve(order);

    try {
      await window.ZimaMOD.setConfig(CONFIG_ID, { order });
    } catch (error) {
      console.error("[ZimaMOD Widget Sortable] Failed to save widget order", error);
    }
  }

  async function loadOrder() {
    if (!orderPromise) {
      orderPromise = window.ZimaMOD.getConfig(CONFIG_ID, { order: [] })
        .then(async config => {
          const original = Array.isArray(config?.order) ? config.order : [];
          const normalized = Array.from(new Set(original.map(stableId).filter(Boolean)));
          if (JSON.stringify(original) !== JSON.stringify(normalized)) {
            await window.ZimaMOD.setConfig(CONFIG_ID, { order: normalized });
          }
          return normalized;
        })
        .catch(error => {
          console.error("[ZimaMOD Widget Sortable] Failed to load widget order", error);
          return [];
        });
    }

    return orderPromise;
  }

  async function restoreOrder(column) {
    if (dragged) return;
    const order = await loadOrder();
    if (column !== activeColumn || dragged) return;

    const children = sortableChildren(column);
    const byId = new Map(children.map((child, index) => [childId(child, index), child]));
    const missingIds = order.filter(id => !byId.has(id) && shouldWaitForMissing(id));
    if (missingIds.length && Date.now() - restoreStartedAt < 5000) {
      clearTimeout(restoreRetryTimer);
      restoreRetryTimer = setTimeout(initialize, 250);
      return;
    }

    for (const [savedIndex, id] of order.entries()) {
      const child = byId.get(id);
      if (!child) continue;

      const currentChildren = sortableChildren(column);
      const targetIndex = Math.min(savedIndex, currentChildren.length - 1);
      const currentIndex = currentChildren.indexOf(child);
      if (currentIndex === targetIndex) continue;

      const referenceIndex = currentIndex < targetIndex ? targetIndex + 1 : targetIndex;
      column.insertBefore(child, currentChildren[referenceIndex] || null);
    }
  }

  function shouldWaitForMissing(id) {
    return !["clock", "system", "storage", "network", "widget-settings"].includes(id);
  }

  function clearDragState() {
    if (dragged) dragged.classList.remove("zimamod-sortable-dragging");
    dragged = null;
    dragColumn = null;
    document.querySelectorAll(".zimamod-sortable-over")
      .forEach(element => element.classList.remove("zimamod-sortable-over"));
  }

  function animateReorder(column, move) {
    const previousTops = new Map(sortableChildren(column).map(child => [
      child,
      child.getBoundingClientRect().top
    ]));
    move();

    for (const child of sortableChildren(column)) {
      if (child === dragged) continue;
      const previousTop = previousTops.get(child);
      if (previousTop === undefined) continue;
      const offset = previousTop - child.getBoundingClientRect().top;
      if (!offset) continue;

      child.style.transition = "none";
      child.style.transform = `translateY(${offset}px)`;
      requestAnimationFrame(() => {
        child.style.transition = "";
        child.style.transform = "";
      });
    }
  }

  function finishDrag(column) {
    if (!dragOrderSaved && column) {
      dragOrderSaved = true;
      void saveOrder(column);
    }
    clearDragState();
  }

  function bindChild(child, index) {
    childId(child, index);
    if (child.hasAttribute(SORTABLE_CHILD)) return;

    child.setAttribute(SORTABLE_CHILD, "");
    child.draggable = true;

    child.addEventListener("dragstart", event => {
      dragged = child;
      dragColumn = child.parentElement;
      dragOrderSaved = false;
      child.classList.add("zimamod-sortable-dragging");
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", child.getAttribute(SORTABLE_ID));
    });

    child.addEventListener("dragover", event => {
      if (!dragged || dragged === child) return;
      event.preventDefault();
      child.classList.add("zimamod-sortable-over");
      const rect = child.getBoundingClientRect();
      const column = child.parentElement;
      const children = sortableChildren(column);
      const draggedIndex = children.indexOf(dragged);
      const targetIndex = children.indexOf(child);

      if (draggedIndex < targetIndex && event.clientY > rect.top + rect.height * .65) {
        animateReorder(column, () => column.insertBefore(dragged, child.nextSibling));
      } else if (draggedIndex > targetIndex && event.clientY < rect.top + rect.height * .35) {
        animateReorder(column, () => column.insertBefore(dragged, child));
      }
    });

    child.addEventListener("dragleave", () => child.classList.remove("zimamod-sortable-over"));
    child.addEventListener("drop", event => {
      event.preventDefault();
      finishDrag(child.parentElement);
    });
    child.addEventListener("dragend", () => {
      finishDrag(dragColumn || child.parentElement);
    });
  }

  function initialize() {
    if (dragged) return;
    if (location.hash.includes("login")) return;
    const column = widgetColumn();
    if (!column) return;

    if (activeColumn !== column) {
      activeColumn = column;
      restoreStartedAt = Date.now();
    }
    column.dataset.zimamodSortable = "true";
    const children = sortableChildren(column);
    children.forEach(bindChild);
    void restoreOrder(column);
  }

  if (!window.ZimaMOD) {
    console.error("[ZimaMOD Widget Sortable] ZimaMOD config API is unavailable");
    return;
  }

  const observer = new MutationObserver(() => {
    clearTimeout(observer.timer);
    observer.timer = setTimeout(initialize, 120);
  });

  observer.observe(document.body, { childList: true, subtree: true });
  window.addEventListener("hashchange", initialize);
  window.addEventListener("resize", initialize);
  initialize();
})();
