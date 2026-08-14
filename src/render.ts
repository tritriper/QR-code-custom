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
  /** Diamètre d'un point rapporté au pas de la grille. */
  dotRatio: number;
  /** Part du côté de la zone de données occupée par le plus grand côté de l'illustration. */
  artworkScale: number;
  /** Contenu interne du SVG source (tout ce qui est entre <svg> et </svg>). */
  artworkContent?: string;
  /** viewBox du SVG source, au format "minX minY width height". */
  artworkViewBox?: string;
}

export const DEFAULT_RENDER_OPTS: RenderOpts = {
  darkColor: "#12341f",
  lightColor: "#ffffff",
  modulePx: 10,
  quietZone: 4,
  dotRatio: 0.8,
  artworkScale: 0.8,
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

/** Illustration résolue : contenu brut, transformation de cadrage et boîte englobante. */
interface Artwork {
  content: string;
  transform: string;
  boxPx: Box;
}

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

const INDENT = "  ";

/**
 * Rend la matrice en SVG. `modules[y][x] === true` signifie module sombre,
 * l'origine (0, 0) étant le coin haut-gauche.
 */
export function renderQrSvg(modules: boolean[][], opts: RenderOpts): string {
  const layout = computeLayout(modules.length, opts);
  const artwork = resolveArtwork(layout, opts);

  const lines: string[] = [];
  lines.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${num(layout.sidePx)}" height="${num(layout.sidePx)}" viewBox="0 0 ${num(layout.sidePx)} ${num(layout.sidePx)}">`,
  );
  // L'ordre de composition ci-dessous est significatif : chaque couche recouvre les précédentes.
  if (artwork !== null) push(lines, maskDefs(layout, artwork, opts));
  push(lines, background(layout, opts));
  push(lines, darkModules(modules, layout, opts));
  push(lines, finders(layout, opts));
  if (artwork !== null) {
    push(lines, artworkGroup(artwork, opts.darkColor, "art-"));
    push(lines, lightModules(modules, layout, opts));
  }
  lines.push(`</svg>`);
  return lines.join("\n") + "\n";
}

/**
 * Nombre de modules sombres dont le centre tombe dans la boîte englobante de
 * l'illustration. Heuristique de comparaison entre variantes de masque : plus
 * ce nombre est bas, moins l'illustration se bat visuellement avec le code.
 */
export function countDarkModulesUnderArtwork(modules: boolean[][], opts: RenderOpts): number {
  const layout = computeLayout(modules.length, opts);
  const artwork = resolveArtwork(layout, opts);
  if (artwork === null) return 0;

  let count = 0;
  for (let y = 0; y < layout.size; y++) {
    for (let x = 0; x < layout.size; x++) {
      if (!modules[y][x]) continue;
      const cx = centerPx(x, layout, opts);
      const cy = centerPx(y, layout, opts);
      const inside =
        cx >= artwork.boxPx.x &&
        cx <= artwork.boxPx.x + artwork.boxPx.width &&
        cy >= artwork.boxPx.y &&
        cy <= artwork.boxPx.y + artwork.boxPx.height;
      if (inside) count++;
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

/** Met l'illustration à l'échelle et la centre sur la zone de données. */
function resolveArtwork(layout: Layout, opts: RenderOpts): Artwork | null {
  if (opts.artworkContent === undefined || opts.artworkViewBox === undefined) return null;

  const source = parseViewBox(opts.artworkViewBox);
  const scale = (layout.dataSidePx * opts.artworkScale) / Math.max(source.width, source.height);
  const width = source.width * scale;
  const height = source.height * scale;
  const x = layout.dataOriginPx + (layout.dataSidePx - width) / 2;
  const y = layout.dataOriginPx + (layout.dataSidePx - height) / 2;

  return {
    content: opts.artworkContent,
    // Le décalage compense l'origine du viewBox source, qui n'est pas forcément (0, 0).
    transform: `translate(${num(x - source.x * scale)} ${num(y - source.y * scale)}) scale(${num(scale)})`,
    boxPx: { x, y, width, height },
  };
}

/*---- Fragments SVG ----*/

function background(layout: Layout, opts: RenderOpts): string[] {
  return [
    `<rect x="0" y="0" width="${num(layout.sidePx)}" height="${num(layout.sidePx)}" fill="${opts.lightColor}"/>`,
  ];
}

function darkModules(modules: boolean[][], layout: Layout, opts: RenderOpts): string[] {
  const dots: string[] = [];
  for (let y = 0; y < layout.size; y++) {
    for (let x = 0; x < layout.size; x++) {
      // Les motifs de détection sont redessinés stylisés, on les saute ici.
      if (!modules[y][x] || isFinderModule(x, y, layout.size)) continue;
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
  const r = (opts.modulePx * opts.dotRatio) / 2;
  return `<circle cx="${num(centerPx(x, layout, opts))}" cy="${num(centerPx(y, layout, opts))}" r="${num(r)}"/>`;
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

function maskDefs(layout: Layout, artwork: Artwork, opts: RenderOpts): string[] {
  const side = num(layout.sidePx);
  return [
    `<defs>`,
    // userSpaceOnUse avec des bornes explicites : sans cela le masque serait
    // exprimé en fraction de la boîte de l'élément masqué, qui varie.
    `${INDENT}<mask id="art" maskUnits="userSpaceOnUse" x="0" y="0" width="${side}" height="${side}">`,
    `${INDENT}${INDENT}<rect x="0" y="0" width="${side}" height="${side}" fill="#000000"/>`,
    ...indent(artworkGroup(artwork, "#ffffff", "mask-"), 2),
    `${INDENT}</mask>`,
    `</defs>`,
  ];
}

/**
 * Une copie de l'illustration, recolorée et cadrée. `idPrefix` évite les
 * identifiants dupliqués entre la copie visible et celle du masque.
 */
function artworkGroup(artwork: Artwork, color: string, idPrefix: string): string[] {
  const content = prefixIds(recolor(artwork.content, color), idPrefix);
  const body = content
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  // fill="none" reproduit la valeur par défaut portée par le <svg> source, dont
  // dépendent les tracés qui n'ont qu'un stroke.
  return group(`<g transform="${artwork.transform}" fill="none">`, body);
}

/**
 * Remplace les couleurs de tracé du SVG source. Seul le noir est visé : le
 * blanc sert aux masques internes de l'illustration et doit rester blanc.
 */
function recolor(content: string, color: string): string {
  return content.replace(/(fill|stroke)="(?:black|#000|#000000)"/gi, `$1="${color}"`);
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
