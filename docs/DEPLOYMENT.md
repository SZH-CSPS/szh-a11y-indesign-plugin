# Déploiement

> Document de référence en français, sans traduction (public : maintenance
> et IT).

## Construire le paquet `.ccx`

Un `.ccx` est un **simple ZIP** des fichiers du plugin avec `manifest.json`
à la racine de l'archive — **aucun outil Adobe n'est nécessaire** pour le
packaging.

- **Localement** : `powershell -ExecutionPolicy Bypass -File .\build\build-ccx.ps1`
  → produit `dist/szh-a11y-indesign-plugin_<version>.ccx` (version lue
  dans `manifest.json`).
- **CI** : [.github/workflows/build-ccx.yml](../.github/workflows/build-ccx.yml)
  construit le même paquet sur GitHub :
  - à chaque **tag `v*`** poussé : build + **release GitHub** avec le `.ccx`
    en pièce jointe et des notes générées. Le lien `…/releases/latest`
    pointe toujours vers la dernière release publiée ;
  - en déclenchement manuel : le `.ccx` est produit comme artifact de
    workflow.

**Procédure de publication** : incrémenter `version` dans `manifest.json` →
commit → `git tag v1.x.y` → `git push --tags` → la release se crée toute
seule.

## Installation (utilisateurs finaux)

1. Télécharger le `.ccx` depuis la page *Releases* (ou le recevoir par
   mail/Teams/SharePoint). Prérequis : l'app **Creative Cloud Desktop**
   (présente chez quiconque a InDesign).
2. **Double-cliquer sur le `.ccx`** → Creative Cloud Desktop installe le
   plugin. Le plugin n'étant pas distribué via le Marketplace Adobe, un
   avertissement « développeur non vérifié » s'affiche — confirmer.
3. Redémarrer InDesign → **Fenêtre > Plugins > SZH-CSPS A11Y InDesign
   Plugin**.

## Mise à jour

Installer un `.ccx` plus récent portant le même `id` de plugin remplace la
version précédente. Désinstallation possible depuis Creative Cloud Desktop →
Stock et places de marché → Plugins.

## Déploiement de masse (IT)

L'agent UPIA (Unified Plugin Installer Agent) de Creative Cloud installe les
`.ccx` silencieusement en ligne de commande — utile via SCCM/Intune :

```
"C:\Program Files\Common Files\Adobe\Adobe Desktop Common\RemoteComponents\UPI\UnifiedPluginInstallerAgent\UnifiedPluginInstallerAgent.exe" /install szh-a11y-indesign-plugin_<version>.ccx
```

(`/list all` liste les plugins installés, `/remove` désinstalle.)

## Distribution publique (optionnel)

Pour une diffusion au-delà de l'organisation : soumission au **Adobe
Marketplace** via l'Adobe Developer Console (processus de revue, badge
développeur vérifié, mises à jour automatiques). L'`id` du plugin doit alors
être généré par la Developer Console.

## Développement

1. Cloner le dépôt.
2. Ouvrir **Adobe UXP Developer Tool** (gratuit, via Creative Cloud).
3. **Add Plugin** → sélectionner le dossier du dépôt → **Load**.
4. Dans InDesign : **Fenêtre > Plugins > SZH-CSPS A11Y InDesign Plugin**.

Après un changement de `manifest.json`, faire **Remove** puis **Add
Plugin** dans UDT (un simple Load ne recharge pas toujours le manifest).
