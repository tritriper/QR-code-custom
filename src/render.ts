/*
 * Rendu SVG d'une matrice QR stylisée « logo intégré » pour Collecti'FROG.
 * Fonctions pures uniquement : aucune E/S, aucun accès au système de fichiers.
 */

export interface RenderOpts {
  darkColor: string;
  lightColor: string;
  modulePx: number;
  /** Marge silencieuse, en modules. Le standard QR en exige 4 au minimum. */
  quietZone: number;
  /** Diamètre d'un point, en px. */
  dotPx: number;
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
  quietZone: 1,
  dotPx: 5,
  artworkScale: 1.4,
  artworkThickenPx: 1,
  centerLogoScale: 0.24,
  centerLogoMarginPx: 4,
};

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
    `<svg xmlns="http://www.w3.org/2000/svg" width="${num(layout.sidePx)}" height="${num(layout.sidePx)}" viewBox="0 0 ${num(layout.sidePx)} ${num(layout.sidePx)}">`,
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

/**
 * Nombre de modules sombres réellement perdus : ceux tombant dans la boîte
 * englobante de l'illustration `--art` (heuristique, ce logo ne supprime
 * aucun module — voir `renderQrSvg`) plus ceux effacés par la zone de
 * réserve du logo central (compte exact, ce logo-là supprime vraiment des
 * modules). Sert à classer les variantes de masque : plus ce nombre est bas,
 * moins la lecture du QR est mise à l'épreuve.
 */
export function countDarkModulesUnderArtwork(modules: boolean[][], opts: RenderOpts): number {
  const layout = computeLayout(modules.length, opts);
  const artwork = resolveArtwork(layout, opts);
  const centerLogo = resolveCenterLogo(layout, opts);
  const reserve = centerLogo === null ? null : reserveOf(centerLogo, opts);
  if (artwork === null && reserve === null) return 0;

  let count = 0;
  for (let y = 0; y < layout.size; y++) {
    for (let x = 0; x < layout.size; x++) {
      if (!modules[y][x]) continue;
      const cx = centerPx(x, layout, opts);
      const cy = centerPx(y, layout, opts);

      const underArtwork =
        artwork !== null &&
        cx >= artwork.boxPx.x &&
        cx <= artwork.boxPx.x + artwork.boxPx.width &&
        cy >= artwork.boxPx.y &&
        cy <= artwork.boxPx.y + artwork.boxPx.height;
      if (underArtwork || (reserve !== null && insideReserve(cx, cy, reserve))) count++;
    }
  }
  return count;
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
  const dots: string[] = [];
  for (let y = 0; y < layout.size; y++) {
    for (let x = 0; x < layout.size; x++) {
      if (!modules[y][x] || isFinderModule(x, y, layout.size)) continue;
      // Le logo central efface réellement les modules dessous, pas seulement
      // à l'écran : inutile de les dessiner.
      if (reserve !== null && insideReserve(centerPx(x, layout, opts), centerPx(y, layout, opts), reserve)) continue;
      dots.push(dot(x, y, layout, opts));
    }
  }
  return group(`<g fill="${opts.darkColor}">`, dots);
}

function lightModules(modules: boolean[][], layout: Layout, opts: RenderOpts): string[] {
  const dots: string[] = [];
  for (let y = 0; y < layout.size; y++) {
    for (let x = 0; x < layout.size; x++) {
      if (modules[y][x]) continue;
      dots.push(dot(x, y, layout, opts));
    }
  }
  // Le masque ne laisse passer ces points qu'à l'intérieur des traits de
  // l'illustration : ailleurs ils seraient clairs sur clair, donc inutiles.
  return group(`<g fill="${opts.lightColor}" mask="url(#art)">`, dots);
}

function dot(x: number, y: number, layout: Layout, opts: RenderOpts): string {
  return `<circle cx="${num(centerPx(x, layout, opts))}" cy="${num(centerPx(y, layout, opts))}" r="${num(opts.dotPx / 2)}"/>`;
}

function finders(layout: Layout, opts: RenderOpts): string[] {
  const px = opts.modulePx;
  const rings: string[] = [];
  const pupils: string[] = [];

  for (const [fx, fy] of finderOrigins(layout.size)) {
    const originX = layout.dataOriginPx + fx * px;
    const originY = layout.dataOriginPx + fy * px;
    // Le contour fait 1 module d'épaisseur : le rect suit sa ligne médiane,
    // d'où un demi-module de retrait sur chaque bord et un côté de 6 modules.
    rings.push(
      `<rect x="${num(originX + px / 2)}" y="${num(originY + px / 2)}" width="${num(6 * px)}" height="${num(6 * px)}" rx="${num(2 * px)}"/>`,
    );
    pupils.push(
      `<rect x="${num(originX + 2 * px)}" y="${num(originY + 2 * px)}" width="${num(3 * px)}" height="${num(3 * px)}" rx="${num(px)}"/>`,
    );
  }

  return [
    ...group(`<g fill="none" stroke="${opts.darkColor}" stroke-width="${num(px)}">`, rings),
    ...group(`<g fill="${opts.darkColor}">`, pupils),
  ];
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
