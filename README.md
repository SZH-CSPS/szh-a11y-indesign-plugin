🇫🇷 Français (référence) · [🇬🇧 English](README.en.md) · [🇩🇪 Deutsch](README.de.md) · [🇮🇹 Italiano](README.it.md)

# SZH-CSPS A11Y InDesign Plugin

Plugin Adobe InDesign (UXP) qui aide à **construire, corriger et vérifier
les deux ordres de lecture** d'un PDF accessible, sans quitter la mise en
page :

- **Tag RO** — l'ordre logique des balises, piloté par le panneau
  **Articles**. Exigé par PDF/UA, suivi par les lecteurs d'écran conformes
  (JAWS, NVDA).
- **Construction RO** — l'ordre du contenu de la page, hérité de
  l'**empilement des calques** et lu de bas en haut. Suivi en pratique par
  le mode reflow et les lecteurs simples.

Aperçu numéroté page par page, réordonnancement en un clic (calques **et**
panneau Articles synchronisés), gestion sûre des groupes (sauvegarde →
dégroupage → regroupement à l'identique), balisage des artifacts, édition
des textes alternatifs et calques de contrôle dessinés dans le document.
Interface en FR/DE/IT/EN avec infobulles explicatives.

> ⚠️ **Réordonner modifie l'empilement des calques (z-order).** Dans les
> mises en page complexes (objets superposés, transparences), l'apparence
> peut changer. **Travaillez toujours sur une copie de sauvegarde du
> document original.**

## Installation

1. [**📦 Télécharger le `.ccx` de la dernière version**](../../releases/latest)
2. Double-cliquer sur le fichier → **Creative Cloud Desktop** installe le
   plugin (confirmer l'avertissement « développeur non vérifié »).
3. Redémarrer InDesign → **Fenêtre > Plugins > SZH-CSPS A11Y InDesign
   Plugin**.

Prérequis : InDesign 2023 (v18.5) ou plus récent, macOS ou Windows.

## Documentation

| Document | Contenu |
|---|---|
| [📖 Description complète](docs/DESCRIPTION.md) | À quoi sert le plugin, fonctionnalités, bonnes pratiques et précautions |
| [🛠 Notes techniques](docs/TECHNICAL.md) | Architecture, comportements détaillés, pièges UXP |
| [🚀 Déploiement](docs/DEPLOYMENT.md) | Build du `.ccx`, GitHub Action, mise à jour, déploiement IT (UPIA) |

## Licence & crédits

GNU GPL v3 · Développé par le
[SZH/CSPS — Centre suisse de pédagogie spécialisée](https://www.csps.ch),
avec le soutien de l'IA (Anthropic Claude) ; le code généré est relu et
testé avant publication.
