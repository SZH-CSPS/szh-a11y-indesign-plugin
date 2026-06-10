/**
 * main.js
 * =======
 * Reading Order Preview — UXP Plugin for Adobe InDesign
 *
 * ARCHITECTURE
 * ------------
 * In InDesign UXP, main.js is the ONLY file that can access require("indesign").
 * The panel HTML (index.html) runs in a separate context and cannot call
 * require("indesign") directly.
 *
 * Communication pattern:
 *   main.js  →  panel DOM  via  panelNode.innerHTML / panelNode.querySelector()
 *   panel DOM  →  main.js  via  entrypoints.setup() callbacks + window globals
 *
 * All InDesign API calls live here in main.js.
 * The panel HTML only handles layout and user interaction.
 *
 * Copyright (C) 2025 SZH/CSPS — Swiss Centre for Special Needs Education
 * Licensed under GNU GPL v3 — https://www.gnu.org/licenses/
 */

"use strict";

const { entrypoints } = require("uxp");
const indesign = require("indesign");
const { app } = indesign;
const Justification = indesign.Justification || globalThis.Justification;
const VerticalJustification = indesign.VerticalJustification || globalThis.VerticalJustification;
const FirstBaseline = indesign.FirstBaseline || globalThis.FirstBaseline;
const ColorModel = indesign.ColorModel || globalThis.ColorModel;
const ColorSpace = indesign.ColorSpace || globalThis.ColorSpace;
const ArrowHead = indesign.ArrowHead || globalThis.ArrowHead;

// ═════════════════════════════════════════════════════════════════════════════
// 1. I18N
// ═════════════════════════════════════════════════════════════════════════════

const STRINGS = {
  en: {
    panelTitle:         "SZH-CSPS Accessibility Toolbox",
    noDocument:         "No document open.",
    noArticles:         "No articles defined. Configure the Articles panel (Window > Articles) first.",
    noPage:             "No active page.",
    thumbnailTitle:     "Page preview",
    thumbnailToggleTitle: "Hide/show preview",
    thumbnailHint:      "Numbers show the Articles reading order.",
    navTitle:           "Navigate",
    navPrev:            "← Previous",
    navNext:            "Next →",
    navCurrent:         "{current} / {total}",
    navItem:            "#{num} — {name}",
    navArticle:         "Article: {name}",
    navSelectHint:      "Object selected in document.",
    navNoItems:         "No items on this page.",
    btnRefresh:         "↺ Refresh",
    layerTitle:         "Reading order layer",
    btnDrawLayer:       "Draw reading order on layer",
    btnDeleteLayer:     "Delete reading order layer",
    layerName:          "[Reading Order]",
    layerDrawn:         "Layer drawn: {count} object(s).",
    layerDeleted:       "Reading order layer deleted.",
    layerNotFound:      "Reading order layer not found.",
    fastTitle:          "Fast reading Article/layer order",
    btnFastReorder:     "Reorder selected (bottom-up)",
    btnFastSaveGroups:  "Save groups",
    btnFastUngroupAll:  "Ungroup all",
    btnFastRegroup:     "Re-group based on save",
    fastNoSelection:    "Select at least 2 objects.",
    fastReordered:      "Reordered {count} selected object(s).",
    fastReorderSkipped: "Some selected objects were skipped (different parent/layer or unsupported type).",
    fastGroupsSaved:    "Saved {count} group(s).",
    fastNoGroupsSaved:  "No saved groups in memory.",
    fastUngrouped:      "Ungrouped {count} group(s).",
    fastRegrouped:      "Re-grouped {count} group(s).",
    errGeneric:         "Error: {msg}"
  },
  fr: {
    panelTitle:         "CSPS Accessibility Toolbox",
    noDocument:         "Aucun document ouvert.",
    noArticles:         "Aucun article défini. Configurez le panneau Articles (Fenêtre > Articles) d'abord.",
    noPage:             "Aucune page active.",
    thumbnailTitle:     "Aperçu de la page",
    thumbnailToggleTitle: "Masquer/afficher l'aperçu",
    thumbnailHint:      "Les numéros indiquent l'ordre de lecture du panneau Articles.",
    navTitle:           "Navigation",
    navPrev:            "← Précédent",
    navNext:            "Suivant →",
    navCurrent:         "{current} / {total}",
    navItem:            "#{num} — {name}",
    navArticle:         "Article : {name}",
    navSelectHint:      "Objet sélectionné dans le document.",
    navNoItems:         "Aucun élément sur cette page.",
    btnRefresh:         "↺ Actualiser",
    layerTitle:         "Calque ordre de lecture",
    btnDrawLayer:       "Dessiner l'ordre de lecture sur calque",
    btnDeleteLayer:     "Supprimer le calque ordre de lecture",
    layerName:          "[Reading Order]",
    layerDrawn:         "Calque dessiné : {count} objet(s).",
    layerDeleted:       "Calque ordre de lecture supprimé.",
    layerNotFound:      "Calque introuvable.",
    fastTitle:          "Ordre article/calque rapide",
    btnFastReorder:     "Réordonner sélection (bas vers haut)",
    btnFastSaveGroups:  "Save group",
    btnFastUngroupAll:  "Ungroup all",
    btnFastRegroup:     "Re-group based on save",
    fastNoSelection:    "Sélectionnez au moins 2 objets.",
    fastReordered:      "{count} objet(s) sélectionné(s) réordonné(s).",
    fastReorderSkipped: "Certains objets sélectionnés ont été ignorés (parent/calque différent ou type non pris en charge).",
    fastGroupsSaved:    "{count} groupe(s) sauvegardé(s).",
    fastNoGroupsSaved:  "Aucun groupe sauvegardé en mémoire.",
    fastUngrouped:      "{count} groupe(s) dissocié(s).",
    fastRegrouped:      "{count} groupe(s) regroupé(s).",
    errGeneric:         "Erreur : {msg}"
  },
  de: {
    panelTitle:         "SZH Accessibility Toolbox",
    noDocument:         "Kein Dokument geöffnet.",
    noArticles:         "Keine Artikel definiert. Bitte zuerst das Artikelbedienfeld konfigurieren.",
    noPage:             "Keine aktive Seite.",
    thumbnailTitle:     "Seitenvorschau",
    thumbnailToggleTitle: "Vorschau ein-/ausblenden",
    thumbnailHint:      "Die Nummern zeigen die Lesereihenfolge gemäss Artikelbedienfeld.",
    navTitle:           "Navigation",
    navPrev:            "← Zurück",
    navNext:            "Weiter →",
    navCurrent:         "{current} / {total}",
    navItem:            "#{num} — {name}",
    navArticle:         "Artikel: {name}",
    navSelectHint:      "Objekt im Dokument ausgewählt.",
    navNoItems:         "Keine Elemente auf dieser Seite.",
    btnRefresh:         "↺ Aktualisieren",
    layerTitle:         "Lesereihenfolge-Ebene",
    btnDrawLayer:       "Lesereihenfolge auf Ebene zeichnen",
    btnDeleteLayer:     "Lesereihenfolge-Ebene löschen",
    layerName:          "[Reading Order]",
    layerDrawn:         "Ebene gezeichnet: {count} Objekt(e).",
    layerDeleted:       "Lesereihenfolge-Ebene gelöscht.",
    layerNotFound:      "Ebene nicht gefunden.",
    errGeneric:         "Fehler: {msg}"
  },
  it: {
    panelTitle:         "SZH-CSPS Accessibility Toolbox",
    noDocument:         "Nessun documento aperto.",
    noArticles:         "Nessun articolo definito. Configurare prima il pannello Articoli.",
    noPage:             "Nessuna pagina attiva.",
    thumbnailTitle:     "Anteprima pagina",
    thumbnailToggleTitle: "Mostra/nascondi anteprima",
    thumbnailHint:      "I numeri mostrano l'ordine di lettura del pannello Articoli.",
    navTitle:           "Navigazione",
    navPrev:            "← Precedente",
    navNext:            "Successivo →",
    navCurrent:         "{current} / {total}",
    navItem:            "#{num} — {name}",
    navArticle:         "Articolo: {name}",
    navSelectHint:      "Oggetto selezionato nel documento.",
    navNoItems:         "Nessun elemento in questa pagina.",
    btnRefresh:         "↺ Aggiorna",
    layerTitle:         "Livello ordine di lettura",
    btnDrawLayer:       "Disegna ordine di lettura su livello",
    btnDeleteLayer:     "Elimina livello ordine di lettura",
    layerName:          "[Reading Order]",
    layerDrawn:         "Livello disegnato: {count} oggetto/i.",
    layerDeleted:       "Livello eliminato.",
    layerNotFound:      "Livello non trovato.",
    errGeneric:         "Errore: {msg}"
  }
};

