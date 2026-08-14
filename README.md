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
npx tsx src/cli.ts --url "https://collecti-frog.fr" --art art/CF-Logo-Black-Trans.svg --out dist/
```

Écrit `dist/qr-mask0.svg` … `dist/qr-mask7.svg` : les 8 variantes de masque du
même contenu, toutes valides. Elles sont visuellement différentes, à toi de
choisir la plus jolie. Le récapitulatif affiché aide à trancher :

```
URL encodée : https://collecti-frog.fr
  masque 0 → version 3 (29×29), 86 modules sombres sous l'illustration → dist/qr-mask0.svg
  ...
  masque 6 → version 3 (29×29), 82 modules sombres sous l'illustration → dist/qr-mask6.svg
```

Moins il y a de modules sombres sous l'illustration, moins celle-ci se bat
visuellement avec le code — c'est une heuristique, pas une règle.

### Options

| Option | Défaut | Rôle |
| --- | --- | --- |
| `--url` | *(requis)* | Contenu encodé |
| `--art` | *(requis)* | SVG de l'illustration |
| `--out` | `dist/` | Dossier de sortie |
| `--art-scale` | `0.8` | Part de la zone de données occupée par l'illustration, dans `]0, 1]` |
| `--upper` | *(désactivé)* | Passe l'URL en majuscules avant encodage |

`--upper` déclenche le mode alphanumérique de qrcodegen (5,5 bits/caractère au
lieu de 8) et réduit donc la version du symbole. Les schémas et les hosts sont
insensibles à la casse, **pas les chemins ni les query strings** : l'outil
prévient quand l'URL en contient.

Les couleurs, la taille de module, la marge silencieuse et le diamètre des
points sont dans `DEFAULT_RENDER_OPTS` ([src/render.ts](src/render.ts)). Le SVG
produit est indenté et prévu pour être retouché à la main.

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
4. l'illustration en couleur foncée
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
