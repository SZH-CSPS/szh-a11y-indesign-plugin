/**
 * src/i18n.js
 * ===========
 * Locale detection, manual override, and string lookup.
 *
 * Language data lives in src/strings.js (data only). By default the UI
 * language follows the InDesign application locale; the user can override it
 * from the panel's language dropdown (persisted via localStorage). Unknown
 * locales and missing keys fall back to English.
 *
 * Copyright (C) 2025-2026 SZH/CSPS — Swiss Centre for Special Needs Education
 * Licensed under GNU GPL v3 — https://www.gnu.org/licenses/
 */

"use strict";

const { app } = require("indesign");
const STRINGS = require("./strings.js");

const STORAGE_KEY = "szh-a11y-locale";

// Manual language override ("en"/"fr"/"de"/"it"), or null = follow InDesign.
let _override = null;
try {
  if (typeof localStorage !== "undefined") {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && STRINGS[stored]) _override = stored;
  }
} catch (e) {}

/**
 * Sets (and persists) the manual language override.
 * Pass null/"" to return to automatic detection (InDesign UI language).
 */
function setLocaleOverride(code) {
  _override = (code && STRINGS[code]) ? code : null;
  try {
    if (typeof localStorage !== "undefined") {
      if (_override) localStorage.setItem(STORAGE_KEY, _override);
      else localStorage.removeItem(STORAGE_KEY);
    }
  } catch (e) {}
}

/** Current manual override, or null when following InDesign. */
function getLocaleOverride() {
  return _override;
}

/** Effective 2-letter language code ("en", "fr", "de", "it"). */
function getLocale() {
  if (_override) return _override;
  try {
    return String(app.locale || "en_US").toLowerCase().substring(0, 2);
  } catch (e) {
    return "en";
  }
}

/**
 * Translates a key, substituting {placeholders} with values from `params`.
 * Example: t("layerDrawn", { count: 3 })
 */
function t(key, params) {
  const strings = STRINGS[getLocale()] || STRINGS.en;
  let str = strings[key] || STRINGS.en[key] || key;
  if (params) {
    Object.keys(params).forEach(function (k) {
      str = str.replace(new RegExp("{" + k + "}", "g"), String(params[k]));
    });
  }
  return str;
}

module.exports = { t, getLocale, setLocaleOverride, getLocaleOverride };
