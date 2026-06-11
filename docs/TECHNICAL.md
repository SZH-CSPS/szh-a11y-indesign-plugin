# Notes techniques

> Document de référence en français, sans traduction (public : développement
> et maintenance). Pour la présentation générale, voir
> [DESCRIPTION.md](DESCRIPTION.md).

## Structure des fichiers

```
szh-a11y-indesign-plugin/
├── manifest.json          Métadonnées et permissions du plugin (UXP v5)
├── index.html             Mise en page du panneau
├── styles.css             Styles (compatibles thèmes clair/sombre d'InDesign)
├── main.js                Point d'entrée : état du panneau + câblage UI
├── src/
│   ├── strings.js         Données de langue (EN/FR/DE/IT)
│   ├── i18n.js            Détection de langue, override persisté + t()
│   ├── utils.js           Aides partagées (géométrie, contexte de page, artifacts)
│   ├── articles.js        Tag RO — lecture/écriture du panneau Articles
│   ├── zorder.js          Construction RO — lecture du z-order + réordonnancement
│   ├── groups.js          Sauvegarde / dégroupage / regroupement des groupes
│   ├── artifacts.js       Balisage artifact, visibilité, déplacements de calque
│   ├── overlay.js         Calques de contrôle dessinés dans le document
│   └── ui.js              Rendu de l'aperçu (panneau)
├── build/
│   └── build-ccx.ps1      Construction locale du paquet .ccx
├── .github/workflows/
│   └── build-ccx.yml      Construction CI + release GitHub (tags v*)
└── docs/                  Documentation (non embarquée dans le .ccx)
```

## Comportements détaillés

### Aperçu (panneau)

- Aperçu de la **page active** uniquement, deux modes : Tag RO (ordre du
  panneau Articles) et Construction RO (pile des calques, bas → haut,
  n°1 = objet le plus en arrière).
- La numérotation **redémarre à 1 sur chaque page** dans les deux modes.
- Les artifacts (balisés directement ou hérités d'un groupe parent) sont
  exclus de toutes les vues.
- Suivi automatique de la page active par **polling** (800 ms) —
  l'événement `afterContextChanged` n'est pas délivré de manière fiable aux
  panneaux UXP.
- Aperçu vide → message explicite selon la cause (aucun article défini /
  aucun élément du Tag RO sur la page / aucun objet visible).
- Les blocs image portent une pastille `ALT` verte ou `ALT?` rouge ; le
  survol d'un bloc affiche son texte alternatif.

### Calques de contrôle

- Quatre calques : `[Tag RO]` (rouge), `[Construction RO]` (bleu),
  `[Alt Text]` (vert/rouge), `[Markup]` (violet, balise d'export PDF par
  paragraphe, `<P>` par défaut, plafonné à 600 étiquettes).
- Étendue au choix : page active (défaut) ou tout le document.
- Calques **verrouillés**, traits fins à 65 % d'opacité, étiquettes
  uniformes (Arial 7,5 pt) avec `ignoreWrap` (sinon l'habillage des objets
  sous-jacents vide les badges).
- Volontairement **pas** `printable = false` : le mode écran Aperçu (W)
  masque les objets non imprimables — le calque disparaissait pour les
  utilisateurs en mode Aperçu. D'où la consigne : supprimer les calques
  avant l'export final.
- Effacer le Tag RO supprime aussi l'ancien calque `[Reading Order]` (v1.0).

### Réordonner & groupes

- « Réordonner la sélection » : réempile selon l'ordre de sélection
  (premier sélectionné = le plus en arrière = lu en premier), puis
  synchronise le panneau Articles :
  - les éléments déjà membres d'articles sont réordonnés sur place ;
  - les éléments absents des articles sont **insérés** dans l'article qui
    contient le reste de la sélection, à leur position relative ;
  - si aucun article ne contient la sélection, un article `RO p.X` est
    **créé**, coché « Inclure lors de l'exportation » et placé dans le
    panneau selon sa page.
- Les articles `RO p.X` sont **renommés automatiquement** quand des pages
  sont déplacées ou supprimées.
- Workflow groupes : 1) sauvegarder les groupes (mémoire de session, par
  document) → 2) tout dégrouper → 3) réordonner → 4) regrouper à
  l'identique (groupes imbriqués reconstruits via un mapping ancien id →
  nouveau groupe).