function getLocale() {
  try {
    return (app.locale || "en_US").toLowerCase().substring(0, 2);
  } catch (e) { return "en"; }
}

function t(key, params) {
  const strings = STRINGS[getLocale()] || STRINGS["en"];
  let str = strings[key] || STRINGS["en"][key] || key;
  if (params) {
    Object.keys(params).forEach(function (k) {
      str = str.replace(new RegExp("{" + k + "}", "g"), String(params[k]));
    });
  }
  return str;
}


// ═════════════════════════════════════════════════════════════════════════════
// 2. INDESIGN API
// ═════════════════════════════════════════════════════════════════════════════

const BADGE_R    = 4;
const ARROW_W    = 0.9;
const ACCENT_RGB = [255, 69, 38];
let _savedGroups = [];
const ENABLE_ARTICLE_SYNC_AFTER_REORDER = true;

function normalizeBounds(bounds) {
  if (!bounds || bounds.length < 4) return null;
  const out = [Number(bounds[0]), Number(bounds[1]), Number(bounds[2]), Number(bounds[3])];
  if (!isFinite(out[0]) || !isFinite(out[1]) || !isFinite(out[2]) || !isFinite(out[3])) return null;
  if (out[2] <= out[0] || out[3] <= out[1]) return null;
  return out;
}

/** Returns the intersection point of a ray (rect center -> target) with rect border. */
function rectBorderPointTowards(rectBounds, targetX, targetY) {
  const t = rectBounds[0], l = rectBounds[1], b = rectBounds[2], r = rectBounds[3];
  const cx = (l + r) / 2;
  const cy = (t + b) / 2;
  const dx = targetX - cx;
  const dy = targetY - cy;
  if (dx === 0 && dy === 0) return [cx, cy];

  const halfW = (r - l) / 2;
  const halfH = (b - t) / 2;
  const nx = Math.abs(dx) / Math.max(halfW, 0.0001);
  const ny = Math.abs(dy) / Math.max(halfH, 0.0001);
  const pad = 0.6; // keep endpoint off exact corners for cleaner joins

  // Pick the dominant side first, then clamp on the other axis.
  if (nx >= ny) {
    const x = (dx >= 0) ? r : l;
    const yRaw = cy + dy * (halfW / Math.max(Math.abs(dx), 0.0001));
    const y = Math.max(t + pad, Math.min(b - pad, yRaw));
    return [x, y];
  }

  const y = (dy >= 0) ? b : t;
  const xRaw = cx + dx * (halfH / Math.max(Math.abs(dy), 0.0001));
  const x = Math.max(l + pad, Math.min(r - pad, xRaw));
  return [x, y];
}

/** Walks parent chain to find the Page containing a pageItem. */
function getParentPage(item) {
  // Fast path: most page items expose parentPage directly.
  try {
    if (item && item.parentPage && item.parentPage.isValid) return item.parentPage;
  } catch (e) {}

  try {
    let p = item.parent;
    while (p) {
      try { if (p.reflect.name === "Page") return p; } catch (e) {}
      if (p === app.activeDocument) break;
      p = p.parent;
    }
  } catch (e) {}
  return null;
}

/**
 * Article members can point to Story/Text objects that are not directly
 * drawable/selectable as page items. Resolve them to a page item when possible.
 */
function resolveArticleMemberRef(member) {
  let ref = null;
  try { ref = member.itemRef; } catch (e) { return null; }
  if (!ref || !ref.isValid) return null;

  // Already a page item-like object.
  try {
    const _ = ref.geometricBounds;
    return ref;
  } catch (e) {}

  // Story-like object: first text container is usually a text frame.
  try {
    if (ref.textContainers && ref.textContainers.length > 0) {
      const tf = ref.textContainers[0];
      if (tf && tf.isValid) return tf;
    }
  } catch (e) {}

  // Text-like object (Character, InsertionPoint, etc.).
  try {
    if (ref.parentTextFrames && ref.parentTextFrames.length > 0) {
      const ptf = ref.parentTextFrames[0];
      if (ptf && ptf.isValid) return ptf;
    }
  } catch (e) {}

  // Last fallback: parent chain may land on a frame/group with bounds.
  try {
    let p = ref.parent;
    let guard = 0;
    while (p && guard < 15) {
      guard++;
      try {
        const _ = p.geometricBounds;
        return p;
      } catch (e) {}
      p = p.parent;
    }
  } catch (e) {}

  return null;
}

/**
 * Reads all article items from the active document.
 * Returns { ok, error?, items?, pageGeometry?, activePageIndex? }
 */
