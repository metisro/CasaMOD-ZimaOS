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
  let orderPromise = null;

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
      .filter(({ element, rect }) => {
        const text = (element.textContent || "").toLowerCase();
        return (
          rect.width >= 260 &&
          rect.width <= 520 &&
          rect.height >= 450 &&
          rect.left < window.innerWidth * .35 &&
          text.includes("storage") &&
          text.includes("network")
        );
      })
      .sort((left, right) => left.rect.width - right.rect.width)[0]?.element || null;
  }

  function slug(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 48);
  }

  function childId(child, index) {
    const existing = child.getAttribute(SORTABLE_ID);
    if (existing) return existing;

    const widget = child.matches("[widget-id]") ? child : child.querySelector(":scope > [widget-id]");
    const label = widget?.getAttribute("widget-id") ||
      child.getAttribute("aria-label") ||
      child.querySelector("h1, h2, h3, h4, [class*='title' i]")?.textContent ||
      child.textContent;
    const id = slug(label) || "widget-" + index;
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
    const order = sortableChildren(column).map((child, index) => childId(child, index));
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
        .then(config => Array.isArray(config?.order) ? config.order : [])
        .catch(error => {
          console.error("[ZimaMOD Widget Sortable] Failed to load widget order", error);
          return [];
        });
    }

    return orderPromise;
  }

  async function restoreOrder(column) {
    const order = await loadOrder();
    if (column !== activeColumn) return;

    const children = sortableChildren(column);
    const byId = new Map(children.map((child, index) => [childId(child, index), child]));
    const currentOrder = children.map((child, index) => childId(child, index));
    const desiredOrder = order.filter(id => byId.has(id));
    if (desiredOrder.every((id, index) => currentOrder[index] === id)) return;

    for (const id of order) {
      const child = byId.get(id);
      if (child) column.appendChild(child);
    }
  }

  function clearDragState() {
    if (dragged) dragged.classList.remove("zimamod-sortable-dragging");
    dragged = null;
    document.querySelectorAll(".zimamod-sortable-over")
      .forEach(element => element.classList.remove("zimamod-sortable-over"));
  }

  function bindChild(child, index) {
    childId(child, index);
    if (child.hasAttribute(SORTABLE_CHILD)) return;

    child.setAttribute(SORTABLE_CHILD, "");
    child.draggable = true;

    child.addEventListener("dragstart", event => {
      dragged = child;
      child.classList.add("zimamod-sortable-dragging");
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", child.getAttribute(SORTABLE_ID));
    });

    child.addEventListener("dragover", event => {
      if (!dragged || dragged === child) return;
      event.preventDefault();
      child.classList.add("zimamod-sortable-over");
      const rect = child.getBoundingClientRect();
      const after = event.clientY > rect.top + rect.height / 2;
      child.parentElement.insertBefore(dragged, after ? child.nextSibling : child);
    });

    child.addEventListener("dragleave", () => child.classList.remove("zimamod-sortable-over"));
    child.addEventListener("drop", event => {
      event.preventDefault();
      void saveOrder(child.parentElement);
      clearDragState();
    });
    child.addEventListener("dragend", () => {
      void saveOrder(child.parentElement);
      clearDragState();
    });
  }

  function initialize() {
    if (location.hash.includes("login")) return;
    const column = widgetColumn();
    if (!column) return;

    activeColumn = column;
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
