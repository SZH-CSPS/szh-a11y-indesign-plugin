/**
 * src/utils.js
 * ============
 * Shared low-level helpers: geometry, page resolution, artifact detection,
 * selection handling, and the fixed layer names used by the plugin.
 *
 * Everything here is side-effect free (no document mutation).
 *
 * Copyright (C) 2025-2026 SZH/CSPS — Swiss Centre for Special Needs Education
 * Licensed under GNU GPL v3 — https://www.gnu.org/licenses/
 */

"use strict";

const indesign = require("indesign");
const { app } = indesign;

// Enum handles. UXP normally exposes enums on the "indesign" module; some
// builds only expose them on globalThis, hence the double lookup.
const TagType    = indesign.TagType    || globalThis.TagType;
const SourceType = indesign.SourceType || globalThis.SourceType;

// ─── Plugin layer names ───────────────────────────────────────────────────────
// Fixed, non-localized names so a document touched under one UI language is
// still recognized under another.
const LAYER_TAG_RO          = "[Tag RO]";
const LAYER_CONSTRUCTION_RO = "[Construction RO]";
const LAYER_ALT_TEXT        = "[Alt Text]";
const LAYER_MARKUP          = "[Markup]";
const LAYER_ARTIFACTS       = "[Artifacts]";
// Name used by plugin v1.0 — still deleted when clearing the Tag RO overlay.
const LAYER_LEGACY_RO       = "[Reading Order]";

// Layers the plugin draws on. They must never appear in the Construction RO
// (they are visual aids, not document content).
const OVERLAY_LAYER_NAMES = [LAYER_TAG_RO, LAYER_CONSTRUCTION_RO, LAYER_ALT_TEXT, LAYER_MARKUP, LAYER_LEGACY_RO];

// ─── Debug logging ────────────────────────────────────────────────────────────

const DEBUG = false;

function log() {
  if (!DEBUG) return;
  const args = Array.prototype.slice.call(arguments);
  args.unshift("[ROP]");
  console.log.apply(console, args);
}

// ─── Geometry ─────────────────────────────────────────────────────────────────

/**
 * Validates and normalizes geometricBounds [top, left, bottom, right].
 * Returns null for missing, non-finite or degenerate bounds.
 */
function normalizeBounds(bounds) {
  if (!bounds || bounds.length < 4) return null;
  const out = [Number(bounds[0]), Number(bounds[1]), Number(bounds[2]), Number(bounds[3])];
  if (!isFinite(out[0]) || !isFinite(out[1]) || !isFinite(out[2]) || !isFinite(out[3])) return null;
  if (out[2] <= out[0] || out[3] <= out[1]) return null;
  return out;
}

/**
 * Intersection point of the ray (rect center → target) with the rect border.
 * Used to attach overlay arrows to box edges instead of centers.
 */
function rectBorderPointTowards(rectBounds, targetX, targetY) {
  const top = rectBounds[0], left = rectBounds[1], bottom = rectBounds[2], right = rectBounds[3];
  const cx = (left + right) / 2;
  const cy = (top + bottom) / 2;
  const dx = targetX - cx;
  const dy = targetY - cy;
  if (dx === 0 && dy === 0) return [cx, cy];

  const halfW = (right - left) / 2;
  const halfH = (bottom - top) / 2;
  const nx = Math.abs(dx) / Math.max(halfW, 0.0001);
  const ny = Math.abs(dy) / Math.max(halfH, 0.0001);
  const pad = 0.6; // keep endpoints off exact corners for cleaner joins

  if (nx >= ny) {
    const x = (dx >= 0) ? right : left;
    const yRaw = cy + dy * (halfW / Math.max(Math.abs(dx), 0.0001));
    const y = Math.max(top + pad, Math.min(bottom - pad, yRaw));
    return [x, y];
  }

  const y = (dy >= 0) ? bottom : top;
  const xRaw = cx + dx * (halfH / Math.max(Math.abs(dy), 0.0001));
  const x = Math.max(left + pad, Math.min(right - pad, xRaw));
  return [x, y];
}

// ─── Enum comparison ──────────────────────────────────────────────────────────

/**
 * Compares two InDesign enum values. Depending on the UXP build, an enum
 * property can come back as a number or as a wrapper object, so === alone
 * is not reliable.
 */
