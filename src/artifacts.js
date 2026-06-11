/**
 * src/artifacts.js
 * ================
 * Artifact tooling.
 *
 * In a tagged PDF, an "artifact" is content excluded from the logical
 * structure (decorations, backgrounds, repeated furniture). In InDesign this
 * is set per object via Object Export Options > Tagged PDF > Apply Tag:
 * Artifact, i.e. objectExportOptions.applyTagType = TagType.TAG_ARTIFACT.
 *
 * This module provides:
 *   - tag / untag the current selection as artifact
 *   - hide/show every artifact (toggle of the items' visible property)
 *   - move artifacts to a dedicated [Artifacts] layer, with session memory of
 *     the original layers and a restore operation
 *
 * Copyright (C) 2025-2026 SZH/CSPS — Swiss Centre for Special Needs Education
 * Licensed under GNU GPL v3 — https://www.gnu.org/licenses/
 */

"use strict";

const indesign = require("indesign");
const { app } = indesign;
const LocationOptions = indesign.LocationOptions || globalThis.LocationOptions;
const ScriptLanguage  = indesign.ScriptLanguage  || globalThis.ScriptLanguage;
const UndoModes       = indesign.UndoModes       || globalThis.UndoModes;
const U = require("./utils.js");

// Session memory: docKey → [{ id, layerName }] (original layer of moved items)
const _layerMoves = {};

// ─── Enumeration ──────────────────────────────────────────────────────────────

/**
 * Returns every page item of the document (including items nested in groups),
 * master spreads excluded. Uses doc.allPageItems when available, otherwise
 * walks spreads recursively.
 */
function getAllPageItems(doc) {
  try {
    const all = doc.allPageItems;
    if (all && all.length !== undefined) return Array.prototype.slice.call(all);
  } catch (e) {}

  const out = [];
  function walk(container) {
    let children = [];
    try { children = container.pageItems.everyItem().getElements(); } catch (e) { return; }
    for (let i = 0; i < children.length; i++) {
      const it = children[i];
      if (!it || !it.isValid) continue;
      out.push(it);
      walk(it); // groups / frames can contain nested page items
    }
  }

  try {
    const spreads = doc.spreads.everyItem().getElements();
    spreads.forEach(function (sp) { walk(sp); });
  } catch (e) {}

  return out;
}

/** Every item of the document directly tagged as artifact (masters excluded). */
function getArtifactItems(doc) {
  return getAllPageItems(doc).filter(function (it) {
    if (!U.isDirectArtifact(it)) return false;
    const pg = U.getParentPage(it);
    return !(pg && U.isMasterPage(pg));
  });
}

// ─── Tag / untag selection ────────────────────────────────────────────────────

/**
 * Direct selection of an image yields the Graphic object (Image/PDF/EPS…),
 * not its containing frame — and export options belong to the FRAME.
 * Normalizes such objects to their parent frame.
 */
function resolveToFrame(item) {
  try {
    const tag = String(item); // "[object Image]", "[object PDF]", …
    const graphicTags = ["[object Image]", "[object PDF]", "[object EPS]",
                         "[object WMF]", "[object PICT]", "[object ImportedPage]",
                         "[object Graphic]"];
    if (graphicTags.indexOf(tag) >= 0 && item.parent && item.parent.isValid) {
      return item.parent;
    }
  } catch (e) {}
  return item;
}

/**
 * Sets the artifact tag of a list of items by id, through ExtendScript.
 *
 * Writing objectExportOptions.applyTagType directly from UXP crashed
 * InDesign in testing (enum write marshalling); routing the write through
 * app.doScript(…, ScriptLanguage.JAVASCRIPT) runs it on the proven
 * ExtendScript engine, grouped as a single undo step.
 *
 * @returns {number|null} number of items tagged, or null if the
 *          ExtendScript path is unavailable (caller falls back to UXP).
 */