function getArticleData() {
  if (!app.documents.length)       return { ok: false, error: t("noDocument") };
  const doc = app.activeDocument;
  if (!doc.articles.length)        return { ok: false, error: t("noArticles") };

  let activePage = null;
  let activePageIndex = null;
  let activePageName  = null;
  try {
    activePage = app.activeWindow.activePage;
    if (activePage && activePage.isValid) {
      activePageIndex = activePage.documentOffset;
      activePageName  = String(activePage.name || "");
    }
  } catch (e) {
    try {
      if (app.layoutWindows && app.layoutWindows.length > 0) {
        const win = app.layoutWindows[0];
        if (win && win.activePage && win.activePage.isValid) {
          activePage = win.activePage;
          activePageIndex = activePage.documentOffset;
          activePageName  = String(activePage.name || "");
        }
      }
    } catch (e2) {}
  }

  let activeSpreadPageIndexes = [];
  let activeSpreadPageNames   = [];
  try {
    if (activePage && activePage.isValid && activePage.parent && activePage.parent.pages) {
      const spreadPages = activePage.parent.pages.everyItem().getElements();
      activeSpreadPageIndexes = spreadPages.map(function (p) { return p.documentOffset; });
      activeSpreadPageNames   = spreadPages.map(function (p) { return String(p.name || ""); });
    }
  } catch (e) {}

  const items = [];
  let idx = 0;

  const articlesCount = doc.articles.length;
  console.log("[ROP] iterating", articlesCount, "articles");

  for (let a = 0; a < articlesCount; a++) {
    let article;
    try { article = doc.articles.item(a); } catch(e) { continue; }

    let membersCount = 0;
    try { membersCount = article.articleMembers.length; } catch(e) {}
    console.log("[ROP] article["+a+"] name=", article.name, "members=", membersCount);

    // everyItem() is the recommended way to iterate InDesign collections in UXP
    let memberArray = [];
    try {
      memberArray = article.articleMembers.everyItem().getElements();
      console.log("[ROP] everyItem count:", memberArray.length);
    } catch(e) {
      console.log("[ROP] everyItem error:", e.message);
      continue;
    }

    for (let m = 0; m < memberArray.length; m++) {
      let member = memberArray[m];
      let pageItem;
      try {
        pageItem = resolveArticleMemberRef(member);
        if (!pageItem || !pageItem.isValid) {
          console.log("[ROP]   member["+m+"] invalid");
          continue;
        }
      } catch (e) { console.log("[ROP]   member["+m+"] error:", e.message); continue; }

      let bounds = null, pageIndex = -1, pageName = "";
      try {
        bounds   = normalizeBounds(pageItem.geometricBounds);
        const pg = getParentPage(pageItem);
        if (pg) {
          pageIndex = pg.documentOffset;
          pageName  = String(pg.name || "");
        }
      } catch (e) { console.log("[ROP]   bounds error:", e.message); continue; }
      if (!bounds) continue;

      const onActivePage =
        (activePageIndex !== null && pageIndex === activePageIndex) ||
        (!!activePageName && !!pageName && pageName === activePageName);

      console.log("[ROP]   member["+m+"] pageIndex=", pageIndex, "onActive=", onActivePage);

      let itemName = "Object";
      try { itemName = pageItem.label || pageItem.name || "Object"; } catch (e) {}

      let textPreview = "";
      try {
        if (pageItem.contents) {
          textPreview = String(pageItem.contents).substring(0, 50).replace(/\n/g, " ");
        }
      } catch (e) {}

      idx++;
      items.push({
        index:        idx,
        articleName:  article.name || ("Article " + (a + 1)),
        itemName:     itemName,
        textPreview:  textPreview,
        bounds:       bounds,
        pageIndex:    pageIndex,
        pageName:     pageName,
        onActivePage: onActivePage,
        _ref:         pageItem
      });
    }
  }

  let onActiveCount = items.filter(function(i){ return i.onActivePage; }).length;
  let displayPageIndex = activePageIndex;
  let displayPageName  = activePageName;

  // Fallback 1: if active page has no items, try the other page(s) in active spread.
  if (items.length > 0 && onActiveCount === 0 && activeSpreadPageIndexes.length > 0) {
    const candidates = {};

    items.forEach(function (it) {
      const inSpreadByIndex = activeSpreadPageIndexes.indexOf(it.pageIndex) >= 0;
      const inSpreadByName  = activeSpreadPageNames.indexOf(it.pageName) >= 0;
      if (!inSpreadByIndex && !inSpreadByName) return;

      const key = it.pageIndex + "|" + it.pageName;
      if (!candidates[key]) {
        candidates[key] = { count: 0, pageIndex: it.pageIndex, pageName: it.pageName };
      }
      candidates[key].count++;
    });

    const keys = Object.keys(candidates);
    if (keys.length > 0) {
      let best = candidates[keys[0]];
      for (let i = 1; i < keys.length; i++) {
        if (candidates[keys[i]].count > best.count) best = candidates[keys[i]];
      }

      items.forEach(function (it) {
        it.onActivePage =
          (best.pageIndex >= 0 && it.pageIndex === best.pageIndex) ||
          (!!best.pageName && !!it.pageName && it.pageName === best.pageName);
      });

      onActiveCount = items.filter(function(i){ return i.onActivePage; }).length;
      displayPageIndex = best.pageIndex;
      displayPageName  = best.pageName;

      console.log("[ROP] spread fallback applied -> pageIndex=", best.pageIndex, "pageName=", best.pageName, "count=", best.count);
    }
  }

  // Fallback 2: if still no match, use the first item's page.
  // This avoids an empty panel when InDesign reports an unexpected active page.
  if (items.length > 0 && onActiveCount === 0) {
    const fallbackPageIndex = items[0].pageIndex;
    const fallbackPageName  = items[0].pageName;
    items.forEach(function (it) {
      it.onActivePage =
        (fallbackPageIndex >= 0 && it.pageIndex === fallbackPageIndex) ||
        (!!fallbackPageName && !!it.pageName && it.pageName === fallbackPageName);
    });
    onActiveCount = items.filter(function(i){ return i.onActivePage; }).length;
    displayPageIndex = fallbackPageIndex;
    displayPageName  = fallbackPageName;
    console.log("[ROP] active page fallback applied -> pageIndex=", fallbackPageIndex, "pageName=", fallbackPageName);
  }

  console.log("[ROP] total items:", items.length, "onActivePage:", onActiveCount, "activePageIndex=", activePageIndex, "activePageName=", activePageName, "displayPageIndex=", displayPageIndex, "displayPageName=", displayPageName);

  let pageGeometry = null;
  try {
    let pg = null;
    if (displayPageIndex !== null && displayPageIndex >= 0) {
      pg = doc.pages.item(displayPageIndex);
      if (!pg || !pg.isValid) pg = null;
    }
    if (!pg && displayPageName) {
      pg = doc.pages.itemByName(displayPageName);
      if (!pg || !pg.isValid) pg = null;
    }
    if (!pg && activePage && activePage.isValid) pg = activePage;
    if (pg && pg.isValid) {
      const b = normalizeBounds(pg.bounds);
      if (b) pageGeometry = { bounds: b };
    }
  } catch (e) {}

  return { ok: true, items, pageGeometry, activePageIndex };
}

/** Selects a page item in InDesign and scrolls to it. */
function selectPageItem(item) {
  if (!item || !item._ref || !item._ref.isValid) return;
  app.activeDocument.select(item._ref);
  try { app.activeWindow.zoom(ZoomOptions.FIT_SELECTION); } catch (e) {}
}

function getSelectionAsPageItems() {
  let sel = [];
  try { sel = app.selection || []; } catch (e) { sel = []; }
  const out = [];

  for (let i = 0; i < sel.length; i++) {
    let it = sel[i];
    if (!it || !it.isValid) continue;
    try {
      const b = normalizeBounds(it.geometricBounds);
      if (!b) continue;
      out.push(it);
    } catch (e) {}
  }

  return out;
}

/**
 * Returns the top reorderable target for z-order operations.
 * If an item is inside nested groups, reorder the highest group ancestor
 * so mixed grouped/ungrouped selections can be handled consistently.
 */
function getReorderTarget(item) {
  if (!item || !item.isValid) return null;

  let cur = item;
  try {
    while (cur && cur.parent && cur.parent.isValid) {
      let pName = "";
      try { pName = String(cur.parent); } catch (e) {}
      if (pName.indexOf("[object Group]") === 0) {
        cur = cur.parent;
        continue;
      }
      break;
    }
  } catch (e) {}

  return (cur && cur.isValid) ? cur : null;
}

/**
 * Reorder selected objects according to selection order.
 * First selected becomes visually lowest in z-order (bottom-up).
 * Uses bringForward/sendBackward when available for broad compatibility.
 */
