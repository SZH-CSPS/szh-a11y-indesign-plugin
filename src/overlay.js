/**
 * src/overlay.js
 * ==============
 * Overlay layers drawn INSIDE the document (visual checking aids):
 *
 *   [Tag RO]           numbered boxes + arrows following the Articles order
 *   [Construction RO]  numbered boxes + arrows following the z-order (bottom-up)
 *   [Alt Text]         labels showing each image's alternative text and
 *                      flagging missing ones
 *   [Markup]           per-paragraph labels showing the export tag and the
 *                      paragraph/character styles
 *
 * Safety: there is no on-screen annotation API in InDesign UXP, so layers are
 * the only in-document channel. To keep them harmless, every overlay layer is
 *   - LOCKED       (its items cannot be selected or moved by accident),
 *   - NON-PRINTING (excluded from print AND PDF export, even if forgotten),
 * and drawn with thin, semi-transparent strokes to stay discreet.
 *
 * Copyright (C) 2025-2026 SZH/CSPS — Swiss Centre for Special Needs Education
 * Licensed under GNU GPL v3 — https://www.gnu.org/licenses/
 */

"use strict";

const indesign = require("indesign");
const { app } = indesign;
const Justification         = indesign.Justification         || globalThis.Justification;
const VerticalJustification = indesign.VerticalJustification || globalThis.VerticalJustification;
const ColorModel            = indesign.ColorModel            || globalThis.ColorModel;
const ColorSpace            = indesign.ColorSpace            || globalThis.ColorSpace;
const ArrowHead             = indesign.ArrowHead             || globalThis.ArrowHead;
const ScriptLanguage        = indesign.ScriptLanguage        || globalThis.ScriptLanguage;
const UndoModes             = indesign.UndoModes             || globalThis.UndoModes;

const U = require("./utils.js");
const { getTagROItems } = require("./articles.js");
const { getConstructionROItemsAllPages } = require("./zorder.js");
const { t } = require("./i18n.js");

/**
 * Runs a drawing routine as fast as InDesign allows: screen redraw disabled,
 * and (when available) the whole batch wrapped in a single
 * doScript(…, FAST_ENTIRE_SCRIPT) transaction — without it, every DOM call
 * records its own undo step and triggers layout work, which is what made
 * large overlays take 10+ seconds.
 *
 * Trade-off: FAST_ENTIRE_SCRIPT skips undo recording. Acceptable here —
 * overlays only ever add a disposable control layer that the Clear buttons
 * remove.
 */
function runFast(name, fn) {
  let result;
  const exec = function () { result = fn(); };

  let sp = null, oldRedraw = null;
  try { sp = app.scriptPreferences; oldRedraw = sp.enableRedraw; sp.enableRedraw = false; } catch (e) {}

  try {
    let ran = false;
    try {
      if (typeof app.doScript === "function" && ScriptLanguage && ScriptLanguage.UXPSCRIPT &&
          UndoModes && UndoModes.FAST_ENTIRE_SCRIPT) {
        app.doScript(exec, ScriptLanguage.UXPSCRIPT, [], UndoModes.FAST_ENTIRE_SCRIPT, name);
        ran = true;
      }
    } catch (e) {
      U.log("runFast doScript failed, falling back:", e.message);
    }
    if (!ran) exec();
  } finally {
    try { if (sp && oldRedraw !== null) sp.enableRedraw = oldRedraw; } catch (e) {}
  }
  return result;
}

// Drawing constants (document units — see README "Units" note).
const BADGE_R         = 4;
const BOX_STROKE      = 0.75;  // thin outline around items
const ARROW_W         = 0.7;
const OVERLAY_OPACITY = 65;    // % opacity of boxes/arrows (badges stay opaque)

// ONE text size for every overlay label (badges, alt text, markup) — points,
// so it is unit-independent. Applied explicitly per label rather than relying
// on style inheritance, which proved flaky across documents.
const OVERLAY_TEXT_PT      = 7.5;
const OVERLAY_TEXT_LEADING = 8;
const OVERLAY_FONT         = "Arial"; // widely available; silently skipped if missing

// Hard cap of markup labels per run — keeps very long documents responsive.
const MARKUP_MAX_LABELS = 600;

// Accent colors per overlay.
const RGB_TAG          = [255, 69, 38];   // red-orange — Tag RO
const RGB_CONSTRUCTION = [0, 120, 212];   // blue       — Construction RO
const RGB_ALT_OK       = [0, 150, 60];    // green      — alt text present
const RGB_ALT_MISSING  = [210, 0, 0];     // red        — alt text missing
const RGB_MARKUP       = [142, 68, 173];  // purple     — style markup

// ─── Swatch & style helpers ───────────────────────────────────────────────────

/** Returns (creating/updating if needed) an RGB process color swatch. */
function ensureSwatch(doc, name, rgb) {
  try {
    const existing = doc.colors.itemByName(name);
    if (existing && existing.isValid) {
      try {
        existing.model = ColorModel.PROCESS;
        existing.space = ColorSpace.RGB;
        existing.colorValue = rgb;
      } catch (e) {}
      return doc.swatches.itemByName(name);
    }
  } catch (e) {}

  try {
    doc.colors.add({ name: name, model: ColorModel.PROCESS, space: ColorSpace.RGB, colorValue: rgb });
    return doc.swatches.itemByName(name);
  } catch (e) {}

  // Last resort so drawing never fails entirely.
  try { return doc.swatches.itemByName("Black"); } catch (e) { return null; }
}

/**
 * Returns (creating if needed) a paragraph style for overlay labels:
 * no decorations, no indents, colored text, fixed size. A dedicated style
 * beats per-frame formatting twice over: document defaults can't leak into
 * the labels, and the style is configured ONCE per draw instead of ~20
 * property calls per badge.
 *
 * @param {object} [extra]  extra style properties (pointSize, justification…)
 */
