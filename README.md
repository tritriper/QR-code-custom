# QR-code-custom

Générateur de QR code stylisé « logo intégré » pour l'association Collecti'FROG.
Modules ronds vert foncé, motifs de détection arrondis, illustration dessinée
par-dessus la matrice avec les modules clairs repercés en blanc à l'intérieur
des traits. Sortie SVG uniquement.

L'outil ne dégrade jamais le code : **tous** les modules sombres restent
présents, et les modules clairs recouverts par l'illustration sont repeints en
clair. L'information encodée est donc intégralement préservée.

## Installation

Avec le devcontainer (VS Code → *Reopen in Container*), tout est fait
automatiquement. Sinon :

```bash
git submodule update --init --recursive
npm install
```

`npm install` déclenche `npm run vendor`, qui génère `src/generated/qrcodegen.ts`
(voir [Note sur le submodule](#note-sur-le-submodule)).

## Utilisation

```bash
npx tsx src/cli.ts --url "https://collecti-frog.fr" --out dist/
```

`--art` a un défaut ([art/CF-Logo-VertFonce-Trans.svg](art/CF-Logo-VertFonce-Trans.svg)),
seul `--url` est requis.

Un même contenu admet 8 variantes de masque, toutes valides mais visuellement
différentes. Les 8 sont systématiquement évaluées et classées ; seules les
`--count` meilleures sont écrites, les autres n'apparaissent que dans le
récapitulatif. Les lignes marquées `✓` sont les fichiers produits :

```
URL encodée : https://collecti-frog.fr — illustration à 140 %
  ✓  masque 0 → version 3 (29×29), 432 modules sombres sous l'illustration → dist/qr-mask0.svg
     ...
  ✓  masque 6 → version 3 (29×29), 418 modules sombres sous l'illustration → dist/qr-mask6.svg
  ✓  masque 7 → version 3 (29×29), 438 modules sombres sous l'illustration → dist/qr-mask7.svg
```

Le classement se fait sur le nombre de modules sombres tombant sous
l'illustration : moins il y en a, moins celle-ci se bat visuellement avec le
code. C'est une heuristique, pas une règle — d'où `--count` pour en sortir
plusieurs et trancher à l'œil.

### Options

| Option | Défaut | Rôle |
| --- | --- | --- |
| `--url` | *(requis)* | Contenu encodé |
| `--art` | `art/CF-Logo-VertFonce-Trans.svg` | SVG de l'illustration |
| `--out` | `dist/` | Dossier de sortie |
| `--art-scale` | `140` | Zoom du logo, en % de la zone de données, dans `]0, 200]` |
| `--count` | `8` | Nombre de variantes de masque à écrire, de 1 à 8, les mieux classées d'abord |
| `--thicken` | `1` | Épaississement du trait du logo, en px |
| `--art-color` | `#12341f` | Couleur du logo |
| `--color` | `#000000` | Couleur des modules et des motifs de détection |
| `--dot-size` | `5` | Diamètre d'un point, en px |
| `--upper` | *(désactivé)* | Passe l'URL en majuscules avant encodage |

`--art-scale` est un pourcentage du côté de la zone de données : `100` fait
tenir le logo exactement dans le code, au-delà il déborde sur la marge
silencieuse dont les lecteurs ont besoin pour cadrer — l'outil prévient et il
faut alors vérifier le décodage.

```bash
# les 3 meilleures variantes, logo zoomé à 110 %
npx tsx src/cli.ts --url "https://collecti-frog.fr" --out dist/ --art-scale 110 --count 3

# QR en vert de la charte, points plus gros
npx tsx src/cli.ts --url "https://collecti-frog.fr" --out dist/ --color "#12341f" --dot-size 8
```

### Lisibilité du logo

`--thicken` épaissit le trait du logo en ajoutant un contour de la même
couleur par-dessus le remplissage existant, sans effacer aucun module.
`--thicken 0` revient au trait d'origine, tel quel dans le SVG source.

`--art-color` change la couleur du logo indépendamment de celle des modules —
utile pour une couleur d'accent de la charte plutôt que le vert des modules.
Fonctionne quelle que soit la couleur d'origine du SVG source.

`--upper` déclenche le mode alphanumérique de qrcodegen (5,5 bits/caractère au
lieu de 8) et réduit donc la version du symbole. Les schémas et les hosts sont
insensibles à la casse, **pas les chemins ni les query strings** : l'outil
prévient quand l'URL en contient.

La taille de module (pas de la grille) et la marge silencieuse ne sont pas
exposées en CLI ; elles se règlent dans `DEFAULT_RENDER_OPTS`
([src/render.ts](src/render.ts)). Le SVG produit est indenté et prévu pour être
retouché à la main.

## Vérifier qu'un code se décode

```bash
rsvg-convert -w 800 -h 800 dist/qr-mask6.svg -o /tmp/qr.png
zbarimg -q --raw /tmp/qr.png
```

Les messages `Connection Error … dbus` de `zbarimg` viennent de sa sonde vidéo
et sont sans rapport avec le décodage.

## Architecture

| Fichier | Rôle |
| --- | --- |
| [src/render.ts](src/render.ts) | Matrice booléenne + config → chaîne SVG. Fonctions pures, aucune E/S. |
| [src/cli.ts](src/cli.ts) | Entrée CLI, seul endroit avec des effets de bord. |
| `vendor/qrcodegen/` | Submodule [nayuki/QR-Code-generator](https://github.com/nayuki/QR-Code-generator) v1.8.0, **à ne pas modifier**. |

Ordre de composition du SVG, du fond vers le dessus :

1. `<rect>` de fond clair, marge silencieuse comprise
2. tous les modules sombres, sauf ceux des 3 motifs de détection
3. les 3 motifs de détection stylisés (contour arrondi + pastille)
4. l'illustration, dans la couleur des modules par défaut (`--art-color` pour une autre)
5. tous les modules clairs, masqués par `url(#art)`

Le masque `#art` est un rectangle noir plein écran plus l'illustration en blanc :
il ne laisse passer les points clairs qu'à l'intérieur des traits.

## Note sur le submodule

`vendor/qrcodegen/typescript-javascript/qrcodegen.ts` déclare
`namespace qrcodegen { … }` sans `export` : c'est un *script global*, pas un
module ES, et l'importer directement ne donne rien. Comme on ne modifie pas un
submodule, `npm run vendor` en produit une copie suffixée d'une ligne
`export default qrcodegen;` dans `src/generated/` (gitignoré, régénéré à chaque
`npm install`).

## Dépendances

Aucune dépendance runtime. En développement : `tsx` pour exécuter, `typescript`
et `@types/node` pour `npm run typecheck`.