function setArtifactViaExtendScript(ids, makeArtifact) {
  if (!ScriptLanguage || typeof app.doScript !== "function") return null;

  const tagExpr = makeArtifact ? "TagType.TAG_ARTIFACT" : "TagType.TAG_BASED_ON_OBJECT";
  const jsx =
    "var n = 0;" +
    "var d = app.activeDocument;" +
    "var ids = [" + ids.join(",") + "];" +
    "for (var i = 0; i < ids.length; i++) {" +
    "  try {" +
    "    var it = d.pageItems.itemByID(ids[i]);" +
    "    if (it && it.isValid) { it.objectExportOptions.applyTagType = " + tagExpr + "; n++; }" +
    "  } catch (e) {}" +
    "}" +
    "n;"; // doScript returns the last expression

  try {
    let result;
    if (UndoModes && UndoModes.ENTIRE_SCRIPT) {
      result = app.doScript(jsx, ScriptLanguage.JAVASCRIPT, [],
                            UndoModes.ENTIRE_SCRIPT,
                            makeArtifact ? "Set as artifact" : "Remove artifact tag");
    } else {
      result = app.doScript(jsx, ScriptLanguage.JAVASCRIPT);
    }
    const n = Number(result);
    return isFinite(n) ? n : ids.length;
  } catch (e) {
    U.log("setArtifact via ExtendScript failed:", e.message);
    return null;
  }
}

/**
 * Tags or untags the selected objects as artifact.
 * Untagging restores the default "Based on Object" behavior.
 * Selected graphics are normalized to their containing frame first.
 */
function setSelectionArtifact(makeArtifact) {
  if (!app.documents.length) return { count: 0, errorKey: "noDocument" };

  const sel = U.getSelectionAsPageItems();
  if (!sel.length) return { count: 0, errorKey: "noSelection" };

  // Normalize graphics → frames and deduplicate by id.
  const targets = [];
  const seen = {};
  sel.forEach(function (raw) {
    const it = resolveToFrame(raw);
    if (!it || !it.isValid || typeof it.id === "undefined") return;
    const k = String(it.id);
    if (seen[k]) return;
    seen[k] = true;
    targets.push(it);
  });
  if (!targets.length) return { count: 0, errorKey: "noSelection" };

  // Preferred path: ExtendScript (see setArtifactViaExtendScript).
  const ids = targets.map(function (it) { return it.id; });
  let count;
  const viaJsx = setArtifactViaExtendScript(ids, makeArtifact);
  if (viaJsx !== null) {
    count = viaJsx;
  } else {
    // Fallback: direct UXP write.
    if (!U.TagType) return { count: 0, errorKey: "errGeneric", msg: "TagType enum unavailable" };
    count = 0;
    targets.forEach(function (it) {
      try {
        it.objectExportOptions.applyTagType =
          makeArtifact ? U.TagType.TAG_ARTIFACT : U.TagType.TAG_BASED_ON_OBJECT;
        count++;
      } catch (e) {
        U.log("setArtifact (UXP fallback) failed:", e.message);
      }
    });
  }

  // "Hide artifacts" currently active? Then the freshly tagged objects
  // should disappear immediately too, like every other artifact.
  let hidden = 0;
  if (makeArtifact && count > 0) hidden = hideWhenHideModeActive(targets);

  return { count: count, hidden: hidden };
}

/**
 * Hides the newly tagged artifacts when the document is in "artifacts
 * hidden" state — detected as: other artifacts exist and NONE of them is
 * visible. Mixed visibility (user hand-hid some) leaves the new ones alone.
 * @returns {number} count of items hidden
 */
function hideWhenHideModeActive(newlyTagged) {
  try {
    const doc = app.activeDocument;
    const newIds = {};
    newlyTagged.forEach(function (it) {
      try { newIds[String(it.id)] = true; } catch (e) {}
    });

    const others = getArtifactItems(doc).filter(function (it) {
      return !newIds[String(it.id)];
    });
    if (!others.length) return 0;

    let anyVisible = false;
    others.forEach(function (it) {
      try { if (it.visible !== false) anyVisible = true; } catch (e) {}
    });
    if (anyVisible) return 0; // hide mode not active

    let hidden = 0;
    newlyTagged.forEach(function (it) {
      try { it.visible = false; hidden++; } catch (e) {}
    });
    return hidden;
  } catch (e) {
    return 0;
  }
}

// ─── Custom alt text ──────────────────────────────────────────────────────────

/**
 * Sets the custom alt text of one page item (by id) and switches its alt
 * source to "Custom". Same ExtendScript routing as the artifact tagging
 * (writing objectExportOptions from UXP crashed InDesign in testing).
 * An empty string clears the alt text but keeps the Custom source.
 *
 * If the item is tagged as ARTIFACT, the tag is reset to "Based on Object":
 * an artifact is excluded from the structure, so its alt text would never be
 * read. The result reports it via artifactRemoved so the UI can tell the user.
 */