function ensureLabelStyle(doc, styleName, textSwatch, extra) {
  let style = null;
  try {
    style = doc.paragraphStyles.itemByName(styleName);
    if (!style.isValid) throw new Error("missing");
  } catch (e) {
    try { style = doc.paragraphStyles.add({ name: styleName }); } catch (e2) {}
  }
  if (!style || !style.isValid) return null;

  const props = {
    justification: Justification.CENTER_ALIGN,
    spaceBefore: 0,
    spaceAfter: 0,
    leftIndent: 0,
    rightIndent: 0,
    firstLineIndent: 0,
    underline: false,
    strikeThru: false
  };
  if (textSwatch && textSwatch.isValid) props.fillColor = textSwatch;
  if (extra) Object.keys(extra).forEach(function (k) { props[k] = extra[k]; });

  try { style.basedOn = doc.paragraphStyles.itemByName("[Basic Paragraph]"); } catch (e) {}

  // One batched assignment instead of one IPC round-trip per property;
  // fall back to individual sets if the batch is rejected.
  try {
    style.properties = props;
  } catch (e) {
    Object.keys(props).forEach(function (k) {
      try { style[k] = props[k]; } catch (e2) {}
    });
  }
  return style;
}

/** Looks up the document's dashed stroke style, or null. */
function getDashedStyle(doc) {
  try {
    const s = doc.strokeStyles.itemByName("Dashed");
    return (s && s.isValid) ? s : null;
  } catch (e) { return null; }
}

/** Sets the opacity (%) of an overlay object. */
function setOpacity(item, pct) {
  try { item.transparencySettings.blendingSettings.opacity = pct; } catch (e) {}
}

/**
 * Common settings of every overlay label frame. ignoreWrap is ESSENTIAL:
 * without it, the text wrap of underlying document objects pushes the label
 * text out of its small frame (overset → seemingly empty badge).
 */
function applyLabelFramePrefs(lbl) {
  try { lbl.textFramePreferences.ignoreWrap = true; } catch (e) {}
  try { lbl.textFramePreferences.insetSpacing = [0, 0, 0, 0]; } catch (e) {}
}

/**
 * Locks the finished overlay layer so its items cannot be selected or moved
 * by accident.
 *
 * Deliberately NOT setting layer.printable = false: InDesign hides
 * non-printing objects in the Preview screen mode (W), which made the whole
 * overlay vanish the moment drawing finished for users working in Preview.
 * The overlays therefore WILL export if forgotten — hence the panel hint to
 * delete them before the final export.
 */
function finalizeOverlayLayer(layer) {
  try { layer.locked = true; } catch (e) {}
}

/**
 * Applies the uniform overlay text formatting to a label frame in ONE batched
 * call: same font, size and leading everywhere, explicit color. Run AFTER
 * style application / clearOverrides so nothing re-overrides it.
 */
function applyLabelTextProps(lbl, textSwatch, justification) {
  const base = {
    pointSize: OVERLAY_TEXT_PT,
    leading: OVERLAY_TEXT_LEADING,
    justification: justification,
    underline: false,
    strikeThru: false
  };
  if (textSwatch && textSwatch.isValid) base.fillColor = textSwatch;

  try {
    const withFont = { appliedFont: OVERLAY_FONT };
    Object.keys(base).forEach(function (k) { withFont[k] = base[k]; });
    lbl.texts.item(0).properties = withFont;
  } catch (e) {
    // Font not available (or batch rejected): retry without the font.
    try { lbl.texts.item(0).properties = base; } catch (e2) {
      U.log("label text props failed:", e2.message);
    }
  }
}

// ─── Drawing primitives ───────────────────────────────────────────────────────

/**
 * Draws a numbered badge (white circle + colored number) at (x, y).
 * Kept lean on purpose — every DOM call is an IPC round-trip, and badges are
 * the most numerous overlay element. All text formatting comes from the
 * paragraph style (configured once per draw); clearOverrides() wipes any
 * local formatting inherited from the document's text defaults.
 */
function drawBadge(pg, layer, x, y, label, accentSwatch, textSwatch, paraStyle, paperSwatch, doc) {
  const r = BADGE_R + 2; // uniform size: 1- and 2-digit badges look identical

  // Solid accent badge with white number — readable on any background.
  pg.ovals.add({
    itemLayer: layer,
    geometricBounds: [y - r, x - r, y + r, x + r],
    fillColor: accentSwatch,
    strokeColor: (paperSwatch && paperSwatch.isValid) ? paperSwatch : "Paper",
    strokeWeight: 0.75
  });

  const lbl = pg.textFrames.add({
    itemLayer: layer,
    geometricBounds: [y - r, x - r, y + r, x + r],
    fillColor: "None",
    strokeColor: "None"
  });
  lbl.contents = label;

  // Batched frame prefs: ignoreWrap is ESSENTIAL (without it the text wrap
  // of underlying objects pushes the number out of the small frame — the
  // "empty badge" bug), the rest centers the number.
  try {
    lbl.textFramePreferences.properties = {
      ignoreWrap: true,
      insetSpacing: [0, 0, 0, 0],
      verticalJustification: VerticalJustification.CENTER_ALIGN
    };
  } catch (e) {
    applyLabelFramePrefs(lbl);
    try { lbl.textFramePreferences.verticalJustification = VerticalJustification.CENTER_ALIGN; } catch (e2) {}
  }

  try { lbl.parentStory.appliedCharacterStyle = doc.characterStyles.itemByName("[None]"); } catch (e) {}
  if (paraStyle && paraStyle.isValid) {
    try { lbl.parentStory.appliedParagraphStyle = paraStyle; } catch (e) {}
  }
  try { lbl.parentStory.clearOverrides(); } catch (e) {}
  applyLabelTextProps(lbl, paperSwatch, Justification.CENTER_ALIGN); // white number
}

