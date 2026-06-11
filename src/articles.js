/**
 * src/articles.js
 * ===============
 * Tag RO — the reading order defined by the Articles panel.
 *
 * The Articles panel drives the tag tree of the exported PDF (the order that
 * PDF/UA-conformant screen readers follow). This module reads article members
 * and resolves them to drawable page items, and can write a new member order
 * back after a z-order reorder (best-effort sync).
 *
 * Copyright (C) 2025-2026 SZH/CSPS — Swiss Centre for Special Needs Education
 * Licensed under GNU GPL v3 — https://www.gnu.org/licenses/
 */

"use strict";

const indesign = require("indesign");
const { app } = indesign;
const LocationOptions = indesign.LocationOptions || globalThis.LocationOptions;
const U = require("./utils.js");

/**
 * Article members may point to Story/Text objects that are not directly
 * drawable or selectable. Resolve them to a page item when possible.
 */
function resolveArticleMemberRef(member) {
  let ref = null;
  try { ref = member.itemRef; } catch (e) { return null; }
  if (!ref || !ref.isValid) return null;

  // Already a page-item-like object (has bounds).
  try {
    void ref.geometricBounds;
    return ref;
  } catch (e) {}

  // Story-like object: its first text container is usually a text frame.
  try {
    if (ref.textContainers && ref.textContainers.length > 0) {
      const tf = ref.textContainers[0];
      if (tf && tf.isValid) return tf;
    }
  } catch (e) {}

  // Text-like object (Character, InsertionPoint, …).
  try {
    if (ref.parentTextFrames && ref.parentTextFrames.length > 0) {
      const ptf = ref.parentTextFrames[0];
      if (ptf && ptf.isValid) return ptf;
    }
  } catch (e) {}

  // Last resort: the parent chain may land on a frame/group with bounds.
  try {
    let p = ref.parent;
    let guard = 0;
    while (p && guard < 15) {
      guard++;
      try {
        void p.geometricBounds;
        return p;
      } catch (e) {}
      p = p.parent;
    }
  } catch (e) {}

  return null;
}

/**
 * Reads the Tag RO (Articles panel order) of the document.
 *
 * Items tagged as artifact (directly or via a group ancestor) are EXCLUDED:
 * artifacts are not part of any reading order. Numbering is continuous over
 * the remaining items, across all articles and pages.
 *
 * Numbering RESTARTS on every page (like the Construction RO): the counter
 * follows the article order, but each page's first item is #1 — page 3
 * should not start at #40 just because pages 1-2 hold 39 items.
 *
 * @param {Document} doc
 * @param {Page|null} activePage  page used to set the onActivePage flag
 * @param {object}    [opts]      { skipAlt: true } skips the alt text reads
 *                                (an IPC saving for the overlay drawing)
 * @returns {{ok:boolean, errorKey?:string, items?:Array}}
 *   items: { index, articleName, itemName, textPreview, bounds, pageIndex,
 *            pageName, pageId, layerName, onActivePage, hasGraphic,
 *            altStatus, altText, _ref }
 */