function enumEq(a, b) {
  if (a === b) return true;
  if (a == null || b == null) return false;
  try { if (a.valueOf() === b.valueOf()) return true; } catch (e) {}
  try { return String(a) === String(b); } catch (e) { return false; }
}

// ─── Page / document context ──────────────────────────────────────────────────

/** Walks the parent chain to find the Page containing a page item. */
function getParentPage(item) {
  // Fast path: most page items expose parentPage directly.
  try {
    if (item && item.parentPage && item.parentPage.isValid) return item.parentPage;
  } catch (e) {}

  try {
    let p = item.parent;
    let guard = 0;
    while (p && guard < 20) {
      guard++;
      try { if (p.constructor && p.constructor.name === "Page") return p; } catch (e) {}
      try { if (p.reflect && p.reflect.name === "Page") return p; } catch (e) {}
      if (p === app.activeDocument) break;
      p = p.parent;
    }
  } catch (e) {}
  return null;
}

/** True if the page belongs to a master spread (not a document page). */
function isMasterPage(page) {
  try {
    return String(page.parent).indexOf("MasterSpread") >= 0;
  } catch (e) { return false; }
}

/**
 * Resolves the active document + active page.
 * Returns { ok:true, doc, page, pageGeometry, pageName }
 * or      { ok:false, errorKey } with an i18n key ("noDocument" / "noPage").
 *
 * No silent fallback to another page: if the active page cannot be resolved,
 * the caller shows an explicit message. (The v1.0 fallbacks made the preview
 * appear "stuck" on a previous page.)
 */
function getActiveContext() {
  if (!app.documents.length) return { ok: false, errorKey: "noDocument" };
  const doc = app.activeDocument;

  let page = null;
  try {
    if (app.activeWindow && app.activeWindow.activePage && app.activeWindow.activePage.isValid) {
      page = app.activeWindow.activePage;
    }
  } catch (e) {}

  // The active window can be a story editor (no activePage): fall back to the
  // first layout window that belongs to the active document.
  if (!page) {
    try {
      const wins = app.layoutWindows;
      for (let i = 0; i < wins.length; i++) {
        const win = wins.item(i);
        try {
          if (win && win.isValid && win.parent && win.parent.id === doc.id &&
              win.activePage && win.activePage.isValid) {
            page = win.activePage;
            break;
          }
        } catch (e) {}
      }
    } catch (e) {}
  }

  if (!page || !page.isValid) return { ok: false, errorKey: "noPage" };

  const bounds = normalizeBounds(page.bounds);
  return {
    ok: true,
    doc: doc,
    page: page,
    pageGeometry: bounds ? { bounds: bounds } : null,
    pageName: String(page.name || "")
  };
}

// ─── Artifact detection ───────────────────────────────────────────────────────

/** True if the item itself is tagged "Artifact" in its Object Export Options. */
function isDirectArtifact(item) {
  if (!TagType) return false;
  try {
    const oeo = item.objectExportOptions;
    if (!oeo) return false;
    return enumEq(oeo.applyTagType, TagType.TAG_ARTIFACT);
  } catch (e) { return false; }
}

/**
 * True if the item or any of its page-item ancestors (e.g. a containing group)
 * is tagged "Artifact" — in the exported PDF the whole subtree is an artifact.
 */
function isArtifact(item) {
  let cur = item;
  let guard = 0;
  while (cur && guard < 15) {
    guard++;
    if (isDirectArtifact(cur)) return true;
    let parent = null;
    try { parent = cur.parent; } catch (e) { break; }
    // Stop climbing once the parent is no longer a page item (Spread, Page, …).
    let parentIsPageItem = false;
    try { parentIsPageItem = !!(parent && parent.objectExportOptions); } catch (e) {}
    if (!parentIsPageItem) break;
    cur = parent;
  }
  return false;
}

// ─── Alt text ─────────────────────────────────────────────────────────────────

/** True if the item contains at least one placed graphic (it is an image frame). */
function hasGraphics(item) {
  try { if (item.allGraphics && item.allGraphics.length > 0) return true; } catch (e) {}
  try { if (item.graphics && item.graphics.length > 0) return true; } catch (e) {}
  return false;
}

