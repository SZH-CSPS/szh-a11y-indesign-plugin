[🇫🇷 Français (riferimento)](DESCRIPTION.md) · [🇬🇧 English](DESCRIPTION.en.md) · [🇩🇪 Deutsch](DESCRIPTION.de.md) · 🇮🇹 Italiano

> ⚠️ Traduzione non verificata — in caso di dubbio fa fede la [versione francese](DESCRIPTION.md).

# SZH-CSPS A11Y InDesign Plugin — Descrizione

## In una frase

Un pannello InDesign che aiuta a **costruire, correggere e verificare i due
ordini di lettura** di un PDF accessibile, senza lasciare l'impaginazione.

## Il problema

Un PDF accessibile si basa su **due ordini di lettura distinti**, gestiti da
due meccanismi diversi di InDesign:

- il **Tag RO** (*tag reading order*): l'ordine logico dei tag, gestito dal
  **pannello Articoli**. È quello richiesto dalla norma PDF/UA e seguito
  dagli screen reader conformi (JAWS, NVDA);
- la **Construction RO** (*construction reading order*): l'ordine degli
  oggetti nel contenuto della pagina, ereditato dall'**impilamento dei
  livelli** (z-order) e letto **dal basso verso l'alto**. Non richiesto
  dalla norma, ma seguito in pratica da molti strumenti non conformi:
  modalità reflow, sintesi vocali semplici, software di supporto per
  persone dislessiche.

Perché un documento sia **conforme** e al tempo stesso **robusto**, i due
ordini devono coincidere — e InDesign non offre alcuna visione d'insieme per
controllarli. È questa lacuna che il plugin colma.

## Cosa fa il plugin

- **Visualizzare**: un'anteprima della pagina attiva numera ogni elemento
  secondo l'ordine scelto (Tag RO o Construction RO); livelli di controllo
  bloccati disegnano gli stessi numeri e delle frecce direttamente nel
  documento. Gli artefatti sono esclusi da tutte le viste.
- **Riordinare**: selezionare gli oggetti nell'ordine di lettura desiderato
  (primo cliccato = letto per primo); un clic riordina i livelli **e**
  sincronizza il pannello Articoli — inclusa la creazione automatica di un
  articolo nella posizione giusta quando non ne esiste alcuno.
- **Gestire i gruppi**: un gruppo è un **blocco indivisibile** in entrambi
  gli ordini di lettura — è quindi **necessario separare il gruppo per
  riordinare gli elementi al suo interno** (o per inserire un oggetto
  esterno tra elementi raggruppati). Il plugin rende questo passaggio
  sicuro: **memorizza i gruppi prima della separazione e li ricostruisce
  identici dopo** il riordino, gruppi annidati compresi.
- **Contrassegnare gli artefatti**: impostare/rimuovere il tag artefatto su
  una selezione, nascondere/mostrare tutti gli artefatti, raccoglierli su un
  livello dedicato (e ripristinarli).
- **Completare i testi alternativi**: modifica direttamente nel pannello,
  visualizzazione del testo alternativo dell'elemento corrente, e un livello
  di controllo che etichetta ogni immagine — testi alternativi mancanti
  segnalati in rosso.
- **Controllare la marcatura**: un livello mostra il tag di esportazione PDF
  di ogni paragrafo (`<H1>`, `<P>`, …) così come uscirà all'esportazione.

## Buone pratiche e precauzioni

### Gli artefatti su un livello dedicato — consigliato, non obbligatorio

Raccogliere tutti gli artefatti sul livello `[Artifacts]` **non è un obbligo
tecnico**: un artefatto correttamente contrassegnato è escluso dalla
struttura ovunque si trovi. Lo **consigliamo** comunque: il documento
diventa più leggibile (tutta la decorazione in un unico posto) e la pratica
resta identica da un documento e da una persona all'altra.

**Attenzione**: spostare un oggetto su un altro livello ne cambia la
posizione nell'impilamento. In alcune impaginazioni (oggetti sovrapposti,
trasparenze) l'aspetto può cambiare — verificare visivamente le pagine
interessate dopo lo spostamento. Il pulsante «Ripristina» rimette ogni
artefatto sul suo livello d'origine.

### ⚠️ Toccare lo z-order non è mai innocuo

> **⚠️ Attenzione:** riordinare gli oggetti modifica l'impilamento dei
> livelli (z-order). Nella maggior parte delle impaginazioni questo non
> cambia l'aspetto. Ma nelle composizioni complesse — oggetti sovrapposti,
> trasparenze, effetti — il risultato visivo può essere alterato.
> **Conservare sempre una copia di sicurezza del documento originale prima
> di riordinare** e controllare visivamente ogni pagina modificata.

## Procedura consigliata

1. **Controllare** l'anteprima pagina per pagina (Tag RO, poi
   Construction RO).
2. **Riordinare** la selezione dove l'ordine è sbagliato — separando prima i
   gruppi se l'ordine attraversa un gruppo (pulsanti da 1 a 4 della sezione
   «Riordino e gruppi»).
3. **Contrassegnare** gli artefatti e completare i testi alternativi.
4. **Verificare** con i livelli di controllo, poi **eliminarli prima
   dell'esportazione finale**.

## Pubblico di riferimento

Grafici e responsabili di pubblicazione che producono PDF accessibili
(PDF/UA, WCAG) con InDesign — senza competenze tecniche di accessibilità
PDF: i suggerimenti ⓘ e la sezione «Informazioni» spiegano ogni funzione.

## Caratteristiche

- Interfaccia in **4 lingue** (FR/DE/IT/EN), segue la lingua di InDesign o
  si imposta in modo indipendente.
- InDesign 2023 (v18.5) o successivo, macOS e Windows.
- Nessun oggetto aggiunto al documento oltre ai livelli di controllo — tutti
  bloccati, riconoscibili (`[Tag RO]`, `[Construction RO]`, `[Alt Text]`,
  `[Markup]`) ed eliminabili con un clic.
- Sviluppato dal **SZH/CSPS** (Centro svizzero di pedagogia speciale) con il
  supporto dell'IA; licenza GPL v3.
