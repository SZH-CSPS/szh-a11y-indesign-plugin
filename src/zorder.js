/**
 * src/zorder.js
 * =============
 * Construction RO — the reading order defined by the z-order (layer stack).
 *
 * The content stream of an exported PDF page follows the stacking order
 * BOTTOM-UP: the backmost object is read first, the frontmost last. Many
 * non-conformant assistive tools (reflow, consumer text-to-speech, dyslexia
 * aids) read this order instead of the tag tree, which is why it matters
 * even though PDF/UA only requires the Tag RO.
 *
 * Copyright (C) 2025-2026 SZH/CSPS — Swiss Centre for Special Needs Education
 * Licensed under GNU GPL v3 — https://www.gnu.org/licenses/
 */

"use strict";

const indesign = require("indesign");
const { app } = indesign;
const ZOrderMethod = indesign.ZOrderMethod || globalThis.ZOrderMethod;
const U = require("./utils.js");
const { syncSelectionOrderToArticles, getTagROItems } = require("./articles.js");

/**
 * Direction of InDesign pageItems collections relative to the z-order.
 *
 * Per the InDesign scripting references and community consensus, index 0 of a
 * parent's pageItems collection is the FRONTMOST (topmost) item. If a future
 * InDesign version inverts this (Construction RO numbers would appear exactly
 * reversed), flip this constant.
 */
const PAGEITEMS_INDEX0_IS_FRONT = true;

/** When true, a successful z-reorder also rewrites the Articles panel order. */
const ENABLE_ARTICLE_SYNC_AFTER_REORDER = true;

// ─── Construction RO enumeration ──────────────────────────────────────────────

/** Layers eligible for the Construction RO, bottom of the stack FIRST. */
function getEligibleLayersBottomUp(doc) {
  let layers = [];
  try { layers = doc.layers.everyItem().getElements(); } catch (e) { return []; }

  const out = [];
  for (let li = layers.length - 1; li >= 0; li--) { // layers[0] is the topmost
    const layer = layers[li];
    if (!layer || !layer.isValid) continue;
    try { if (!layer.visible) continue; } catch (e) {}
    try { if (U.OVERLAY_LAYER_NAMES.indexOf(String(layer.name)) >= 0) continue; } catch (e) {}
    out.push(layer);
  }
  return out;
}

/**
 * Builds one Construction RO item entry, or returns null when the item is
 * excluded (hidden, non-printing, artifact, no bounds).
 */
function buildEntry(item, layerName, pg, opts) {
  try { if (item.visible === false) return null; } catch (e) {}      // hidden → not exported
  try { if (item.nonprinting === true) return null; } catch (e) {}   // non-printing → not exported
  if (U.isArtifact(item)) return null;                               // artifacts → no reading order

  const bounds = U.normalizeBounds(item.geometricBounds);
  if (!bounds) return null;

  let itemName = "Object";
  try { itemName = item.label || item.name || "Object"; } catch (e) {}

  let textPreview = "";
  try {
    if (item.contents) {
      textPreview = String(item.contents).substring(0, 50).replace(/\n/g, " ");
    }
  } catch (e) {}

  // Alt text state — only computed for image frames (where alt matters)
  // and skipped entirely for the overlay drawing path.
  let hasGraphic = false, altStatus = "", altText = "";
  if (!opts.skipAlt) {
    hasGraphic = U.hasGraphics(item);
    if (hasGraphic) {
      const ai = U.getAltTextInfo(item);
      altStatus = ai.status;
      altText   = ai.text;
    }
  }

  return {
    index:        0, // filled by the caller
    articleName:  "",
    itemName:     itemName,
    textPreview:  textPreview,
    bounds:       bounds,
    pageIndex:    pg.documentOffset,
    pageName:     String(pg.name || ""),
    pageId:       pg.id,
    layerName:    layerName,
    onActivePage: true,
    hasGraphic:   hasGraphic,
    altStatus:    altStatus,
    altText:      altText,
    _ref:         item
  };
}

/**
 * Reads the Construction RO of ONE page: every top-level object, ordered
 * bottom→top (item #1 = backmost = read first by content-stream readers).
 *
 * Iterates document layers from the bottom of the Layers panel upwards, and
 * within each layer walks the pageItems collection in back-to-front order.
 * Excluded: hidden layers, plugin overlay layers, hidden or non-printing
 * items, master-page items, and artifacts. A group counts as ONE object.
 *
 * @param {object} [opts]  { skipAlt: true } skips the alt text reads
 */
