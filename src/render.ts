/*
 * Rendu SVG d'une matrice QR stylisée « logo intégré » pour Collecti'FROG.
 * Fonctions pures uniquement : aucune E/S, aucun accès au système de fichiers.
 */

/**
 * Formes disponibles pour les 3 motifs de détection. `leaf` est asymétrique :
 * son coin pointu est orienté par `finders()`, les autres sont invariantes
 * par rotation.
 */
export const FINDER_SHAPES = ["square", "rounded", "extra-rounded", "circle", "leaf"] as const;

/** Forme d'un motif de détection : son contour et son centre en ont une chacun. */
export type FinderShape = (typeof FINDER_SHAPES)[number];

/**
 * Formes dessinées module par module, chacune sans regarder ses voisines.
 * Quatre d'entre elles sont celles des motifs de détection, au même nom et au
 * même dessin (`baseRadii()`) : c'est ce qui permet d'assortir points et
 * coins. `diamond` n'existe que pour les points — un motif de détection en
 * losange ne respecterait plus le rapport 1:1:3:1:1 attendu par les lecteurs.
 */
const ISOLATED_DOT_SHAPES = ["circle", "rounded", "extra-rounded", "square", "leaf", "diamond"] as const;

/**
 * Formes qui soudent les modules contigus. Contrairement aux précédentes,
 * elles ont besoin de connaître le voisinage de chaque module — d'où la grille
 * `Drawn` passée à `dotMarks()`. Toutes deux gardent `dotPx` comme épaisseur :
 * à 10 (le pas de la grille) elles sont pleines, en dessous elles donnent un
 * chapelet de points reliés.
 */
const CONNECTED_DOT_SHAPES = ["bars", "connected"] as const;

export const DOT_SHAPES = [...ISOLATED_DOT_SHAPES, ...CONNECTED_DOT_SHAPES] as const;

/** Forme d'un point du QR, motifs de détection exclus. */
export type DotShape = (typeof DOT_SHAPES)[number];

/** Forme dessinée module par module, sans regarder les voisins. */
type IsolatedDotShape = (typeof ISOLATED_DOT_SHAPES)[number];

/**
 * Quels modules sont réellement dessinés dans un groupe donné. Les formes
 * connectées doivent souder d'après cette grille et non d'après la matrice
 * brute : un module sombre sauté (motif de détection, réserve du logo central)
 * ne doit pas servir de voisin, sans quoi un trait déborderait dans une zone
 * censée rester vide.
 */
type Drawn = readonly (readonly boolean[])[];

/**
 * Forme de coin qui va avec chaque forme de point, pour la case « Coins
 * assortis aux points » de l'app web.
 *
 * Vit ici et non dans `web/main.ts` parce que c'est une correspondance entre
 * deux listes de `render.ts`, et parce que trois formes de points n'ont pas
 * d'équivalent exact côté coins — un motif de détection doit garder le rapport
 * 1:1:3:1:1 que les lecteurs y cherchent :
 *
 * - `diamond` → `square` : un losange est un carré tourné, c'est la forme
 *   anguleuse la plus proche ;
 * - `bars` → `rounded` : les capsules ont des bouts arrondis ;
 * - `connected` → `extra-rounded`, l'arrondi le plus franc qui reste sûr.
 */
const MATCHING_FINDER: Record<DotShape, FinderShape> = {
  circle: "circle",
  rounded: "rounded",
  "extra-rounded": "extra-rounded",
  square: "square",
  leaf: "leaf",
  diamond: "square",
  bars: "rounded",
  connected: "extra-rounded",
};

export function matchingFinderShape(shape: DotShape): FinderShape {
  return MATCHING_FINDER[shape];
}

