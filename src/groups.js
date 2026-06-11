/**
 * src/groups.js
 * =============
 * Group snapshot / ungroup / regroup workflow.
 *
 * Why this exists: a group is a single unit both in the Articles panel and in
 * the z-order. To interleave grouped content with outside objects in a reading
 * order, ungrouping is unavoidable. This module lets the user:
 *   1. Save the current grouping (per document, session memory),
 *   2. Ungroup everything and reorder freely,
 *   3. Re-create the saved groups afterwards — including nested groups.
 *
 * Copyright (C) 2025-2026 SZH/CSPS — Swiss Centre for Special Needs Education
 * Licensed under GNU GPL v3 — https://www.gnu.org/licenses/
 */

"use strict";

const { app } = require("indesign");
const U = require("./utils.js");

// Session memory: docKey → [{ groupId, memberIds }]
// Not persisted — closing InDesign or the panel loses saved snapshots.
const _snapshots = {};

/**
 * Saves the membership of every group of the active document.
 * Nested groups are saved too: the outer group's member list contains the
 * inner group's id, which regroupFromSnapshot() resolves via its id map.
 */
function saveGroupsSnapshot() {
  if (!app.documents.length) return { saved: 0, errorKey: "noDocument" };
  const doc = app.activeDocument;

  let groups = [];
  try { groups = doc.groups.everyItem().getElements(); } catch (e) { groups = []; }

  const snapshot = [];
  groups.forEach(function (g) {
    if (!g || !g.isValid) return;
    try {
      const members = g.pageItems.everyItem().getElements(); // direct children only
      const ids = members
        .filter(function (m) { return m && m.isValid && typeof m.id !== "undefined"; })
        .map(function (m) { return m.id; });
      if (ids.length >= 2) snapshot.push({ groupId: g.id, memberIds: ids });
    } catch (e) {}
  });

  _snapshots[U.docKey(doc)] = snapshot;
  return { saved: snapshot.length };
}

/**
 * Ungroups every group in the active document, repeating until none remain
 * (nested groups need several passes).
 */
function ungroupAllGroups() {
  if (!app.documents.length) return { ungrouped: 0, errorKey: "noDocument" };
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
    if (!changed) break; // locked / uneditable groups — avoid an endless loop
  }

  return { ungrouped: total };
}

/**
 * Re-creates the saved groups of the active document.
 *
 * Nested groups: an outer group may reference an inner group's (now dead) id.
 * Inner groups are therefore rebuilt first; each new group is registered in
 * an old-id → new-item map, and outer groups resolve their members through
 * that map. The loop runs until a full pass makes no progress.
 */
function regroupFromSnapshot() {
  if (!app.documents.length) return { regrouped: 0, errorKey: "noDocument" };
  const doc = app.activeDocument;

  const saved = _snapshots[U.docKey(doc)];
  if (!saved || !saved.length) return { regrouped: 0, errorKey: "fastNoGroupsSaved" };

  const savedGroupIds = {};
  saved.forEach(function (g) { savedGroupIds[String(g.groupId)] = true; });

  const idMap = {};   // old group id → newly created Group
  let remaining = saved.slice();
  let regrouped = 0;
  let progress = true;

  while (progress && remaining.length) {
    progress = false;
    const next = [];

    for (let gi = 0; gi < remaining.length; gi++) {
      const g = remaining[gi];
      const members = [];
      let pending = false;

      for (let mi = 0; mi < g.memberIds.length; mi++) {
        const id = g.memberIds[mi];

        // Member already rebuilt as a new group in a previous pass?
        const mapped = idMap[String(id)];
        if (mapped && mapped.isValid) { members.push(mapped); continue; }

        // Still alive under its original id?
        let it = null;
        try { it = doc.pageItems.itemByID(id); } catch (e) {}
        if (it && it.isValid) { members.push(it); continue; }

        // Dead id that belongs to a saved (not yet rebuilt) inner group:
        // defer this group to a later pass.
        if (savedGroupIds[String(id)] && !idMap[String(id)]) { pending = true; break; }
        // Otherwise the member is simply gone (deleted) — drop it.
      }

      if (pending) { next.push(g); continue; }
      if (members.length < 2) continue; // not enough survivors to form a group

      let newGroup = null;
      try {
        newGroup = doc.groups.add(members);
      } catch (e) {
        // Members nested under a common parent: group through that parent.
        try {
          if (members[0] && members[0].parent && members[0].parent.groups) {
            newGroup = members[0].parent.groups.add(members);
          }
        } catch (e2) {}
      }

      if (newGroup && newGroup.isValid) {
        idMap[String(g.groupId)] = newGroup;
        regrouped++;
        progress = true;
      }
    }

    remaining = next;
  }

  return { regrouped: regrouped };
}

module.exports = { saveGroupsSnapshot, ungroupAllGroups, regroupFromSnapshot };
