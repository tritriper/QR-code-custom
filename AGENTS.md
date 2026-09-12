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

L'outil a deux entrées qui doivent produire exactement la même chose : un CLI
et une application web statique (hébergée sur GitHub Pages).

Contraintes qui restent valables pour tout ajout futur :
- TypeScript strict, types explicites, jamais de `any`.
- `src/render.ts` et `src/qr.ts` : uniquement des fonctions pures. Aucune E/S,
  aucun accès au système de fichiers, aucun `console`, aucun DOM.
- `src/cli.ts` et `web/main.ts` : les deux seuls endroits avec des effets de
  bord, chacun pour son environnement. Rien de partageable ne doit y rester —
  ça part dans `src/qr.ts`.
- Commentaires en français, uniquement quand le *pourquoi* n'est pas évident
  (jamais pour redire ce que le code dit déjà).
- Aucune dépendance runtime. `tsx` pour exécuter, `esbuild` pour bundler le
  web, `typescript`/`@types/node` pour `npm run typecheck`.
- Le SVG produit doit rester indenté et lisible : il est prévu pour être
  retouché à la main.
- Aucune fonctionnalité qui ne serait disponible que d'un côté : ajouter une
  option au CLI sans l'exposer dans l'app web (ou l'inverse) donnerait deux
  outils différents. Le tableau des options du README fait foi pour les deux.

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
| `src/qr.ts` | Encodage d'un masque, parsing d'un SVG source, `--upper`. Fonctions pures, partagées par les deux entrées. |
| `src/cli.ts` | Entrée terminal : arguments, lecture/écriture de fichiers, `console`. |
| `web/main.ts` | Entrée navigateur : DOM, fichier déposé, téléchargement. |
| `web/index.html`, `web/style.css` | Structure et habillage de l'app web. |
| `vendor/qrcodegen/` | Submodule, intact. |
| `src/generated/` | Généré par `npm run vendor`, gitignoré. |
| `site/` | Sortie de `npm run build:web`, gitignorée. Jamais commitée. |
| `art/` | Fichiers `.svg` des logos (charte Collecti'FROG). |

### Séparation encodage / rendu

`buildVariant()` encode **un seul** masque et n'en retourne que la matrice ;
`renderVariant()` en construit le SVG. Les deux restent séparés parce qu'ils
ne dépendent pas des mêmes entrées : l'encodage ne dépend que du texte, du
masque et de la densité, le rendu de tout `RenderOpts`. C'est aussi le rendu
qui coûte cher, le logo source y étant recopié jusqu'à 3 fois dans la chaîne
produite.

**Il n'y a jamais 8 variantes construites, ni de classement.** Une version
précédente encodait les 8 masques, comptait pour chacun les modules sombres
recouverts par les overlays et les classait du plus lisible au moins lisible.
Retiré à la demande : un seul masque est encodé, celui affiché, et
« Régénérer » (`--mask` en CLI) passe au suivant en bouclant. Les 8 masques
sont des dessins également valides du même contenu — le classement était un
confort, pas une condition de lisibilité. `countDarkModulesUnderArtwork()`,
qui ne servait qu'à ce classement, a été supprimé de `render.ts` avec lui ; ne
pas le réintroduire sans réintroduire aussi ce qui s'en servait.

### Ordre de composition du SVG (`renderQrSvg`)

L'ordre est documenté en commentaire dans le code et **significatif** :
chaque couche recouvre les précédentes.

1. `<rect>` de fond clair, marge silencieuse comprise
2. tous les modules sombres, sauf ceux des 3 motifs de détection
3. les 3 motifs de détection stylisés (contour + pastille, formes et couleurs
   réglables via `finderShape` / `finderPupilShape` / `finderColor` /
   `finderPupilColor`)
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

**Calibration empirique** (avant de durcir `--center-logo-scale`) : testé de
20 % à 40 % sur `art/Circle Logo.svg`, sur un QR court (v3) et un QR plus
long (v8, URL avec query string), sur les 8 masques à chaque fois — tout
décode encore à 40 %. La marge de manœuvre est donc plus confortable que le
plafond choisi ; le plafond à 40 %/avertissement à 30 % reste volontairement
prudent (un futur logo plus dense en encre que ce badge, ou un texte moins
tolérant aux erreurs, pourrait se comporter moins bien). Si ce plafond est
révisé, retester avec le même protocole plutôt que de se fier à ce résultat
qui ne vaut que pour cet essai précis.

### Choix du masque et de la densité

`cli.ts` encode un seul symbole via
`QrCode.encodeSegments(segs, ecl, density, 40, mask, true)` et écrit un seul
fichier, `qr-mask{N}.svg`. `--mask` (0 à 7, défaut 0) choisit le dessin ; le
résumé du terminal rappelle la valeur suivante à essayer, comme le bouton
« Régénérer » de l'app web. Le niveau de correction d'erreur est toujours
`Ecc.HIGH`, en dur ; la version minimale vient de `--density`, bornée par
`MIN_DENSITY`/`MAX_DENSITY` dans `qr.ts`. C'est un plancher : un texte long
donne une version plus élevée que celle demandée, et la grille réellement
obtenue est celle affichée dans le résumé du CLI comme sous l'aperçu de
l'app.

## Options CLI actuelles

Voir le tableau du [README.md](README.md#personnaliser-le-rendu) pour la
description utilisateur. Côté code, chaque flag CLI (`kebab-case`) alimente un
champ de `RenderOpts` (`camelCase`) dans `main()`, et son contrôle de l'app web
fait de même dans `renderOpts()` — les trois doivent rester synchronisés si
l'un d'eux change.

**`--spacing` a existé et a été retiré.** Il alimentait `modulePx`, le pas de
la grille : comme c'est l'unité de base de toute la géométrie, le faire varier
redimensionnait le SVG entier (positions, finders, marge silencieuse) au lieu
de n'écarter que les points. Résultat, une fois l'aperçu ramené à une largeur
fixe — et maintenant que `--size` règle la taille du fichier séparément — il
ne restait de lui que son rapport à `--dot-size`, c'est-à-dire la grosseur
apparente des points, doublon exact de `--dot-size`. `modulePx` est donc figé
à 10 dans `DEFAULT_RENDER_OPTS`, comme `quietZone`, et seul `--dot-size`
(diamètre d'un point, sur cette grille au pas de 10) est exposé. Ne pas
réexposer `modulePx` : tout rendu atteignable par un couple
(`modulePx`, `dotPx`) l'est déjà par `dotPx` seul à `--size` égal.

La taille du fichier produit est un réglage à part, `--size` → `outputPx`, qui
ne touche qu'aux attributs `width`/`height` du `<svg>` sans rien changer au
`viewBox` ni à la géométrie.

Le **SVG est le seul format de logo accepté**, des deux côtés. Ce n'est pas un
oubli : voir [improvement.md](improvement.md) pour ce que coûterait le
support du raster, style par style.

## Décisions historiques (pour éviter de refaire les mêmes essais)

- **Formes des motifs de détection** : une forme n'est pas un nom de plus dans
  un `switch` de dessins, c'est un quadruplet de rayons d'arrondi (`Radii`,
  dans le sens horaire à partir du coin haut-gauche). `finderMark()` en tire
  un `<rect rx>` si les 4 coins sont identiques, un `<path>` sinon — le `rect`
  n'est pas une optimisation mais un choix de lisibilité du SVG produit.
  Ajouter une forme = une entrée dans `FINDER_SHAPES` et un `case` dans
  `baseRadii()` ; le CLI, ses messages d'erreur et les boutons de l'app web
  en découlent tout seuls. Les formes asymétriques sont tournées par
  `finders()` : le motif haut-gauche est la référence, les deux autres sont
  son quart de tour, ce qui met leur coin pointu du côté extérieur du symbole
  et préserve la symétrie du QR autour de sa diagonale.
- **Le rayon de `leaf` est calibré, pas choisi à l'œil** : ses deux coins
  arrondis s'arrêtent à 2/5 du côté. À 1/2 (le demi-cercle, l'aspect
  « feuille » le plus franc) l'arc ronge trop le contour et le rapport
  1:1:3:1:1 du motif de détection n'est plus retrouvé : testé sur les 8
  masques rastérisés à 300/400/800 px, 10 échecs de décodage sur 16 à 1/2,
  aucun à 0,45, 2/5 ou 1/3 — y compris sur une URL longue (version 8). Ne pas
  remonter ce rayon sans refaire ce test.
- **Contour rond + centre d'une autre forme : à éviter, avertissement des
  deux côtés.** Matrice complète des 25 couples de formes, 8 masques × 4
  rastérisations (300/400/500/800 px), sans overlay : 32/32 décodés partout,
  sauf le contour `circle` — `circle/square` **0/32**, `circle/rounded` 29/32,
  `circle/leaf` 28/32, `circle/extra-rounded` 30/32, `circle/circle` 32/32.
  Le contour rond est fin sur ses diagonales ; un centre anguleux y grignote
  le blanc qui les sépare et le rapport 1:1:3:1:1 disparaît. La combinaison
  n'est pas interdite (le CLI et l'app laissent faire, comme pour
  `--center-logo-scale`), elle déclenche un avertissement dupliqué dans
  `parseOptions()` et `warnings()`. Si la condition bouge, bouger les deux.
- **Formes des points (`--dot-shape`) : chaque point est dessiné seul.**
  `dot()` ne reçoit que ses coordonnées, jamais la matrice : les six formes
  exposées sont donc toutes des formes isolées. Les styles qui fusionnent les
  modules contigus (rubans « fluides », stries horizontales) demanderaient de
  passer `modules` à `dot()` — c'est le vrai coût, pas le dessin lui-même.
  Quatre des six formes (`rounded`, `extra-rounded`, `square`, `leaf`) sont
  celles des motifs de détection et réutilisent `baseRadii()` via
  `finderMark()` : c'est ce qui permet d'assortir points et coins, et ça évite
  deux tables de dessins qui dériveraient. `circle` garde volontairement sa
  balise `<circle>` plutôt qu'un `<rect rx>` équivalent — c'est la plus courte,
  et il y en a une par module sombre (plus de 2000 sur une grille dense). La
  sortie du rendu par défaut est restée **strictement identique** à celle
  d'avant l'option, vérifié par diff.
- **`diamond` n'existe que pour les points**, pas pour les coins : un motif de
  détection en losange ne présenterait plus le rapport 1:1:3:1:1 attendu par
  les lecteurs. Il est inscrit dans le carré de `dotPx`, donc il ne couvre que
  la moitié de sa surface — et non mis à l'échelle par √2 pour compenser, ce
  qui le ferait déborder sur les modules voisins dès `--dot-size` élevé. D'où
  un avertissement sous `--dot-size 5`, dupliqué dans `parseOptions()` et
  `warnings()` comme les autres.
- **Calibration des formes de points** : 6 formes × 8 masques × 4
  rastérisations (300/400/500/800 px), `rsvg-convert` + `zbarimg`. Tout décode
  (32/32 par forme) sur : le défaut avec logo intégré, `--dot-size 9`,
  `--dot-size 4`, une URL longue (version 8) et le logo central à 40 %. Le seul
  décrochage est à **points fins** : à `--dot-size 3`, `circle` tombe à 23/32,
  `diamond` à 21/32, `leaf` à 27/32 — mais `circle` est la forme historique et
  se comportait déjà ainsi, ce n'est donc pas propre aux nouvelles formes ;
  c'est `--dot-size 3` qui est fragile en soi, toutes formes confondues.
  `diamond` seul décroche encore à `--dot-size 4` (24/32, tous les échecs à
  300 px) et passe à 32/32 dès 4,5–5.
- **`dotPreviewSvg()` vit dans `render.ts`**, pour la même raison que
  `finderPreviewSvg()` : les vignettes de l'app web sont dessinées par
  `dotMark()`, la fonction qui dessine réellement les points du QR. Elle
  affiche **deux points en diagonale sur 2 modules**, à 0,82 module — plus gros
  que le défaut, parce que c'est la forme qui se juge sur une vignette, pas la
  taille —, dans un carré de 30 px (`DOT_PREVIEW_PX` dans `web/main.ts`) et non
  22 comme les coins (`SHAPE_PREVIEW_PX`) : un coin est un dessin unique qui
  remplit sa vignette, un point n'en occupe qu'une fraction.
  Ces valeurs viennent d'un essai à l'œil sur maquette, pas d'un choix
  arbitraire : un quinconce de 5 points, à 22 px puis à 30 px, ne laissait pas
  distinguer `rounded` de `extra-rounded`, dont les rayons ne diffèrent que
  d'un quinzième de côté. Un point unique (essayé aussi) rend les formes encore
  plus nettes mais fait ressembler la vignette à une pastille de couleur ; le
  damier de deux points est le compromis retenu. Si une forme s'ajoute un jour,
  revérifier qu'elle se distingue à cette taille avant de l'exposer.
- **`finderPreviewSvg()` vit dans `render.ts`** alors qu'il ne sert qu'à
  l'app web : c'est ce qui garantit que les vignettes des boutons de forme
  sont dessinées par le même code que le QR (même géométrie sur 7 modules),
  et non redessinées à la main en HTML où elles dériveraient au premier
  changement. La fonction reste pure ; `web/main.ts` construit les deux
  groupes de boutons radio à partir de `FINDER_SHAPES`, `index.html` ne
  contient que les conteneurs vides.
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
idéalement les 8 masques (boucle sur `--mask 0` à `--mask 7`), pas seulement
un.

Après tout changement de `RenderOpts` ou des options CLI, lancer aussi :

```bash
npm run typecheck
```

## L'application web

Vanilla TS + DOM, bundlé par esbuild en un seul fichier (~22 ko). Pas de
framework, pas de dépendance runtime, aucun appel réseau une fois la page
chargée : tout tourne côté client, le logo de l'utilisateur ne part nulle
part.

- **L'état de l'interface n'est pas dupliqué** dans une structure à part : il
  est relu depuis les contrôles du formulaire à chaque rendu (`renderOpts()`).
  Seuls le logo déposé et la variante affichée, qui ne correspondent à aucun
  champ, vivent en variables de module. Ne pas introduire de store : il n'y a
  rien à synchroniser.
- **Un seul masque est encodé et rendu**, celui de la variable de module
  `mask` ; « Régénérer » avance d'un cran et reboucle après le 7. Rien
  d'autre n'est calculé en coulisses (voir *Séparation encodage / rendu*).
- **Les deux overlays deviennent un choix à trois positions** (`logo intégré`
  / `logo au centre` / `sans logo`). Le CLI permet de les cumuler, l'app non :
  c'est visuellement chargé et ça n'a jamais servi. Les réglages sans objet
  dans le style choisi sont masqués via `[data-modes]` sur l'élément et
  `showRows()`.
- **Les avertissements sont dupliqués** entre `parseOptions()` (CLI) et
  `warnings()` (web), seuils compris. Volontaire : ce sont des textes destinés
  à deux publics différents. Si un seuil bouge, les deux doivent bouger.
  Conséquence assumée : le défaut « logo intégré à 140 % » affiche un
  avertissement dès l'ouverture de la page, exactement comme le CLI avec ses
  propres défauts.
- **Un jeton de rendu** (`renderToken`) empêche qu'un rendu lancé avant un
  autre écrase son résultat au retour du `await` de chargement du logo.
- **Chemins relatifs obligatoires** dans `index.html` et dans les `fetch()` :
  le site est servi sous `https://tritriper.github.io/QR-code-custom/`, un
  chemin absolu (`/app.js`) pointerait à la racine du domaine.

### Déploiement

`.github/workflows/pages.yml` construit et publie à chaque push sur `main`.
Rien de généré n'est commité. Deux choses à savoir :

- `actions/checkout` doit avoir `submodules: recursive`, sinon `npm run
  vendor` produit un fichier vide (voir le piège plus haut) ;
- côté dépôt, *Settings → Pages → Source* doit être réglé sur **GitHub
  Actions**, pas sur « Deploy from a branch ». C'est le seul réglage manuel.

## Vérifier l'app web

Il n'y a pas de framework de test dans le projet (aucune dépendance de test à
installer, c'est délibéré). Les vérifications faites lors du développement,
à refaire de la même façon si l'app change sérieusement :

1. `npm run dev:web`, puis à l'œil : rendu neumorphism, bascule entre les
   trois styles, dépôt d'un logo, bouton « Régénérer » (il boucle sur les 8
   masques), curseur de densité, formes et couleurs des 3 coins — dont les
   deux rangées de vignettes de forme (contour, puis centre une fois la case
   « même forme » décochée : les vignettes du centre se redessinent alors avec
   le contour choisi).
2. Le protocole de décodage ci-dessus, mais sur des SVG **exportés depuis
   l'app** plutôt que depuis le CLI — c'est le même `render.ts`, mais les
   options y arrivent par un autre chemin.

## Commandes utiles

```bash
npm run vendor      # régénère src/generated/qrcodegen.ts
npm run typecheck   # tsc --noEmit, couvre src/ et web/
npm run dev:web     # app web en local (surveille main.ts ; relancer après
                    # une modification de index.html ou style.css)
npm run build:web   # produit site/, ce que GitHub Pages sert
npx tsx src/cli.ts --url "https://collecti-frog.fr"   # génération de base
```