function getTagROItems(doc, activePage, opts) {
  opts = opts || {};
  if (!doc || !doc.articles || !doc.articles.length) {
    return { ok: false, errorKey: "noArticles" };
  }

  const activePageId = (activePage && activePage.isValid) ? activePage.id : null;
  const items = [];
  const pageCounters = {}; // pageId → last number used on that page

  const articlesCount = doc.articles.length;
  for (let a = 0; a < articlesCount; a++) {
    let article;
    try { article = doc.articles.item(a); } catch (e) { continue; }

    // everyItem() is the recommended way to iterate InDesign collections in UXP.
    let memberArray = [];
    try {
      memberArray = article.articleMembers.everyItem().getElements();
    } catch (e) {
      U.log("articles: everyItem failed for article", a, e.message);
      continue;
    }

    for (let m = 0; m < memberArray.length; m++) {
      let pageItem;
      try {
        pageItem = resolveArticleMemberRef(memberArray[m]);
        if (!pageItem || !pageItem.isValid) continue;
      } catch (e) { continue; }

      // Artifacts are excluded from every reading order view.
      if (U.isArtifact(pageItem)) continue;

      let bounds = null, pageIndex = -1, pageName = "", pageId = null;
      try {
        bounds = U.normalizeBounds(pageItem.geometricBounds);
        const pg = U.getParentPage(pageItem);
        if (pg) {
          pageIndex = pg.documentOffset;
          pageName  = String(pg.name || "");
          pageId    = pg.id;
        }
      } catch (e) { continue; }
      if (!bounds) continue;

      let itemName = "Object";
      try { itemName = pageItem.label || pageItem.name || "Object"; } catch (e) {}

      let layerName = "";
      try { layerName = pageItem.itemLayer ? String(pageItem.itemLayer.name || "") : ""; } catch (e) {}

      let textPreview = "";
      try {
        if (pageItem.contents) {
          textPreview = String(pageItem.contents).substring(0, 50).replace(/\n/g, " ");
        }
      } catch (e) {}

      // Alt text state — only computed for image frames (where alt matters)
      // and skipped entirely for the overlay drawing path.
      let hasGraphic = false, altStatus = "", altText = "";
      if (!opts.skipAlt) {
        hasGraphic = U.hasGraphics(pageItem);
        if (hasGraphic) {
          const ai = U.getAltTextInfo(pageItem);
          altStatus = ai.status;
          altText   = ai.text;
        }
      }

      const pageKey = (pageId === null) ? "none" : String(pageId);
      pageCounters[pageKey] = (pageCounters[pageKey] || 0) + 1;
      items.push({
        index:        pageCounters[pageKey],
        articleName:  article.name || ("Article " + (a + 1)),
        itemName:     itemName,
        textPreview:  textPreview,
        bounds:       bounds,
        pageIndex:    pageIndex,
        pageName:     pageName,
        pageId:       pageId,
        layerName:    layerName,
        onActivePage: activePageId !== null && pageId === activePageId,
        hasGraphic:   hasGraphic,
        altStatus:    altStatus,
        altText:      altText,
        _ref:         pageItem
      });
    }
  }

  return { ok: true, items: items };
}

// ─── Article helpers ──────────────────────────────────────────────────────────

// Naming pattern of the articles this plugin creates ("RO p.<pageName>").
const RO_ARTICLE_NAME_RE = /^RO p\./;

/**
 * Refreshes the names of plugin-created articles ("RO p.X") after pages were
 * moved or deleted: each one is renamed to the CURRENT page of its first
 * member. User-named articles are never touched. Returns the rename count.
 */
function updateROArticleNames(doc) {
  let renamed = 0;
  if (!doc || !doc.articles || !doc.articles.length) return renamed;

  let articles = [];
  try { articles = doc.articles.everyItem().getElements(); } catch (e) { return renamed; }

  articles.forEach(function (article) {
    try {
      if (!article || !article.isValid) return;
      const name = String(article.name || "");
      if (!RO_ARTICLE_NAME_RE.test(name)) return;

      let members = [];
      try { members = article.articleMembers.everyItem().getElements(); } catch (e) { return; }
      for (let i = 0; i < members.length; i++) {
        const ref = resolveArticleMemberRef(members[i]);
        if (!ref || !ref.isValid) continue;
        const pg = U.getParentPage(ref);
        if (!pg) continue;
        const expected = "RO p." + String(pg.name || "");
        if (expected !== name) {
          article.name = expected;
          renamed++;
        }
        break; // the first resolvable member decides
      }
    } catch (e) {}
  });

  return renamed;
}

/** documentOffset of the first resolvable member's page, or -1. */
function articleFirstPageOffset(article) {
  let members = [];
  try { members = article.articleMembers.everyItem().getElements(); } catch (e) { return -1; }
  for (let i = 0; i < members.length; i++) {
    try {
      const ref = resolveArticleMemberRef(members[i]);
      if (!ref || !ref.isValid) continue;
      const pg = U.getParentPage(ref);
      if (pg) return pg.documentOffset;
    } catch (e) {}
  }
  return -1;
}

/**
 * Moves an article to its natural place in the Articles panel: before the
 * first existing article whose content starts on a LATER page. Without this,
 * a freshly created article always lands at the end of the list (e.g. pages
 * ordered 1·3·2 after filling in a forgotten page 2).
 */