function reorderSelectedBottomUp() {
  if (!app.documents.length) return { reordered: 0, skipped: 0, error: t("noDocument") };

  const selectedRaw = getSelectionAsPageItems();
  if (selectedRaw.length < 2) return { reordered: 0, skipped: 0, error: t("fastNoSelection") };

  // Normalize to reorder targets and deduplicate while preserving selection order.
  const selected = [];
  const seen = {};
  selectedRaw.forEach(function (it) {
    const target = getReorderTarget(it);
    if (!target || !target.isValid || typeof target.id === "undefined") return;
    const k = String(target.id);
    if (seen[k]) return;
    seen[k] = true;
    selected.push(target);
  });

  if (selected.length < 2) {
    return {
      reordered: 0,
      skipped: 0,
      error: "Selection resolves to a single z-order target. Select at least 2 independent objects/groups."
    };
  }

  console.log("[ROP] reorderSelectedBottomUp: raw selected =", selectedRaw.length, "targets =", selected.length);
  for (var di = 0; di < selected.length; di++) {
    var dit = selected[di];
    var dType = "?", dParent = "?", dLayer = "?";
    try { dType   = String(dit); } catch(e) {}
    try { dParent = String(dit.parent); } catch(e) {}
    try { dLayer  = dit.itemLayer ? (dit.itemLayer.name || dit.itemLayer.id) : "none"; } catch(e) {}
    console.log("[ROP]   [" + di + "] type=" + dType + " parent=" + dParent + " layer=" + dLayer);
  }

  function stepForward(item) {
    if (item && typeof item.bringForward === "function") {
      item.bringForward();
      return true;
    }
    if (item && typeof item.zOrder === "function" && typeof ZOrderMethod !== "undefined" && ZOrderMethod && ZOrderMethod.BRING_FORWARD) {
      item.zOrder(ZOrderMethod.BRING_FORWARD);
      return true;
    }
    return false;
  }

  function stepBackward(item) {
    if (item && typeof item.sendBackward === "function") {
      item.sendBackward();
      return true;
    }
    if (item && typeof item.zOrder === "function" && typeof ZOrderMethod !== "undefined" && ZOrderMethod && ZOrderMethod.SEND_BACKWARD) {
      item.zOrder(ZOrderMethod.SEND_BACKWARD);
      return true;
    }
    return false;
  }

  // Group by parent — z-order is meaningful only among siblings
  var parentGroups = {};
  selected.forEach(function(it) {
    try {
      var key = (it.parent && typeof it.parent.id !== "undefined") ? String(it.parent.id) : "none";
      if (!parentGroups[key]) parentGroups[key] = [];
      parentGroups[key].push(it);
    } catch(e) {}
  });

  // Returns the current z-index of an item within its parent's pageItems (0 = bottom)
  function getZIndex(item) {
    try {
      var siblings = item.parent.pageItems.everyItem().getElements();
      for (var j = 0; j < siblings.length; j++) {
        if (siblings[j].id === item.id) return j;
      }
    } catch(e) {}
    return -1;
  }

  var reordered = 0;
  var skipped   = 0;

  Object.keys(parentGroups).forEach(function(key) {
    var items = parentGroups[key]; // desired order: items[0] lowest, items[last] highest
    if (items.length < 2) { skipped += items.length; return; }

    var currentZs = items.map(getZIndex);
    console.log("[ROP] group key=" + key + " currentZs=" + JSON.stringify(currentZs));

    // Deterministic strategy:
    // 1) If available, bring each selected item to front in selection order.
    //    Final relative order among selected becomes: first selected lowest, last selected highest.
    // 2) Else, send each selected item to back in reverse selection order (same final relative order).
    var movedAny = false;
    var canBringToFront = items.every(function (it) { return it && typeof it.bringToFront === "function"; });
    var canSendToBack = items.every(function (it) { return it && typeof it.sendToBack === "function"; });

    if (canBringToFront) {
      for (var i = 0; i < items.length; i++) {
        try {
          items[i].bringToFront();
          reordered++;
          movedAny = true;
        } catch (e) {
          skipped++;
          console.log("[ROP]   bringToFront failed [" + i + "]:", e.message);
        }
      }
      console.log("[ROP]   strategy=bringToFront");
    } else if (canSendToBack) {
      for (var i = items.length - 1; i >= 0; i--) {
        try {
          items[i].sendToBack();
          reordered++;
          movedAny = true;
        } catch (e2) {
          skipped++;
          console.log("[ROP]   sendToBack failed [" + i + "]:", e2.message);
        }
      }
      console.log("[ROP]   strategy=sendToBack");
    } else {
      // Last-resort per-pair strategy.
      for (var i = 1; i < items.length; i++) {
        var above = items[i];
        var below = items[i - 1];
        var moved = false;

        try {
          if (above && typeof above.bringInFrontOf === "function") {
            above.bringInFrontOf(below);
            moved = true;
            console.log("[ROP]   bringInFrontOf ok: [" + i + "] in front of [" + (i - 1) + "]");
          }
        } catch (e3) {
          console.log("[ROP]   bringInFrontOf failed [" + i + "]:", e3.message);
        }

        if (!moved) {
          try {
            if (below && typeof below.sendBehind === "function") {
              below.sendBehind(above);
              moved = true;
              console.log("[ROP]   sendBehind ok: [" + (i - 1) + "] behind [" + i + "]");
            }
          } catch (e4) {
            console.log("[ROP]   sendBehind failed [" + i + "]:", e4.message);
          }
        }

        if (!moved) {
          skipped++;
          console.log("[ROP]   pair not moved [" + (i - 1) + "," + i + "]");
        } else {
          reordered++;
          movedAny = true;
        }
      }
      console.log("[ROP]   strategy=pairwise-fallback");
    }

    var finalGroupZs = items.map(getZIndex);
    console.log("[ROP] group key=" + key + " finalZs=" + JSON.stringify(finalGroupZs) + " movedAny=" + movedAny);
  });

  if (reordered === 0 && skipped === 0) {
    return { reordered: 0, skipped: 0, error: t("fastNoSelection") };
  }

  // Log final z-positions to confirm actual result
  var finalZs = selected.map(function (it, i) {
    return i + ":z=" + getZIndex(it);
  });
  console.log("[ROP] final z-positions after reorder:", finalZs.join(", "));

  let articleSync = null;
  if (ENABLE_ARTICLE_SYNC_AFTER_REORDER && reordered > 0) {
    articleSync = syncSelectionOrderToArticles(selected);
    console.log("[ROP] article sync result:", JSON.stringify(articleSync));
  }

  return { reordered: reordered, skipped: skipped, articleSync: articleSync };
}

/**
 * Best-effort sync of the same selected objects into Articles panel order.
 * Toggle with ENABLE_ARTICLE_SYNC_AFTER_REORDER.
 */
