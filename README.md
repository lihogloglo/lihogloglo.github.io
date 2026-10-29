# lihogloglo

Ma galerie de projets en cours, avec un petit blog. Français sur `/`, anglais sur `/en/`.
Reconstruit et publié sur GitHub Pages à chaque push et une fois par jour.

## Éditer

Tout se modifie depuis GitHub (crayon ✏️ sur le fichier) ou en local, puis on pousse.

| Quoi | Où |
|---|---|
| Ajouter, retirer, réécrire un projet (phrase courte et fiche détaillée) | `content/projects.yml` |
| Titre, phrase d'accroche, nom de domaine | `content/site.yml` |
| Écrire un article | `content/posts/<nom>.fr.md` et/ou `<nom>.en.md` |
| Images et vidéos | `media/<id>/` |

Un clic sur un projet ouvre sa fiche par-dessus la galerie : toutes ses images, le texte `more`, les liens.
Chaque fiche a sa propre adresse (`…/#tamagosea`), à partager directement.

Un article commence par :

```
---
title: Mon titre
date: 2026-10-29
draft: true   # optionnel : pas publié tant que c'est là
---
```

S'il n'existe qu'en une langue, il apparaît quand même dans les deux blogs, avec une étiquette FR ou EN.

## Images et vidéos

Chaque projet a son dossier, `media/<id>/`, où `<id>` est celui de `projects.yml`. Les fichiers s'affichent
dans l'ordre de leur nom (`01-…`, `02-…`) : le premier sert de couverture, tous apparaissent dans la fiche.
Une vidéo `01-plongee.mp4` prend `01-plongee.jpg` comme image d'attente.
Sans média, la carte affiche un dégradé avec le titre.

Pour une appli de téléphone, mets `format: phone` dans `projects.yml` : la carte montre jusqu'à trois
captures verticales côte à côte, comme des écrans.

**Format conseillé :** une boucle MP4 (H.264) de 5 à 8 secondes, sans son, 960 px de large au plus,
moins de 1 Mo, plus une image JPG qui s'affiche le temps que la vidéo charge. Les navigateurs, iPhone
compris, la lisent en silence et en boucle. Elle ne joue que quand elle est à l'écran.

Pour enregistrer : Win+Alt+R (Xbox Game Bar), ShareX ou OBS, peu importe le format. Puis :

```
npm run media -- "C:\chemin\enregistrement.mp4" parallax 01-descente 12 7
#                 fichier                       id       nom         début durée (secondes)
```

Ça produit `media/parallax/01-descente.mp4` et `.jpg` au bon format. Ça marche aussi avec un GIF,
ou une capture d'écran (`npm run media -- capture.png parallax 02-brouillard`).
Pour une capture de téléphone Android : `adb exec-out screencap -p > capture.png`, ou les boutons du téléphone.

### Captures automatiques des projets web

`content/captures.yml` dit comment ouvrir un projet web, sur quoi cliquer, et combien de secondes filmer.
`npm run capture` les refait toutes (`npm run capture -- tamagosea` pour un seul projet). Ça utilise ton Chrome.
Pour une appli web déjà construite, `serve` pointe sur son dossier (ex. `dist/`). Pour un projet qui se lance
avec `npm run dev`, démarre-le, puis mets son adresse (`http://localhost:5173`) dans `open`.

La première fois : `npx playwright-core install ffmpeg` (1,6 Mo, sert à filmer).

## « Travaillé dessus il y a… »

`npm run activity` lit sur GitHub la date du dernier commit (branche principale) et les commits des
12 dernières semaines de chaque projet, dans `data/activity.json`. La galerie est triée là-dessus.
La pastille est bleu vif sous 3 jours, bleu clair sous 2 semaines, bleu-gris sous 2 mois, grise au-delà.
Les petites barres montrent les commits par semaine.

En ligne, le workflow le fait chaque jour avec le secret `PROJECTS_TOKEN` (voir plus bas).
Les repos privés n'exposent que leurs dates. Le lien « Code » n'apparaît que pour les repos publics.

## En local

```
npm install
npm run dev        # http://localhost:8080, se reconstruit à chaque modification
```

## Réglages GitHub (une fois)

**Le jeton pour les dates.** GitHub → Settings → Developer settings → Fine-grained tokens → Generate:
accès « All repositories » (ou seulement ceux de la galerie), permissions *Contents: Read-only* et
*Metadata: Read-only*, expiration la plus longue. Puis, dans ce repo : Settings → Secrets and variables →
Actions → New repository secret, nom `PROJECTS_TOKEN`. Ou en ligne de commande :
`gh secret set PROJECTS_TOKEN`. Sans lui, le site marche, mais avec les dates du dernier `npm run activity` lancé en local.

**Un nom de domaine.** Écris-le dans `content/site.yml` (`domain: lihogloglo.fr`), puis chez le registrar ajoute :
quatre enregistrements `A` vers `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`,
et un `CNAME` `www` vers `lihogloglo.github.io`. Enfin, Settings → Pages → coche *Enforce HTTPS*.
