# AGENTS.md

Contexte technique pour tout assistant IA reprenant ce projet. Le
[README.md](README.md) s'adresse à l'utilisatrice ou l'utilisateur final
(association Collecti'FROG, sans connaissance en programmation) ; ce fichier
s'adresse à qui modifie le code.

## Ce que c'est

Un générateur de QR codes stylisés à usage unique pour une association
(Collecti'FROG) : points ronds, coins arrondis, logo intégré. **Ce n'est pas
une librairie générique** — pas de système de plugins, pas d'abstraction pour
des besoins hypothétiques. Priorité constante à la simplicité et à la
lisibilité, y compris au prix de duplication mineure plutôt que d'une
abstraction prématurée. Trois lignes similaires valent mieux qu'un mauvais
générique.

Contraintes qui restent valables pour tout ajout futur :
- TypeScript strict, types explicites, jamais de `any`.
- `src/render.ts` : uniquement des fonctions pures (matrice + config → SVG).
  Aucune E/S, aucun accès au système de fichiers.
- `src/cli.ts` : seul endroit avec des effets de bord (lecture de fichiers,
  écriture, `console.log`).
- Commentaires en français, uniquement quand le *pourquoi* n'est pas évident
  (jamais pour redire ce que le code dit déjà).
- Aucune dépendance runtime. `tsx` pour exécuter, `typescript`/`@types/node`
  pour `npm run typecheck`.
- Le SVG produit doit rester indenté et lisible : il est prévu pour être
  retouché à la main.

## Le submodule qrcodegen — piège à connaître

`vendor/qrcodegen/` est un submodule Git ([nayuki/QR-Code-generator](https://github.com/nayuki/QR-Code-generator),
pinné en v1.8.0). **Ne jamais le modifier** : tout changement local y serait
perdu, et ce n'est pas notre code.

`vendor/qrcodegen/typescript-javascript/qrcodegen.ts` déclare
`namespace qrcodegen { ... }` **sans `export`**. C'est un script global écrit
pour être compilé par concaténation (`tsc a.ts b.ts`), pas un module ES —
l'importer directement (`import * as qrcodegen from "../vendor/.../qrcodegen"`)
donne un objet vide. C'était le premier blocage rencontré sur ce projet,
vérifié empiriquement avant de choisir la solution ci-dessous.

**Solution retenue** : `npm run vendor` (déclenché automatiquement par le hook
`prepare` de `npm install`) concatène le fichier source avec une ligne
`export default qrcodegen;` et écrit le résultat dans
`src/generated/qrcodegen.ts` (gitignoré, régénéré à chaque install). Le code
applicatif importe ce fichier généré :

```ts
import qrcodegen from "./generated/qrcodegen.js";
```

Si une erreur `Cannot find module './generated/qrcodegen.js'` apparaît,
lancer `npm run vendor`.

## Architecture

| Fichier | Rôle |
| --- | --- |
| `src/render.ts` | Matrice booléenne (`boolean[][]`) + `RenderOpts` → chaîne SVG. Fonctions pures. |
| `src/cli.ts` | Parsing des arguments, lecture de l'illustration, appel à `qrcodegen`, écriture des fichiers. |
| `vendor/qrcodegen/` | Submodule, intact. |
| `src/generated/` | Généré par `npm run vendor`, gitignoré. |
| `art/` | Fichiers `.svg` des logos (charte Collecti'FROG). |

### Ordre de composition du SVG (`renderQrSvg`)

L'ordre est documenté en commentaire dans le code et **significatif** :
chaque couche recouvre les précédentes.

1. `<rect>` de fond clair, marge silencieuse comprise
2. tous les modules sombres, sauf ceux des 3 motifs de détection
3. les 3 motifs de détection stylisés (contour arrondi + pastille)
4. l'illustration `--art` (silhouette dessinée par-dessus les points)
5. tous les modules clairs, masqués par `url(#art)` — ne deviennent visibles
   qu'à l'intérieur des traits de l'illustration (repercage)

Le masque `#art` est un rectangle noir plein écran + l'illustration en blanc
par-dessus (`maskUnits="userSpaceOnUse"`, bornes explicites). C'est ce qui
laisse passer les points clairs uniquement sous les traits du logo.

**Point important** : l'overlay `--art` ne supprime jamais de module sombre.
Les modules restent tous dessinés ; l'illustration est peinte par-dessus. Ne
pas casser cette propriété sans le signaler clairement — c'est un invariant
que le README promet implicitement (« sans jamais rendre le code illisible »).

### Logo central (`--center-logo`) — comportement différent de `--art`

Deuxième style, indépendant du premier : un logo posé au centre du QR sur un
disque clair qui **efface réellement** les modules dessous
(`darkModules()` saute les modules dont le centre tombe dans le rayon de
réserve — voir `Reserve`/`insideReserve()`/`reserveOf()` dans `render.ts`).
C'est la technique standard des « QR + logo au centre » : elle s'appuie sur
la correction d'erreur (toujours `Ecc.HIGH`) pour rester lisible malgré la
perte. Contrairement à `--art`, ce n'est **pas** sans risque — d'où :

- un plafond dur à 40 % (`--center-logo-scale`), un avertissement au-delà de
  30 %, calibrés empiriquement (voir plus bas) ;
- une réserve **circulaire uniquement** (pas de forme rectangulaire) : plus
  petite qu'un carré englobant à taille égale, donc moins destructrice, et
  adaptée au badge rond fourni. Un futur logo non circulaire nécessiterait de
  revoir cette géométrie (actuellement en dur, volontairement — pas
  d'abstraction pour un besoin qui n'existe pas encore) ;
- `--no-art` pour désactiver l'overlay `--art` par défaut et n'avoir que le
  badge central (sinon les deux se superposent — testé, ça fonctionne mais
  c'est visuellement chargé, deux visages de grenouille se chevauchent).

`resolveOverlay()` est partagé entre `--art` et `--center-logo` (même
géométrie de cadrage : mise à l'échelle sur le plus grand côté du viewBox
source, centrage sur la zone de données). `overlayGroup()` (ex-`artworkGroup`)
aussi, avec une différence : pour le logo central, `color` peut être
`undefined`, auquel cas ses couleurs d'origine sont conservées sans passer
par `recolor()` — contrairement à `--art` où une couleur est toujours
appliquée (celle des modules par défaut).

`countDarkModulesUnderArtwork` (nom conservé tel quel malgré l'ajout du logo
central, pour limiter le diff) additionne maintenant deux choses de nature
différente : le compte heuristique (bbox) de `--art`, et le compte exact
(cercle de réserve) du logo central. Les deux contribuent au même classement
de masques.

**Calibration empirique** (avant de durcir `--center-logo-scale`) : testé de
20 % à 40 % sur `art/Circle Logo.svg`, sur un QR court (v3) et un QR plus
long (v8, URL avec query string), sur les 8 masques à chaque fois — tout
décode encore à 40 %. La marge de manœuvre est donc plus confortable que le
plafond choisi ; le plafond à 40 %/avertissement à 30 % reste volontairement
prudent (un futur logo plus dense en encre que ce badge, ou un texte moins
tolérant aux erreurs, pourrait se comporter moins bien). Si ce plafond est
révisé, retester avec le même protocole plutôt que de se fier à ce résultat
qui ne vaut que pour cet essai précis.

### CLI : évaluation des 8 masques

`cli.ts` encode systématiquement les 8 masques QR (0 à 7) via
`QrCode.encodeSegments(segs, ecl, 1, 40, mask, true)`, calcule pour chacun le
nombre de modules sombres concernés par les overlays (`--art` et/ou
`--center-logo`, voir `countDarkModulesUnderArtwork`), les classe, et n'écrit
sur disque que les `--count` meilleures (défaut 8, donc tout est écrit par
défaut). Le niveau de correction d'erreur est toujours `Ecc.HIGH`, en dur.

## Options CLI actuelles

Voir le tableau du [README.md](README.md#personnaliser-le-rendu) pour la
description utilisateur. Côté code, chaque flag CLI (`kebab-case`) alimente un
champ de `RenderOpts` (`camelCase`) dans `main()` — les deux fichiers doivent
rester synchronisés si l'un des deux change. `--spacing` alimente `modulePx`
(pas de la grille, en px) : comme il fixe l'unité de base de toute la
géométrie, il redimensionne le SVG entier (positions, finders, marge
silencieuse) plutôt que de ne toucher qu'à l'espace entre les points — c'est
son rôle, distinct de `--dot-size` (diamètre d'un point) qui n'affecte que le
rayon des cercles. `quietZone` (marge silencieuse, en modules) reste **pas**
exposée en CLI, réglée en dur dans `DEFAULT_RENDER_OPTS`.

## Décisions historiques (pour éviter de refaire les mêmes essais)

- **`recolor()` généralisé** : remplace la couleur de `fill`/`stroke` de
  n'importe quel tracé source, pas seulement le noir (les logos fournis ne
  sont pas tous dans la même couleur d'origine). Exclut explicitement `none`
  et `white` : le blanc sert aux masques internes de certains logos (ex.
  dents en creux dessinées via un `<mask fill="white">`), pas au dessin
  visible. La regex n'est pas scopée par balise ; elle marche uniquement
  parce que ces `fill="white"` n'apparaissent que sur des éléments `<mask>`,
  jamais sur un `<path>` visible, dans les logos actuels. Si un futur logo
  a un tracé blanc *visible*, cette hypothèse casse.
- **Le halo (essayé, retiré)** : une première approche de lisibilité du logo
  dilatait une copie claire du logo sous l'original (halo). Sur les petits
  détails d'un logo (dents, iris), un stroke large fusionnait ces détails en
  un ruban de bulbes soudés (« aspect scalloped », accentué par les jonctions
  anguleuses). Retiré au profit de `--thicken` (simple stroke de la même
  couleur, `stroke-linejoin`/`stroke-linecap: round`) + `--art-color`. Ne pas
  réintroduire un halo sans tester sur un logo à petits détails et vérifier
  le rendu à l'œil, pas seulement le décodage.
- **`--art-scale` en pourcentage, pas en ratio** : plus lisible pour un public
  non technique (le README s'adresse à des utilisateurs sans connaissance en
  programmation). `100` fait tenir le logo exactement dans la zone de
  données ; au-delà il déborde sur la marge silencieuse et un avertissement
  s'affiche.
- **`--art-color` a un défaut fixe (`#12341f`), indépendant de `--color`** :
  les deux ont été découplés intentionnellement. Si `--art-color` dérivait
  de `--color` (comme c'était le cas dans une version antérieure), changer la
  couleur des modules changerait aussi celle du logo sans le vouloir.

## Vérifier qu'un changement de rendu ne casse rien

Le critère d'acceptation du projet est qu'un QR généré reste scannable après
rastérisation. Après toute modification de `render.ts` ou `cli.ts` :

```bash
npx tsx src/cli.ts --url "https://collecti-frog.fr" --out /tmp/check/
rsvg-convert -w 800 -h 800 /tmp/check/qr-mask6.svg -o /tmp/check.png
zbarimg -q --raw /tmp/check.png
```

`rsvg-convert` et `zbarimg` sont installés par le devcontainer
(`.devcontainer/setup.sh`). Les messages `Connection Error … dbus` de
`zbarimg` viennent de sa sonde vidéo, sans rapport avec le décodage. Tester
idéalement les 8 masques (`--count 8`), pas seulement un.

Après tout changement de `RenderOpts` ou des options CLI, lancer aussi :

```bash
npm run typecheck
```

## Commandes utiles

```bash
npm run vendor      # régénère src/generated/qrcodegen.ts
npm run typecheck   # tsc --noEmit
npx tsx src/cli.ts --url "https://collecti-frog.fr"   # génération de base
```