- « Aligner Construction RO sur Tag RO » (expérimental) : `bringToFront()`
  de chaque élément d'article dans l'ordre du Tag RO. Limites : l'ordre
  entre calques reste celui de la pile ; les objets hors articles passent
  derrière.

### Artifacts & textes alternatifs

- Balisage via `objectExportOptions.applyTagType`
  (`TAG_ARTIFACT` / `TAG_BASED_ON_OBJECT`). Les graphiques sélectionnés en
  sélection directe sont résolus vers leur bloc conteneur.
- « Définir comme artifact » masque immédiatement les nouveaux artifacts si
  le mode « cacher » est actif (détection : tous les autres artifacts sont
  invisibles).
- Déplacement vers `[Artifacts]` : ordre z relatif **préservé**
  (énumération bas → haut puis `bringToFront()` séquentiel) ; les artifacts
  membres d'un groupe sont ignorés (un membre ne peut pas changer de calque
  seul) ; calques d'origine mémorisés (session) pour la restauration.
- Édition d'alt text dans le panneau : écrit `customAltText` + source
  « Personnalisé » ; si l'objet était artifact, le balisage est retiré (un
  artifact n'est jamais lu). La source par défaut « structure XML » est
  traitée comme alt manquant.

## Pièges UXP appris sur ce projet

- **Direction du z-order** : le plugin suppose `pageItems[0]` = objet le
  plus en avant. Si une version d'InDesign inversait ce comportement
  (numéros Construction RO exactement inversés), basculer
  `PAGEITEMS_INDEX0_IS_FRONT` dans `src/zorder.js`.
- **Écritures `objectExportOptions` depuis UXP → crash d'InDesign** : tout
  balisage artifact/alt text passe par ExtendScript
  (`app.doScript(…, ScriptLanguage.JAVASCRIPT)`), groupé en une étape
  d'annulation ; écriture UXP directe en repli.
- **Performance des overlays** : chaque appel DOM depuis UXP est un
  aller-retour inter-processus (~5-15 ms). Les calques Tag/Construction RO
  sont énumérés ET dessinés par un **ExtendScript généré** exécuté via
  `doScript(…, FAST_ENTIRE_SCRIPT)` (implémentation UXP pure en repli).
  Conséquence du mode rapide : le dessin n'est **pas annulable** — utiliser
  les boutons « Effacer ». Pendant le dessin, les contrôles sont désactivés
  (verrou anti double-clic + fenêtre de refroidissement de 400 ms qui avale
  les clics rejoués par la file d'attente).
- **`<button>` natifs** : UXP leur applique le style Spectrum et ignore
  largeur/retour à la ligne/padding → tous les boutons d'action sont des
  `<div role="button">` ; seuls les petits boutons de repli restent natifs.
- **`position: sticky` interdit** : rendu comme une boîte flottante
  détachée du flux dans InDesign UXP (l'ancien en-tête du panneau a dû être
  supprimé pour ça). La bulle de tooltip utilise `position: fixed`
  volontairement, en surimpression masquée au scroll.
- **Tooltips** : le `title` natif est erratique → icônes ⓘ injectées +
  bulle maison. Attention : `applyLocalization` réécrit le `textContent`
  des boutons, il faut **re-greffer l'icône** après traduction, sinon elle
  disparaît au changement de langue.
- **Unités** : les tailles des badges utilisent les unités du document
  (mm et pt donnent des rendus utilisables) ; les tailles de texte sont en
  points (indépendantes des unités).
- **Mémoire de session** : instantanés de groupes et déplacements
  d'artifacts sont conservés en mémoire par document — perdus à la
  fermeture d'InDesign.

## Compatibilité

| Version d'InDesign | Statut |
|---|---|
| 2023 (v18.5) | ✓ pris en charge |
| 2024 (v19.x) | ✓ pris en charge |
| 2025 (v20.x) | ✓ pris en charge |

macOS et Windows.