export interface RenderOpts {
  darkColor: string;
  lightColor: string;
  /**
   * Pas de la grille, en px : l'unité de base de toute la géométrie. Fixé une
   * fois pour toutes dans `DEFAULT_RENDER_OPTS` et non exposé, comme
   * `quietZone` — seul son rapport avec `dotPx` se voit à l'écran, et la
   * taille du fichier se règle par `outputPx`.
   */
  modulePx: number;
  /**
   * Côté du SVG produit, en px. Ne change que les attributs `width`/`height` :
   * la géométrie interne reste celle de la grille (le `viewBox`), le SVG étant
   * vectoriel. C'est donc la taille à laquelle le fichier s'affiche par défaut
   * une fois importé ailleurs, pas une résolution.
   */
  outputPx: number;
  /** Marge silencieuse, en modules. Le standard QR en exige 4 au minimum. */
  quietZone: number;
  /** Diamètre d'un point, en px. Pour les formes anguleuses, le côté de son carré englobant. */
  dotPx: number;
  /** Forme des points, motifs de détection exclus (ils ont la leur). */
  dotShape: DotShape;
  /** Forme du contour des 3 motifs de détection. */
  finderShape: FinderShape;
  /** Forme du centre des 3 motifs de détection. Par défaut, celle du contour. */
  finderPupilShape?: FinderShape;
  /** Couleur du contour des motifs de détection. Par défaut, celle des points. */
  finderColor?: string;
  /** Couleur du centre des motifs de détection. Par défaut, celle du contour. */
  finderPupilColor?: string;
  /** Part du côté de la zone de données occupée par le plus grand côté de l'illustration. */
  artworkScale: number;
  /** Couleur de l'illustration. Par défaut, celle des modules. */
  artworkColor?: string;
  /** Épaississement du trait de l'illustration, en px. 0 laisse le trait d'origine. */
  artworkThickenPx: number;
  /** Contenu interne du SVG source (tout ce qui est entre <svg> et </svg>). */
  artworkContent?: string;
  /** viewBox du SVG source, au format "minX minY width height". */
  artworkViewBox?: string;
  /**
   * Part du côté de la zone de données occupée par le logo central. À la
   * différence de `--art`, ce logo efface réellement les modules sous lui
   * (voir `centerLogoMarginPx`) : contrairement à l'illustration `--art`, ce
   * n'est pas sans risque, d'où un plafond conseillé autour de 30 %.
   */
  centerLogoScale: number;
  /** Couleur du logo central. Par défaut, ses couleurs d'origine sont conservées. */
  centerLogoColor?: string;
  /** Marge claire entre le logo central et les modules autour, en px. */
  centerLogoMarginPx: number;
  /** Contenu interne du SVG source du logo central. */
  centerLogoContent?: string;
  /** viewBox du SVG source du logo central. */
  centerLogoViewBox?: string;
}

export const DEFAULT_RENDER_OPTS: RenderOpts = {
  darkColor: "#000000",
  lightColor: "#ffffff",
  modulePx: 10,
  outputPx: 1024,
  quietZone: 1,
  dotPx: 5,
  dotShape: "circle",
  finderShape: "rounded",
  artworkScale: 1.4,
  artworkThickenPx: 1,
  centerLogoScale: 0.40,
  centerLogoMarginPx: 0,
};

/**
 * Préréglages d'apparence : le point d'entrée principal des deux interfaces.
 * Chacun n'est qu'un paquet de valeurs de `RenderOpts`, appliqué par-dessus
 * `DEFAULT_RENDER_OPTS` et sous les réglages explicites de l'utilisateur.
 *
 * **Volontairement géométriques.** Aucun ne fixe de couleur, alors que
 * certains y inviteraient (« Feuille » et le vert de la charte). La raison est
 * une règle d'interface : changer de style ne doit jamais écraser une couleur
 * qu'on vient de choisir. Les couleurs restent donc réglées à part, des deux
 * côtés.
 *
 * Ils ne couvrent pas non plus le logo (`artwork*`, `centerLogo*`) : le style
 * du logo est un choix à trois positions dans l'app web, indépendant de
 * l'apparence des points, et le mélanger ici ferait qu'un clic sur un
 * préréglage changerait le logo affiché.
 */
export const PRESETS = {
  classique: { dotShape: "square", finderShape: "square", dotPx: 10 },
  rond: { dotShape: "circle", finderShape: "rounded", dotPx: 5 },
  feuille: { dotShape: "leaf", finderShape: "leaf", dotPx: 8 },
  fluide: { dotShape: "connected", finderShape: "extra-rounded", dotPx: 9 },
  stries: { dotShape: "bars", finderShape: "rounded", dotPx: 6 },
  // Points fins, mais pas autant que le nom y inviterait : mesuré, des points
  // à 3,5 ne décodent plus que 20 fois sur 32, et un contour de coin rond
  // aggrave encore (24/32 même à 4). D'où des coins arrondis et des points à
  // 4, la combinaison la plus aérée qui passe partout.
  minimal: { dotShape: "circle", finderShape: "rounded", dotPx: 4 },
} as const satisfies Record<string, Partial<RenderOpts>>;