function getConstructionROItems(doc, page, opts) {
  opts = opts || {};
  const items = [];
  if (!doc || !page || !page.isValid) return { ok: false, items: items };

  const layers = getEligibleLayersBottomUp(doc);

  for (let li = 0; li < layers.length; li++) {
    const layer = layers[li];

    let layerItems = [];
    try { layerItems = layer.pageItems.everyItem().getElements(); } catch (e) { layerItems = []; }
    if (PAGEITEMS_INDEX0_IS_FRONT) layerItems = layerItems.slice().reverse(); // backmost first

    let layerName = "";
    try { layerName = String(layer.name || ""); } catch (e) {}

    for (let i = 0; i < layerItems.length; i++) {
      const item = layerItems[i];
      if (!item || !item.isValid) continue;

      // Layer collections span the whole document: keep this page only.
      // (This also drops master-page items, whose parent page differs.)
      let pg = null;
      try { pg = U.getParentPage(item); } catch (e) {}
      if (!pg || pg.id !== page.id) continue;

      const entry = buildEntry(item, layerName, pg, opts);
      if (entry) items.push(entry);
    }
  }

  items.forEach(function (it, i) { it.index = i + 1; });
  return { ok: true, items: items };
}

/**
 * Reads the Construction RO of EVERY document page in a single pass over the
 * layer collections (the per-page function would rescan the whole document
 * once per page — quadratic and slow on long documents). Items are grouped
 * by page in document order; numbering restarts on each page.
 *
 * @param {object} [opts]  { skipAlt: true } skips the alt text reads
 */
function getConstructionROItemsAllPages(doc, opts) {
  opts = opts || {};
  if (!doc) return { ok: false, items: [] };

  // One bucket per document page — master items fall through (no bucket).
  const buckets = {};
  const pageOrder = [];
  try {
    doc.pages.everyItem().getElements().forEach(function (p) {
      buckets[String(p.id)] = [];
      pageOrder.push(String(p.id));
    });
  } catch (e) {
    return { ok: false, items: [] };
  }

  const layers = getEligibleLayersBottomUp(doc);

  for (let li = 0; li < layers.length; li++) {
    const layer = layers[li];

    let layerItems = [];
    try { layerItems = layer.pageItems.everyItem().getElements(); } catch (e) { layerItems = []; }
    if (PAGEITEMS_INDEX0_IS_FRONT) layerItems = layerItems.slice().reverse(); // backmost first

    let layerName = "";
    try { layerName = String(layer.name || ""); } catch (e) {}

    for (let i = 0; i < layerItems.length; i++) {
      const item = layerItems[i];
      if (!item || !item.isValid) continue;

      let pg = null;
      try { pg = U.getParentPage(item); } catch (e) {}
      if (!pg) continue;
      const bucket = buckets[String(pg.id)];
      if (!bucket) continue; // master page or pasteboard

      const entry = buildEntry(item, layerName, pg, opts);
      if (entry) bucket.push(entry);
    }
  }

  // Flatten in document page order, numbering restarting on each page.
  const all = [];
  pageOrder.forEach(function (pid) {
    buckets[pid].forEach(function (it, i) {
      it.index = i + 1;
      all.push(it);
    });
  });

  return { ok: true, items: all };
}

// ─── Selection reorder (bottom-up) ────────────────────────────────────────────

/**
 * Reorders the selected objects according to the SELECTION ORDER:
 * the first-selected object ends up backmost (read first), the last-selected
 * frontmost. Items inside nested groups are normalized to their top group
 * ancestor, since that is what actually moves in the parent's stack.
 *
 * Note: the selected items are brought to the front of their layer as a side
 * effect (bringToFront in sequence) — their order RELATIVE TO EACH OTHER is
 * what this tool guarantees.
 */
