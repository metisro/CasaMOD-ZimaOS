// ZimaMOD Widget Sortable - ZimaOS compatibility build

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
  const STORAGE_KEY = MOD_ID + "-order";
  const SORTABLE_CHILD = "data-zimamod-sortable-child";
  const SORTABLE_ID = "data-zimamod-sortable-id";
  let activeColumn = null;
  let dragged = null;

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

  function saveOrder(column) {
    const order = sortableChildren(column).map((child, index) => childId(child, index));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(order));
  }

  function restoreOrder(column) {
    let order = [];
    try {
      order = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    } catch (_) {
      return;
    }

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
      saveOrder(child.parentElement);
      clearDragState();
    });
    child.addEventListener("dragend", () => {
      saveOrder(child.parentElement);
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
    restoreOrder(column);
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