/** Nom d'un préréglage d'apparence. */
export type PresetName = keyof typeof PRESETS;

export const PRESET_NAMES = Object.keys(PRESETS) as readonly PresetName[];

/** Géométrie dérivée, en pixels utilisateur SVG. */
interface Layout {
  /** Côté de la matrice, en modules. */
  size: number;
  /** Côté total du SVG, marge silencieuse comprise. */
  sidePx: number;
  /** Coin haut-gauche de la zone de données (donc hors marge silencieuse). */
  dataOriginPx: number;
  /** Côté de la zone de données. */
  dataSidePx: number;
}

/** Une illustration résolue : contenu brut, transformation de cadrage et boîte englobante. */
interface Overlay {
  content: string;
  transform: string;
  boxPx: Box;
  /** Facteur d'échelle appliqué, pour convertir des épaisseurs en px vers les unités source. */
  scale: number;
}

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Zone claire circulaire qui efface les modules sous le logo central. */
interface Reserve {
  cx: number;
  cy: number;
  r: number;
}

const INDENT = "  ";

/**
 * Rend la matrice en SVG. `modules[y][x] === true` signifie module sombre,
 * l'origine (0, 0) étant le coin haut-gauche.
 */
export function renderQrSvg(modules: boolean[][], opts: RenderOpts): string {
  const layout = computeLayout(modules.length, opts);
  const artwork = resolveArtwork(layout, opts);
  const centerLogo = resolveCenterLogo(layout, opts);
  const reserve = centerLogo === null ? null : reserveOf(centerLogo, opts);

  const lines: string[] = [];
  lines.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${num(opts.outputPx)}" height="${num(opts.outputPx)}" viewBox="0 0 ${num(layout.sidePx)} ${num(layout.sidePx)}">`,
  );
  // L'ordre de composition ci-dessous est significatif : chaque couche recouvre les précédentes.
  if (artwork !== null) push(lines, maskDefs(layout, artwork, opts));
  push(lines, background(layout, opts));
  push(lines, darkModules(modules, layout, opts, reserve));
  push(lines, finders(layout, opts));
  if (artwork !== null) {
    push(lines, overlayGroup(artwork, opts.artworkColor ?? opts.darkColor, "art-", opts.artworkThickenPx));
    push(lines, lightModules(modules, layout, opts));
  }
  if (centerLogo !== null && reserve !== null) {
    push(lines, centerLogoReserve(reserve, opts));
    push(lines, overlayGroup(centerLogo, opts.centerLogoColor, "center-", 0));
  }
  lines.push(`</svg>`);
  return lines.join("\n") + "\n";
}

/*---- Géométrie ----*/

function computeLayout(size: number, opts: RenderOpts): Layout {
  return {
    size,
    sidePx: (size + 2 * opts.quietZone) * opts.modulePx,
    dataOriginPx: opts.quietZone * opts.modulePx,
    dataSidePx: size * opts.modulePx,
  };
}

/** Centre d'un module sur un axe, en pixels. */
function centerPx(index: number, layout: Layout, opts: RenderOpts): number {
  return layout.dataOriginPx + (index + 0.5) * opts.modulePx;
}

/** Les 3 motifs de détection occupent des carrés 7x7 dans trois coins sur quatre. */
function isFinderModule(x: number, y: number, size: number): boolean {
  return finderOrigins(size).some(([fx, fy]) => x >= fx && x < fx + 7 && y >= fy && y < fy + 7);
}

function finderOrigins(size: number): Array<[number, number]> {
  return [
    [0, 0],
    [size - 7, 0],
    [0, size - 7],
  ];
}

function parseViewBox(viewBox: string): Box {
  const parts = viewBox.trim().split(/[\s,]+/).map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) {
    throw new Error(`viewBox invalide : "${viewBox}"`);
  }
  return { x: parts[0], y: parts[1], width: parts[2], height: parts[3] };
}

/** Met une illustration à l'échelle et la centre sur la zone de données. */
function resolveOverlay(layout: Layout, content: string, viewBox: string, scaleRatio: number): Overlay {
  const source = parseViewBox(viewBox);
  const scale = (layout.dataSidePx * scaleRatio) / Math.max(source.width, source.height);
  const width = source.width * scale;
  const height = source.height * scale;
  const x = layout.dataOriginPx + (layout.dataSidePx - width) / 2;
  const y = layout.dataOriginPx + (layout.dataSidePx - height) / 2;

  return {
    content,
    // Le décalage compense l'origine du viewBox source, qui n'est pas forcément (0, 0).
    transform: `translate(${num(x - source.x * scale)} ${num(y - source.y * scale)}) scale(${num(scale)})`,
    boxPx: { x, y, width, height },
    scale,
  };
}

