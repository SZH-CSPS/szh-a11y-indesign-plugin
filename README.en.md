[🇫🇷 Français (reference)](README.md) · 🇬🇧 English · [🇩🇪 Deutsch](README.de.md) · [🇮🇹 Italiano](README.it.md)

> ⚠️ Unverified translation — in case of doubt, the [French version](README.md) is authoritative.

# SZH-CSPS A11Y InDesign Plugin

Adobe InDesign plugin (UXP) that helps **build, fix and verify the two
reading orders** of an accessible PDF, without leaving the layout:

- **Tag RO** — the logical tag order, driven by the **Articles panel**.
  Required by PDF/UA, followed by conformant screen readers (JAWS, NVDA).
- **Construction RO** — the page content order, inherited from the **layer
  stacking** and read bottom-up. Followed in practice by reflow mode and
  simple readers.

Numbered page-by-page preview, one-click reordering (layers **and** Articles
panel kept in sync), safe group handling (save → ungroup → identical
re-group), artifact tagging, alt text editing and control layers drawn in
the document. Interface in FR/DE/IT/EN with explanatory tooltips.

> ⚠️ **Reordering changes the layer stacking (z-order).** In complex
> layouts (overlapping objects, transparency), the appearance may change.
> **Always work on a backup copy of the original document.**

## Installation

1. [**📦 Download the latest `.ccx`**](../../releases/latest)
2. Double-click the file → **Creative Cloud Desktop** installs the plugin
   (confirm the "unverified developer" warning).
3. Restart InDesign → **Window > Plugins > SZH-CSPS A11Y InDesign Plugin**.

Requirements: InDesign 2023 (v18.5) or later, macOS or Windows.

## Documentation

| Document | Content |
|---|---|
| [📖 Full description](docs/DESCRIPTION.en.md) | What the plugin is for, features, good practices and precautions |
| [🛠 Technical notes](docs/TECHNICAL.md) (FR) | Architecture, detailed behaviors, UXP pitfalls |
| [🚀 Deployment](docs/DEPLOYMENT.md) (FR) | Building the `.ccx`, GitHub Action, updates, IT deployment (UPIA) |

## License & credits

GNU GPL v3 · Developed by
[SZH/CSPS — Swiss Centre for Special Needs Education](https://www.csps.ch),
with AI assistance (Anthropic Claude); generated code is reviewed and
tested before release.