function syncSelectionOrderToArticles(orderedSelection) {
  if (!app.documents.length) return { updatedArticles: 0, movedMembers: 0, errors: 0 };
  const doc = app.activeDocument;
  if (!doc.articles || !doc.articles.length) return { updatedArticles: 0, movedMembers: 0, errors: 0 };

  // Build rank map: item id -> desired rank (0 = first in reading order)
  // Include both the page item ID and its parent story ID (article members often point to Stories).
  const rankById = {};
  orderedSelection.forEach(function (it, idx) {
    try {
      if (it && it.isValid && typeof it.id !== "undefined") {
        rankById[String(it.id)] = idx;
        // Also register parent story id so story-referenced article members can match
        try {
          if (it.parentStory && it.parentStory.isValid && typeof it.parentStory.id !== "undefined") {
            // Only map story id if no other selected item already claimed it
            var sid = String(it.parentStory.id);
            if (typeof rankById[sid] === "undefined") rankById[sid] = idx;
          }
        } catch (e) {}
      }
    } catch (e) {}
  });
  console.log("[ROP] syncArticle rankById keys:", Object.keys(rankById).join(","));

  let updatedArticles = 0;
  let movedMembers = 0;
  let errors = 0;

  for (let a = 0; a < doc.articles.length; a++) {
    let article;
    try { article = doc.articles.item(a); } catch (e) { continue; }
    if (!article || !article.isValid) continue;

    let members = [];
    try { members = article.articleMembers.everyItem().getElements(); } catch (e) { members = []; }
    if (members.length < 2) continue;

    // Build full entry list for this article, resolving refs now (before any removal).
    const fullList = [];
    members.forEach(function (m) {
      try {
        // Try the raw itemRef id first (may be Story), then the resolved page item id
        let rawId = null;
        let rawRef = null;
        try { rawRef = m.itemRef; rawId = (rawRef && typeof rawRef.id !== "undefined") ? String(rawRef.id) : null; } catch (e) {}

        const ref = resolveArticleMemberRef(m);
        const resolvedId = (ref && ref.isValid && typeof ref.id !== "undefined") ? String(ref.id) : null;

        // Pick whichever id matches first; prefer the resolved page item for the add() call
        let idKey = null;
        if (resolvedId && typeof rankById[resolvedId] !== "undefined") idKey = resolvedId;
        else if (rawId && typeof rankById[rawId] !== "undefined") idKey = rawId;

        console.log("[ROP]   member rawId=" + rawId + " resolvedId=" + resolvedId + " matched=" + idKey);

        fullList.push({
          ref: ref || rawRef,   // prefer resolved page item, fall back to raw for add()
          idKey: idKey,
          isSelected: idKey !== null,
          rank: idKey !== null ? rankById[idKey] : -1
        });
      } catch (e) {
        // unresolvable member: keep a null slot so we preserve count
        fullList.push({ ref: null, idKey: null, isSelected: false, rank: -1 });
      }
    });

    // Find how many selected items are in this article
    const selectedInArticle = fullList.filter(function (e) { return e.isSelected; });
    if (selectedInArticle.length < 2) continue;

    // Find the positions (indices) occupied by selected items in the article
    const selectedPositions = [];
    fullList.forEach(function (e, pos) {
      if (e.isSelected) selectedPositions.push(pos);
    });

    // Sort selected entries for Articles panel in top-down order
    // (opposite of the bottom-up layer operation).
    const sortedSelected = selectedInArticle.slice().sort(function (a, b) { return a.rank - b.rank; });

    // Build new order: non-selected items stay, selected slots get the re-ranked items
    const newOrder = fullList.slice();
    selectedPositions.forEach(function (pos, i) {
      newOrder[pos] = sortedSelected[i];
    });

    // Remove ALL members (back to front to keep indices stable)
    for (let i = members.length - 1; i >= 0; i--) {
      try {
        if (members[i] && members[i].isValid) members[i].remove();
      } catch (e) {
        console.log("[ROP] syncArticle: remove member[" + i + "] failed:", e.message);
        errors++;
      }
    }

    // Re-add in new order
    for (let i = 0; i < newOrder.length; i++) {
      const entry = newOrder[i];
      if (!entry || !entry.ref || !entry.ref.isValid) {
        console.log("[ROP] syncArticle: skipping slot " + i + " (no valid ref)");
        errors++;
        continue;
      }
      try {
        article.articleMembers.add(entry.ref);
        movedMembers++;
      } catch (e) {
        console.log("[ROP] syncArticle: add slot " + i + " failed:", e.message, "| ref:", String(entry.ref));
        errors++;
      }
    }

    updatedArticles++;
  }

  return { updatedArticles: updatedArticles, movedMembers: movedMembers, errors: errors };
}

function saveGroupsSnapshot() {
  if (!app.documents.length) return { saved: 0, error: t("noDocument") };
  const doc = app.activeDocument;

  let groups = [];
  try { groups = doc.groups.everyItem().getElements(); } catch (e) { groups = []; }

  const snapshot = [];

  groups.forEach(function (g) {
    if (!g || !g.isValid) return;
    try {
      const members = g.pageItems.everyItem().getElements();
      const ids = members
        .filter(function (m) { return m && m.isValid && typeof m.id !== "undefined"; })
        .map(function (m) { return m.id; });
      if (ids.length >= 2) snapshot.push({ ids: ids });
    } catch (e) {}
  });

  _savedGroups = snapshot;
  return { saved: snapshot.length };
}

function ungroupAllGroups() {
  if (!app.documents.length) return { ungrouped: 0, error: t("noDocument") };
  const doc = app.activeDocument;

  let total = 0;
  let safety = 0;

  while (safety < 1000) {
    safety++;
    let groups = [];
    try { groups = doc.groups.everyItem().getElements(); } catch (e) { groups = []; }
    if (!groups.length) break;

    let changed = 0;
    for (let i = groups.length - 1; i >= 0; i--) {
      const g = groups[i];
      if (!g || !g.isValid) continue;
      try {
        g.ungroup();
        total++;
        changed++;
      } catch (e) {}
    }

    if (!changed) break;
  }

  return { ungrouped: total };
}

function regroupFromSnapshot() {
  if (!app.documents.length) return { regrouped: 0, error: t("noDocument") };
  const doc = app.activeDocument;
  if (!_savedGroups.length) return { regrouped: 0, error: t("fastNoGroupsSaved") };

  let regrouped = 0;

  _savedGroups.forEach(function (g) {
    if (!g || !g.ids || g.ids.length < 2) return;

    const members = [];
    g.ids.forEach(function (id) {
      try {
        const it = doc.pageItems.itemByID(id);
        if (it && it.isValid) members.push(it);
      } catch (e) {}
    });

    if (members.length < 2) return;

    try {
      doc.groups.add(members);
      regrouped++;
    } catch (e) {
      try {
        if (members[0] && members[0].parent && members[0].parent.groups) {
          members[0].parent.groups.add(members);
          regrouped++;
        }
      } catch (e2) {}
    }
  });

  return { regrouped };
}