function resolveArtwork(layout: Layout, opts: RenderOpts): Overlay | null {
  if (opts.artworkContent === undefined || opts.artworkViewBox === undefined) return null;
  return resolveOverlay(layout, opts.artworkContent, opts.artworkViewBox, opts.artworkScale);
}

function resolveCenterLogo(layout: Layout, opts: RenderOpts): Overlay | null {
  if (opts.centerLogoContent === undefined || opts.centerLogoViewBox === undefined) return null;
  return resolveOverlay(layout, opts.centerLogoContent, opts.centerLogoViewBox, opts.centerLogoScale);
}

/** Cercle couvrant le logo central plus sa marge, centré sur sa boîte englobante. */
function reserveOf(centerLogo: Overlay, opts: RenderOpts): Reserve {
  const { boxPx } = centerLogo;
  return {
    cx: boxPx.x + boxPx.width / 2,
    cy: boxPx.y + boxPx.height / 2,
    r: Math.max(boxPx.width, boxPx.height) / 2 + opts.centerLogoMarginPx,
  };
}

function insideReserve(x: number, y: number, reserve: Reserve): boolean {
  return Math.hypot(x - reserve.cx, y - reserve.cy) <= reserve.r;
}

/*---- Fragments SVG ----*/

function background(layout: Layout, opts: RenderOpts): string[] {
  return [
    `<rect x="0" y="0" width="${num(layout.sidePx)}" height="${num(layout.sidePx)}" fill="${opts.lightColor}"/>`,
  ];
}

function darkModules(modules: boolean[][], layout: Layout, opts: RenderOpts, reserve: Reserve | null): string[] {
  const drawn = drawnGrid(layout.size, (x, y) => {
    if (!modules[y][x] || isFinderModule(x, y, layout.size)) return false;
    // Le logo central efface réellement les modules dessous, pas seulement
    // à l'écran : inutile de les dessiner.
    return reserve === null || !insideReserve(centerPx(x, layout, opts), centerPx(y, layout, opts), reserve);
  });
  return group(`<g fill="${opts.darkColor}">`, dotMarks(drawn, layout, opts));
}

function lightModules(modules: boolean[][], layout: Layout, opts: RenderOpts): string[] {
  const drawn = drawnGrid(layout.size, (x, y) => !modules[y][x]);
  // Le masque ne laisse passer ces points qu'à l'intérieur des traits de
  // l'illustration : ailleurs ils seraient clairs sur clair, donc inutiles.
  return group(`<g fill="${opts.lightColor}" mask="url(#art)">`, dotMarks(drawn, layout, opts));
}

function drawnGrid(size: number, keep: (x: number, y: number) => boolean): Drawn {
  return Array.from({ length: size }, (_row, y) => Array.from({ length: size }, (_cell, x) => keep(x, y)));
}

/** Vrai si le module existe et fait partie du groupe dessiné. */
function at(drawn: Drawn, x: number, y: number): boolean {
  return drawn[y]?.[x] === true;
}

/** Tous les tracés d'un groupe de modules, dans la forme demandée. */
function dotMarks(drawn: Drawn, layout: Layout, opts: RenderOpts): string[] {
  switch (opts.dotShape) {
    case "bars":
      return barMarks(drawn, layout, opts);
    case "connected":
      return connectedMarks(drawn, layout, opts);
    default:
      return isolatedMarks(drawn, layout, opts, opts.dotShape);
  }
}

function isolatedMarks(drawn: Drawn, layout: Layout, opts: RenderOpts, shape: IsolatedDotShape): string[] {
  const marks: string[] = [];
  for (let y = 0; y < layout.size; y++) {
    for (let x = 0; x < layout.size; x++) {
      if (!at(drawn, x, y)) continue;
      marks.push(dotMark(centerPx(x, layout, opts), centerPx(y, layout, opts), opts.dotPx, shape));
    }
  }
  return marks;
}

/**
 * Chaque suite horizontale de modules devient une capsule unique. Émettre la
 * suite d'un coup plutôt qu'un tracé par module garde le SVG court et lisible
 * à la main, ce que le projet exige — et c'est aussi ce qui donne des bouts
 * franchement arrondis plutôt qu'une succession de bosses.
 */
