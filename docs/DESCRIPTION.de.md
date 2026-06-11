[🇫🇷 Français (Referenz)](DESCRIPTION.md) · [🇬🇧 English](DESCRIPTION.en.md) · 🇩🇪 Deutsch · [🇮🇹 Italiano](DESCRIPTION.it.md)

> ⚠️ Ungeprüfte Übersetzung — im Zweifelsfall ist die [französische Version](DESCRIPTION.md) massgebend.

# SZH-CSPS A11Y InDesign Plugin — Beschreibung

## In einem Satz

Ein InDesign-Bedienfeld, das hilft, die **beiden Lesereihenfolgen** eines
barrierefreien PDFs **aufzubauen, zu korrigieren und zu prüfen** — ohne das
Layout zu verlassen.

## Das Problem

Ein barrierefreies PDF beruht auf **zwei unterschiedlichen
Lesereihenfolgen**, die von zwei verschiedenen InDesign-Mechanismen
gesteuert werden:

- die **Tag RO** (*tag reading order*): die logische Reihenfolge der Tags,
  gesteuert über das **Artikel-Bedienfeld**. Sie wird von der PDF/UA-Norm
  verlangt und von konformen Screenreadern (JAWS, NVDA) befolgt;
- die **Construction RO** (*construction reading order*): die Reihenfolge
  der Objekte im Seiteninhalt, geerbt vom **Ebenenstapel** (Z-Order) und
  **von unten nach oben** gelesen. Von der Norm nicht verlangt, in der
  Praxis aber von vielen nicht konformen Werkzeugen befolgt: Reflow-Modus,
  einfache Sprachausgaben, Hilfsprogramme für Menschen mit Dyslexie.

Damit ein Dokument zugleich **konform** und **robust** ist, müssen beide
Reihenfolgen übereinstimmen — und InDesign bietet keine Übersicht, um sie zu
kontrollieren. Genau diese Lücke schliesst das Plugin.

## Was das Plugin macht

- **Visualisieren**: eine Vorschau der aktiven Seite nummeriert jedes
  Element in der gewählten Reihenfolge (Tag RO oder Construction RO);
  gesperrte Kontroll-Ebenen zeichnen dieselben Nummern und Pfeile direkt ins
  Dokument. Artefakte sind von allen Ansichten ausgeschlossen.
- **Umordnen**: Objekte in der gewünschten Lesereihenfolge auswählen (zuerst
  angeklickt = zuerst gelesen); ein Klick stapelt die Ebenen neu **und**
  synchronisiert das Artikel-Bedienfeld — inklusive automatischer Erstellung
  eines Artikels an der richtigen Position, wenn keiner existiert.
- **Gruppen handhaben**: eine Gruppe ist in beiden Lesereihenfolgen ein
  **unteilbarer Block** — um Elemente **innerhalb einer Gruppe umzuordnen**
  (oder ein externes Objekt zwischen gruppierte Elemente zu schieben),
  **muss die Gruppe zuerst aufgelöst werden**. Das Plugin macht diesen
  Schritt risikofrei: es **merkt sich die Gruppen vor dem Auflösen und baut
  sie danach identisch wieder auf**, verschachtelte Gruppen inklusive.
- **Artefakte markieren**: Artefakt-Tag einer Auswahl setzen/entfernen, alle
  Artefakte aus-/einblenden, sie auf einer eigenen Ebene sammeln (und wieder
  zurückstellen).
- **Alternativtexte ergänzen**: Bearbeitung direkt im Bedienfeld, Anzeige
  des Alternativtexts des aktuellen Elements, und eine Kontroll-Ebene, die
  jedes Bild beschriftet — fehlende Alternativtexte werden rot markiert.
- **Auszeichnung prüfen**: eine Ebene zeigt das PDF-Export-Tag jedes
  Absatzes (`<H1>`, `<P>`, …), so wie es beim Export ausgegeben wird.

## Gute Praxis und Vorsichtsmassnahmen

### Artefakte auf einer eigenen Ebene — empfohlen, nicht obligatorisch

Alle Artefakte auf der Ebene `[Artifacts]` zu sammeln ist **keine technische
Pflicht**: ein korrekt markiertes Artefakt ist überall von der Struktur
ausgeschlossen. Wir **empfehlen** es trotzdem: das Dokument wird lesbarer
(der ganze Schmuck an einem Ort), und die Praxis bleibt über Dokumente und
Personen hinweg dieselbe.

**Achtung**: ein Objekt auf eine andere Ebene zu verschieben ändert seinen
Platz im Stapel. In gewissen Layouts (überlappende Objekte, Transparenzen)
kann sich das Erscheinungsbild ändern — die betroffenen Seiten nach dem
Verschieben visuell prüfen. Die Schaltfläche «Wiederherstellen» stellt jedes
Artefakt auf seine ursprüngliche Ebene zurück.

### ⚠️ Eingriffe in die Z-Order sind nie harmlos

> **⚠️ Achtung:** das Umordnen von Objekten verändert den Ebenenstapel
> (Z-Order). In den meisten Layouts ändert das nichts am Erscheinungsbild.
> In komplexen Kompositionen — überlappende Objekte, Transparenzen,
> Effekte — kann das visuelle Ergebnis jedoch verändert werden.
> **Bewahren Sie vor dem Umordnen immer eine Sicherungskopie des
> Originaldokuments auf** und prüfen Sie jede geänderte Seite visuell.

## Empfohlenes Vorgehen

1. **Prüfen** der Vorschau Seite für Seite (Tag RO, dann Construction RO).
2. **Umordnen** der Auswahl, wo die Reihenfolge falsch ist — zuerst Gruppen
   auflösen, wenn die Reihenfolge eine Gruppe durchquert (Schaltflächen 1
   bis 4 des Abschnitts «Umordnen & Gruppen»).
3. **Markieren** der Artefakte und Ergänzen der Alternativtexte.
4. **Kontrollieren** mit den Kontroll-Ebenen, diese dann **vor dem finalen
   Export löschen**.

## Zielpublikum

Grafiker:innen und Publikationsverantwortliche, die mit InDesign
barrierefreie PDFs (PDF/UA, WCAG) erstellen — ohne technisches Fachwissen
zur PDF-Barrierefreiheit: die ⓘ-Tooltips und der Abschnitt «Über» erklären
jede Funktion.

## Eigenschaften

- Oberfläche in **4 Sprachen** (FR/DE/IT/EN), folgt der InDesign-Sprache
  oder wird unabhängig eingestellt.
- InDesign 2023 (v18.5) oder neuer, macOS und Windows.
- Ausser den Kontroll-Ebenen wird dem Dokument nichts hinzugefügt — alle
  gesperrt, erkennbar (`[Tag RO]`, `[Construction RO]`, `[Alt Text]`,
  `[Markup]`) und mit einem Klick löschbar.
- Entwickelt vom **SZH/CSPS** (Schweizer Zentrum für Heil- und
  Sonderpädagogik) mit KI-Unterstützung; Lizenz GPL v3.
