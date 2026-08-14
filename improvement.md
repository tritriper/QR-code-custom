# Pistes d'amélioration

Idées écartées volontairement à un moment donné, à reprendre si le besoin se
confirme. Ce n'est pas une liste de tâches : rien ici n'est promis.

## Accepter d'autres formats de logo que le SVG

Aujourd'hui seul le `.svg` est accepté, côté CLI comme côté web, et l'app le
dit explicitement à l'utilisateur (« Format SVG uniquement »). C'est une vraie
limite : la plupart des logos circulent en PNG.

La raison est technique : `render.ts` recopie le *contenu* du SVG source dans
le SVG produit (voir `resolveOverlay`/`overlayGroup`), ce qui suppose des
tracés vectoriels.

Les deux styles ne sont pas logés à la même enseigne :

- **Logo au centre** : faisable sans grande difficulté. Le logo est simplement
  posé sur la pastille claire ; un `<image href="data:image/png;base64,…"/>`
  cadré sur la même boîte ferait l'affaire. Perd `--center-logo-color`
  (impossible de recolorer un raster) et alourdit le fichier produit.
- **Logo intégré** : nettement plus délicat. Le masque `#art` a besoin des
  tracés pour laisser passer les points clairs à l'intérieur du dessin
  (« repercage »). Avec un raster il faudrait passer par un masque de
  luminance, dont le rendu dépend de la qualité et de la transparence de
  l'image — à tester à l'œil, pas seulement au décodage.

À faire ensemble si c'est fait : accepter un format côté web sans l'accepter
côté CLI créerait deux outils qui ne produisent pas la même chose.

## Exporter en PNG depuis l'app web

L'app ne propose que le téléchargement du SVG, comme le CLI. Un export PNG
(canvas + `drawImage` d'un blob SVG + `toBlob`) tiendrait en une quinzaine de
lignes et éviterait le détour par un convertisseur en ligne, que le README
recommande aujourd'hui.

Points à traiter avant de le faire : choisir la résolution (une taille fixe ?
un curseur ?), et vérifier le rendu des logos avec un `<mask>` une fois
rastérisé par le navigateur — c'est le point le plus incertain.
