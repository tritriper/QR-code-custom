# QR-code-custom

Cet outil crée des QR codes personnalisés : points ronds, coins arrondis, avec un logo affiché par-dessus.

Il fonctionne depuis un terminal (une fenêtre où l'on tape des commandes).
Pas d'installation d'application, pas de compte à créer.

Ce projet utilise le generateur de QRCode [nayuki/QR-Code-generator](https://github.com/nayuki/QR-Code-generator)

## Exemples
<img src="exemple/artwork.svg" alt="artwork" width="200"/>
<img src="exemple/center-logo.svg" alt="center-logo" width="200"/>

## Installation (à faire une seule fois)

### Solution 1 (non testé, peut manquer des deps)
1. Installer npm 
2. Télécharger le code du repository
3. Ouvrir un terminal de commande dans le dossier du repository

### Solution 2 (mode developpeur)

Si tu as VS Code et docker :
1. Télécharge le code du repository
2. Ouvre ce projet dans VS Code.
3. Une notification propose de « Rouvrir dans un conteneur » (*Reopen in
   Container*) — accepte. VS Code installe alors tout ce qu'il faut
   automatiquement (ça peut prendre quelques minutes la première fois).
4. Ouvre un nouveau terminal (ctrl+j)

Si tu n'as pas cette notification, ouvre la palette de commandes
(`Ctrl+Maj+P` ou `Cmd+Maj+P` sur Mac) et cherche *Dev Containers: Reopen in
Container*.

## Générer un QR code

Dans le terminal :

```bash
npx tsx src/cli.ts --url "https://collecti-frog.fr"
```

Remplace l'adresse par celle que tu veux encoder. Après quelques secondes,
8 fichiers apparaissent dans le dossier `dist/` : `qr-mask0.svg`,
`qr-mask1.svg`, etc. Ce sont 8 versions du même QR code, légèrement
différentes visuellement — ouvre-les pour voir laquelle te plaît le plus.
Le terminal affiche un petit résumé pour chacune ; celle avec le moins de
« modules sombres concernés » est en général la plus lisible.

Chaque fichier `.svg` peut être ouvert dans un navigateur, importé dans Canva,
Illustrator, Figma, ou converti en PNG/JPEG avec n'importe quel outil en ligne.

### Vérifier que le QR code fonctionne

Avant de l'utiliser, scanne-le avec l'appareil photo de ton téléphone (comme
pour scanner un QR code normal). S'il ouvre bien le bon lien, c'est bon.

## Personnaliser le rendu

Toutes ces options se rajoutent à la suite de la commande de base. Par
exemple, pour un QR code avec des points plus gros :

```bash
npx tsx src/cli.ts --url "https://collecti-frog.fr" --dot-size 8
```

On peut combiner plusieurs options dans la même commande.

| Option | Ce que ça change | Valeur par défaut |
| --- | --- | --- |
| `--url` | L'adresse ou le texte encodé dans le QR code (obligatoire) | — |
| `--out` | Le dossier où enregistrer les fichiers | `dist/` |
| `--color` | La couleur des points et des coins du QR code (ex. `"#12341f"` pour le vert Collecti'FROG) | noir |
| `--dot-size` | La taille des points, en une unité proche du pixel | `5` |
| `--spacing` | L'espacement entre les points (distance entre leurs centres, même unité) — plus la valeur est grande, plus les points sont espacés et le QR code prend de la place | `10` |
| `--art` | Le logo à afficher par-dessus le QR code (un fichier `.svg`) | logo grenouille vert |
| `--art-scale` | La taille du logo, en pourcentage de la zone centrale du QR code | `140` |
| `--art-color` | La couleur du logo | vert Collecti'FROG |
| `--thicken` | Épaissit le trait du logo pour qu'il ressorte mieux | `1` |
| `--count` | Le nombre de variantes à générer (entre 1 et 8) | `8` |
| `--upper` | Écrit l'adresse en MAJUSCULES avant de l'encoder — permet parfois d'obtenir un QR code un peu plus simple. Fonctionne seulement pour des adresses simples type `https://collecti-frog.fr` | désactivé |

Quelques exemples :

```bash
# QR code tout en vert Collecti'FROG, points plus gros
npx tsx src/cli.ts --url "https://collecti-frog.fr" --color "#12341f" --dot-size 8

# Une seule variante au lieu de 8, dans un dossier "mon-dossier"
npx tsx src/cli.ts --url "https://collecti-frog.fr" --out mon-dossier/ --count 1

# Logo plus petit et plus discret
npx tsx src/cli.ts --url "https://collecti-frog.fr" --art-scale 90 --thicken 0

# Points bien espacés, aspect aéré
npx tsx src/cli.ts --url "https://collecti-frog.fr" --spacing 16

# Points serrés, aspect dense et compact
npx tsx src/cli.ts --url "https://collecti-frog.fr" --spacing 6
```

### Utiliser un autre logo

Remplace `--art` par le chemin vers ton propre fichier `.svg` :

```bash
npx tsx src/cli.ts --url "https://collecti-frog.fr" --art art/mon-logo.svg
```

Le logo doit être un fichier `.svg` (pas un `.png` ni un `.jpg`).

### Logo rond au centre

Il existe une deuxième façon d'afficher un logo : au centre du QR code, dans
un petit badge rond, plutôt qu'intégré aux points. C'est le style utilisé sur
les QR codes « logo au milieu » qu'on voit couramment.

```bash
npx tsx src/cli.ts --url "https://collecti-frog.fr" --no-art --center-logo "art/Circle Logo.svg"
```

`--no-art` désactive le style « logo intégré aux points » habituel, pour ne
garder que le badge au centre (sinon les deux se superposent).

| Option | Ce que ça change | Valeur par défaut |
| --- | --- | --- |
| `--center-logo` | Le logo rond à afficher au centre (un fichier `.svg`) | aucun (désactivé) |
| `--center-logo-scale` | La taille du badge, en pourcentage de la zone centrale du QR code | `24` |
| `--center-logo-color` | La couleur du badge | ses couleurs d'origine |

**Important : ce logo efface une partie des points du QR code en dessous
de lui**, contrairement au logo intégré aux points (`--art`) qui, lui, ne
touche jamais un seul point. C'est normal et volontaire — les QR codes sont
conçus pour rester lisibles même abîmés — mais ne pas dépasser `40` pour
`--center-logo-scale`, et toujours vérifier le résultat en le scannant (voir
*Vérifier que le QR code fonctionne* plus haut). Au-delà de `30`, l'outil
affiche un avertissement.

Comme pour `--art`, `--center-logo` accepte n'importe quel fichier `.svg` —
pas seulement le badge rond fourni :

```bash
npx tsx src/cli.ts --url "https://collecti-frog.fr" --no-art --center-logo art/mon-badge.svg
```

### Les deux exemples, côte à côte

Dans les deux modes — le logo intégré aux points (celui de base) et le badge
rond au centre — c'est toujours le même principe : le nom de ton fichier
`.svg` après `--art` ou `--center-logo`.

```bash
# Mode de base : logo intégré aux points
npx tsx src/cli.ts --url "https://collecti-frog.fr" --art art/mon-logo.svg

# Logo rond au centre
npx tsx src/cli.ts --url "https://collecti-frog.fr" --no-art --center-logo art/mon-badge.svg
```

## En cas de souci

**« Attention : à XXX % l'illustration déborde… »** — le logo est réglé trop
grand (`--art-scale` trop élevé) et risque de gêner la lecture du QR code.
Réduis la valeur, ou vérifie en scannant le résultat avec ton téléphone.

**« Attention : à XXX % le logo central efface une grande zone… »** — réduis
`--center-logo-scale`, ou vérifie que le QR code se scanne toujours bien.

**Le QR code ne se scanne pas** — essaie une autre variante parmi les 8
générées (`qr-mask0.svg` à `qr-mask7.svg`), ou réduis `--art-scale` /
`--center-logo-scale`.

**Une erreur mentionnant `art-color` ou `color`** — la couleur donnée n'est
pas reconnue : utilise un code hexadécimal comme `"#12341f"`, ou un nom de
couleur simple en anglais (`"red"`, `"green"`…).

**Rien ne se passe / erreur `command not found`** — vérifie que tu es bien
dans le terminal du conteneur VS Code (voir *Installation* ci-dessus), pas
dans un terminal classique.

---

*Pour les développeurs qui contribuent au code de cet outil, voir
[AGENTS.md](AGENTS.md).*
