🇫🇷 Français (référence) · [🇬🇧 English](DESCRIPTION.en.md) · [🇩🇪 Deutsch](DESCRIPTION.de.md) · [🇮🇹 Italiano](DESCRIPTION.it.md)

# SZH-CSPS A11Y InDesign Plugin — Description

## En une phrase

Un panneau InDesign qui aide à **construire, corriger et vérifier les deux
ordres de lecture** d'un PDF accessible, sans quitter la mise en page.

## Le problème

Un PDF accessible repose sur **deux ordres de lecture distincts**, pilotés
par deux mécanismes différents d'InDesign :

- le **Tag RO** (*tag reading order*) : l'ordre logique des balises, piloté
  par le **panneau Articles**. C'est lui qu'exige la norme PDF/UA et que
  suivent les lecteurs d'écran conformes (JAWS, NVDA) ;
- la **Construction RO** (*construction reading order*) : l'ordre des objets
  dans le contenu de la page, hérité de l'**empilement des calques**
  (z-order) et lu **de bas en haut**. Non exigé par la norme, mais suivi en
  pratique par de nombreux outils non conformes : mode reflow, synthèses
  vocales grand public, logiciels d'aide aux personnes dyslexiques.

Pour un document à la fois **conforme** et **robuste**, les deux ordres
doivent coïncider — et InDesign n'offre aucune vue d'ensemble pour les
contrôler. C'est ce vide que comble le plugin.

## Ce que fait le plugin

- **Visualiser** : un aperçu de la page active numérote chaque élément selon
  l'ordre choisi (Tag RO ou Construction RO) ; des calques de contrôle
  verrouillés dessinent les mêmes numéros et des flèches directement dans le
  document. Les artifacts sont exclus de toutes les vues.
- **Réordonner** : sélectionnez les objets dans l'ordre de lecture voulu
  (premier cliqué = lu en premier), un clic réempile les calques **et**
  synchronise le panneau Articles — y compris la création automatique d'un
  article s'il n'en existe pas, à la bonne position.
- **Gérer les groupes** : un groupe est un **bloc indivisible** dans les deux
  ordres de lecture — il est donc **nécessaire de dégrouper pour réordonner
  des éléments à l'intérieur d'un groupe** (ou pour intercaler un objet
  extérieur entre deux éléments groupés). Le plugin rend cette étape sans
  risque : il **mémorise les groupes avant le dégroupage et les reconstruit
  à l'identique après** le réordonnancement, groupes imbriqués compris.
- **Baliser les artifacts** : définir/retirer le balisage artifact d'une
  sélection, masquer/afficher tous les artifacts, les rassembler sur un
  calque dédié (et les restaurer).
- **Compléter les textes alternatifs** : édition directement dans le
  panneau, affichage de l'alt text de l'élément courant, et un calque de
  contrôle qui étiquette chaque image — alt manquants signalés en rouge.
- **Contrôler le balisage** : un calque affiche la balise d'export PDF de
  chaque paragraphe (`<H1>`, `<P>`, …) telle qu'elle partira à l'export.

## Bonnes pratiques et précautions

### Les artifacts sur un calque dédié — conseillé, pas obligatoire

Rassembler tous les artifacts sur le calque `[Artifacts]` n'est **pas une
obligation technique** : un artifact correctement balisé est exclu de la
structure où qu'il se trouve. Nous le **recommandons** néanmoins : le
document devient plus lisible (tout le décor au même endroit), et la
pratique reste identique d'un document et d'une personne à l'autre.

**Attention** : déplacer un objet sur un autre calque change sa place dans
l'empilement. Dans certaines mises en page (objets qui se chevauchent,
transparences), l'apparence peut s'en trouver modifiée — vérifiez
visuellement les pages concernées après le déplacement. Le bouton
« Restaurer » remet chaque artifact sur son calque d'origine.

### ⚠️ Toucher au z-order n'est jamais anodin

> **⚠️ Attention :** réordonner les objets modifie l'empilement des calques
> (z-order). Dans la plupart des mises en page, cela ne change rien à
> l'apparence. Mais dans les compositions complexes — objets superposés,
> transparences, effets — le rendu visuel peut être altéré.
> **Conservez toujours une copie de sauvegarde du document original avant
> de réordonner**, et contrôlez visuellement chaque page modifiée.

## Démarche conseillée

1. **Contrôler** l'aperçu page par page (Tag RO, puis Construction RO).
2. **Réordonner** la sélection là où l'ordre est faux — en dégroupant
   d'abord si l'ordre traverse un groupe (boutons 1 à 4 de la section
   « Réordonner & groupes »).
3. **Baliser** les artifacts et compléter les textes alternatifs.
4. **Vérifier** avec les calques de contrôle, puis les **supprimer avant
   l'export final**.

## Public cible

Graphistes et chargé·e·s de publication qui produisent des PDF accessibles
(PDF/UA, WCAG) avec InDesign — sans expertise technique de l'accessibilité
PDF requise : les infobulles ⓘ et la section « À propos » expliquent chaque
fonction.

## Caractéristiques

- Interface en **4 langues** (FR/DE/IT/EN), suit la langue d'InDesign ou se
  règle indépendamment.
- InDesign 2023 (v18.5) ou plus récent, macOS et Windows.
- Aucun objet ajouté au document en dehors des calques de contrôle — tous
  verrouillés, identifiables (`[Tag RO]`, `[Construction RO]`, `[Alt Text]`,
  `[Markup]`) et supprimables d'un clic.
- Développé par le **SZH/CSPS** (Centre suisse de pédagogie spécialisée)
  avec le soutien de l'IA ; licence GPL v3.