/** Draws a dashed arrow from the border of one box to the border of the next. */
function drawArrow(pg, layer, fromBounds, toBounds, accentSwatch, dashedStyle) {
  const x1c = (fromBounds[1] + fromBounds[3]) / 2, y1c = (fromBounds[0] + fromBounds[2]) / 2;
  const x2c = (toBounds[1] + toBounds[3]) / 2,     y2c = (toBounds[0] + toBounds[2]) / 2;
  const p1 = U.rectBorderPointTowards(fromBounds, x2c, y2c);
  const p2 = U.rectBorderPointTowards(toBounds, x1c, y1c);
  const x1 = p1[0], y1 = p1[1], x2 = p2[0], y2 = p2[1];

  const line = pg.graphicLines.add({
    itemLayer: layer,
    geometricBounds: [Math.min(y1, y2), Math.min(x1, x2), Math.max(y1, y2), Math.max(x1, x2)],
    strokeColor: accentSwatch,
    strokeWeight: ARROW_W
  });
  setOpacity(line, OVERLAY_OPACITY);

  try { if (dashedStyle) line.strokeType = dashedStyle; } catch (e) {}

  try {
    line.rightArrowHead = (ArrowHead && ArrowHead.TRIANGLE) ? ArrowHead.TRIANGLE : "Triangle";
    line.rightArrowHeadScale = 60;
  } catch (e) {
    try {
      line.endArrowHead = "Triangle";
      line.endArrowHeadScale = 60;
    } catch (e2) {}
  }

  try {
    line.paths[0].entirePath = [[x1, y1], [x2, y2]];
  } catch (e) {
    // Some InDesign contexts expect swapped coordinate tuples.
    line.paths[0].entirePath = [[y1, x1], [y2, x2]];
  }
}

// ─── Generic reading-order overlay ────────────────────────────────────────────

/**
 * Removes the layers with the given names (unlocking them first — overlay
 * layers are locked after drawing). Returns true if any was removed.
 */
function deleteLayers(doc, names) {
  let removed = false;
  names.forEach(function (name) {
    try {
      const l = doc.layers.itemByName(name);
      if (l && l.isValid) {
        try { if (l.locked) l.locked = false; } catch (e) {}
        l.remove();
        removed = true;
      }
    } catch (e) {}
  });
  return removed;
}

/**
 * (Re)draws one reading-order overlay layer.
 *
 * @param {Document} doc
 * @param {string}   layerName     plugin layer to (re)create
 * @param {Array}    items         reading-order items ({bounds, index, _ref, pageId})
 * @param {Array}    accentRgb     outline/arrow color
 * @param {string}   styleName     paragraph style suffix for the badge numbers
 * @returns {number} count of items drawn
 */
function drawOrderOverlay(doc, layerName, items, accentRgb, styleName) {
  return runFast("Draw " + layerName, function () {
    deleteLayers(doc, [layerName]);
    const layer = doc.layers.add({ name: layerName });

    const accentSwatch = ensureSwatch(doc, "_ROP_" + styleName, accentRgb);
    const textSwatch   = ensureSwatch(doc, "_ROP_" + styleName + "_Text", accentRgb);
    const paraStyle    = ensureLabelStyle(doc, "CSPS-" + styleName, textSwatch,
                                          { pointSize: 7.2, leading: 7.2 });
    const dashedStyle  = getDashedStyle(doc);
    let paperSwatch = null;
    try { paperSwatch = doc.swatches.itemByName("Paper"); } catch (e) {}

    let drawn = 0;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const b = U.normalizeBounds(item.bounds);
      const pg = U.getParentPage(item._ref);
      if (!pg || !b) continue;

      let itemDrawn = false;

      // Bounding box — thin and semi-transparent.
      try {
        const box = pg.rectangles.add({
          itemLayer: layer,
          geometricBounds: b,
          fillColor: "None",
          strokeColor: accentSwatch,
          strokeWeight: BOX_STROKE
        });
        setOpacity(box, OVERLAY_OPACITY);
        itemDrawn = true;
      } catch (e) {}

      // Numbered badge at the top-left corner (kept opaque for readability).
      try {
        drawBadge(pg, layer, b[1], b[0], String(item.index), accentSwatch, textSwatch, paraStyle, paperSwatch, doc);
        itemDrawn = true;
      } catch (e) {}

      if (itemDrawn) drawn++;

      // Arrow to the next item when it sits on the same page.
      if (i < items.length - 1) {
        const next = items[i + 1];
        if (item.pageId !== next.pageId) continue;
        const nb = U.normalizeBounds(next.bounds);
        if (!nb) continue;
        try { drawArrow(pg, layer, b, nb, accentSwatch, dashedStyle); } catch (e) {}
      }
    }

    finalizeOverlayLayer(layer);
    U.log("overlay", layerName, "drawn:", drawn, "/", items.length);
    return drawn;
  });
}

// ─── ExtendScript fast path ───────────────────────────────────────────────────
//
// Every InDesign DOM call from UXP is an inter-process round-trip (~5-15 ms);
// an overlay needs ~15 calls per object plus the enumeration, which made
// large documents take 10-30 s. The whole enumerate-and-draw therefore runs
// as ONE ExtendScript via app.doScript — native speed inside InDesign's
// process. The UXP implementation below remains as fallback.