function barMarks(drawn: Drawn, layout: Layout, opts: RenderOpts): string[] {
  const marks: string[] = [];
  for (let y = 0; y < layout.size; y++) {
    let start = -1;
    for (let x = 0; x <= layout.size; x++) {
      if (at(drawn, x, y)) {
        if (start === -1) start = x;
        continue;
      }
      if (start === -1) continue;
      marks.push(capsule(start, x - 1, y, layout, opts));
      start = -1;
    }
  }
  return marks;
}

/** Capsule couvrant les modules `from` à `to` de la ligne `y`, épaisse de `dotPx`. */
function capsule(from: number, to: number, y: number, layout: Layout, opts: RenderOpts): string {
  const half = opts.dotPx / 2;
  const left = centerPx(from, layout, opts) - half;
  const width = centerPx(to, layout, opts) + half - left;
  return `<rect x="${num(left)}" y="${num(centerPx(y, layout, opts) - half)}" width="${num(width)}" height="${num(opts.dotPx)}" rx="${num(half)}"/>`;
}

/**
 * Un point rond par module, plus un trait vers son voisin de droite et vers
 * celui du dessous. Les traits ne sont émis qu'une fois par paire (jamais vers
 * la gauche ni vers le haut), et se chevauchent volontairement avec les points
 * qu'ils relient : c'est ce recouvrement qui soude le tout sans jointure
 * visible, là où des segments bout à bout laisseraient une arête.
 */
function connectedMarks(drawn: Drawn, layout: Layout, opts: RenderOpts): string[] {
  const marks: string[] = [];
  const half = opts.dotPx / 2;
  for (let y = 0; y < layout.size; y++) {
    for (let x = 0; x < layout.size; x++) {
      if (!at(drawn, x, y)) continue;
      const cx = centerPx(x, layout, opts);
      const cy = centerPx(y, layout, opts);
      marks.push(dotMark(cx, cy, opts.dotPx, "circle"));
      if (at(drawn, x + 1, y)) {
        marks.push(
          `<rect x="${num(cx)}" y="${num(cy - half)}" width="${num(opts.modulePx)}" height="${num(opts.dotPx)}"/>`,
        );
      }
      if (at(drawn, x, y + 1)) {
        marks.push(
          `<rect x="${num(cx - half)}" y="${num(cy)}" width="${num(opts.dotPx)}" height="${num(opts.modulePx)}"/>`,
        );
      }
    }
  }
  return marks;
}

/** Un point de la forme demandée, centré sur (cx, cy) et inscrit dans un carré de `side`. */
function dotMark(cx: number, cy: number, side: number, shape: IsolatedDotShape): string {
  const half = side / 2;
  switch (shape) {
    case "circle":
      // Gardé comme `<circle>` plutôt que comme un `<rect rx>` de rayon
      // maximal, pourtant équivalent : c'est la balise la plus courte, et il y
      // en a une par module sombre (plus de 2000 sur une grille dense).
      return `<circle cx="${num(cx)}" cy="${num(cy)}" r="${num(half)}"/>`;
    case "diamond":
      // Carré tourné d'un quart de tour, inscrit dans le même carré englobant :
      // ses sommets touchent le milieu des côtés. Il paraît donc plus léger que
      // les autres formes à `dotPx` égal, ce que le README signale.
      return `<path d="M${num(cx)} ${num(cy - half)} L${num(cx + half)} ${num(cy)} L${num(cx)} ${num(cy + half)} L${num(cx - half)} ${num(cy)} Z"/>`;
    default:
      // Les formes restantes sont celles des motifs de détection, au même
      // dessin : `finderMark()` choisit seul entre `<rect rx>` et `<path>`.
      return finderMark(cx - half, cy - half, side, radiiOf(shape, 0));
  }
}

