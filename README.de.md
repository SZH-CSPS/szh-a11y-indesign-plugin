[🇫🇷 Français (Referenz)](README.md) · [🇬🇧 English](README.en.md) · 🇩🇪 Deutsch · [🇮🇹 Italiano](README.it.md)

> ⚠️ Ungeprüfte Übersetzung — im Zweifelsfall ist die [französische Version](README.md) massgebend.

# SZH-CSPS A11Y InDesign Plugin

Adobe-InDesign-Plugin (UXP), das hilft, die **beiden Lesereihenfolgen**
eines barrierefreien PDFs **aufzubauen, zu korrigieren und zu prüfen** —
ohne das Layout zu verlassen:

- **Tag RO** — die logische Tag-Reihenfolge, gesteuert über das
  **Artikel-Bedienfeld**. Von PDF/UA verlangt, von konformen Screenreadern
  (JAWS, NVDA) befolgt.
- **Construction RO** — die Reihenfolge des Seiteninhalts, geerbt vom
  **Ebenenstapel** und von unten nach oben gelesen. In der Praxis von
  Reflow-Modus und einfachen Readern befolgt.

Nummerierte Vorschau Seite für Seite, Umordnen mit einem Klick (Ebenen
**und** Artikel-Bedienfeld synchron), sichere Gruppenverwaltung (speichern →
auflösen → identisch wiederherstellen), Artefakt-Markierung, Bearbeitung
der Alternativtexte und Kontroll-Ebenen direkt im Dokument. Oberfläche in
FR/DE/IT/EN mit erklärenden Tooltips.

> ⚠️ **Umordnen verändert den Ebenenstapel (Z-Order).** In komplexen
> Layouts (überlappende Objekte, Transparenzen) kann sich das
> Erscheinungsbild ändern. **Arbeiten Sie immer mit einer Sicherungskopie
> des Originaldokuments.**

## Installation

1. [**📦 Neueste `.ccx`-Version herunterladen**](../../releases/latest)
2. Datei doppelklicken → **Creative Cloud Desktop** installiert das Plugin
   (Warnung «nicht verifizierter Entwickler» bestätigen).
3. InDesign neu starten → **Fenster > Plugins > SZH-CSPS A11Y InDesign
   Plugin**.

Voraussetzungen: InDesign 2023 (v18.5) oder neuer, macOS oder Windows.

## Dokumentation

| Dokument | Inhalt |
|---|---|
| [📖 Vollständige Beschreibung](docs/DESCRIPTION.de.md) | Wozu das Plugin dient, Funktionen, gute Praxis und Vorsichtsmassnahmen |
| [🛠 Technische Notizen](docs/TECHNICAL.md) (FR) | Architektur, detailliertes Verhalten, UXP-Fallstricke |
| [🚀 Deployment](docs/DEPLOYMENT.md) (FR) | Build des `.ccx`, GitHub Action, Updates, IT-Verteilung (UPIA) |

## Lizenz & Credits

GNU GPL v3 · Entwickelt vom
[SZH/CSPS — Schweizer Zentrum für Heil- und Sonderpädagogik](https://www.csps.ch),
mit KI-Unterstützung (Anthropic Claude); generierter Code wird vor der
Veröffentlichung geprüft und getestet.
