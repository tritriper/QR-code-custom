# QR-code-custom

Cet outil crée des QR codes personnalisés : points ronds, coins arrondis, avec un logo affiché par-dessus.

Il existe en deux versions, qui produisent exactement la même chose :

- **[l'application web](https://tritriper.github.io/QR-code-custom/)** — rien à
  installer, ça se passe dans le navigateur ;
- **le programme en ligne de commande**, pour qui préfère le terminal ou veut
  automatiser (voir plus bas).

Ce projet utilise le generateur de QRCode [nayuki/QR-Code-generator](https://github.com/nayuki/QR-Code-generator)

## Exemples
<img src="exemple/artwork.svg" alt="artwork" width="200"/>
<img src="exemple/center-logo.svg" alt="center-logo" width="200"/>

## L'application web

Ouvre **<https://tritriper.github.io/QR-code-custom/>**, puis :

1. saisis l'adresse à encoder ;
2. choisis un style : *logo intégré* (le logo est dessiné par-dessus les
   points), *logo au centre* (posé sur une pastille claire) ou *sans logo* ;
3. charge ton logo si tu ne veux pas celui de Collecti'FROG (**format `.svg`
   uniquement**), puis règle couleurs, formes, densité des points, forme des
   trois coins (et, si tu veux, celle de leur centre) et taille du fichier ;
4. si le dessin ne te plaît pas, clique sur **Régénérer** : le même lien est
   redessiné autrement, autant de fois que tu veux ;
5. télécharge le SVG.

Rien n'est envoyé sur Internet : ton logo ne quitte pas ton ordinateur, tout
le calcul se fait dans le navigateur.

**Avant d'utiliser le QR code obtenu, scanne-le avec l'appareil photo de ton
téléphone** pour vérifier qu'il ouvre bien le bon lien. C'est valable pour les
deux versions de l'outil.

## Le programme en ligne de commande

### Installation (à faire une seule fois)

#### Solution 1 (non testé, peut manquer des deps)
1. Installer npm 
2. Télécharger le code du repository
3. Ouvrir un terminal de commande dans le dossier du repository

#### Solution 2 (mode developpeur)

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

### Générer un QR code

Dans le terminal :

```bash
npx tsx src/cli.ts --url "https://collecti-frog.fr"
```

Remplace l'adresse par celle que tu veux encoder. Après quelques secondes, un
fichier `qr-mask0.svg` apparaît dans le dossier `dist/`.

Il existe 8 dessins possibles du même QR code, légèrement différents
visuellement et tous aussi valides. Si celui-ci ne te plaît pas, relance la
commande avec `--mask 1`, puis `--mask 2`, etc. jusqu'à `--mask 7` : c'est
l'équivalent du bouton *Régénérer* de l'application web.

Chaque fichier `.svg` peut être ouvert dans un navigateur, importé dans Canva,
Illustrator, Figma, ou converti en PNG/JPEG avec n'importe quel outil en ligne.

#### Vérifier que le QR code fonctionne

Avant de l'utiliser, scanne-le avec l'appareil photo de ton téléphone (comme
pour scanner un QR code normal). S'il ouvre bien le bon lien, c'est bon.

### Personnaliser le rendu

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
| `--dot-size` | La taille des points. Les centres des points sont espacés de 10 : en dessous de `5` les points sont fins et aérés, au-delà ils se rapprochent jusqu'à se toucher vers `10` | `5` |
| `--art` | Le logo à afficher par-dessus le QR code (un fichier `.svg`) | logo grenouille vert |
| `--art-scale` | La taille du logo, en pourcentage de la zone centrale du QR code | `140` |
| `--art-color` | La couleur du logo | vert Collecti'FROG |
| `--thicken` | Épaissit le trait du logo pour qu'il ressorte mieux | `1` |
| `--mask` | Le dessin à produire, entre 0 et 7 : même lien encodé, points disposés autrement | `0` |
| `--density` | La densité de la grille, entre 1 et 12 : plus la valeur est haute, plus le QR code compte de points, donc plus ils sont fins. C'est un minimum — une adresse longue en impose parfois plus | `1` |
| `--size` | La taille du fichier produit, en pixels. Le SVG reste net quelle que soit la taille : ça ne fixe que la taille à laquelle il s'affiche par défaut une fois importé ailleurs | `1024` |
| `--finder-shape` | La forme des 3 grands carrés des coins : `square` (carrés), `rounded` (arrondis), `extra-rounded` (très arrondis), `circle` (ronds) ou `leaf` (en feuille, un coin pointu tourné vers l'extérieur) | `rounded` |
| `--finder-pupil-shape` | La forme du centre des 3 coins, parmi la même liste — utile pour marier deux formes (ex. contour en feuille, centre rond) | celle du contour |
| `--finder-color` | La couleur du contour des 3 coins | celle des points |
| `--finder-pupil-color` | La couleur du centre des 3 coins | celle du contour |
| `--upper` | Écrit l'adresse en MAJUSCULES avant de l'encoder — permet parfois d'obtenir un QR code un peu plus simple. Fonctionne seulement pour des adresses simples type `https://collecti-frog.fr` | désactivé |

Quelques exemples :

```bash
# QR code tout en vert Collecti'FROG, points plus gros
npx tsx src/cli.ts --url "https://collecti-frog.fr" --color "#12341f" --dot-size 8

# Un autre dessin du même QR code, dans un dossier "mon-dossier"
npx tsx src/cli.ts --url "https://collecti-frog.fr" --out mon-dossier/ --mask 4

# Logo plus petit et plus discret
npx tsx src/cli.ts --url "https://collecti-frog.fr" --art-scale 90 --thicken 0

# Points fins, aspect aéré
npx tsx src/cli.ts --url "https://collecti-frog.fr" --dot-size 3

# Points gros, presque jointifs
npx tsx src/cli.ts --url "https://collecti-frog.fr" --dot-size 9

# Beaucoup plus de points, plus fins (grille dense)
npx tsx src/cli.ts --url "https://collecti-frog.fr" --density 6

# Un grand fichier, pour une affiche
npx tsx src/cli.ts --url "https://collecti-frog.fr" --size 4096

# Coins ronds, contour vert et centre orange
npx tsx src/cli.ts --url "https://collecti-frog.fr" \
  --finder-shape circle --finder-color "#12341f" --finder-pupil-color "#c94f2f"

# Coins en feuille, avec un centre rond
npx tsx src/cli.ts --url "https://collecti-frog.fr" \
  --finder-shape leaf --finder-pupil-shape circle
```

#### Utiliser un autre logo

Remplace `--art` par le chemin vers ton propre fichier `.svg` :

```bash
npx tsx src/cli.ts --url "https://collecti-frog.fr" --art art/mon-logo.svg
```

Le logo doit être un fichier `.svg` (pas un `.png` ni un `.jpg`).

#### Logo rond au centre

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
| `--center-logo-scale` | La taille du badge, en pourcentage de la zone centrale du QR code | `40` |
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

#### Les deux exemples, côte à côte

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

**Le QR code ne se scanne pas** — essaie un autre dessin avec `--mask 1`,
`--mask 2`… (sur l'application web, clique sur *Régénérer*), réduis
`--art-scale` / `--center-logo-scale`, ou baisse `--density` : des points trop
fins passent mal à l'impression.

**Une erreur mentionnant `art-color` ou `color`** — la couleur donnée n'est
pas reconnue : utilise un code hexadécimal comme `"#12341f"`, ou un nom de
couleur simple en anglais (`"red"`, `"green"`…).

**Rien ne se passe / erreur `command not found`** — vérifie que tu es bien
dans le terminal du conteneur VS Code (voir *Installation* ci-dessus), pas
dans un terminal classique.

**Sur l'application web : « … n'est pas un fichier SVG »** — seul le format
`.svg` fonctionne pour l'instant (un PNG ou un JPEG ne peut pas être intégré
au QR code de cette façon). Demande le logo en `.svg` à qui l'a dessiné, ou
convertis-le avec un outil en ligne.

**Sur l'application web : rien ne s'affiche** — l'aperçu a besoin de
JavaScript ; vérifie qu'il n'est pas bloqué par une extension du navigateur.

---

*Pour les développeurs qui contribuent au code de cet outil, voir
[AGENTS.md](AGENTS.md).*