/** Shared JSX helpers: artifact test, opacity, badge, arrow. */
function jsxCommonHelpers() {
  return (
    "  function isArtifact(it) {" +
    "    var cur = it, g = 0;" +
    "    while (cur && g < 10) {" +
    "      g++;" +
    "      var oeo = null;" +
    "      try { oeo = cur.objectExportOptions; } catch (e) { oeo = null; }" +
    "      if (!oeo) break;" +
    "      try { if (oeo.applyTagType == TagType.TAG_ARTIFACT) return true; } catch (e) {}" +
    "      cur = cur.parent;" +
    "    }" +
    "    return false;" +
    "  }" +
    "  function setOpacity(it, pct) {" +
    "    try { it.transparencySettings.blendingSettings.opacity = pct; } catch (e) {}" +
    "  }" +
    "  function drawItem(pg, b, num) {" +
    "    try {" +
    "      var box = pg.rectangles.add({ itemLayer: layer, geometricBounds: b, fillColor: 'None', strokeColor: accent, strokeWeight: " + BOX_STROKE + " });" +
    "      setOpacity(box, " + OVERLAY_OPACITY + ");" +
    "    } catch (e) {}" +
    "    try {" +
    "      var r = " + (BADGE_R + 2) + ";" +
    "      var x = b[1], y = b[0];" +
    // Solid accent badge with white bold number — readable on any background.
    "      var badgePaper = (paper && paper.isValid) ? paper : 'Paper';" +
    "      pg.ovals.add({ itemLayer: layer, geometricBounds: [y - r, x - r, y + r, x + r], fillColor: accent, strokeColor: badgePaper, strokeWeight: 0.75 });" +
    "      var lbl = pg.textFrames.add({ itemLayer: layer, geometricBounds: [y - r, x - r, y + r, x + r], fillColor: 'None', strokeColor: 'None' });" +
    "      lbl.contents = String(num);" +
    "      try { lbl.textFramePreferences.properties = { ignoreWrap: true, insetSpacing: [0, 0, 0, 0], verticalJustification: VerticalJustification.CENTER_ALIGN }; } catch (e) {}" +
    "      try { lbl.parentStory.appliedCharacterStyle = d.characterStyles.itemByName('[None]'); } catch (e) {}" +
    "      if (ps) { try { lbl.parentStory.appliedParagraphStyle = ps; } catch (e) {} }" +
    "      try { lbl.parentStory.clearOverrides(OverrideType.ALL); } catch (e) {}" +
    "      try { lbl.texts[0].properties = { appliedFont: '" + OVERLAY_FONT + "', fontStyle: 'Bold', pointSize: " + OVERLAY_TEXT_PT + ", leading: " + OVERLAY_TEXT_LEADING + ", justification: Justification.CENTER_ALIGN, fillColor: badgePaper, underline: false, strikeThru: false }; }" +
    "      catch (e) { try { lbl.texts[0].properties = { pointSize: " + OVERLAY_TEXT_PT + ", leading: " + OVERLAY_TEXT_LEADING + ", justification: Justification.CENTER_ALIGN, fillColor: badgePaper }; } catch (e2) {} }" +
    "    } catch (e) {}" +
    "  }" +
    "  function borderPoint(b, tx, ty) {" +
    "    var t = b[0], l = b[1], bo = b[2], rr = b[3];" +
    "    var cx = (l + rr) / 2, cy = (t + bo) / 2;" +
    "    var dx = tx - cx, dy = ty - cy;" +
    "    if (dx === 0 && dy === 0) return [cx, cy];" +
    "    var hw = (rr - l) / 2, hh = (bo - t) / 2;" +
    "    var nx = Math.abs(dx) / Math.max(hw, 0.0001);" +
    "    var ny = Math.abs(dy) / Math.max(hh, 0.0001);" +
    "    var pad = 0.6;" +
    "    if (nx >= ny) {" +
    "      var x1 = dx >= 0 ? rr : l;" +
    "      var yr = cy + dy * (hw / Math.max(Math.abs(dx), 0.0001));" +
    "      return [x1, Math.max(t + pad, Math.min(bo - pad, yr))];" +
    "    }" +
    "    var y1 = dy >= 0 ? bo : t;" +
    "    var xr = cx + dx * (hh / Math.max(Math.abs(dy), 0.0001));" +
    "    return [Math.max(l + pad, Math.min(rr - pad, xr)), y1];" +
    "  }" +
    "  function drawArrow(pg, b1, b2) {" +
    "    try {" +
    "      var p1 = borderPoint(b1, (b2[1] + b2[3]) / 2, (b2[0] + b2[2]) / 2);" +
    "      var p2 = borderPoint(b2, (b1[1] + b1[3]) / 2, (b1[0] + b1[2]) / 2);" +
    "      var line = pg.graphicLines.add({ itemLayer: layer, strokeColor: accent, strokeWeight: " + ARROW_W + " });" +
    "      line.paths[0].entirePath = [[p1[0], p1[1]], [p2[0], p2[1]]];" +
    "      if (dashed) { try { line.strokeType = dashed; } catch (e) {} }" +
    "      try { line.rightLineEnd = ArrowHead.TRIANGLE_ARROW_HEAD; } catch (e) { try { line.rightArrowHead = 'Triangle'; } catch (e2) {} }" +
    "      setOpacity(line, " + OVERLAY_OPACITY + ");" +
    "    } catch (e) {}" +
    "  }"
  );
}

