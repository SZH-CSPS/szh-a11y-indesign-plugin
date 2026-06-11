/**
 * main.js
 * =======
 * SZH-CSPS A11Y InDesign Plugin — UXP plugin for Adobe InDesign.
 * Entry point: panel lifecycle, state, and UI wiring.
 *
 * ARCHITECTURE
 * ------------
 * index.html   panel layout (loaded by UXP, runs this script)
 * styles.css   panel styles
 * main.js      ← you are here: state + event wiring, no business logic
 * src/
 *   strings.js   language data (EN/FR/DE)
 *   i18n.js      locale detection + t()
 *   utils.js     shared helpers (geometry, page context, artifact detection)
 *   articles.js  Tag RO (Articles panel order)
 *   zorder.js    Construction RO (layer stack order) + selection reorder
 *   groups.js    save / ungroup / regroup workflow
 *   artifacts.js artifact tagging, visibility, layer moves
 *   overlay.js   in-document overlay layers (Tag RO, Construction RO, Alt Text)
 *   ui.js        panel thumbnail renderer
 *
 * DOMAIN GLOSSARY
 * ---------------
 * Tag RO          reading order of the tag tree, driven by the Articles panel.
 *                 Required by PDF/UA; what conformant screen readers follow.
 * Construction RO reading order of the page content stream, driven by the
 *                 z-order (layer stack), read BOTTOM-UP. Followed by many
 *                 non-conformant assistive tools, hence equally important.
 * Artifact        object excluded from the logical structure (decoration);
 *                 never part of any reading order.
 *
 * Copyright (C) 2025-2026 SZH/CSPS — Swiss Centre for Special Needs Education
 * Licensed under GNU GPL v3 — https://www.gnu.org/licenses/
 */

"use strict";

const { entrypoints } = require("uxp");
const indesign = require("indesign");
const { app } = indesign;
const ZoomOptions = indesign.ZoomOptions || globalThis.ZoomOptions;

const { t, setLocaleOverride, getLocaleOverride } = require("./src/i18n.js");
const U = require("./src/utils.js");
const { getTagROItems, updateROArticleNames } = require("./src/articles.js");
const { getConstructionROItems, reorderSelectedBottomUp, alignZOrderToTagRO } = require("./src/zorder.js");
const groups = require("./src/groups.js");
const artifacts = require("./src/artifacts.js");
const overlay = require("./src/overlay.js");
const { buildThumbnailHTML } = require("./src/ui.js");

// ═════════════════════════════════════════════════════════════════════════════
// PANEL STATE
// ═════════════════════════════════════════════════════════════════════════════

let _panelRoot = null;          // root DOM node of the panel
let _bound = false;             // button handlers attached? (show() may re-run)
let _previewMode = "tag";       // "tag" (Articles) | "construction" (z-order)
let _previewCollapsed = false;
let _pageItems = [];            // items of the current preview (active page)
let _pageGeometry = null;       // bounds of the displayed page
let _navIdx = 0;                // current navigation index (0-based)
let _watcher = null;            // polling timer for page/document changes
let _lastContextSig = null;     // last seen "document:page" signature
let _altEditTargetId = null;    // page item id being edited in the alt editor
let _busy = false;              // an action is running — ignore further clicks
let _cooldownUntil = 0;         // timestamp until which clicks are swallowed
let _overlayAllPages = false;   // control layer scope: false = active page only

// Clicks made while the JS thread is blocked by a long InDesign call are
// QUEUED by the UI and dispatched right after the work completes — at which
// point the busy flag is already cleared and the buttons re-enabled, so the
// queued clicks would relaunch the action. A short cooldown after each
// action swallows exactly those replayed clicks.
const CLICK_COOLDOWN_MS = 400;

// How often the active page is checked. InDesign's afterContextChanged event
// is not delivered reliably to UXP panels, so the plugin polls instead.
const WATCH_INTERVAL_MS = 800;

// ═════════════════════════════════════════════════════════════════════════════
// DOM HELPERS
// ═════════════════════════════════════════════════════════════════════════════