/** Creates or replaces the reading order overlay layer. */
function drawReadingOrderLayer() {
  const doc  = app.activeDocument;
  const name = t("layerName");

  // Remove existing
  try {
    const ex = doc.layers.itemByName(name);
    if (ex && ex.isValid) ex.remove();
  } catch (e) {}

  const layer = doc.layers.add({ name });

  // Create accent color swatch
  let accentSwatch;
  try {
    accentSwatch = doc.colors.itemByName("_ROPAccent");
    if (!accentSwatch.isValid) throw new Error();
  } catch (e) {
    try {
      accentSwatch = doc.colors.add({
        name: "_ROPAccent", model: ColorModel.PROCESS,
        space: ColorSpace.RGB, colorValue: ACCENT_RGB
      });
    } catch (e2) {
      accentSwatch = doc.swatches.itemByName("Black");
    }
  }

  const data = getArticleData();
  if (!data.ok || !data.items.length) return 0;

  const items = data.items;
  let drawn = 0;
  let drawErrors = 0;

  let paperSwatch = null;
  let blackSwatch = null;
  try { paperSwatch = doc.swatches.itemByName("Paper"); } catch (e) {}
  try { blackSwatch = doc.swatches.itemByName("Black"); } catch (e) {}

  let dashedStrokeStyle = null;
  try {
    dashedStrokeStyle = doc.strokeStyles.itemByName("Dashed");
    if (!dashedStrokeStyle.isValid) throw new Error();
  } catch (e) {
    dashedStrokeStyle = null;
  }

  // Swatch rouge pour le texte des badges
  let textRedSwatch = null;
  try {
    try {
      const redColorDef = doc.colors.itemByName("_ROPText");
      if (redColorDef && redColorDef.isValid) {
        redColorDef.model = ColorModel.PROCESS;
        redColorDef.space = ColorSpace.RGB;
        redColorDef.colorValue = [210, 0, 0];
      }
    } catch (eDef) {}
    textRedSwatch = doc.swatches.itemByName("_ROPText");
    if (!textRedSwatch.isValid) throw new Error();
  } catch (e) {
    try {
      doc.colors.add({
        name: "_ROPText", model: ColorModel.PROCESS,
        space: ColorSpace.RGB, colorValue: [210, 0, 0]
      });
      textRedSwatch = doc.swatches.itemByName("_ROPText");
    } catch (e2) {}
  }
  if (!textRedSwatch || !textRedSwatch.isValid) {
    try {
      textRedSwatch = doc.swatches.itemByName("Red");
      if (!textRedSwatch.isValid) throw new Error();
    } catch (e) {
      try { textRedSwatch = doc.swatches.itemByName("Magenta"); } catch (e2) {}
    }
  }

  // Style de paragraphe dedie pour le numero
  let badgeParaStyle = null;
  try {
    badgeParaStyle = doc.paragraphStyles.itemByName("CSPS-RED");
    if (!badgeParaStyle.isValid) throw new Error();
  } catch (e) {
    try {
      badgeParaStyle = doc.paragraphStyles.add({ name: "CSPS-RED" });
    } catch (e2) {}
  }
  if (badgeParaStyle && badgeParaStyle.isValid) {
    try { badgeParaStyle.basedOn = doc.paragraphStyles.itemByName("[Basic Paragraph]"); } catch (e) {}
    try { badgeParaStyle.justification = Justification.CENTER_ALIGN; } catch (e) {}
    try { badgeParaStyle.spaceBefore = 0; } catch (e) {}
    try { badgeParaStyle.spaceAfter = 0; } catch (e) {}
    try { badgeParaStyle.underline = false; } catch (e) {}
    try { badgeParaStyle.strikeThru = false; } catch (e) {}
    if (textRedSwatch && textRedSwatch.isValid) {
      try { badgeParaStyle.fillColor = textRedSwatch; } catch (e) {}
    }
  }

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const b    = normalizeBounds(item.bounds); // [top, left, bottom, right]
    const pg   = getParentPage(item._ref);
    if (!pg || !b) continue;

    const top = b[0], left = b[1], bottom = b[2], right = b[3];
    let itemDrawn = false;

    // Bounding box outline
    try {
      pg.rectangles.add({
        itemLayer: layer,
        geometricBounds: [top, left, bottom, right],
        fillColor: "None", strokeColor: accentSwatch, strokeWeight: 1.5
      });
      itemDrawn = true;
    } catch (e) { drawErrors++; }

    // Badge circle
    try {
      const label = String(item.index);
      const r = (label.length >= 2) ? BADGE_R + 2 : BADGE_R + 1;
      pg.ovals.add({
        itemLayer: layer,
        geometricBounds: [top - r, left - r, top + r, left + r],
        fillColor: (paperSwatch && paperSwatch.isValid) ? paperSwatch : "Paper",
        strokeColor: accentSwatch,
        strokeWeight: 1.2
      });
      const ps = (label.length >= 2) ? 7.2 : 8.0;
      // Meme zone que le rond, puis centrage via proprietes de texte/paragraphe
      const txLeft = left - r;
      const txTop = top - r;
      const lbl = pg.textFrames.add({
        itemLayer: layer,
        geometricBounds: [txTop, txLeft, txTop + (2 * r), txLeft + (2 * r)],
        fillColor: "None", strokeColor: "None"
      });
      lbl.contents = label;
      // Neutraliser les styles herites (supprime souligne et police du doc)
      try { lbl.parentStory.appliedCharacterStyle = doc.characterStyles.itemByName("[None]"); } catch (e) {}
      try { lbl.parentStory.appliedParagraphStyle = doc.paragraphStyles.itemByName("[Basic Paragraph]"); } catch (e) {}
      try { lbl.textFramePreferences.insetSpacing = [0, 0, 0, 0]; } catch (e) {}
      try { lbl.textFramePreferences.verticalJustification = VerticalJustification.CENTER_ALIGN; } catch (e) {}
      try { lbl.textFramePreferences.firstBaselineOffset = FirstBaseline.FIXED; } catch (e) {}
      try { lbl.textFramePreferences.firstBaselineMinimum = r + ps * 0.35; } catch (e) {}
      if (badgeParaStyle && badgeParaStyle.isValid) {
        try { lbl.parentStory.appliedParagraphStyle = badgeParaStyle; } catch (e) {}
        try { lbl.paragraphs.everyItem().appliedParagraphStyle = badgeParaStyle; } catch (e) {}
      }
      // Renforcer localement les proprietes critiques
      try { lbl.paragraphs[0].justification = Justification.CENTER_ALIGN; } catch (e) {}
      try { lbl.paragraphs[0].pointSize = ps; } catch (e) {}
      try { lbl.paragraphs[0].leading = ps; } catch (e) {}
      try { lbl.paragraphs[0].spaceBefore = 0; } catch (e) {}
      try { lbl.paragraphs[0].spaceAfter = 0; } catch (e) {}
      try { lbl.paragraphs[0].underline = false; } catch (e) {}
      try { lbl.paragraphs[0].strikeThru = false; } catch (e) {}
      try { lbl.paragraphs[0].strokeColor = "None"; } catch (e) {}
      try { lbl.paragraphs[0].strokeWeight = 0; } catch (e) {}
      if (textRedSwatch) {
        try { lbl.paragraphs[0].fillColor = textRedSwatch; } catch (e) {}
        try { lbl.texts[0].fillColor = textRedSwatch; } catch (e) {}
        try { lbl.parentStory.fillColor = textRedSwatch; } catch (e) {}
        try { lbl.insertionPoints[0].fillColor = textRedSwatch; } catch (e) {}
        try { lbl.characters.everyItem().fillColor = textRedSwatch; } catch (e) {}
        try { lbl.characters.everyItem().fillTint = 100; } catch (e) {}
      } else {
        try { lbl.paragraphs[0].fillColor = "Magenta"; } catch (e) {}
        try { lbl.texts[0].fillColor = "Magenta"; } catch (e) {}
        try { lbl.parentStory.fillColor = "Magenta"; } catch (e) {}
        try { lbl.insertionPoints[0].fillColor = "Magenta"; } catch (e) {}
        try { lbl.characters.everyItem().fillColor = "Magenta"; } catch (e) {}
      }
      try { lbl.texts[0].strokeColor = "None"; } catch (e) {}
      try { lbl.texts[0].strokeWeight = 0; } catch (e) {}
      try { lbl.characters.everyItem().strokeColor = "None"; } catch (e) {}
      try { lbl.characters.everyItem().strokeWeight = 0; } catch (e) {}
      try { lbl.characters.everyItem().underline = false; } catch (e) {}
      try { lbl.characters.everyItem().strikeThru = false; } catch (e) {}
      itemDrawn = true;
    } catch (e) { drawErrors++; }

    if (itemDrawn) drawn++;

    // Arrow to next item (same page only)
    if (i < items.length - 1) {
      const next = items[i + 1];
      if (item.pageIndex !== next.pageIndex) continue;
      const nb = normalizeBounds(next.bounds);
      if (!nb) continue;
      try {
        const x1c = (left + right) / 2,   y1c = (top + bottom) / 2;
        const x2c = (nb[1] + nb[3]) / 2,  y2c = (nb[0] + nb[2]) / 2;
        const p1 = rectBorderPointTowards(b, x2c, y2c);
        const p2 = rectBorderPointTowards(nb, x1c, y1c);
        const x1 = p1[0], y1 = p1[1];
        const x2 = p2[0], y2 = p2[1];

        const line = pg.graphicLines.add({
          itemLayer: layer,
          geometricBounds: [Math.min(y1, y2), Math.min(x1, x2), Math.max(y1, y2), Math.max(x1, x2)],
          strokeColor: accentSwatch, strokeWeight: ARROW_W
        });
        try {
          if (dashedStrokeStyle && dashedStrokeStyle.isValid) {
            line.strokeType = dashedStrokeStyle;
          }
        } catch (eStyle) {}
        try {
          if (ArrowHead && ArrowHead.TRIANGLE) {
            line.rightArrowHead = ArrowHead.TRIANGLE;
          } else {
            line.rightArrowHead = "Triangle";
          }
          line.rightArrowHeadScale = 60;
        } catch (eHead) {
          try {
            line.endArrowHead = "Triangle";
            line.endArrowHeadScale = 60;
          } catch (eHead2) {}
        }
        try {
          line.paths[0].entirePath = [[x1, y1], [x2, y2]];
        } catch (ePath) {
          // Some InDesign contexts expect swapped coordinate tuples.
          line.paths[0].entirePath = [[y1, x1], [y2, x2]];
        }
      } catch (e) {
        // Arrow failure should not count as badge/text drawing error.
      }
    }
  }

  console.log("[ROP] drawReadingOrderLayer result: drawn=", drawn, "errors=", drawErrors, "items=", items.length);

  return drawn;
}