/** JSX prologue: layer reset, accent swatch, paragraph style, dashed stroke. */
function jsxPrologue(layerName, swatchName, styleName, rgb, targetPageId) {
  return (
    "(function () {" +
    "  var d = app.activeDocument;" +
    "  var TARGET = " + Number(targetPageId) + ";" + // page id to draw, or -1 = all pages

    "  var OVERLAYS = { '" + U.LAYER_TAG_RO + "': 1, '" + U.LAYER_CONSTRUCTION_RO + "': 1, '" +
         U.LAYER_ALT_TEXT + "': 1, '" + U.LAYER_MARKUP + "': 1, '" + U.LAYER_LEGACY_RO + "': 1 };" +
    "  try { var old = d.layers.itemByName('" + layerName + "'); if (old.isValid) { old.locked = false; old.remove(); } } catch (e) {}" +
    "  var layer = d.layers.add({ name: '" + layerName + "' });" +
    "  var accent;" +
    "  try {" +
    "    accent = d.colors.itemByName('" + swatchName + "');" +
    "    if (!accent.isValid) throw 0;" +
    "    accent.properties = { model: ColorModel.PROCESS, space: ColorSpace.RGB, colorValue: [" + rgb.join(",") + "] };" +
    "  } catch (e) {" +
    "    try { accent = d.colors.add({ name: '" + swatchName + "', model: ColorModel.PROCESS, space: ColorSpace.RGB, colorValue: [" + rgb.join(",") + "] }); }" +
    "    catch (e2) { accent = d.swatches.itemByName('Black'); }" +
    "  }" +
    "  var paper = null;" +
    "  try { paper = d.swatches.itemByName('Paper'); } catch (e) {}" +
    "  var ps = null;" +
    "  try { ps = d.paragraphStyles.itemByName('" + styleName + "'); if (!ps.isValid) throw 0; }" +
    "  catch (e) { try { ps = d.paragraphStyles.add({ name: '" + styleName + "' }); } catch (e2) { ps = null; } }" +
    "  if (ps) {" +
    "    try { ps.properties = { justification: Justification.CENTER_ALIGN, pointSize: " + OVERLAY_TEXT_PT + ", leading: " + OVERLAY_TEXT_LEADING + ", spaceBefore: 0, spaceAfter: 0, leftIndent: 0, rightIndent: 0, firstLineIndent: 0, underline: false, strikeThru: false, fillColor: accent }; } catch (e) {}" +
    "    try { ps.appliedFont = '" + OVERLAY_FONT + "'; } catch (e) {}" +
    "  }" +
    "  var dashed = null;" +
    "  try { dashed = d.strokeStyles.itemByName('Dashed'); if (!dashed.isValid) dashed = null; } catch (e) { dashed = null; }" +
    jsxCommonHelpers() +
    "  var drawn = 0;"
  );
}

const JSX_EPILOGUE =
    "  try { layer.locked = true; } catch (e) {}" +
    "  return drawn;" +
    "})();";

/** Enumeration fragment — Construction RO: layers bottom→up, per-page buckets. */
const JSX_ENUM_CONSTRUCTION =
    "  var buckets = {}; var order = [];" +
    "  for (var p = 0; p < d.pages.length; p++) {" +
    "    var pid = d.pages[p].id;" +
    "    if (TARGET >= 0 && pid != TARGET) continue;" + // items on other pages find no bucket below
    "    buckets[pid] = []; order.push(pid);" +
    "  }" +
    "  for (var li = d.layers.length - 1; li >= 0; li--) {" +
    "    var L2 = d.layers[li];" +
    "    try { if (!L2.visible) continue; } catch (e) {}" +
    "    if (OVERLAYS[L2.name]) continue;" +
    "    var pis = [];" +
    "    try { pis = L2.pageItems.everyItem().getElements(); } catch (e) { pis = []; }" +
    "    for (var i = pis.length - 1; i >= 0; i--) {" + // pageItems[0] = frontmost → reverse = backmost first
    "      var it2 = pis[i];" +
    "      try {" +
    "        if (!it2.isValid) continue;" +
    "        if (it2.visible === false) continue;" +
    "        if (it2.nonprinting === true) continue;" +
    "        var pp = it2.parentPage;" +
    "        if (!pp || !pp.isValid) continue;" +
    "        var bucket = buckets[pp.id];" +
    "        if (!bucket) continue;" + // master page item
    "        if (isArtifact(it2)) continue;" +
    "        var bb = it2.geometricBounds;" +
    "        if (!(bb[2] > bb[0] && bb[3] > bb[1])) continue;" +
    "        bucket.push({ pg: pp, b: bb });" +
    "      } catch (e) {}" +
    "    }" +
    "  }" +
    "  for (var o = 0; o < order.length; o++) {" +
    "    var list = buckets[order[o]];" +
    "    for (var k = 0; k < list.length; k++) {" +
    "      drawItem(list[k].pg, list[k].b, k + 1);" +
    "      if (k < list.length - 1) drawArrow(list[k].pg, list[k].b, list[k + 1].b);" +
    "      drawn++;" +
    "    }" +
    "  }";

/** Enumeration fragment — Tag RO: articles order, numbering restarts per page. */
const JSX_ENUM_TAG =
    "  function resolveMember(m) {" +
    "    var ref = null;" +
    "    try { ref = m.itemRef; } catch (e) { return null; }" +
    "    if (!ref || !ref.isValid) return null;" +
    "    try { var dummy = ref.geometricBounds; return ref; } catch (e) {}" +
    "    try { if (ref.textContainers && ref.textContainers.length > 0) return ref.textContainers[0]; } catch (e) {}" +
    "    try { if (ref.parentTextFrames && ref.parentTextFrames.length > 0) return ref.parentTextFrames[0]; } catch (e) {}" +
    "    try {" +
    "      var par = ref.parent, g = 0;" +
    "      while (par && g < 10) { g++; try { var d2 = par.geometricBounds; return par; } catch (e2) {} par = par.parent; }" +
    "    } catch (e) {}" +
    "    return null;" +
    "  }" +
    "  var entries = [];" +
    "  for (var a = 0; a < d.articles.length; a++) {" +
    "    var members = [];" +
    "    try { members = d.articles[a].articleMembers.everyItem().getElements(); } catch (e) { members = []; }" +
    "    for (var mi = 0; mi < members.length; mi++) {" +
    "      try {" +
    "        var ref2 = resolveMember(members[mi]);" +
    "        if (!ref2 || !ref2.isValid) continue;" +
    "        if (isArtifact(ref2)) continue;" +
    "        var pp2 = null;" +
    "        try { pp2 = ref2.parentPage; } catch (e) { pp2 = null; }" +
    "        if (!pp2 || !pp2.isValid) continue;" +
    "        if (TARGET >= 0 && pp2.id != TARGET) continue;" +
    "        var bb2 = ref2.geometricBounds;" +
    "        if (!(bb2[2] > bb2[0] && bb2[3] > bb2[1])) continue;" +
    "        entries.push({ pg: pp2, b: bb2, pid: pp2.id });" +
    "      } catch (e) {}" +
    "    }" +
    "  }" +
    "  var counters = {};" +
    "  for (var k2 = 0; k2 < entries.length; k2++) {" +
    "    var en = entries[k2];" +
    "    counters[en.pid] = (counters[en.pid] || 0) + 1;" +
    "    drawItem(en.pg, en.b, counters[en.pid]);" +
    "    if (k2 < entries.length - 1 && entries[k2 + 1].pid === en.pid) drawArrow(en.pg, en.b, entries[k2 + 1].b);" +
    "    drawn++;" +
    "  }";