/**
 * Classifies the alt text state of a page item (usually a graphic frame).
 * @returns {{status:"ok"|"decorative"|"external"|"missing", text:string}}
 *
 * "From XML structure" (InDesign's default) is treated as MISSING: unless the
 * document really carries XML alt attributes, nothing reaches the PDF.
 * XMP-based sources are reported as "external" with the source name in text
 * (the actual string lives in the image metadata and cannot be read here).
 */
function getAltTextInfo(item) {
  let oeo = null;
  try { oeo = item.objectExportOptions; } catch (e) {}
  if (!oeo) return { status: "missing", text: "" };

  let srcType = null;
  try { srcType = oeo.altTextSourceType; } catch (e) {}

  if (SourceType) {
    try {
      if (enumEq(srcType, SourceType.SOURCE_DECORATIVE_IMAGE)) {
        return { status: "decorative", text: "" };
      }
    } catch (e) {} // enum value absent in older InDesign versions

    if (enumEq(srcType, SourceType.SOURCE_CUSTOM)) {
      let txt = "";
      try { txt = String(oeo.customAltText || ""); } catch (e) {}
      txt = txt.trim();
      return txt ? { status: "ok", text: txt } : { status: "missing", text: "" };
    }

    const xmpSources = [
      ["SOURCE_XMP_TITLE", "XMP Title"],
      ["SOURCE_XMP_DESCRIPTION", "XMP Description"],
      ["SOURCE_XMP_HEADLINE", "XMP Headline"],
      ["SOURCE_XMP_ALT_TEXT", "XMP Alt"],
      ["SOURCE_XMP_EXTENDED_DESCRIPTION", "XMP Ext. Description"],
      ["SOURCE_XMP_OTHER", "XMP"]
    ];
    for (let i = 0; i < xmpSources.length; i++) {
      try {
        if (enumEq(srcType, SourceType[xmpSources[i][0]])) {
          return { status: "external", text: xmpSources[i][1] };
        }
      } catch (e) {}
    }
  }

  // SOURCE_XML_STRUCTURE (the default) or unknown.
  return { status: "missing", text: "" };
}

// ─── Selection ────────────────────────────────────────────────────────────────

/** Returns the selected objects that are actual page items (with bounds). */
function getSelectionAsPageItems() {
  let sel = [];
  try { sel = app.selection || []; } catch (e) { sel = []; }
  const out = [];

  for (let i = 0; i < sel.length; i++) {
    const it = sel[i];
    if (!it || !it.isValid) continue;
    try {
      if (normalizeBounds(it.geometricBounds)) out.push(it);
    } catch (e) {}
  }
  return out;
}

/**
 * Returns the top reorderable target for z-order operations.
 * If an item lives inside nested groups, the highest group ancestor is the
 * thing that actually moves in the parent's stacking order.
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

/** True if the item sits directly on a spread/page (its layer can be changed). */
function isTopLevelItem(item) {
  try {
    const pName = String(item.parent);
    return pName.indexOf("[object Spread]") === 0 ||
           pName.indexOf("[object Page]") === 0 ||
           pName.indexOf("[object MasterSpread]") === 0;
  } catch (e) { return false; }
}

/** True if the document has a layer with this exact name. */
function layerExists(doc, name) {
  try {
    const l = doc.layers.itemByName(name);
    return !!(l && l.isValid);
  } catch (e) { return false; }
}

/** Stable per-document key for session-scoped memories (groups, layer moves). */
function docKey(doc) {
  try { return "id:" + doc.id; } catch (e) {}
  try { return "name:" + doc.name; } catch (e) {}
  return "unknown";
}

module.exports = {
  TagType,
  SourceType,
  LAYER_TAG_RO,
  LAYER_CONSTRUCTION_RO,
  LAYER_ALT_TEXT,
  LAYER_MARKUP,
  LAYER_ARTIFACTS,
  LAYER_LEGACY_RO,
  OVERLAY_LAYER_NAMES,
  hasGraphics,
  getAltTextInfo,
  log,
  normalizeBounds,
  rectBorderPointTowards,
  enumEq,
  getParentPage,
  isMasterPage,
  getActiveContext,
  isDirectArtifact,
  isArtifact,
  getSelectionAsPageItems,
  getReorderTarget,
  isTopLevelItem,
  layerExists,
  docKey
};