function finders(layout: Layout, opts: RenderOpts): string[] {
  const px = opts.modulePx;
  const ringColor = opts.finderColor ?? opts.darkColor;
  const pupilShape = opts.finderPupilShape ?? opts.finderShape;
  const rings: string[] = [];
  const pupils: string[] = [];

  finderOrigins(layout.size).forEach(([fx, fy], index) => {
    const originX = layout.dataOriginPx + fx * px;
    const originY = layout.dataOriginPx + fy * px;
    // Les formes asymétriques sont tournées pour que leur coin pointu tombe
    // du côté extérieur du symbole. Le motif haut-gauche sert de référence ;
    // les deux autres sont son quart de tour, ce qui préserve la symétrie du
    // symbole autour de sa diagonale.
    const turns = index === 0 ? 0 : 1;
    // Le contour fait 1 module d'épaisseur : la forme suit sa ligne médiane,
    // d'où un demi-module de retrait sur chaque bord et un côté de 6 modules.
    rings.push(finderMark(originX + px / 2, originY + px / 2, 6 * px, radiiOf(opts.finderShape, turns)));
    pupils.push(finderMark(originX + 2 * px, originY + 2 * px, 3 * px, radiiOf(pupilShape, turns)));
  });

  return [
    ...group(`<g fill="none" stroke="${ringColor}" stroke-width="${num(px)}">`, rings),
    ...group(`<g fill="${opts.finderPupilColor ?? ringColor}">`, pupils),
  ];
}

/**
 * Rayons d'arrondi des 4 coins, en part du côté, dans le sens horaire à
 * partir du coin haut-gauche.
 */
type Radii = readonly [number, number, number, number];

function radiiOf(shape: FinderShape, quarterTurns: number): Radii {
  return rotate(baseRadii(shape), quarterTurns);
}

function baseRadii(shape: FinderShape): Radii {
  switch (shape) {
    case "square":
      return uniform(0);
    case "rounded":
      return uniform(1 / 3);
    case "extra-rounded":
      return uniform(2 / 5);
    case "circle":
      return uniform(1 / 2);
    case "leaf":
      // Un coin pointu, son opposé aussi, les deux autres arrondis. Le rayon
      // s'arrête à 2/5 et non à 1/2 (le demi-cercle) : au-delà, l'arc ronge
      // trop le contour pour que le lecteur y retrouve le rapport 1:1:3:1:1
      // du motif de détection — testé, un demi-cercle ne décode plus sur
      // plusieurs masques dès 800 px de rastérisation.
      return [0, 2 / 5, 0, 2 / 5];
  }
}

function uniform(ratio: number): Radii {
  return [ratio, ratio, ratio, ratio];
}

/** Tourne les rayons d'un quart de tour horaire, `quarterTurns` fois. */
function rotate(radii: Radii, quarterTurns: number): Radii {
  // Les coins étant listés dans le sens horaire, tourner la forme revient à
  // décaler les rayons d'autant de rangs.
  const shift = ((quarterTurns % 4) + 4) % 4;
  const at = (index: number): number => radii[(index - shift + 4) % 4];
  return [at(0), at(1), at(2), at(3)];
}

/** Le carré d'un motif de détection : un `rect` si les 4 coins sont identiques, un chemin sinon. */
function finderMark(x: number, y: number, side: number, radii: Radii): string {
  const box = `x="${num(x)}" y="${num(y)}" width="${num(side)}" height="${num(side)}"`;
  const [topLeft, topRight, bottomRight, bottomLeft] = radii;
  if (topLeft === topRight && topRight === bottomRight && bottomRight === bottomLeft) {
    return `<rect ${box} rx="${num(side * topLeft)}"/>`;
  }
  return `<path d="${markPath(x, y, side, radii)}"/>`;
}

/** Contour d'un carré à 4 rayons indépendants, parcouru dans le sens horaire. */
function markPath(x: number, y: number, side: number, radii: Radii): string {
  const [topLeft, topRight, bottomRight, bottomLeft] = radii.map((ratio) => ratio * side);
  const right = x + side;
  const bottom = y + side;
  return [
    `M${num(x + topLeft)} ${num(y)}`,
    `H${num(right - topRight)}`,
    arc(topRight, right, y + topRight),
    `V${num(bottom - bottomRight)}`,
    arc(bottomRight, right - bottomRight, bottom),
    `H${num(x + bottomLeft)}`,
    arc(bottomLeft, x, bottom - bottomLeft),
    `V${num(y + topLeft)}`,
    arc(topLeft, x + topLeft, y),
    "Z",
  ]
    .filter((part) => part !== "")
    .join(" ");
}

/** Quart de cercle horaire, ou rien du tout si le coin est pointu. */
function arc(radius: number, x: number, y: number): string {
  return radius === 0 ? "" : `A${num(radius)} ${num(radius)} 0 0 1 ${num(x)} ${num(y)}`;
}

/**
 * Un motif de détection isolé, à l'usage des aperçus de l'app web : même
 * géométrie que dans le QR (grille de 7 modules), ramenée à un carré de
 * `sidePx` de côté et peinte dans la couleur courante du texte.
 */
