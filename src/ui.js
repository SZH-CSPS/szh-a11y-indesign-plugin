/**
 * src/ui.js
 * =========
 * Panel-side rendering: the miniature page preview with numbered overlays.
 *
 * Pure HTML generation — no InDesign API access, no DOM mutation. The caller
 * (main.js) injects the returned markup into the panel.
 *
 * Copyright (C) 2025-2026 SZH/CSPS — Swiss Centre for Special Needs Education
 * Licensed under GNU GPL v3 — https://www.gnu.org/licenses/
 */

"use strict";

const U = require("./utils.js");

// Preview accent per mode (CSS colors).
const ACCENT_TAG          = "#ff4526"; // red-orange — Tag RO
const ACCENT_CONSTRUCTION = "#3b8de0"; // blue       — Construction RO
const ACCENT_HIGHLIGHT    = "#ffd23c"; // yellow     — current nav item

/**
 * Builds the HTML of the page thumbnail with numbered item boxes.
 * Renders the bare page when `items` is empty (so an empty page is clearly
 * an empty page, not a stale preview).
 *
 * @param {Array}  items        items on the displayed page (with .bounds/.index)
 * @param {object} pageGeometry { bounds: [top, left, bottom, right] }
 * @param {number} containerW   available width in px
 * @param {number} highlightIdx array index to highlight, or -1
 * @param {string} mode         "tag" | "construction" (accent color)
 * @returns {string} HTML markup, or "" when the page geometry is unusable
 */
function buildThumbnailHTML(items, pageGeometry, containerW, highlightIdx, mode) {
  if (!pageGeometry) return "";
  const pb = U.normalizeBounds(pageGeometry.bounds);
  if (!pb) return "";

  const pw = pb[3] - pb[1], ph = pb[2] - pb[0];
  if (pw <= 0 || ph <= 0) return "";

  const viewW = Math.max(10, (containerW || 280) - 12);
  const sc    = viewW / pw;
  const viewH = Math.max(10, Math.round(ph * sc));

  const sx = function (x) { return (x - pb[1]) * sc; };
  const sy = function (y) { return (y - pb[0]) * sc; };

  const accent = (mode === "construction") ? ACCENT_CONSTRUCTION : ACCENT_TAG;

  const p = [
    '<div style="position:relative;width:' + Math.round(viewW) + "px;height:" + viewH +
    "px;background:#f5f5f5;border:1px solid " + accent + ';overflow:hidden;border-radius:2px;">'
  ];

  (items || []).forEach(function (item, i) {
    const b = U.normalizeBounds(item.bounds);
    if (!b) return;

    const x = sx(b[1]);
    const y = sy(b[0]);
    const w = (b[3] - b[1]) * sc;
    const h = (b[2] - b[0]) * sc;
    if (w <= 0 || h <= 0) return;

    const hl = (i === highlightIdx);
    const c  = hl ? ACCENT_HIGHLIGHT : accent;
    const stroke = hl ? 2 : 1;
    const br = 7; // badge radius in px
    // Solid accent badge with white bold number — far more readable than
    // the former thin-ring style (highlight: yellow with black number).
    const badgeTxt = hl ? "#000" : "#fff";

    // Tooltip: alt text (or the item text preview) on hover.
    let tip = "";
    if (item.hasGraphic) {
      tip = (item.altStatus === "ok") ? item.altText : ("[alt: " + (item.altStatus || "?") + "]");
    } else if (item.textPreview) {
      tip = item.textPreview;
    }
    const tipAttr = tip
      ? ' title="' + String(tip).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;") + '"'
      : "";

    p.push('<div' + tipAttr + ' style="position:absolute;left:' + x.toFixed(1) + "px;top:" + y.toFixed(1) +
           "px;width:" + w.toFixed(1) + "px;height:" + h.toFixed(1) +
           "px;border:" + stroke + "px solid " + c +
           ';background:rgba(127,127,127,0.08);"></div>');
    p.push('<div style="position:absolute;left:' + (x + 1).toFixed(1) + "px;top:" + (y + 1).toFixed(1) +
           "px;width:" + (br * 2) + "px;height:" + (br * 2) +
           "px;border-radius:50%;background:" + c + ";border:1px solid #fff" +
           ";color:" + badgeTxt + ";font-size:10px;font-weight:700;line-height:" + (br * 2) +
           'px;text-align:center;">' + item.index + "</div>");

    // ALT state chip on image frames: green when alt text is present
    // (or the image is decorative/from metadata), red when missing.
    if (item.hasGraphic && h > 12 && w > 30) {
      const altOk = (item.altStatus === "ok" || item.altStatus === "decorative" || item.altStatus === "external");
      const chipBg = altOk ? "#1d7d3f" : "#c42b1c";
      const chipTxt = altOk ? "ALT" : "ALT?";
      p.push('<div style="position:absolute;left:' + (x + 2).toFixed(1) + "px;top:" + (y + h - 11).toFixed(1) +
             "px;padding:0 3px;height:9px;background:" + chipBg +
             ';color:#fff;font-size:7px;font-weight:700;line-height:9px;border-radius:2px;">' +
             chipTxt + "</div>");
    }
  });

  p.push("</div>");
  return p.join("");
}

module.exports = { buildThumbnailHTML };