/**
 * Active page id for the given scope, or -1 = whole document.
 * Falls back to -1 when no page can be resolved.
 */
function resolveTargetPageId(allPages) {
  if (allPages) return -1;
  try {
    const ctx = U.getActiveContext();
    if (ctx.ok) return ctx.page.id;
  } catch (e) {}
  return -1;
}

/**
 * Runs an overlay draw as a single ExtendScript.
 * @param {string} mode          "tag" | "construction"
 * @param {number} targetPageId  page id to draw, or -1 for all pages
 * @returns {number|null} drawn count, or null when the JSX path is
 *          unavailable/failed (caller falls back to the UXP implementation).
 */
function drawOverlayViaExtendScript(mode, targetPageId) {
  if (typeof app.doScript !== "function" || !ScriptLanguage) return null;

  const isTag = (mode === "tag");
  const jsx =
    jsxPrologue(
      isTag ? U.LAYER_TAG_RO : U.LAYER_CONSTRUCTION_RO,
      isTag ? "_ROP_TagRO" : "_ROP_ConstrRO",
      isTag ? "CSPS-TagRO" : "CSPS-ConstrRO",
      isTag ? RGB_TAG : RGB_CONSTRUCTION,
      targetPageId
    ) +
    (isTag ? JSX_ENUM_TAG : JSX_ENUM_CONSTRUCTION) +
    JSX_EPILOGUE;

  try {
    const res = (UndoModes && UndoModes.FAST_ENTIRE_SCRIPT)
      ? app.doScript(jsx, ScriptLanguage.JAVASCRIPT, [], UndoModes.FAST_ENTIRE_SCRIPT,
                     isTag ? "Draw Tag RO" : "Draw Construction RO")
      : app.doScript(jsx, ScriptLanguage.JAVASCRIPT);
    const n = Number(res);
    return isFinite(n) ? n : null;
  } catch (e) {
    U.log("overlay via ExtendScript failed:", e.message);
    return null;
  }
}

// ─── Public overlay operations ────────────────────────────────────────────────

/**
 * Draws the [Tag RO] overlay (Articles order, artifacts excluded).
 * @param {boolean} allPages  false (default) = active page only
 */
function drawTagROOverlay(doc, allPages) {
  if (!doc || !doc.articles || !doc.articles.length) return { drawn: 0, errorKey: "noArticles" };

  const targetId = resolveTargetPageId(allPages);
  const viaJsx = drawOverlayViaExtendScript("tag", targetId);
  if (viaJsx !== null) return { drawn: viaJsx };

  // Fallback: UXP implementation.
  const data = getTagROItems(doc, null, { skipAlt: true }); // alt not drawn here
  if (!data.ok) return { drawn: 0, errorKey: data.errorKey };
  let items = data.items;
  if (targetId >= 0) items = items.filter(function (it) { return it.pageId === targetId; });
  if (!items.length) return { drawn: 0 };
  return { drawn: drawOrderOverlay(doc, U.LAYER_TAG_RO, items, RGB_TAG, "TagRO") };
}

/** Deletes the [Tag RO] overlay (and the v1.0 [Reading Order] layer). */
function deleteTagROOverlay(doc) {
  return deleteLayers(doc, [U.LAYER_TAG_RO, U.LAYER_LEGACY_RO]);
}

/**
 * Draws the [Construction RO] overlay: every document page, numbering
 * restarting on each page (the content stream is per page), bottom-up.
 */
function drawConstructionROOverlay(doc, allPages) {
  let targetId = -1;
  let targetPage = null;
  if (!allPages) {
    try {
      const ctx = U.getActiveContext();
      if (ctx.ok) { targetId = ctx.page.id; targetPage = ctx.page; }
    } catch (e) {}
  }

  const viaJsx = drawOverlayViaExtendScript("construction", targetId);
  if (viaJsx !== null) return { drawn: viaJsx };

  // Fallback: UXP implementation — enumeration done BEFORE creating the
  // overlay layer so it cannot list itself.
  const r = targetPage
    ? getConstructionROItems(doc, targetPage, { skipAlt: true })
    : getConstructionROItemsAllPages(doc, { skipAlt: true });
  if (!r.ok) return { drawn: 0, errorKey: "errGeneric", msg: "enumeration failed" };

  if (!r.items.length) return { drawn: 0 };
  return { drawn: drawOrderOverlay(doc, U.LAYER_CONSTRUCTION_RO, r.items, RGB_CONSTRUCTION, "ConstrRO") };
}

/** Deletes the [Construction RO] overlay. */
function deleteConstructionROOverlay(doc) {
  return deleteLayers(doc, [U.LAYER_CONSTRUCTION_RO]);
}

// ─── Alt text overlay ─────────────────────────────────────────────────────────