export function finderPreviewSvg(ring: FinderShape, pupil: FinderShape, sidePx: number): string {
  const px = sidePx / 7;
  const side = num(sidePx);
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${side}" height="${side}" viewBox="0 0 ${side} ${side}" aria-hidden="true">`,
    `${INDENT}<g fill="none" stroke="currentColor" stroke-width="${num(px)}">`,
    `${INDENT}${INDENT}${finderMark(px / 2, px / 2, 6 * px, radiiOf(ring, 0))}`,
    `${INDENT}</g>`,
    `${INDENT}<g fill="currentColor">`,
    `${INDENT}${INDENT}${finderMark(2 * px, 2 * px, 3 * px, radiiOf(pupil, 0))}`,
    `${INDENT}</g>`,
    `</svg>`,
  ].join("\n");
}

/**
 * Trames servant d'aperçu aux formes de points. Deux motifs, parce que les
 * deux familles de formes ne se jugent pas sur la même chose :
 *
 * - les formes isolées se lisent sur deux points en diagonale, qui ne se
 *   touchent pas — c'est exactement leur situation dans le QR ;
 * - les formes connectées ne montrent rien sans voisinage (sans adjacence,
 *   elles retombent sur des ronds). Leur motif est donc un escalier de deux
 *   suites de deux, qui fait apparaître à la fois une soudure horizontale et,
 *   pour `connected`, la verticale.
 *
 * Les deux tiennent dans la même vignette de 30 px. Descendre en dessous de
 * deux points sur la diagonale ne laissait plus distinguer `rounded` de
 * `extra-rounded`, dont les rayons ne diffèrent que d'un quinzième de côté ;
 * un point unique ressemblerait à une pastille de couleur plutôt qu'à des
 * points.
 */
const DOT_PREVIEW_ISOLATED = ["#.", ".#"] as const;
const DOT_PREVIEW_CONNECTED = ["##.", ".##"] as const;

/**
 * Un échantillon de points, à l'usage des aperçus de l'app web : mêmes
 * fonctions de dessin que dans le QR, sur une trame ramenée à un carré de
 * `sidePx` de côté et peinte dans la couleur courante du texte.
 *
 * Les points y sont volontairement plus gros que le défaut (0,82 module contre
 * 0,5) : c'est la forme qui se juge sur une vignette, pas la taille, réglée à
 * part par `dotPx`.
 */
export function dotPreviewSvg(shape: DotShape, sidePx: number): string {
  const rows: readonly string[] =
    shape === "bars" || shape === "connected" ? DOT_PREVIEW_CONNECTED : DOT_PREVIEW_ISOLATED;
  const cols = rows[0].length;
  const px = sidePx / cols;
  const drawn: boolean[][] = rows.map((row) => [...row].map((cell) => cell === "#"));

  // Une mise en page réduite au motif : même géométrie que le QR (pas de
  // grille `px`, points à `dotPx`), sans marge silencieuse, et centrée
  // verticalement puisque le motif connecté est plus large que haut.
  const layout: Layout = { size: cols, sidePx, dataOriginPx: 0, dataSidePx: sidePx };
  const previewOpts: RenderOpts = { ...DEFAULT_RENDER_OPTS, dotShape: shape, modulePx: px, dotPx: px * 0.82, quietZone: 0 };
  const offsetY = (sidePx - rows.length * px) / 2;
  const side = num(sidePx);

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${side}" height="${side}" viewBox="0 0 ${side} ${side}" aria-hidden="true">`,
    ...indent(group(`<g fill="currentColor" transform="translate(0 ${num(offsetY)})">`, dotMarks(drawn, layout, previewOpts)), 1),
    `</svg>`,
  ].join("\n");
}

/**
 * Vignette d'un préréglage, à l'usage de la galerie de l'app web : un vrai QR
 * miniature, produit par `renderQrSvg()` lui-même, sur une matrice fournie par
 * l'appelant.
 *
 * La matrice vient de l'extérieur parce que `render.ts` ne sait pas encoder —
 * c'est le rôle de `qr.ts`. En échange, la vignette est un rendu authentique
 * du préréglage et non un dessin à part qui dériverait au premier changement,
 * exactement comme `finderPreviewSvg()` et `dotPreviewSvg()`.
 *
 * Le fond est `none` et les modules sont peints en `currentColor` : la
 * vignette suit la couleur du libellé du bouton, muette au repos et accentuée
 * une fois sélectionnée.
 */