function reorderSelectedBottomUp() {
  if (!app.documents.length) return { reordered: 0, skipped: 0, errorKey: "noDocument" };

  const selectedRaw = U.getSelectionAsPageItems();
  if (selectedRaw.length < 2) return { reordered: 0, skipped: 0, errorKey: "fastNoSelection" };

  // Normalize to reorder targets, deduplicate, preserve selection order.
  const selected = [];
  const seen = {};
  selectedRaw.forEach(function (it) {
    const target = U.getReorderTarget(it);
    if (!target || !target.isValid || typeof target.id === "undefined") return;
    const k = String(target.id);
    if (seen[k]) return;
    seen[k] = true;
    selected.push(target);
  });

  if (selected.length < 2) {
    return { reordered: 0, skipped: 0, errorKey: "fastSingleTarget" };
  }

  // z-order is only meaningful among siblings: group by parent.
  const parentGroups = {};
  selected.forEach(function (it) {
    try {
      const key = (it.parent && typeof it.parent.id !== "undefined") ? String(it.parent.id) : "none";
      if (!parentGroups[key]) parentGroups[key] = [];
      parentGroups[key].push(it);
    } catch (e) {}
  });

  let reordered = 0;
  let skipped   = 0;

  Object.keys(parentGroups).forEach(function (key) {
    const items = parentGroups[key]; // desired: items[0] backmost … items[last] frontmost
    if (items.length < 2) { skipped += items.length; return; }

    const canBringToFront = items.every(function (it) { return it && typeof it.bringToFront === "function"; });
    const canSendToBack   = items.every(function (it) { return it && typeof it.sendToBack === "function"; });

    if (canBringToFront) {
      // Bring each to front in selection order: the last call ends frontmost,
      // so the relative order becomes first-selected lowest … last highest.
      for (let i = 0; i < items.length; i++) {
        try { items[i].bringToFront(); reordered++; }
        catch (e) { skipped++; U.log("bringToFront failed [" + i + "]:", e.message); }
      }
    } else if (canSendToBack) {
      // Same final relative order, built from the back.
      for (let i = items.length - 1; i >= 0; i--) {
        try { items[i].sendToBack(); reordered++; }
        catch (e) { skipped++; U.log("sendToBack failed [" + i + "]:", e.message); }
      }
    } else {
      // Last-resort pairwise strategy for objects lacking the convenience APIs.
      for (let i = 1; i < items.length; i++) {
        const above = items[i];
        const below = items[i - 1];
        let moved = false;

        try {
          if (above && typeof above.bringInFrontOf === "function") {
            above.bringInFrontOf(below);
            moved = true;
          }
        } catch (e) {}

        if (!moved) {
          try {
            if (below && typeof below.sendBehind === "function") {
              below.sendBehind(above);
              moved = true;
            }
          } catch (e) {}
        }

        if (!moved && ZOrderMethod && above && typeof above.zOrder === "function") {
          try { above.zOrder(ZOrderMethod.BRING_FORWARD); moved = true; } catch (e) {}
        }

        if (moved) reordered++; else skipped++;
      }
    }
  });

  if (reordered === 0 && skipped === 0) {
    return { reordered: 0, skipped: 0, errorKey: "fastNoSelection" };
  }

  let articleSync = null;
  if (ENABLE_ARTICLE_SYNC_AFTER_REORDER && reordered > 0) {
    articleSync = syncSelectionOrderToArticles(selected);
    U.log("article sync:", JSON.stringify(articleSync));
  }

  return { reordered: reordered, skipped: skipped, articleSync: articleSync };
}

// ─── Align Construction RO to Tag RO (experimental) ──────────────────────────

/**
 * EXPERIMENTAL — re-stacks the document so the Construction RO follows the
 * Tag RO: every article item (or its top group ancestor) is brought to front
 * in Articles-panel order, so the first article item ends up backmost on its
 * layer and the last one frontmost.
 *
 * Known limits, hence "experimental":
 *  - bringToFront works WITHIN a layer: when article items sit on several
 *    layers, the order BETWEEN layers still follows the layer stack
 *    (the caller is told via multiLayer so the UI can warn).
 *  - Non-article items (backgrounds, decorations) end up BEHIND the article
 *    content, which may change the visual stacking of overlapping designs.
 */
function alignZOrderToTagRO() {
  if (!app.documents.length) return { moved: 0, errorKey: "noDocument" };
  const doc = app.activeDocument;

  const data = getTagROItems(doc, null, { skipAlt: true });
  if (!data.ok) return { moved: 0, errorKey: data.errorKey };
  if (!data.items.length) return { moved: 0, errorKey: "noArticles" };

  // Normalize to z-order targets, deduplicate keeping the FIRST occurrence
  // (a group containing several article members moves once, at the position
  // of its first member).
  const targets = [];
  const seen = {};
  data.items.forEach(function (item) {
    const target = U.getReorderTarget(item._ref);
    if (!target || !target.isValid || typeof target.id === "undefined") return;
    const k = String(target.id);
    if (seen[k]) return;
    seen[k] = true;
    targets.push(target);
  });

  let moved = 0;
  let skipped = 0;
  const layersSeen = {};

  targets.forEach(function (it) {
    try {
      if (typeof it.bringToFront === "function") {
        it.bringToFront();
        moved++;
        try { layersSeen[String(it.itemLayer.name)] = true; } catch (e) {}
      } else {
        skipped++;
      }
    } catch (e) {
      skipped++;
      U.log("alignZOrder bringToFront failed:", e.message);
    }
  });

  return {
    moved: moved,
    skipped: skipped,
    multiLayer: Object.keys(layersSeen).length > 1
  };
}

module.exports = {
  getConstructionROItems,
  getConstructionROItemsAllPages,
  reorderSelectedBottomUp,
  alignZOrderToTagRO
};