/** Collects the document's graphic frames (deduplicated, masters excluded). */
function getGraphicFrames(doc) {
  const frames = [];
  const seen = {};

  let graphics = [];
  try { graphics = doc.allGraphics; } catch (e) { graphics = []; }

  for (let i = 0; i < graphics.length; i++) {
    let frame = null;
    try { frame = graphics[i].parent; } catch (e) { continue; }
    if (!frame || !frame.isValid) continue;
    try { if (seen[String(frame.id)]) continue; seen[String(frame.id)] = true; } catch (e) { continue; }

    const pg = U.getParentPage(frame);
    if (!pg || U.isMasterPage(pg)) continue;

    frames.push(frame);
  }
  return frames;
}

/**
 * Toggles the [Alt Text] overlay:
 *   - layer present  → deletes it, returns { deleted: true }
 *   - layer absent   → draws a label per image frame (green = alt present,
 *     gray = decorative/external, red = missing), returns { drawn, missing }
 *
 * Artifact-tagged images are skipped (artifacts need no alt text).
 */
function toggleAltTextOverlay(doc, allPages) {
  if (deleteLayers(doc, [U.LAYER_ALT_TEXT])) return { deleted: true };
  const targetId = resolveTargetPageId(allPages);
  return runFast("Draw [Alt Text]", function () { return drawAltTextOverlay(doc, targetId); });
}

function drawAltTextOverlay(doc, targetId) {
  const frames = getGraphicFrames(doc).filter(function (f) { return !U.isArtifact(f); });

  const layer = doc.layers.add({ name: U.LAYER_ALT_TEXT });
  const okSwatch      = ensureSwatch(doc, "_ROP_AltOK", RGB_ALT_OK);
  const missingSwatch = ensureSwatch(doc, "_ROP_AltMissing", RGB_ALT_MISSING);
  const paraStyleOk      = ensureLabelStyle(doc, "CSPS-AltOK", okSwatch);
  const paraStyleMissing = ensureLabelStyle(doc, "CSPS-AltMissing", missingSwatch);
  try { if (paraStyleOk) paraStyleOk.justification = Justification.LEFT_ALIGN; } catch (e) {}
  try { if (paraStyleMissing) paraStyleMissing.justification = Justification.LEFT_ALIGN; } catch (e) {}

  let drawn = 0;
  let missing = 0;

  frames.forEach(function (frame) {
    const b = U.normalizeBounds(frame.geometricBounds);
    const pg = U.getParentPage(frame);
    if (!b || !pg) return;
    if (targetId >= 0 && pg.id !== targetId) return; // outside the chosen scope

    const info = U.getAltTextInfo(frame);
    if (info.status === "missing") missing++;

    let labelText;
    if (info.status === "ok")              labelText = info.text.substring(0, 90);
    else if (info.status === "decorative") labelText = t("altDecorative");
    else if (info.status === "external")   labelText = t("altExternal", { source: info.text });
    else                                   labelText = "⚠ " + t("altMissing");

    const isMissing = (info.status === "missing");
    const accent = isMissing ? missingSwatch : okSwatch;
    const paraStyle = isMissing ? paraStyleMissing : paraStyleOk;

    // Label box sized relative to the page so it works in mm and pt documents.
    const pageB = U.normalizeBounds(pg.bounds) || b;
    const pageW = pageB[3] - pageB[1];
    const labelH = pageW * 0.035;
    const labelW = Math.max(pageW * 0.2, Math.min(b[3] - b[1], pageW * 0.6));

    try {
      // Thin outline around the image.
      const box = pg.rectangles.add({
        itemLayer: layer,
        geometricBounds: b,
        fillColor: "None",
        strokeColor: accent,
        strokeWeight: isMissing ? 1.5 : BOX_STROKE
      });
      setOpacity(box, OVERLAY_OPACITY);

      // Label just above the image's top-left corner (clamped to the page).
      const lTop = Math.max(pageB[0], b[0] - labelH);
      const lbl = pg.textFrames.add({
        itemLayer: layer,
        geometricBounds: [lTop, b[1], lTop + labelH, b[1] + labelW],
        fillColor: (function () {
          try { return doc.swatches.itemByName("Paper"); } catch (e) { return "Paper"; }
        })(),
        strokeColor: accent,
        strokeWeight: 0.5
      });
      lbl.contents = labelText;
      applyLabelFramePrefs(lbl);
      try { lbl.parentStory.appliedCharacterStyle = doc.characterStyles.itemByName("[None]"); } catch (e) {}
      if (paraStyle && paraStyle.isValid) {
        try { lbl.parentStory.appliedParagraphStyle = paraStyle; } catch (e) {}
      }
      try { lbl.parentStory.clearOverrides(); } catch (e) {}
      try { lbl.textFramePreferences.verticalJustification = VerticalJustification.CENTER_ALIGN; } catch (e) {}
      applyLabelTextProps(lbl, isMissing ? missingSwatch : okSwatch, Justification.LEFT_ALIGN);

      drawn++;
    } catch (e) {
      U.log("altText label failed:", e.message);
    }
  });

  finalizeOverlayLayer(layer);
  return { drawn: drawn, missing: missing };
}

// ─── Markup overlay (paragraph/character style tags) ──────────────────────────

/**
 * PDF export tag of a paragraph style ("H1", "P", "Artifact"…), read from
 * the style's Export Tagging settings. Returns "" when no explicit PDF tag
 * is set (the "[Automatic]" default).
 */
function getStylePdfExportTag(paraStyle) {
  let pdfTag = "";
  try {
    const maps = paraStyle.styleExportTagMaps.everyItem().getElements();
    maps.forEach(function (m) {
      try {
        const type = String(m.exportType || "").toLowerCase();
        const tag = String(m.exportTag || "").trim();
        if (!tag || tag === "[Automatic]") return;
        if (type.indexOf("pdf") >= 0) pdfTag = tag;
      } catch (e) {}
    });
  } catch (e) {}
  return pdfTag;
}