function positionArticleByPage(doc, article) {
  if (!LocationOptions) return;
  const myOffset = articleFirstPageOffset(article);
  if (myOffset < 0) return;

  try {
    const all = doc.articles.everyItem().getElements();
    for (let i = 0; i < all.length; i++) {
      const other = all[i];
      if (!other || !other.isValid) continue;
      try { if (other.id === article.id) continue; } catch (e) { continue; }
      const off = articleFirstPageOffset(other);
      if (off >= 0 && off > myOffset) {
        article.move(LocationOptions.BEFORE, other);
        return;
      }
    }
  } catch (e) {
    U.log("positionArticleByPage failed:", e.message);
  }
}

// ─── Sync selection order into the Articles panel ─────────────────────────────

/**
 * Best-effort sync of a freshly z-reordered selection into the Articles
 * panel, so Tag RO and Construction RO stay aligned.
 *
 * Three cases, by where the selected items currently live:
 *  1. In one or more articles → the member slots they occupy are rewritten in
 *     the new order (non-selected members keep their positions).
 *  2. Partially in an article → the selected items MISSING from the articles
 *     are INSERTED into the article holding the most selected items, at their
 *     correct relative position.
 *  3. In no article at all → a new article is created with the selection in
 *     order, flagged for export, and placed in the panel according to its
 *     page (not blindly at the end).
 *
 * Member lists are rewritten via remove-all + re-add because the Articles DOM
 * has no "move member" API.
 */