export function presetPreviewSvg(modules: boolean[][], preset: PresetName, sidePx: number): string {
  return renderQrSvg(modules, {
    ...DEFAULT_RENDER_OPTS,
    ...PRESETS[preset],
    outputPx: sidePx,
    quietZone: 0,
    darkColor: "currentColor",
    lightColor: "none",
  });
}

function maskDefs(layout: Layout, artwork: Overlay, opts: RenderOpts): string[] {
  const side = num(layout.sidePx);
  return [
    `<defs>`,
    // userSpaceOnUse avec des bornes explicites : sans cela le masque serait
    // exprimé en fraction de la boîte de l'élément masqué, qui varie.
    `${INDENT}<mask id="art" maskUnits="userSpaceOnUse" x="0" y="0" width="${side}" height="${side}">`,
    `${INDENT}${INDENT}<rect x="0" y="0" width="${side}" height="${side}" fill="#000000"/>`,
    ...indent(overlayGroup(artwork, "#ffffff", "mask-", opts.artworkThickenPx), 2),
    `${INDENT}</mask>`,
    `</defs>`,
  ];
}

/** Disque clair qui efface les modules sous le logo central, plus sa marge. */
function centerLogoReserve(reserve: Reserve, opts: RenderOpts): string[] {
  return [`<circle cx="${num(reserve.cx)}" cy="${num(reserve.cy)}" r="${num(reserve.r)}" fill="${opts.lightColor}"/>`];
}

/**
 * Une copie d'une illustration, cadrée et éventuellement recolorée.
 * `idPrefix` évite les identifiants dupliqués entre les différentes copies.
 * `color` recolore tous les tracés source si fourni, sinon leurs couleurs
 * d'origine sont conservées. `strokePx` épaissit le tracé en ajoutant un
 * contour de la même couleur par-dessus le remplissage existant, sans
 * toucher aux tracés qui n'ont qu'un stroke (leur propre épaisseur est
 * conservée telle quelle) ; ignoré si `color` est absent.
 */
function overlayGroup(overlay: Overlay, color: string | undefined, idPrefix: string, strokePx: number): string[] {
  const content = color === undefined ? overlay.content : recolor(overlay.content, color);
  const body = prefixIds(content, idPrefix)
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  // fill="none" reproduit la valeur par défaut portée par le <svg> source, dont
  // dépendent les tracés qui n'ont qu'un stroke.
  const attrs = [`transform="${overlay.transform}"`, `fill="none"`];
  if (strokePx > 0 && color !== undefined) {
    // Le trait est exprimé dans les unités du viewBox source, donc avant mise à l'échelle.
    // linejoin/linecap ronds évitent les becquets pointus aux jonctions des
    // petits détails (dents, iris) une fois le tracé épaissi.
    attrs.push(
      `stroke="${color}"`,
      `stroke-width="${num(strokePx / overlay.scale)}"`,
      `stroke-linejoin="round"`,
      `stroke-linecap="round"`,
    );
  }
  return group(`<g ${attrs.join(" ")}>`, body);
}

/**
 * Remplace la couleur de tracé du SVG source, quelle qu'elle soit, par la
 * couleur cible. Le blanc est laissé intact : il sert aux masques internes de
 * l'illustration (ex. dents en creux), pas au dessin visible.
 */
function recolor(content: string, color: string): string {
  return content.replace(/(fill|stroke)="(?!none"|white")[^"]*"/gi, `$1="${color}"`);
}

/** Préfixe les identifiants et les références url(#...) d'un fragment SVG. */
function prefixIds(content: string, prefix: string): string {
  return content
    .replace(/\bid="([^"]+)"/g, (_match, id: string) => `id="${prefix}${id}"`)
    .replace(/\burl\(#([^)]+)\)/g, (_match, id: string) => `url(#${prefix}${id})`);
}

/*---- Mise en forme ----*/

function group(open: string, children: string[]): string[] {
  if (children.length === 0) return [];
  return [open, ...indent(children, 1), `</g>`];
}

function indent(lines: string[], level: number): string[] {
  return lines.map((line) => INDENT.repeat(level) + line);
}

function push(lines: string[], fragment: string[]): void {
  lines.push(...indent(fragment, 1));
}

/** Arrondi court : le SVG doit rester éditable à la main. */
function num(value: number): string {
  return String(Math.round(value * 1000) / 1000);
}
