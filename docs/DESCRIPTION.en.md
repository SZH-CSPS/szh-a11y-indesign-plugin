[🇫🇷 Français (reference)](DESCRIPTION.md) · 🇬🇧 English · [🇩🇪 Deutsch](DESCRIPTION.de.md) · [🇮🇹 Italiano](DESCRIPTION.it.md)

> ⚠️ Unverified translation — in case of doubt, the [French version](DESCRIPTION.md) is authoritative.

# SZH-CSPS A11Y InDesign Plugin — Description

## In one sentence

An InDesign panel that helps **build, fix and verify the two reading
orders** of an accessible PDF, without leaving the layout.

## The problem

An accessible PDF relies on **two distinct reading orders**, driven by two
different InDesign mechanisms:

- the **Tag RO** (*tag reading order*): the logical order of the tags,
  driven by the **Articles panel**. It is what the PDF/UA standard requires
  and what conformant screen readers (JAWS, NVDA) follow;
- the **Construction RO** (*construction reading order*): the order of the
  objects in the page content, inherited from the **layer stacking**
  (z-order) and read **bottom-up**. Not required by the standard, but
  followed in practice by many non-conformant tools: reflow mode, consumer
  text-to-speech, assistive software for dyslexic readers.

For a document that is both **conformant** and **robust**, the two orders
must match — and InDesign offers no overview to check them. That is the gap
this plugin fills.

## What the plugin does

- **Visualize**: a preview of the active page numbers every element in the
  chosen order (Tag RO or Construction RO); locked control layers draw the
  same numbers and arrows directly in the document. Artifacts are excluded
  from every view.
- **Reorder**: select the objects in the desired reading order (first
  clicked = read first); one click re-stacks the layers **and** synchronizes
  the Articles panel — including the automatic creation of an article at the
  right position when none exists.
- **Handle groups**: a group is an **indivisible block** in both reading
  orders — so **ungrouping is required to reorder elements inside a group**
  (or to interleave an outside object between grouped elements). The plugin
  makes this step safe: it **memorizes the groups before ungrouping and
  rebuilds them identically afterwards**, nested groups included.
- **Tag artifacts**: set/remove the artifact tag on a selection, hide/show
  all artifacts, gather them on a dedicated layer (and restore them).
- **Complete alt texts**: editing directly in the panel, display of the
  current element's alt text, and a control layer that labels every image —
  missing alt texts flagged in red.
- **Check the tagging**: a layer shows each paragraph's PDF export tag
  (`<H1>`, `<P>`, …) as it will leave at export time.

## Good practices and precautions

### Artifacts on a dedicated layer — recommended, not mandatory

Gathering all artifacts on the `[Artifacts]` layer is **not a technical
requirement**: a correctly tagged artifact is excluded from the structure
wherever it sits. We nevertheless **recommend it**: the document becomes
easier to read (all decoration in one place), and the practice stays the
same across documents and people.

**Caution**: moving an object to another layer changes its place in the
stacking. In some layouts (overlapping objects, transparency), the
appearance may change — visually check the affected pages after the move.
The "Restore" button puts every artifact back on its original layer.

### ⚠️ Touching the z-order is never harmless

> **⚠️ Warning:** reordering objects changes the layer stacking (z-order).
> In most layouts this does not affect the appearance. But in complex
> compositions — overlapping objects, transparency, effects — the visual
> result can be altered.
> **Always keep a backup copy of the original document before reordering**,
> and visually check every modified page.

## Suggested workflow

1. **Check** the preview page by page (Tag RO, then Construction RO).
2. **Reorder** the selection wherever the order is wrong — ungrouping first
   when the order crosses a group (buttons 1 to 4 of the "Reorder & groups"
   section).
3. **Tag** the artifacts and complete the alt texts.
4. **Verify** with the control layers, then **delete them before the final
   export**.

## Target audience

Graphic designers and publication officers producing accessible PDFs
(PDF/UA, WCAG) with InDesign — no technical PDF accessibility expertise
required: the ⓘ tooltips and the "About" section explain every function.

## Characteristics

- Interface in **4 languages** (FR/DE/IT/EN), follows the InDesign language
  or can be set independently.
- InDesign 2023 (v18.5) or later, macOS and Windows.
- No object added to the document apart from the control layers — all
  locked, identifiable (`[Tag RO]`, `[Construction RO]`, `[Alt Text]`,
  `[Markup]`) and removable in one click.
- Developed by **SZH/CSPS** (Swiss Centre for Special Needs Education) with
  AI assistance; GPL v3 license.
