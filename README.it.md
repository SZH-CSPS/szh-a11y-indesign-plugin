[🇫🇷 Français (riferimento)](README.md) · [🇬🇧 English](README.en.md) · [🇩🇪 Deutsch](README.de.md) · 🇮🇹 Italiano

> ⚠️ Traduzione non verificata — in caso di dubbio fa fede la [versione francese](README.md).

# SZH-CSPS A11Y InDesign Plugin

Plugin Adobe InDesign (UXP) che aiuta a **costruire, correggere e verificare
i due ordini di lettura** di un PDF accessibile, senza lasciare
l'impaginazione:

- **Tag RO** — l'ordine logico dei tag, gestito dal **pannello Articoli**.
  Richiesto da PDF/UA, seguito dagli screen reader conformi (JAWS, NVDA).
- **Construction RO** — l'ordine del contenuto della pagina, ereditato
  dall'**impilamento dei livelli** e letto dal basso verso l'alto. Seguito
  in pratica dalla modalità reflow e dai lettori semplici.

Anteprima numerata pagina per pagina, riordino con un clic (livelli **e**
pannello Articoli sincronizzati), gestione sicura dei gruppi (salvataggio →
separazione → ricostruzione identica), marcatura degli artefatti, modifica
dei testi alternativi e livelli di controllo disegnati nel documento.
Interfaccia in FR/DE/IT/EN con suggerimenti esplicativi.

> ⚠️ **Riordinare modifica l'impilamento dei livelli (z-order).** Nelle
> impaginazioni complesse (oggetti sovrapposti, trasparenze) l'aspetto può
> cambiare. **Lavorare sempre su una copia di sicurezza del documento
> originale.**

## Installazione

1. [**📦 Scaricare l'ultima versione `.ccx`**](../../releases/latest)
2. Fare doppio clic sul file → **Creative Cloud Desktop** installa il plugin
   (confermare l'avviso «sviluppatore non verificato»).
3. Riavviare InDesign → **Finestra > Plugin > SZH-CSPS A11Y InDesign
   Plugin**.

Requisiti: InDesign 2023 (v18.5) o successivo, macOS o Windows.

## Documentazione

| Documento | Contenuto |
|---|---|
| [📖 Descrizione completa](docs/DESCRIPTION.it.md) | A cosa serve il plugin, funzionalità, buone pratiche e precauzioni |
| [🛠 Note tecniche](docs/TECHNICAL.md) (FR) | Architettura, comportamenti dettagliati, insidie UXP |
| [🚀 Distribuzione](docs/DEPLOYMENT.md) (FR) | Build del `.ccx`, GitHub Action, aggiornamenti, distribuzione IT (UPIA) |

## Licenza e crediti

GNU GPL v3 · Sviluppato dal
[SZH/CSPS — Centro svizzero di pedagogia speciale](https://www.csps.ch),
con il supporto dell'IA (Anthropic Claude); il codice generato viene
revisionato e testato prima della pubblicazione.