function syncSelectionOrderToArticles(orderedSelection) {
  const empty = { updatedArticles: 0, movedMembers: 0, errors: 0, createdArticle: null, addedToArticle: null };
  if (!app.documents.length) return empty;
  const doc = app.activeDocument;

  // Rank map: item id → desired rank (0 = first in reading order).
  // Article members often reference Stories, so the parent story id is
  // registered as an alias of the frame's rank.
  const rankById = {};
  orderedSelection.forEach(function (it, idx) {
    try {
      if (it && it.isValid && typeof it.id !== "undefined") {
        rankById[String(it.id)] = idx;
        try {
          if (it.parentStory && it.parentStory.isValid && typeof it.parentStory.id !== "undefined") {
            const sid = String(it.parentStory.id);
            if (typeof rankById[sid] === "undefined") rankById[sid] = idx;
          }
        } catch (e) {}
      }
    } catch (e) {}
  });

  let updatedArticles = 0;
  let movedMembers = 0;
  let errors = 0;

  // ── Pass 1: analyze every article (resolve members BEFORE any removal) ──
  const analyses = [];
  const matchedRanks = {};
  const articlesCount = (doc.articles && doc.articles.length) ? doc.articles.length : 0;

  for (let a = 0; a < articlesCount; a++) {
    let article;
    try { article = doc.articles.item(a); } catch (e) { continue; }
    if (!article || !article.isValid) continue;

    let members = [];
    try { members = article.articleMembers.everyItem().getElements(); } catch (e) { members = []; }
    if (!members.length) continue;

    const fullList = [];
    let matchCount = 0;

    members.forEach(function (m) {
      try {
        let rawId = null;
        let rawRef = null;
        try {
          rawRef = m.itemRef;
          rawId = (rawRef && typeof rawRef.id !== "undefined") ? String(rawRef.id) : null;
        } catch (e) {}

        const ref = resolveArticleMemberRef(m);
        const resolvedId = (ref && ref.isValid && typeof ref.id !== "undefined") ? String(ref.id) : null;

        let idKey = null;
        if (resolvedId && typeof rankById[resolvedId] !== "undefined") idKey = resolvedId;
        else if (rawId && typeof rankById[rawId] !== "undefined") idKey = rawId;

        const rank = idKey !== null ? rankById[idKey] : -1;
        if (idKey !== null) {
          matchCount++;
          matchedRanks[rank] = true;
        }

        fullList.push({
          ref: ref || rawRef, // prefer the resolved page item for the add() call
          isSelected: idKey !== null,
          rank: rank
        });
      } catch (e) {
        fullList.push({ ref: null, isSelected: false, rank: -1 }); // keep slot count
      }
    });

    analyses.push({ article: article, members: members, fullList: fullList, matchCount: matchCount });
  }

  // Selected items found in NO article, in selection order.
  const unmatched = [];
  orderedSelection.forEach(function (it, rank) {
    if (matchedRanks[rank]) return;
    if (it && it.isValid) unmatched.push({ item: it, rank: rank });
  });
  unmatched.sort(function (x, y) { return x.rank - y.rank; });

  // Insertion target: the article holding the most selected items.
  let target = null;
  analyses.forEach(function (a) {
    if (a.matchCount >= 1 && (!target || a.matchCount > target.matchCount)) target = a;
  });

  // ── Pass 2: rewrite the articles that need it ──
  let addedToArticle = null;

  analyses.forEach(function (a) {
    const isInsertionTarget = (a === target) && unmatched.length > 0;
    if (a.matchCount < 2 && !isInsertionTarget) return; // nothing to do here

    // Slots occupied by selected items keep their place in the article; only
    // the order AMONG selected items changes (top-down = reading order).
    const selectedInArticle = a.fullList.filter(function (e) { return e.isSelected; });
    const selectedPositions = [];
    a.fullList.forEach(function (e, pos) { if (e.isSelected) selectedPositions.push(pos); });
    const sortedSelected = selectedInArticle.slice().sort(function (x, y) { return x.rank - y.rank; });

    const newOrder = a.fullList.slice();
    selectedPositions.forEach(function (pos, i) { newOrder[pos] = sortedSelected[i]; });

    // Insert the selected items missing from every article, each right after
    // its predecessor in the selection order (or before the first selected
    // entry when it has no predecessor). unmatched is rank-sorted, so earlier
    // insertions correctly serve as anchors for later ones.
    let added = 0;
    if (isInsertionTarget) {
      unmatched.forEach(function (u) {
        const entry = { ref: u.item, isSelected: true, rank: u.rank };
        let insertPos = -1;
        let bestRank = -1;
        newOrder.forEach(function (e2, pos) {
          if (e2.isSelected && e2.rank < u.rank && e2.rank > bestRank) {
            bestRank = e2.rank;
            insertPos = pos;
          }
        });
        if (insertPos >= 0) {
          newOrder.splice(insertPos + 1, 0, entry);
        } else {
          let firstSelPos = -1;
          for (let p = 0; p < newOrder.length; p++) {
            if (newOrder[p].isSelected) { firstSelPos = p; break; }
          }
          newOrder.splice(firstSelPos < 0 ? newOrder.length : firstSelPos, 0, entry);
        }
        added++;
      });
    }

    // Remove all members (back to front to keep indices stable)…
    for (let i = a.members.length - 1; i >= 0; i--) {
      try {
        if (a.members[i] && a.members[i].isValid) a.members[i].remove();
      } catch (e) { errors++; }
    }

    // …and re-add them in the new order.
    for (let i = 0; i < newOrder.length; i++) {
      const entry = newOrder[i];
      if (!entry || !entry.ref || !entry.ref.isValid) { errors++; continue; }
      try {
        a.article.articleMembers.add(entry.ref);
        movedMembers++;
      } catch (e) { errors++; }
    }

    if (added > 0) {
      let articleName = "";
      try { articleName = a.article.name || ""; } catch (e) {}
      addedToArticle = { name: articleName, added: added };
    }
    updatedArticles++;
  });

  // ── No article holds any of the selected items → create one ──
  let createdArticle = null;
  if (!target && unmatched.length >= 2) {
    try {
      let name = "Reading order";
      try {
        const pg = U.getParentPage(unmatched[0].item);
        if (pg && pg.name) name = "RO p." + String(pg.name);
      } catch (e) {}

      const article = doc.articles.add();
      try { article.name = name; } catch (e) {}
      try { article.articleExportStatus = true; } catch (e) {} // "Include when exporting"

      let added = 0;
      unmatched.forEach(function (u) {
        try {
          article.articleMembers.add(u.item);
          added++;
        } catch (e) { errors++; }
      });

      if (added > 0) {
        positionArticleByPage(doc, article); // panel order should follow page order
        createdArticle = { name: name, added: added };
        updatedArticles++;
      } else {
        try { article.remove(); } catch (e) {} // nothing could be added: clean up
      }
    } catch (e) {
      errors++;
      U.log("article auto-create failed:", e.message);
    }
  }

  return {
    updatedArticles: updatedArticles,
    movedMembers: movedMembers,
    errors: errors,
    createdArticle: createdArticle,
    addedToArticle: addedToArticle
  };
}

module.exports = {
  getTagROItems,
  resolveArticleMemberRef,
  syncSelectionOrderToArticles,
  updateROArticleNames
};