function setCustomAltText(itemId, text) {
  if (!app.documents.length) return { ok: false, errorKey: "noDocument" };
  const json = JSON.stringify(String(text == null ? "" : text)); // safe JSX string literal

  if (ScriptLanguage && typeof app.doScript === "function") {
    const jsx =
      "var res = '';" +
      "try {" +
      "  var it = app.activeDocument.pageItems.itemByID(" + Number(itemId) + ");" +
      "  if (it && it.isValid) {" +
      "    var oeo = it.objectExportOptions;" +
      "    var wasArtifact = false;" +
      "    try {" +
      "      if (oeo.applyTagType == TagType.TAG_ARTIFACT) {" +
      "        oeo.applyTagType = TagType.TAG_BASED_ON_OBJECT;" +
      "        wasArtifact = true;" +
      "      }" +
      "    } catch (e) {}" +
      "    oeo.altTextSourceType = SourceType.SOURCE_CUSTOM;" +
      "    oeo.customAltText = " + json + ";" +
      "    res = wasArtifact ? 'ok-artifact' : 'ok';" +
      "  }" +
      "} catch (e) {}" +
      "res;";
    try {
      const res = (UndoModes && UndoModes.ENTIRE_SCRIPT)
        ? app.doScript(jsx, ScriptLanguage.JAVASCRIPT, [], UndoModes.ENTIRE_SCRIPT, "Edit alt text")
        : app.doScript(jsx, ScriptLanguage.JAVASCRIPT);
      const s = String(res);
      if (s === "ok" || s === "ok-artifact") {
        return { ok: true, artifactRemoved: s === "ok-artifact" };
      }
    } catch (e) {
      U.log("setCustomAltText via ExtendScript failed:", e.message);
    }
  }

  // Fallback: direct UXP write.
  try {
    const it = app.activeDocument.pageItems.itemByID(Number(itemId));
    if (!it || !it.isValid) return { ok: false, errorKey: "altEditNoTarget" };
    let artifactRemoved = false;
    if (U.isDirectArtifact(it) && U.TagType) {
      try {
        it.objectExportOptions.applyTagType = U.TagType.TAG_BASED_ON_OBJECT;
        artifactRemoved = true;
      } catch (e) {}
    }
    if (U.SourceType) it.objectExportOptions.altTextSourceType = U.SourceType.SOURCE_CUSTOM;
    it.objectExportOptions.customAltText = String(text == null ? "" : text);
    return { ok: true, artifactRemoved: artifactRemoved };
  } catch (e) {
    return { ok: false, errorKey: "errGeneric", msg: e.message };
  }
}

// ─── Hide / show ──────────────────────────────────────────────────────────────

/**
 * Toggles the visibility of every artifact in the document.
 * Stateless: if at least one artifact is visible, all are hidden; otherwise
 * all are shown. (Re-showing also re-shows artifacts hidden manually.)
 */
function toggleArtifactsVisibility() {
  if (!app.documents.length) return { errorKey: "noDocument" };
  const doc = app.activeDocument;

  const artifacts = getArtifactItems(doc);
  if (!artifacts.length) return { none: true };

  let anyVisible = false;
  artifacts.forEach(function (it) {
    try { if (it.visible !== false) anyVisible = true; } catch (e) {}
  });

  let count = 0;
  artifacts.forEach(function (it) {
    try { it.visible = !anyVisible; count++; } catch (e) {}
  });

  return anyVisible ? { hidden: count } : { shown: count };
}

// ─── Move to [Artifacts] layer / restore ──────────────────────────────────────

/** Returns (creating if needed) the [Artifacts] layer, placed at the bottom. */
function ensureArtifactsLayer(doc) {
  let layer = null;
  try {
    layer = doc.layers.itemByName(U.LAYER_ARTIFACTS);
    if (layer && layer.isValid) return layer;
  } catch (e) {}

  layer = doc.layers.add({ name: U.LAYER_ARTIFACTS });
  // Bottom of the stack: artifacts have no reading-order position to claim.
  try {
    if (LocationOptions && LocationOptions.AT_END) layer.move(LocationOptions.AT_END);
  } catch (e) {}
  return layer;
}

/**
 * Top-level directly-tagged artifacts in GLOBAL Z-ORDER, backmost first
 * (layers walked bottom→top, items within a layer back→front). Items already
 * on the [Artifacts] layer and master-page items are excluded.
 */