/** Deletes the reading order layer. Returns true if deleted. */
function deleteReadingOrderLayer() {
  try {
    const l = app.activeDocument.layers.itemByName(t("layerName"));
    if (l && l.isValid) { l.remove(); return true; }
  } catch (e) {}
  return false;
}


// ═════════════════════════════════════════════════════════════════════════════
// 3. SVG THUMBNAIL RENDERER
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Generates HTML markup showing the page with numbered item overlays.
 * @param {Array}  items        - filtered to active page
 * @param {object} pageGeometry - { bounds: [top,left,bottom,right] }
 * @param {number} containerW   - available width in px
 * @param {number} highlightIdx - index to highlight, or -1
 */
function buildThumbnailHTML(items, pageGeometry, containerW, highlightIdx) {
  if (!pageGeometry || !items.length) return "";

  const pb   = normalizeBounds(pageGeometry.bounds);
  if (!pb) return "";
  const pw   = pb[3] - pb[1], ph = pb[2] - pb[0];
  if (pw <= 0 || ph <= 0) return "";

  const viewW = Math.max(10, (containerW || 280) - 12);
  const sc    = viewW / pw;
  const viewH = Math.max(10, Math.round(ph * sc));

  const sx = function (x) { return (x - pb[1]) * sc; };
  const sy = function (y) { return (y - pb[0]) * sc; };

  const ACCENT = "#ff4526";
  const BLUE   = "#0078d4";
  const p = [
    `<div style="position:relative;width:${Math.round(viewW)}px;height:${viewH}px;background:#f5f5f5;border:1px solid ${ACCENT};overflow:hidden;border-radius:2px;">`
  ];

  items.forEach(function (item, i) {
    const b = normalizeBounds(item.bounds);
    if (!b) return;

    const x = sx(b[1]);
    const y = sy(b[0]);
    const w = (b[3] - b[1]) * sc;
    const h = (b[2] - b[0]) * sc;
    if (w <= 0 || h <= 0) return;

    const hl = (i === highlightIdx);
    const c  = hl ? BLUE : ACCENT;
    const stroke = hl ? 2 : 1;
    const br = 6;

    p.push(`<div style="position:absolute;left:${x.toFixed(1)}px;top:${y.toFixed(1)}px;width:${w.toFixed(1)}px;height:${h.toFixed(1)}px;border:${stroke}px solid ${c};background:rgba(255,69,38,0.08);"></div>`);
    p.push(`<div style="position:absolute;left:${(x+2).toFixed(1)}px;top:${(y+2).toFixed(1)}px;width:${(br*2).toFixed(1)}px;height:${(br*2).toFixed(1)}px;border-radius:50%;background:#fff;border:1px solid ${c};color:#000;font-size:10px;font-weight:700;line-height:${(br*2).toFixed(1)}px;text-align:center;">${item.index}</div>`);
  });

  p.push("</div>");
  return p.join("");
}


// ═════════════════════════════════════════════════════════════════════════════
// 4. PANEL STATE & DOM MANIPULATION
// ═════════════════════════════════════════════════════════════════════════════

let _panelRoot  = null;   // DOM root of the panel (set in show callback)
let _data       = null;   // last getArticleData() result
let _pageItems  = [];     // items on active page
let _navIdx     = 0;      // current navigation index (0-based)
let _previewCollapsed = false;
let _pageChangeHandler = null;  // afterContextChanged listener reference

/** Returns a DOM element within the panel. */
function el(id) {
  return _panelRoot ? _panelRoot.querySelector("#" + id) : null;
}

/** Sets text content of a panel element. */
function setText(id, text) {
  const e = el(id);
  if (e) e.textContent = text;
}

/** Shows or hides a panel element. */
function setVisible(id, visible) {
  const e = el(id);
  if (e) e.style.display = visible ? "" : "none";
}

/** Shows or hides the status bar with an optional error style. */
function showStatus(msg, isError) {
  const e = el("status-msg");
  if (!e) return;
  e.textContent   = msg || "";
  e.className     = "status" + (isError ? " error" : "");
  e.style.display = msg ? "block" : "none";
}

/** Localizes all [data-i18n] elements in the panel. */
function applyLocalization() {
  if (!_panelRoot) return;
  _panelRoot.querySelectorAll("[data-i18n]").forEach(function (e) {
    e.textContent = t(e.getAttribute("data-i18n"));
  });
  _panelRoot.querySelectorAll("[data-i18n-title]").forEach(function (e) {
    e.setAttribute("title", t(e.getAttribute("data-i18n-title")));
  });
}

function setPreviewCollapsed(collapsed) {
  _previewCollapsed = !!collapsed;
  const sec = el("section-thumbnail");
  if (sec) {
    if (_previewCollapsed) sec.classList.add("collapsed");
    else sec.classList.remove("collapsed");
  }
  const btn = el("btn-toggle-preview");
  if (btn) {
    btn.textContent = _previewCollapsed ? "▸" : "▾";
    btn.setAttribute("aria-expanded", _previewCollapsed ? "false" : "true");
  }
}