function el(id) {
  return _panelRoot ? _panelRoot.querySelector("#" + id) : null;
}

function setText(id, text) {
  const e = el(id);
  if (e) e.textContent = text;
}

function setVisible(id, visible) {
  const e = el(id);
  if (e) e.style.display = visible ? "" : "none";
}

function setDisabled(id, disabled) {
  const e = el(id);
  if (!e) return;
  // Real buttons have a disabled property; div-based buttons use the
  // .disabled class (pointer-events: none) instead.
  if (typeof e.disabled === "boolean") e.disabled = !!disabled;
  e.classList.toggle("disabled", !!disabled);
  e.setAttribute("aria-disabled", disabled ? "true" : "false");
}

/** Shows a message in the status bar (green) or an error (red). */
function showStatus(msg, isError) {
  const e = el("status-msg");
  if (!e) return;
  e.textContent   = msg || "";
  e.className     = "status" + (isError ? " error" : "");
  e.style.display = msg ? "block" : "none";
}

/** Localizes all [data-i18n] / [data-i18n-title] elements. */
function applyLocalization() {
  if (!_panelRoot) return;
  _panelRoot.querySelectorAll("[data-i18n]").forEach(function (e) {
    // Setting textContent wipes ALL children — including the ⓘ tooltip icon
    // injected by setupTooltips() (this was the "tooltips vanish after a
    // language switch" bug). Detach the icon, translate, re-attach.
    const icon = e.querySelector(".info-dot");
    e.textContent = t(e.getAttribute("data-i18n"));
    if (icon) e.appendChild(icon);
  });
  // Native title tooltips only for the collapse buttons (no room for an ⓘ
  // icon); everything else uses the custom tooltip, which resolves t() at
  // hover time — a language switch needs no re-pass.
  _panelRoot.querySelectorAll("[data-i18n-title]").forEach(function (e) {
    if (e.classList.contains("btn-collapse")) {
      e.setAttribute("title", t(e.getAttribute("data-i18n-title")));
    } else {
      e.removeAttribute("title");
    }
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// CUSTOM TOOLTIPS
// ═════════════════════════════════════════════════════════════════════════════

let _tipsReady = false;

/**
 * Injects an ⓘ icon at the end of every control carrying data-i18n-title and
 * shows a positioned, readable bubble on hover or click of that icon. The
 * icon gives users a precise, stable hover target — UXP's native title
 * bubbles fire erratically and stick to the cursor.
 */
function setupTooltips() {
  if (_tipsReady || !_panelRoot) return;
  _tipsReady = true;

  const host = document.body || _panelRoot;
  const tip = document.createElement("div");
  tip.id = "rop-tooltip";
  tip.className = "rop-tooltip";
  tip.style.display = "none";
  host.appendChild(tip);

  function hideTip() {
    tip.style.display = "none";
  }

  function showTipFor(anchor, key) {
    tip.textContent = t(key); // resolved at show time → follows the language
    tip.style.left = "0px";
    tip.style.top = "0px";
    tip.style.display = "block";

    const r = anchor.getBoundingClientRect();
    const tw = tip.offsetWidth;
    const th = tip.offsetHeight;
    const vw = window.innerWidth || 320;
    const vh = window.innerHeight || 600;

    // Centered under the icon, clamped to the viewport; above when there is
    // no room below. position:fixed → viewport coordinates, no scroll math.
    let left = r.left + r.width / 2 - tw / 2;
    left = Math.max(4, Math.min(left, vw - tw - 4));
    let top = r.bottom + 6;
    if (top + th > vh - 4) top = r.top - th - 6;

    tip.style.left = Math.round(left) + "px";
    tip.style.top = Math.round(top) + "px";
  }

  _panelRoot.querySelectorAll("[data-i18n-title]").forEach(function (ctrl) {
    // Header icon buttons keep the native title (no room for an ⓘ icon).
    if (ctrl.classList.contains("btn-icon") || ctrl.classList.contains("btn-collapse")) return;

    const key = ctrl.getAttribute("data-i18n-title");
    const icon = document.createElement("span");
    icon.className = "info-dot";
    icon.textContent = "i";
    ctrl.classList.add("has-tip");
    ctrl.appendChild(icon);

    icon.addEventListener("mouseenter", function () { showTipFor(icon, key); });
    icon.addEventListener("mouseleave", hideTip);
    // Click toggles the bubble (reliable fallback when hover is flaky) and
    // must NOT trigger the underlying button.
    icon.addEventListener("click", function (ev) {
      ev.stopPropagation();
      if (tip.style.display === "none") showTipFor(icon, key);
      else hideTip();
    });
  });

  // Any scroll or click elsewhere dismisses the bubble.
  document.addEventListener("scroll", hideTip, true);
  document.addEventListener("click", hideTip);
}

/** Disables every actionable control while a long operation runs. */
function setPanelBusy(busy) {
  try { (document.body || _panelRoot).classList.toggle("busy", !!busy); } catch (e) {}
  if (!_panelRoot) return;
  _panelRoot.querySelectorAll("button").forEach(function (b) { b.disabled = !!busy; });
}

/**
 * Runs an action handler with uniform status reporting and a re-entrancy
 * guard: while an action runs, every control is disabled and further clicks
 * are ignored (drawing a control layer can take seconds — without the guard
 * a double-click would queue the work twice).
 *
 * The handler is deferred by a tick so the busy state can actually paint
 * before the synchronous InDesign work blocks the thread. The handler
 * returns a success string, { error: string }, or null for silence; thrown
 * errors land in the status bar. The final status is shown AFTER the
 * optional refresh, because doRefresh() clears the status bar.
 */
function runAction(handler, refreshAfter, busyKey) {
  if (_busy) return;
  _busy = true;
  setPanelBusy(true);
  showStatus("⏳ " + t(busyKey || "busyWorking"), false);

  setTimeout(function () {
    let msg = null;
    let isError = false;
    try {
      const r = handler();
      if (r && typeof r === "object" && r.error) {
        msg = r.error;
        isError = true;
      } else {
        msg = r;
      }
    } catch (e) {
      msg = t("errGeneric", { msg: e.message });
      isError = true;
    } finally {
      _busy = false;
      _cooldownUntil = Date.now() + CLICK_COOLDOWN_MS;
      setPanelBusy(false);
    }

    if (refreshAfter) {
      doRefresh(); // also restores the per-button disabled states
    } else {
      // Restore the states the blanket disable wiped out.
      refreshNav();
      try {
        const ctx = U.getActiveContext();
        if (ctx.ok) refreshDocStateButtons(ctx.doc);
      } catch (e) {}
    }
    showStatus(msg || "", isError);
  }, 50);
}

// ═════════════════════════════════════════════════════════════════════════════
// PREVIEW + NAVIGATION
// ═════════════════════════════════════════════════════════════════════════════

function setPreviewCollapsed(collapsed) {
  _previewCollapsed = !!collapsed;
  const sec = el("section-preview");
  if (sec) sec.classList.toggle("collapsed", _previewCollapsed);
  const btn = el("btn-toggle-preview");
  if (btn) {
    btn.textContent = _previewCollapsed ? "▸" : "▾";
    btn.setAttribute("aria-expanded", _previewCollapsed ? "false" : "true");
  }
}

/** Switches the control layer drawing scope (active page / all pages). */
function setOverlayScope(allPages) {
  _overlayAllPages = !!allPages;
  const btnActive = el("btn-scope-active");
  const btnAll = el("btn-scope-all");
  if (btnActive) {
    btnActive.classList.toggle("active", !_overlayAllPages);
    btnActive.setAttribute("aria-checked", !_overlayAllPages ? "true" : "false");
  }
  if (btnAll) {
    btnAll.classList.toggle("active", _overlayAllPages);
    btnAll.setAttribute("aria-checked", _overlayAllPages ? "true" : "false");
  }
}

function setPreviewMode(mode) {
  _previewMode = (mode === "construction") ? "construction" : "tag";
  const btnTag = el("btn-mode-tag");
  const btnConstr = el("btn-mode-construction");
  if (btnTag) {
    btnTag.classList.toggle("active", _previewMode === "tag");
    btnTag.setAttribute("aria-checked", _previewMode === "tag" ? "true" : "false");
  }
  if (btnConstr) {
    btnConstr.classList.toggle("active", _previewMode === "construction");
    btnConstr.setAttribute("aria-checked", _previewMode === "construction" ? "true" : "false");
  }
  setText("preview-hint", t(_previewMode === "tag" ? "previewHintTag" : "previewHintConstruction"));
  doRefresh();
}

/** Replaces the thumbnail with an inline message (e.g. "no articles"). */
function renderPreviewMessage(msg) {
  const container = el("thumbnail-container");
  if (!container) return;
  container.innerHTML =
    '<div class="thumb-msg">' +
    String(msg).replace(/&/g, "&amp;").replace(/</g, "&lt;") +
    "</div>";
}

/** Re-renders the thumbnail. highlightIdx: array index to highlight, or -1. */
function refreshThumbnail(highlightIdx) {
  const container = el("thumbnail-container");
  if (!container) return;
  const w = container.offsetWidth || 280;
  container.innerHTML = buildThumbnailHTML(
    _pageItems, _pageGeometry, w,
    typeof highlightIdx === "number" ? highlightIdx : -1,
    _previewMode
  );
}

/** Updates the navigation counter and current-item info box. */
function refreshNav() {
  const total   = _pageItems.length;
  const current = total > 0 ? _navIdx + 1 : 0;
  const item    = _pageItems[_navIdx] || null;

  setText("nav-counter", t("navCurrent", { current: current, total: total }));
  setText("nav-info", item ? t("navItem", { num: item.index, name: item.textPreview || item.itemName }) : "—");

  // Second line: source of the order — article name (Tag RO) or layer (Construction RO).
  let detail = "";
  if (item) {
    detail = (_previewMode === "tag")
      ? t("navArticle", { name: item.articleName })
      : t("navLayer", { name: item.layerName });
  }
  setText("nav-article", detail);

  // Alt text of the current item — shown for image frames only.
  const navAlt = el("nav-alt");
  if (navAlt) {
    if (item && item.hasGraphic) {
      let altLine, missing = false;
      if (item.altStatus === "ok")              altLine = t("navAlt", { text: item.altText });
      else if (item.altStatus === "decorative") altLine = t("navAlt", { text: t("altDecorative") });
      else if (item.altStatus === "external")   altLine = t("navAlt", { text: t("altExternal", { source: item.altText }) });
      else { altLine = t("navAltMissing"); missing = true; }
      navAlt.textContent = altLine;
      navAlt.className = "nav-alt" + (missing ? " missing" : "");
      navAlt.style.display = "";
    } else {
      navAlt.textContent = "";
      navAlt.style.display = "none";
    }
  }

  setText("nav-hint", item ? t("navSelectHint") : "");

  setDisabled("btn-prev", current <= 1);
  setDisabled("btn-next", current >= total);
}

/**
 * Reflects the document state on stateful controls: "Clear" buttons are
 * disabled while their control layer does not exist, and the alt-text button
 * label tells what pressing it will do.
 */
function refreshDocStateButtons(doc) {
  try {
    const hasTag    = U.layerExists(doc, U.LAYER_TAG_RO) || U.layerExists(doc, U.LAYER_LEGACY_RO);
    const hasConstr = U.layerExists(doc, U.LAYER_CONSTRUCTION_RO);
    const hasAlt    = U.layerExists(doc, U.LAYER_ALT_TEXT);
    const hasMarkup = U.layerExists(doc, U.LAYER_MARKUP);
    setDisabled("btn-delete-tag-ro", !hasTag);
    setDisabled("btn-delete-construction-ro", !hasConstr);
    setText("btn-toggle-alttext", t(hasAlt ? "btnHideAltText" : "btnShowAltText"));
    setText("btn-toggle-markup", t(hasMarkup ? "btnHideMarkup" : "btnShowMarkup"));
  } catch (e) {
    U.log("refreshDocStateButtons failed:", e.message);
  }
}

/**
 * Full refresh: re-reads the active page from InDesign and rebuilds the
 * preview. Never falls back to another page — if the active page is empty,
 * an empty page is what gets shown.
 */
function doRefresh() {
  showStatus("", false);
  try {
    const ctx = U.getActiveContext();

    if (!ctx.ok) {
      _pageItems = [];
      _pageGeometry = null;
      _navIdx = 0;
      _lastContextSig = null;
      setVisible("section-preview", false);
      setVisible("section-nav", false);
      setVisible("section-overlay", false);
      setVisible("section-fast", false);
      setVisible("section-artifacts", false);
      setVisible("section-artifact-preview", false);
      setVisible("section-alttext", false);
      setVisible("section-markup", false);
      setVisible("empty-state", true);
      setText("empty-message", t(ctx.errorKey));
      return;
    }

    setVisible("section-preview", true);
    setVisible("section-nav", true);
    setVisible("section-overlay", true);
    setVisible("section-fast", true);
    setVisible("section-artifacts", true);
    setVisible("section-artifact-preview", true);
    setVisible("section-alttext", true);
    setVisible("section-markup", true);
    setVisible("empty-state", false);

    _pageGeometry = ctx.pageGeometry;
    _lastContextSig = contextSignature();
    setText("preview-page-label", t("previewPageLabel", { name: ctx.pageName }));
    refreshDocStateButtons(ctx.doc);

    // Keep plugin-created article names ("RO p.X") in sync with the current
    // page numbers after pages were moved or deleted.
    try { updateROArticleNames(ctx.doc); } catch (e) {}

    let result;
    if (_previewMode === "tag") {
      result = getTagROItems(ctx.doc, ctx.page);
      if (!result.ok) {
        _pageItems = [];
        _navIdx = 0;
        // No article in the document: say it IN the preview, not only in
        // the status bar.
        renderPreviewMessage(t("previewNoArticles"));
        refreshNav();
        showStatus(t(result.errorKey), true);
        return;
      }
      _pageItems = result.items.filter(function (i) { return i.onActivePage; });
    } else {
      result = getConstructionROItems(ctx.doc, ctx.page);
      _pageItems = result.items;
    }

    _navIdx = 0;
    if (_pageItems.length) {
      refreshThumbnail(-1);
    } else {
      // Empty page in this mode: explain WHY directly in the preview.
      renderPreviewMessage(t(_previewMode === "tag"
        ? "previewNoItemsTag"
        : "previewNoItemsConstruction"));
    }
    refreshNav();
    if (!_pageItems.length) showStatus(t("navNoItems"), false);

  } catch (e) {
    showStatus(t("errGeneric", { msg: e.message }), true);
  }
}

/** Selects an item in InDesign and zooms to it. */
function selectPageItem(item) {
  if (!item || !item._ref || !item._ref.isValid) return;
  app.activeDocument.select(item._ref);
  try { if (ZoomOptions) app.activeWindow.zoom(ZoomOptions.FIT_SELECTION); } catch (e) {}
}

function navigateTo(idx) {
  const item = _pageItems[idx];
  if (!item) return;
  try { selectPageItem(item); } catch (e) {
    showStatus(t("errGeneric", { msg: e.message }), true);
  }
  refreshThumbnail(idx);
  refreshNav();
}

// ═════════════════════════════════════════════════════════════════════════════
// INLINE ALT TEXT EDITOR
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Object whose alt text gets edited: the InDesign selection first (resolved
 * to its containing frame when a graphic is direct-selected), the current
 * navigation item otherwise.
 */
function getAltEditTarget() {
  const sel = U.getSelectionAsPageItems();
  if (sel.length) {
    const f = artifacts.resolveToFrame(sel[0]);
    if (f && f.isValid) return f;
  }
  const item = _pageItems[_navIdx];
  if (item && item._ref && item._ref.isValid) return item._ref;
  return null;
}

/** Opens the inline editor, prefilled with the target's current custom alt. */
function openAltEditor() {
  showStatus("", false);
  const target = getAltEditTarget();
  if (!target) {
    showStatus(t("altEditNoTarget"), true);
    return;
  }

  _altEditTargetId = target.id;

  let name = "";
  try { name = target.label || target.name || ""; } catch (e) {}
  setText("alt-editor-target", name ? String(name) : ("#" + _altEditTargetId));

  const input = el("alt-input");
  if (input) {
    const info = U.getAltTextInfo(target);
    input.value = (info.status === "ok") ? info.text : "";
  }

  setVisible("alt-editor", true);
  if (input) input.focus();
}

function closeAltEditor() {
  _altEditTargetId = null;
  setVisible("alt-editor", false);
}

// ═════════════════════════════════════════════════════════════════════════════
// ACTIVE PAGE WATCHER
// ═════════════════════════════════════════════════════════════════════════════

/** Cheap signature of the active document + page, for change detection. */
function contextSignature() {
  try {
    if (!app.documents.length) return "no-doc";
    const doc = app.activeDocument;
    let pageId = "?";
    try {
      if (app.activeWindow && app.activeWindow.activePage) {
        pageId = app.activeWindow.activePage.id;
      }
    } catch (e) {}
    return doc.id + ":" + pageId;
  } catch (e) {
    return "err";
  }
}

function startWatcher() {
  if (_watcher) return;
  _watcher = setInterval(function () {
    const sig = contextSignature();
    if (sig !== _lastContextSig) {
      _lastContextSig = sig;
      U.log("context changed →", sig);
      doRefresh();
    }
  }, WATCH_INTERVAL_MS);
}

function stopWatcher() {
  if (_watcher) {
    clearInterval(_watcher);
    _watcher = null;
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// BUTTON WIRING
// ═════════════════════════════════════════════════════════════════════════════

function bindButtons() {
  if (_bound) return; // show() can run multiple times; bind only once
  _bound = true;

  function bind(id, handler) {
    const e = el(id);
    if (!e) return;
    e.addEventListener("click", function (ev) {
      // Triple protection against re-entry: the _busy flag (action running),
      // and the post-action cooldown (queued clicks replayed by the UI after
      // a blocking call — see CLICK_COOLDOWN_MS). The disabled state of the
      // buttons is the visual third layer.
      if (_busy || Date.now() < _cooldownUntil) return;
      handler(ev);
    });
  }

  // ── Preview ──
  bind("btn-toggle-preview", function () { setPreviewCollapsed(!_previewCollapsed); });

  // ── About (collapsed by default) ──
  bind("btn-toggle-about", function () {
    const body = el("about-body");
    const btn = el("btn-toggle-about");
    const open = body && body.style.display === "none";
    if (body) body.style.display = open ? "" : "none";
    if (btn) {
      btn.textContent = open ? "▾" : "▸";
      btn.setAttribute("aria-expanded", open ? "true" : "false");
    }
  });
  bind("btn-mode-tag", function () { setPreviewMode("tag"); });
  bind("btn-mode-construction", function () { setPreviewMode("construction"); });

  // ── Navigation ──
  bind("btn-prev", function () {
    if (_navIdx > 0) { _navIdx--; navigateTo(_navIdx); }
  });
  bind("btn-next", function () {
    if (_navIdx < _pageItems.length - 1) { _navIdx++; navigateTo(_navIdx); }
  });

  // ── Plugin language ──
  // "auto" follows the InDesign UI language; a specific code overrides it
  // (persisted across sessions). Re-localize everything on change.
  const langSel = el("lang-select");
  if (langSel) {
    langSel.addEventListener("change", function () {
      setLocaleOverride(langSel.value === "auto" ? null : langSel.value);
      applyLocalization();
      setText("preview-hint", t(_previewMode === "tag" ? "previewHintTag" : "previewHintConstruction"));
      doRefresh(); // re-renders the dynamic labels (page, nav, layer states)
    });
  }

  // ── Control layer scope ──
  bind("btn-scope-active", function () { setOverlayScope(false); });
  bind("btn-scope-all", function () { setOverlayScope(true); });

  // ── Control layers: Tag RO ──
  // refreshAfter keeps the Clear buttons' disabled state in sync.
  bind("btn-draw-tag-ro", function () {
    runAction(function () {
      const r = overlay.drawTagROOverlay(app.activeDocument, _overlayAllPages);
      if (r.errorKey) return { error: t(r.errorKey, { msg: r.msg || "" }) };
      return t("layerDrawn", { count: r.drawn });
    }, true, "busyDrawing");
  });
  bind("btn-delete-tag-ro", function () {
    runAction(function () {
      return overlay.deleteTagROOverlay(app.activeDocument)
        ? t("layerDeleted") : t("layerNotFound");
    }, true);
  });

  // ── Control layers: Construction RO ──
  bind("btn-draw-construction-ro", function () {
    runAction(function () {
      const r = overlay.drawConstructionROOverlay(app.activeDocument, _overlayAllPages);
      if (r.errorKey) return { error: t(r.errorKey, { msg: r.msg || "" }) };
      return t("layerDrawn", { count: r.drawn });
    }, true, "busyDrawing");
  });
  bind("btn-delete-construction-ro", function () {
    runAction(function () {
      return overlay.deleteConstructionROOverlay(app.activeDocument)
        ? t("layerDeleted") : t("layerNotFound");
    }, true);
  });

  // ── Reorder & groups ──
  bind("btn-fast-reorder", function () {
    runAction(function () {
      const r = reorderSelectedBottomUp();
      if (r.errorKey) return { error: t(r.errorKey) };
      let msg = t("fastReordered", { count: r.reordered });
      if (r.skipped > 0) msg += " " + t("fastReorderSkipped");
      // No article contained the selection → one was created automatically.
      if (r.articleSync && r.articleSync.createdArticle) {
        msg += " " + t("articleCreated", {
          name:  r.articleSync.createdArticle.name,
          count: r.articleSync.createdArticle.added
        });
      }
      // Items missing from the article were inserted at their position.
      if (r.articleSync && r.articleSync.addedToArticle) {
        msg += " " + t("articleMembersAdded", {
          name:  r.articleSync.addedToArticle.name,
          count: r.articleSync.addedToArticle.added
        });
      }
      return msg;
    }, true);
  });
  bind("btn-align-zorder", function () {
    runAction(function () {
      const r = alignZOrderToTagRO();
      if (r.errorKey) return { error: t(r.errorKey) };
      let msg = t("alignDone", { count: r.moved });
      if (r.multiLayer) msg += " " + t("alignLayersWarning");
      return msg;
    }, true);
  });
  bind("btn-fast-save-groups", function () {
    runAction(function () {
      const r = groups.saveGroupsSnapshot();
      if (r.errorKey) return { error: t(r.errorKey) };
      return t("fastGroupsSaved", { count: r.saved });
    });
  });
  bind("btn-fast-ungroup-all", function () {
    runAction(function () {
      const r = groups.ungroupAllGroups();
      if (r.errorKey) return { error: t(r.errorKey) };
      return t("fastUngrouped", { count: r.ungrouped });
    }, true);
  });
  bind("btn-fast-regroup", function () {
    runAction(function () {
      const r = groups.regroupFromSnapshot();
      if (r.errorKey) return { error: t(r.errorKey) };
      return t("fastRegrouped", { count: r.regrouped });
    }, true);
  });

  // ── Artifacts & alt text ──
  bind("btn-set-artifact", function () {
    runAction(function () {
      const r = artifacts.setSelectionArtifact(true);
      if (r.errorKey) return { error: t(r.errorKey, { msg: r.msg || "" }) };
      let msg = t("artifactsSet", { count: r.count });
      // "Hide artifacts" was active → the new artifacts were hidden too.
      if (r.hidden > 0) msg += " " + t("artifactsHidden", { count: r.hidden });
      return msg;
    }, true);
  });
  bind("btn-unset-artifact", function () {
    runAction(function () {
      const r = artifacts.setSelectionArtifact(false);
      if (r.errorKey) return { error: t(r.errorKey, { msg: r.msg || "" }) };
      return t("artifactsUnset", { count: r.count });
    }, true);
  });
  bind("btn-toggle-artifacts", function () {
    runAction(function () {
      const r = artifacts.toggleArtifactsVisibility();
      if (r.errorKey) return { error: t(r.errorKey) };
      if (r.none) return t("artifactsNone");
      return (typeof r.hidden === "number")
        ? t("artifactsHidden", { count: r.hidden })
        : t("artifactsShown", { count: r.shown });
    });
  });
  bind("btn-move-artifacts", function () {
    runAction(function () {
      const r = artifacts.moveArtifactsToLayer();
      if (r.errorKey) return { error: t(r.errorKey) };
      if (r.none) return t("artifactsNone");
      let msg = t("artifactsMoved", { count: r.moved });
      if (r.skipped > 0) msg += " " + t("artifactsMoveSkipped", { count: r.skipped });
      return msg;
    }, true);
  });
  bind("btn-restore-artifacts", function () {
    runAction(function () {
      const r = artifacts.restoreArtifactLayers();
      if (r.errorKey) return { error: t(r.errorKey) };
      return t("artifactsRestored", { count: r.restored });
    }, true);
  });
  bind("btn-toggle-alttext", function () {
    // refreshAfter also flips the button label (Show ↔ Hide alt texts).
    runAction(function () {
      if (!app.documents.length) return { error: t("noDocument") };
      const r = overlay.toggleAltTextOverlay(app.activeDocument, _overlayAllPages);
      if (r.deleted) return t("altTextDeleted");
      return t("altTextDrawn", { count: r.drawn, missing: r.missing });
    }, true, "busyDrawing");
  });
  bind("btn-toggle-markup", function () {
    runAction(function () {
      if (!app.documents.length) return { error: t("noDocument") };
      const r = overlay.toggleMarkupOverlay(app.activeDocument, _overlayAllPages);
      if (r.deleted) return t("markupDeleted");
      return t("markupDrawn", { count: r.drawn });
    }, true, "busyDrawing");
  });

  // ── Inline alt text editor ──
  bind("btn-edit-alttext", function () { openAltEditor(); });
  bind("btn-alt-save", function () {
    runAction(function () {
      if (_altEditTargetId === null) return { error: t("altEditNoTarget") };
      const input = el("alt-input");
      const r = artifacts.setCustomAltText(_altEditTargetId, input ? input.value : "");
      if (!r.ok) return { error: t(r.errorKey, { msg: r.msg || "" }) };
      closeAltEditor();
      let msg = t("altEditApplied");
      // Artifacts are excluded from the structure: the tag had to go for the
      // alt text to be read — tell the user.
      if (r.artifactRemoved) msg += " " + t("altEditArtifactRemoved");
      return msg;
    }, true);
  });
  bind("btn-alt-cancel", function () { closeAltEditor(); });
}

// ═════════════════════════════════════════════════════════════════════════════
// ENTRYPOINT REGISTRATION
// ═════════════════════════════════════════════════════════════════════════════

entrypoints.setup({
  panels: {
    readingOrderPanel: {

      /** Called each time the panel becomes visible. */
      show: function (panelNode) {
        // Depending on the UXP version, the argument is the root node itself
        // or an event-like object carrying it.
        _panelRoot = (panelNode && panelNode.node) ? panelNode.node : (panelNode || document.body);
        U.log("panel show()");

        // Reflect the persisted language override in the dropdown.
        const langSel = el("lang-select");
        if (langSel) langSel.value = getLocaleOverride() || "auto";

        applyLocalization();
        setPreviewCollapsed(_previewCollapsed);
        setOverlayScope(_overlayAllPages);
        setPreviewMode(_previewMode); // also triggers the initial doRefresh()
        bindButtons();
        setupTooltips();
        startWatcher();

        // A second refresh shortly after: InDesign may still be settling the
        // document context when the panel first appears.
        setTimeout(doRefresh, 500);
      },

      hide: function () {
        U.log("panel hide()");
        stopWatcher();
      }
    }
  }
});

U.log("main.js loaded, entrypoints registered");