/**
 * Label for one paragraph: its PDF export tag in angle brackets — "<H1>",
 * "<P>"… InDesign's "[Automatic]" default maps body text to P, hence "<P>"
 * when no explicit tag is configured on the style.
 */
function getParagraphMarkupLabel(para) {
  let tag = "";
  try {
    const ps = para.appliedParagraphStyle;
    if (ps && ps.isValid) tag = getStylePdfExportTag(ps);
  } catch (e) {}
  return "<" + (tag || "P") + ">";
}

/** Text frames of one page, nested ones included, overlay/artifact ones excluded. */
function getPageTextFrames(page) {
  let candidates = [];
  try { candidates = page.allPageItems; } catch (e) {}
  if (!candidates || !candidates.length) {
    try { candidates = page.textFrames.everyItem().getElements(); } catch (e) { candidates = []; }
  }

  const frames = [];
  for (let i = 0; i < candidates.length; i++) {
    const it = candidates[i];
    try {
      if (String(it) !== "[object TextFrame]") continue;
      if (!it.isValid) continue;
      if (it.visible === false) continue;
      const layerName = it.itemLayer ? String(it.itemLayer.name) : "";
      if (U.OVERLAY_LAYER_NAMES.indexOf(layerName) >= 0) continue;
      try { if (it.itemLayer && !it.itemLayer.visible) continue; } catch (e) {}
      if (U.isArtifact(it)) continue;
      frames.push(it);
    } catch (e) {}
  }
  return frames;
}

/**
 * Toggles the [Markup] overlay: one small purple label per paragraph showing
 * its export tag and styles, positioned at the paragraph's first baseline.
 *   - layer present → deletes it, returns { deleted: true }
 *   - layer absent  → returns { drawn: <label count> }
 */
function toggleMarkupOverlay(doc, allPages) {
  if (deleteLayers(doc, [U.LAYER_MARKUP])) return { deleted: true };
  const targetId = resolveTargetPageId(allPages);
  return runFast("Draw [Markup]", function () { return drawMarkupOverlay(doc, targetId); });
}

function drawMarkupOverlay(doc, targetId) {
  const layer = doc.layers.add({ name: U.LAYER_MARKUP });
  const swatch = ensureSwatch(doc, "_ROP_Markup", RGB_MARKUP);
  const paraStyle = ensureLabelStyle(doc, "CSPS-Markup", swatch);
  try { if (paraStyle) paraStyle.justification = Justification.LEFT_ALIGN; } catch (e) {}

  let paperSwatch = null;
  try { paperSwatch = doc.swatches.itemByName("Paper"); } catch (e) {}

  let drawn = 0;
  let pages = [];
  try { pages = doc.pages.everyItem().getElements(); } catch (e) { pages = []; }

  for (let p = 0; p < pages.length && drawn < MARKUP_MAX_LABELS; p++) {
    const page = pages[p];
    if (targetId >= 0 && page.id !== targetId) continue; // outside the chosen scope
    const pageB = U.normalizeBounds(page.bounds);
    if (!pageB) continue;
    const pageW = pageB[3] - pageB[1];
    const labelH = pageW * 0.022;
    const labelW = pageW * 0.11; // short tags only ("<H1>", "<P>", …)

    const frames = getPageTextFrames(page);

    for (let f = 0; f < frames.length && drawn < MARKUP_MAX_LABELS; f++) {
      let paragraphs = [];
      try { paragraphs = frames[f].paragraphs.everyItem().getElements(); } catch (e) { continue; }

      for (let i = 0; i < paragraphs.length && drawn < MARKUP_MAX_LABELS; i++) {
        const para = paragraphs[i];
        try {
          if (!String(para.contents || "").trim()) continue; // empty line

          const labelText = getParagraphMarkupLabel(para);
          if (!labelText) continue;

          // Anchor at the paragraph's first character baseline.
          const ch = para.characters.item(0);
          const baseline = Number(ch.baseline);
          const x = Number(ch.horizontalOffset);
          if (!isFinite(baseline) || !isFinite(x)) continue;

          const top  = Math.max(pageB[0], baseline - labelH);
          const left = Math.min(Math.max(pageB[1], x), pageB[3] - labelW);

          const lbl = page.textFrames.add({
            itemLayer: layer,
            geometricBounds: [top, left, top + labelH, left + labelW],
            fillColor: (paperSwatch && paperSwatch.isValid) ? paperSwatch : "Paper",
            strokeColor: swatch,
            strokeWeight: 0.4
          });
          lbl.contents = labelText.substring(0, 80);
          applyLabelFramePrefs(lbl);
          setOpacity(lbl, 85);
          try { lbl.parentStory.appliedCharacterStyle = doc.characterStyles.itemByName("[None]"); } catch (e) {}
          if (paraStyle && paraStyle.isValid) {
            try { lbl.parentStory.appliedParagraphStyle = paraStyle; } catch (e) {}
          }
          try { lbl.parentStory.clearOverrides(); } catch (e) {}
          try { lbl.textFramePreferences.verticalJustification = VerticalJustification.CENTER_ALIGN; } catch (e) {}
          applyLabelTextProps(lbl, swatch, Justification.LEFT_ALIGN);

          drawn++;
        } catch (e) {
          U.log("markup label failed:", e.message);
        }
      }
    }
  }

  if (drawn >= MARKUP_MAX_LABELS) {
    U.log("markup overlay: label cap reached (" + MARKUP_MAX_LABELS + ")");
  }

  finalizeOverlayLayer(layer);
  return { drawn: drawn };
}

module.exports = {
  drawTagROOverlay,
  deleteTagROOverlay,
  drawConstructionROOverlay,
  deleteConstructionROOverlay,
  toggleAltTextOverlay,
  toggleMarkupOverlay
};