function getOrderedTopLevelArtifacts(doc) {
  const ordered = [];
  let layers = [];
  try { layers = doc.layers.everyItem().getElements(); } catch (e) { return ordered; }

  for (let li = layers.length - 1; li >= 0; li--) { // bottom layer first
    const layer = layers[li];
    if (!layer || !layer.isValid) continue;
    try { if (String(layer.name) === U.LAYER_ARTIFACTS) continue; } catch (e) {}

    let layerItems = [];
    try { layerItems = layer.pageItems.everyItem().getElements(); } catch (e) { continue; }

    // pageItems[0] is the frontmost item → reverse iteration = backmost first.
    for (let i = layerItems.length - 1; i >= 0; i--) {
      const item = layerItems[i];
      if (!item || !item.isValid) continue;
      if (!U.isDirectArtifact(item)) continue;
      const pg = U.getParentPage(item);
      if (pg && U.isMasterPage(pg)) continue;
      ordered.push(item);
    }
  }
  return ordered;
}

/**
 * Moves every top-level artifact onto the [Artifacts] layer and remembers the
 * original layer of each moved item (session memory, per document).
 *
 * The RELATIVE STACKING ORDER of the moved artifacts is preserved: they are
 * processed backmost-first and then explicitly re-stacked with bringToFront()
 * in that same order, so on the [Artifacts] layer they end up exactly as they
 * stood relative to each other before the move.
 *
 * Items nested inside a group are skipped: a group member cannot change layer
 * on its own (the group owns a single layer).
 */
function moveArtifactsToLayer() {
  if (!app.documents.length) return { moved: 0, skipped: 0, errorKey: "noDocument" };
  const doc = app.activeDocument;

  const allArtifacts = getArtifactItems(doc);
  if (!allArtifacts.length) return { none: true, moved: 0, skipped: 0 };

  // Artifacts inside groups cannot move layer individually.
  let skipped = allArtifacts.filter(function (it) { return !U.isTopLevelItem(it); }).length;

  const ordered = getOrderedTopLevelArtifacts(doc); // backmost first
  const layer = ensureArtifactsLayer(doc);
  const key = U.docKey(doc);
  if (!_layerMoves[key]) _layerMoves[key] = [];
  const moves = _layerMoves[key];
  const alreadyRecorded = {};
  moves.forEach(function (m) { alreadyRecorded[String(m.id)] = true; });

  let moved = 0;
  const movedItems = [];

  ordered.forEach(function (it) {
    let currentLayerName = "";
    try { currentLayerName = String(it.itemLayer.name || ""); } catch (e) {}

    try {
      // Keep the FIRST recorded origin if the item is moved several times.
      if (!alreadyRecorded[String(it.id)]) {
        moves.push({ id: it.id, layerName: currentLayerName });
        alreadyRecorded[String(it.id)] = true;
      }
      it.itemLayer = layer;
      movedItems.push(it);
      moved++;
    } catch (e) {
      skipped++;
      U.log("moveArtifact failed:", e.message);
    }
  });

  // Enforce the original relative order regardless of where InDesign placed
  // each item on the target layer: bringing them to front backmost-first
  // rebuilds the exact stack (the last one raised ends frontmost).
  movedItems.forEach(function (it) {
    try { it.bringToFront(); } catch (e) {}
  });

  return { moved: moved, skipped: skipped };
}

/**
 * Moves previously relocated artifacts back to their original layer.
 * Items or layers that no longer exist are silently skipped.
 * The memory entry is consumed on success.
 */
function restoreArtifactLayers() {
  if (!app.documents.length) return { restored: 0, errorKey: "noDocument" };
  const doc = app.activeDocument;

  const key = U.docKey(doc);
  const moves = _layerMoves[key];
  if (!moves || !moves.length) return { restored: 0, errorKey: "artifactsNoMoves" };

  let restored = 0;
  const stillPending = [];

  moves.forEach(function (m) {
    let it = null, layer = null;
    try { it = doc.pageItems.itemByID(m.id); } catch (e) {}
    try { layer = doc.layers.itemByName(m.layerName); } catch (e) {}

    if (it && it.isValid && layer && layer.isValid) {
      try {
        it.itemLayer = layer;
        restored++;
        return;
      } catch (e) {
        U.log("restoreArtifact failed:", e.message);
      }
    }
    stillPending.push(m); // keep the memory for items we could not restore
  });

  _layerMoves[key] = stillPending;
  return { restored: restored };
}

module.exports = {
  getAllPageItems,
  getArtifactItems,
  resolveToFrame,
  setSelectionArtifact,
  setCustomAltText,
  toggleArtifactsVisibility,
  moveArtifactsToLayer,
  restoreArtifactLayers
};
