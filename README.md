# ReadingOrderPreview — UXP Plugin for Adobe InDesign

Visualizes the Articles panel reading order directly in the InDesign interface.
No objects are added to your document unless you explicitly use the layer overlay feature.

Developed by **[SZH/CSPS — Swiss Centre for Special Needs Education](https://www.csps.ch)**.

---

## Features

### A — Page thumbnail with numbered overlay
A scaled preview of the current page is displayed in the panel. Each article item is shown as a semi-transparent numbered rectangle. Arrows connect items in reading order. The display updates on refresh.

### B — Sequential navigation
Step through article items one by one using ← / → buttons. Each click selects the corresponding object in the InDesign document and scrolls to it. The current item is highlighted in the thumbnail.

### C — Reading order layer
- **Draw reading order on layer** — creates a `[Reading Order]` layer containing:
  - A thin colored outline around each article item
  - A numbered badge (circle + number) at the top-left of each item
  - Arrows connecting consecutive items in reading order
- **Delete reading order layer** — removes the layer and all its contents after confirmation.

> The layer is a normal InDesign layer. It does not affect PDF export if hidden, but should be deleted before final export to avoid including it in the output.

---

## Localization

The plugin UI is available in **English, French, German, and Italian**.

The language is detected automatically from the InDesign application locale.

To add a new language, edit `src/i18n.js`:
1. Add a new entry using the BCP 47 language tag (e.g. `"es"` for Spanish)
2. Copy the `"en"` block and translate all values

---

## Installation

### Prerequisites
- Adobe InDesign 2023 (v18.5) or later
- Adobe UXP Developer Tool (free, available from Adobe Creative Cloud)

### Load for development / testing

1. Download or clone this repository
2. Open **Adobe UXP Developer Tool**
3. Click **Add Plugin** → select the `reading-order-plugin/` folder
4. Click **Load** in the plugin row
5. In InDesign: **Window > Plugins > Reading Order Preview**

### Package for distribution (.ccx)

In UXP Developer Tool:
1. Click **⋯ → Package** in the plugin row
2. A `.ccx` file is created — share it directly with users
3. Users install it by double-clicking the `.ccx` file

---

## File structure

```
reading-order-plugin/
├── manifest.json       Plugin metadata and permissions
├── index.html          Panel UI layout
├── styles.css          Panel styles (InDesign theme-aware)
├── main.js             Entry point — wires UI, InDesign API, and i18n
└── src/
    ├── i18n.js         Localization strings and t() helper
    ├── indesign.js     All InDesign DOM interactions
    └── ui.js           SVG thumbnail renderer and DOM update helpers
```

---

## Compatibility

| InDesign version | Status |
|---|---|
| 2023 (v18.5) | ✓ Supported |
| 2024 (v19.x) | ✓ Supported |
| 2025 (v20.x) | ✓ Supported |

macOS and Windows are both supported.

---

## License

GNU General Public License v3.0 — see [README](../README.md#license) for details.

    Copyright (C) 2025 SZH/CSPS — Swiss Centre for Special Needs Education