/** Re-renders the thumbnail SVG. */
function refreshThumbnail(highlightIdx) {
  const container = el("thumbnail-container");
  if (!container || !_data || !_data.ok) return;
  const w   = container.offsetWidth || 280;
  const html = buildThumbnailHTML(_pageItems, _data.pageGeometry, w,
                                  typeof highlightIdx === "number" ? highlightIdx : -1);
  container.innerHTML = html;
  console.log("[ROP] thumbnail rendered: items=", _pageItems.length, "htmlLen=", html.length, "width=", w);
}

/** Updates the navigation counter and item info. */
function refreshNav() {
  const total   = _pageItems.length;
  const current = total > 0 ? _navIdx + 1 : 0;
  const item    = _pageItems[_navIdx] || null;

  setText("nav-counter", t("navCurrent", { current, total }));
  setText("nav-info",    item ? t("navItem", { num: item.index, name: item.textPreview || item.itemName }) : "—");
  setText("nav-article", item ? t("navArticle", { name: item.articleName }) : "");
  setText("nav-hint",    item ? t("navSelectHint") : "");

  const btnPrev = el("btn-prev");
  const btnNext = el("btn-next");
  if (btnPrev) btnPrev.disabled = (current <= 1);
  if (btnNext) btnNext.disabled = (current >= total);

  if (total === 0) showStatus(t("navNoItems"), false);
}

/** Full refresh: re-reads InDesign data and rebuilds the panel. */
function doRefresh() {
  showStatus("", false);
  try {
    const data = getArticleData();

    if (!data.ok) {
      _data = null; _pageItems = []; _navIdx = 0;
      setVisible("section-thumbnail", false);
      setVisible("section-nav",       false);
      setVisible("section-layer",     false);
      setVisible("empty-state",       true);
      setText("empty-message", data.error);
      return;
    }

    _data      = data;
    _pageItems = data.items.filter(function (i) { return i.onActivePage; });
    _navIdx    = 0;

    setVisible("section-thumbnail", true);
    setVisible("section-nav",       true);
    setVisible("section-layer",     true);
    setVisible("empty-state",       false);

    refreshThumbnail(-1);
    refreshNav();

  } catch (e) {
    showStatus(t("errGeneric", { msg: e.message }), true);
  }
}

/** Navigate to an item: select in InDesign, update UI. */
function navigateTo(idx) {
  const item = _pageItems[idx];
  if (!item) return;
  try { selectPageItem(item); } catch (e) {
    showStatus(t("errGeneric", { msg: e.message }), true);
  }
  refreshThumbnail(idx);
  refreshNav();
}

/** Binds all button click handlers. */
function bindButtons() {
  function bind(id, handler) {
    const e = el(id);
    if (e) e.addEventListener("click", handler);
  }

  bind("btn-refresh", function () { doRefresh(); });

  bind("btn-toggle-preview", function () {
    setPreviewCollapsed(!_previewCollapsed);
  });

  bind("btn-prev", function () {
    if (_navIdx > 0) { _navIdx--; navigateTo(_navIdx); }
  });

  bind("btn-next", function () {
    if (_navIdx < _pageItems.length - 1) { _navIdx++; navigateTo(_navIdx); }
  });

  bind("btn-draw-layer", function () {
    showStatus("", false);
    try {
      const count = drawReadingOrderLayer();
      showStatus(t("layerDrawn", { count }), false);
    } catch (e) {
      showStatus(t("errGeneric", { msg: e.message }), true);
    }
  });

  bind("btn-delete-layer", function () {
    showStatus("", false);
    try {
      const deleted = deleteReadingOrderLayer();
      showStatus(deleted ? t("layerDeleted") : t("layerNotFound"), false);
    } catch (e) {
      showStatus(t("errGeneric", { msg: e.message }), true);
    }
  });

  bind("btn-fast-reorder", function () {
    showStatus("", false);
    try {
      const result = reorderSelectedBottomUp();
      if (result.error) {
        showStatus(result.error, true);
        return;
      }
      if (result.reordered > 0 && result.skipped > 0) {
        showStatus(t("fastReordered", { count: result.reordered }) + " " + t("fastReorderSkipped"), false);
      } else if (result.reordered > 0) {
        showStatus(t("fastReordered", { count: result.reordered }), false);
      } else {
        showStatus(t("fastReorderSkipped"), true);
      }
    } catch (e) {
      showStatus(t("errGeneric", { msg: e.message }), true);
    }
  });

  bind("btn-fast-save-groups", function () {
    showStatus("", false);
    try {
      const result = saveGroupsSnapshot();
      if (result.error) {
        showStatus(result.error, true);
        return;
      }
      showStatus(t("fastGroupsSaved", { count: result.saved }), false);
    } catch (e) {
      showStatus(t("errGeneric", { msg: e.message }), true);
    }
  });

  bind("btn-fast-ungroup-all", function () {
    showStatus("", false);
    try {
      const result = ungroupAllGroups();
      if (result.error) {
        showStatus(result.error, true);
        return;
      }
      showStatus(t("fastUngrouped", { count: result.ungrouped }), false);
    } catch (e) {
      showStatus(t("errGeneric", { msg: e.message }), true);
    }
  });

  bind("btn-fast-regroup", function () {
    showStatus("", false);
    try {
      const result = regroupFromSnapshot();
      if (result.error) {
        showStatus(result.error, true);
        return;
      }
      showStatus(t("fastRegrouped", { count: result.regrouped }), false);
    } catch (e) {
      showStatus(t("errGeneric", { msg: e.message }), true);
    }
  });
}


// ═════════════════════════════════════════════════════════════════════════════
// 5. ENTRYPOINT REGISTRATION
// ═════════════════════════════════════════════════════════════════════════════

entrypoints.setup({
  panels: {
    readingOrderPanel: {

      /**
       * Called each time the panel becomes visible.
       * panelNode is the root DOM element of the panel — this is where
       * we can safely access the HTML elements defined in index.html.
       */
      show: function (panelNode) {
        console.log("[ROP] show() called");
        _panelRoot = panelNode;

        applyLocalization();
        setPreviewCollapsed(_previewCollapsed);
        bindButtons();

        // Listen for page/spread navigation and auto-refresh the preview
        if (!_pageChangeHandler) {
          _pageChangeHandler = function () {
            console.log("[ROP] afterContextChanged -> doRefresh");
            doRefresh();
          };
          try {
            app.addEventListener("afterContextChanged", _pageChangeHandler);
            console.log("[ROP] afterContextChanged listener registered");
          } catch (e) {
            console.log("[ROP] could not register afterContextChanged:", e.message);
            _pageChangeHandler = null;
          }
        }

        // Delay to let InDesign finish initializing the document context
        setTimeout(function () {
          try {
            console.log("[ROP] documents:", app.documents.length);
            if (app.documents.length > 0) {
              console.log("[ROP] doc:", app.activeDocument.name);
              console.log("[ROP] articles:", app.activeDocument.articles.length);
            }
          } catch (e) {
            console.log("[ROP] doc check error:", e.message);
          }
          doRefresh();
        }, 500);
      },

      hide: function () {
        console.log("[ROP] hide() called");
        if (_pageChangeHandler) {
          try {
            app.removeEventListener("afterContextChanged", _pageChangeHandler);
            console.log("[ROP] afterContextChanged listener removed");
          } catch (e) {
            console.log("[ROP] could not remove afterContextChanged:", e.message);
          }
          _pageChangeHandler = null;
        }
      }
    }
  }
});

console.log("[ROP] main.js loaded and entrypoints registered");
