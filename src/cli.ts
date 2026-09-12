/*
 * Entrée CLI. Seul module à effets de bord : lecture de l'illustration,
 * écriture des SVG, affichage du récapitulatif.
 *
 *   npx tsx src/cli.ts --url "https://collecti-frog.fr" --out dist/
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";

import {
  MASK_COUNT,
  MAX_DENSITY,
  MIN_DENSITY,
  buildVariant,
  parseSvg,
  renderVariant,
  toUpperUrl,
  type SvgFile,
} from "./qr.js";
import {
  DEFAULT_RENDER_OPTS,
  DOT_SHAPES,
  FINDER_SHAPES,
  PRESETS,
  PRESET_NAMES,
  type DotShape,
  type FinderShape,
  type PresetName,
  type RenderOpts,
} from "./render.js";

interface Options {
  url: string;
  art: string;
  out: string;
  upper: boolean;
  /** Zoom de l'illustration en pourcentage de la zone de données. */
  artScalePercent: number;
  /** Masque QR à dessiner, de 0 à 7 : même contenu, dessin différent. */
  mask: number;
  thicken: number;
  artColor: string;
  /** Couleur des modules et des motifs de détection. */
  color: string;
  /** Diamètre d'un point, en px, sur une grille au pas de 10. */
  dotSize: number;
  /** Forme des points, motifs de détection exclus. */
  dotShape: DotShape;
  /** Préréglage d'apparence appliqué, ou undefined si aucun. */
  preset: PresetName | undefined;
  /** Version minimale du symbole : plus elle est haute, plus la grille a de points. */
  density: number;
  /** Côté du SVG produit, en px. */
  size: number;
  /** Forme du contour des 3 motifs de détection. */
  finderShape: FinderShape;
  /** Forme du centre des 3 motifs de détection, ou undefined pour celle du contour. */
  finderPupilShape: FinderShape | undefined;
  /** Couleur du contour des motifs de détection, ou undefined pour celle des points. */
  finderColor: string | undefined;
  /** Couleur du centre des motifs de détection, ou undefined pour celle du contour. */
  finderPupilColor: string | undefined;
  /** Désactive l'illustration --art (silhouette intégrée aux points). */
  noArt: boolean;
  /** Chemin du logo à afficher au centre, ou undefined pour ne pas en afficher. */
  centerLogo: string | undefined;
  /** Zoom du logo central en pourcentage de la zone de données. */
  centerLogoScalePercent: number;
  /** Couleur du logo central, ou undefined pour garder ses couleurs d'origine. */
  centerLogoColor: string | undefined;
}

/**
 * Sous cette taille de point, les losanges ne se décodent plus de façon fiable
 * (voir AGENTS.md). Seuil dupliqué dans `warnings()` de `web/main.ts`.
 */
const DIAMOND_MIN_DOT_SIZE = 5;

/**
 * Sous cette taille de point, un contour de coin rond ne se détecte plus de
 * façon fiable (voir AGENTS.md). Seuil dupliqué dans `warnings()` de
 * `web/main.ts`.
 */
const CIRCLE_FINDER_MIN_DOT_SIZE = 5;

/** SVG de l'association, à jour dans la charte : trait vert foncé. */
const DEFAULT_ART = "art/CF-Logo-VertFonce-Trans.svg";
/** Couleur de l'illustration par défaut : vert foncé de la charte Collecti'FROG. */
const DEFAULT_ART_COLOR = "#12341f";

function main(): void {
  const opts = parseOptions();
  const artwork = opts.noArt ? undefined : readSvg(opts.art);
  const centerLogo = opts.centerLogo === undefined ? undefined : readSvg(opts.centerLogo);

  let text = opts.url;
  if (opts.upper) {
    const upper = toUpperUrl(opts.url);
    text = upper.text;
    for (const warning of upper.warnings) console.warn(`Attention : ${warning}`);
  }

  // Le préréglage se glisse entre les défauts et les options explicites : il
  // ne touche qu'aux réglages laissés au défaut (voir `wasGiven`).
  const preset: Partial<RenderOpts> = opts.preset === undefined ? {} : PRESETS[opts.preset];
  const renderOpts: RenderOpts = {
    ...DEFAULT_RENDER_OPTS,
    ...preset,
    darkColor: opts.color,
    dotPx: wasGiven("dot-size") ? opts.dotSize : (preset.dotPx ?? DEFAULT_RENDER_OPTS.dotPx),
    dotShape: wasGiven("dot-shape") ? opts.dotShape : (preset.dotShape ?? DEFAULT_RENDER_OPTS.dotShape),
    outputPx: opts.size,
    finderShape: wasGiven("finder-shape")
      ? opts.finderShape
      : (preset.finderShape ?? DEFAULT_RENDER_OPTS.finderShape),
    finderPupilShape: opts.finderPupilShape,
    finderColor: opts.finderColor,
    finderPupilColor: opts.finderPupilColor,
    artworkScale: opts.artScalePercent / 100,
    artworkThickenPx: opts.thicken,
    artworkColor: opts.artColor,
    artworkContent: artwork?.content,
    artworkViewBox: artwork?.viewBox,
    centerLogoScale: opts.centerLogoScalePercent / 100,
    centerLogoColor: opts.centerLogoColor,
    centerLogoContent: centerLogo?.content,
    centerLogoViewBox: centerLogo?.viewBox,
  };

  const variant = buildVariant(text, opts.mask, opts.density);

  mkdirSync(opts.out, { recursive: true });
  const summaryHeader = [
    artwork !== undefined ? `illustration à ${opts.artScalePercent} %` : null,
    centerLogo !== undefined ? `logo central à ${opts.centerLogoScalePercent} %` : null,
  ]
    .filter((part) => part !== null)
    .join(", ");
  console.log(`URL encodée : ${text}${summaryHeader === "" ? "" : ` — ${summaryHeader}`}`);

  const file = join(opts.out, `qr-mask${variant.mask}.svg`);
  writeFileSync(file, renderVariant(variant, renderOpts), "utf8");
  console.log(`  ✓  masque ${variant.mask} → version ${variant.version} (${variant.size}×${variant.size}) → ${file}`);
  console.log(`     Un autre dessin du même QR code : --mask ${(variant.mask + 1) % MASK_COUNT}`);
}

function parseOptions(): Options {
  const { values } = parseArgs({
    options: {
      url: { type: "string" },
      art: { type: "string", default: DEFAULT_ART },
      out: { type: "string", default: "dist/" },
      upper: { type: "boolean", default: false },
      "art-scale": { type: "string", default: String(DEFAULT_RENDER_OPTS.artworkScale * 100) },
      mask: { type: "string", default: "0" },
      thicken: { type: "string", default: String(DEFAULT_RENDER_OPTS.artworkThickenPx) },
      "art-color": { type: "string", default: DEFAULT_ART_COLOR },
      color: { type: "string", default: DEFAULT_RENDER_OPTS.darkColor },
      "dot-size": { type: "string", default: String(DEFAULT_RENDER_OPTS.dotPx) },
      "dot-shape": { type: "string", default: DEFAULT_RENDER_OPTS.dotShape },
      preset: { type: "string" },
      density: { type: "string", default: String(MIN_DENSITY) },
      size: { type: "string", default: String(DEFAULT_RENDER_OPTS.outputPx) },
      "finder-shape": { type: "string", default: DEFAULT_RENDER_OPTS.finderShape },
      "finder-pupil-shape": { type: "string" },
      "finder-color": { type: "string" },
      "finder-pupil-color": { type: "string" },
      "no-art": { type: "boolean", default: false },
      "center-logo": { type: "string" },
      "center-logo-scale": { type: "string", default: String(DEFAULT_RENDER_OPTS.centerLogoScale * 100) },
      "center-logo-color": { type: "string" },
    },
  });

  if (values.url === undefined) {
    throw new Error(
      'Usage : --url "<URL>" [--art <fichier.svg>] [--out dist/] [--upper]\n' +
        '        [--art-scale 140] [--mask 0] [--thicken 1] [--art-color "#12341f"]\n' +
        '        [--color "#000000"] [--dot-size 5] [--no-art]\n' +
        '        [--density 1] [--size 1024]\n' +
        `        [--preset ${PRESET_NAMES.join("|")}]\n` +
        `        [--dot-shape ${DOT_SHAPES.join("|")}]\n` +
        `        [--finder-shape ${FINDER_SHAPES.join("|")}]\n` +
        '        [--finder-pupil-shape <même liste>] [--finder-color "#000"]\n' +
        '        [--finder-pupil-color "#000"]\n' +
        '        [--center-logo <fichier.svg>] [--center-logo-scale 40] [--center-logo-color "#000"]',
    );
  }

  const artScalePercent = number(values["art-scale"], "--art-scale");
  if (artScalePercent <= 0 || artScalePercent > 200) {
    throw new Error(`--art-scale doit être un pourcentage dans ]0, 200], reçu "${values["art-scale"]}"`);
  }
  if (artScalePercent > 100 && !values["no-art"]) {
    // Au-delà de 100 % l'illustration déborde sur la marge silencieuse, dont
    // les lecteurs ont besoin pour cadrer le symbole.
    console.warn(`Attention : à ${artScalePercent} % l'illustration déborde de la zone de données, vérifie le décodage.`);
  }

  const mask = number(values.mask, "--mask");
  if (!Number.isInteger(mask) || mask < 0 || mask >= MASK_COUNT) {
    throw new Error(`--mask doit être un entier entre 0 et ${MASK_COUNT - 1}, reçu "${values.mask}"`);
  }

  const thicken = number(values.thicken, "--thicken");
  if (thicken < 0) {
    throw new Error("--thicken doit être positif ou nul");
  }

  const artColor = values["art-color"];
  if (!isCssColor(artColor)) {
    throw new Error(`--art-color doit être une couleur CSS, reçu "${artColor}"`);
  }

  const color = values.color;
  if (!isCssColor(color)) {
    throw new Error(`--color doit être une couleur CSS, reçu "${color}"`);
  }

  const dotSize = number(values["dot-size"], "--dot-size");
  if (dotSize <= 0) {
    throw new Error(`--dot-size doit être strictement positif, reçu "${values["dot-size"]}"`);
  }

  const preset = values.preset;
  if (preset !== undefined && !isPresetName(preset)) {
    throw new Error(`--preset doit valoir ${PRESET_NAMES.join(", ")}, reçu "${preset}"`);
  }

  const dotShape = values["dot-shape"];
  if (!isDotShape(dotShape)) {
    throw new Error(`--dot-shape doit valoir ${DOT_SHAPES.join(", ")}, reçu "${dotShape}"`);
  }
  // Le losange est inscrit dans le carré de `--dot-size` : il n'en couvre que
  // la moitié, donc il pose deux fois moins d'encre que les autres formes à
  // taille égale. Mesuré (voir AGENTS.md) : sous 5, il décroche à basse
  // résolution là où les autres passent encore.
  if (dotShape === "diamond" && dotSize < DIAMOND_MIN_DOT_SIZE) {
    console.warn(
      `Attention : des losanges à --dot-size ${dotSize} posent peu d'encre et se décodent mal` +
        ` une fois le QR imprimé petit. Reste au-dessus de ${DIAMOND_MIN_DOT_SIZE}, ou choisis une autre forme.`,
    );
  }

  const density = number(values.density, "--density");
  if (!Number.isInteger(density) || density < MIN_DENSITY || density > MAX_DENSITY) {
    throw new Error(`--density doit être un entier entre ${MIN_DENSITY} et ${MAX_DENSITY}, reçu "${values.density}"`);
  }

  const size = number(values.size, "--size");
  if (size <= 0) {
    throw new Error(`--size doit être strictement positif, reçu "${values.size}"`);
  }

  const finderShape = values["finder-shape"];
  if (!isFinderShape(finderShape)) {
    throw new Error(`--finder-shape doit valoir ${FINDER_SHAPES.join(", ")}, reçu "${finderShape}"`);
  }

  const finderPupilShape = values["finder-pupil-shape"];
  if (finderPupilShape !== undefined && !isFinderShape(finderPupilShape)) {
    throw new Error(`--finder-pupil-shape doit valoir ${FINDER_SHAPES.join(", ")}, reçu "${finderPupilShape}"`);
  }

  const finderColor = values["finder-color"];
  if (finderColor !== undefined && !isCssColor(finderColor)) {
    throw new Error(`--finder-color doit être une couleur CSS, reçu "${finderColor}"`);
  }

  const finderPupilColor = values["finder-pupil-color"];
  if (finderPupilColor !== undefined && !isCssColor(finderPupilColor)) {
    throw new Error(`--finder-pupil-color doit être une couleur CSS, reçu "${finderPupilColor}"`);
  }

  // Le contour rond est fin sur ses diagonales : un centre anguleux y grignote
  // le blanc qui l'en sépare, et le lecteur ne retrouve plus le rapport
  // 1:1:3:1:1 du motif. Mesuré (voir AGENTS.md) : jamais décodé avec un
  // centre carré, quelques échecs avec les autres formes.
  if (finderShape === "circle" && finderPupilShape !== undefined && finderPupilShape !== "circle") {
    console.warn(
      "Attention : un contour de coin rond avec un centre d'une autre forme se détecte mal" +
        " (jamais décodé avec --finder-pupil-shape square dans nos essais). Garde un centre rond" +
        " ou change de contour, et vérifie le décodage.",
    );
  }

  // Le contour rond est déjà fin sur ses diagonales ; des points fins autour
  // lui retirent les repères dont le lecteur se sert. Mesuré (voir AGENTS.md) :
  // 24/32 seulement à --dot-size 4, contre 32/32 à partir de 5.
  if (finderShape === "circle" && dotSize < CIRCLE_FINDER_MIN_DOT_SIZE) {
    console.warn(
      `Attention : des coins ronds avec des points à --dot-size ${dotSize} se détectent mal` +
        ` (24 décodages sur 32 dans nos essais). Reste au-dessus de ${CIRCLE_FINDER_MIN_DOT_SIZE},` +
        " ou choisis un autre contour de coin.",
    );
  }

  const centerLogoScalePercent = number(values["center-logo-scale"], "--center-logo-scale");
  if (centerLogoScalePercent <= 0 || centerLogoScalePercent > 40) {
    throw new Error(
      `--center-logo-scale doit être un pourcentage dans ]0, 40], reçu "${values["center-logo-scale"]}"`,
    );
  }
  if (centerLogoScalePercent > 30 && values["center-logo"] !== undefined) {
    // Contrairement à --art-scale, ce logo efface réellement les modules
    // dessous : au-delà d'environ 30 % la correction d'erreur du QR ne
    // suffit plus toujours à compenser.
    console.warn(
      `Attention : à ${centerLogoScalePercent} % le logo central efface une grande zone du QR, vérifie le décodage.`,
    );
  }

  const centerLogoColor = values["center-logo-color"];
  if (centerLogoColor !== undefined && !isCssColor(centerLogoColor)) {
    throw new Error(`--center-logo-color doit être une couleur CSS, reçu "${centerLogoColor}"`);
  }

  return {
    url: values.url,
    art: values.art,
    out: values.out,
    upper: values.upper,
    artScalePercent,
    mask,
    thicken,
    artColor,
    color,
    dotSize,
    dotShape,
    preset,
    density,
    size,
    finderShape,
    finderPupilShape,
    finderColor,
    finderPupilColor,
    noArt: values["no-art"],
    centerLogo: values["center-logo"],
    centerLogoScalePercent,
    centerLogoColor,
  };
}

function isFinderShape(value: string): value is FinderShape {
  return (FINDER_SHAPES as readonly string[]).includes(value);
}

function isDotShape(value: string): value is DotShape {
  return (DOT_SHAPES as readonly string[]).includes(value);
}

function isPresetName(value: string): value is PresetName {
  return (PRESET_NAMES as readonly string[]).includes(value);
}

/**
 * Vrai si l'option a été tapée sur la ligne de commande. `parseArgs` ne le dit
 * pas — une option absente y prend sa valeur par défaut, indiscernable d'une
 * valeur choisie — et c'est nécessaire ici pour que `--preset` s'applique aux
 * réglages laissés au défaut sans écraser ceux qu'on a explicitement demandés.
 */
function wasGiven(flag: string): boolean {
  return process.argv.slice(2).some((arg) => arg === `--${flag}` || arg.startsWith(`--${flag}=`));
}

function isCssColor(value: string): boolean {
  return /^(#[0-9a-f]{3,8}|[a-z]+)$/i.test(value);
}

function number(raw: string, flag: string): number {
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    throw new Error(`${flag} doit être un nombre, reçu "${raw}"`);
  }
  return value;
}

function readSvg(path: string): SvgFile {
  return parseSvg(readFileSync(path, "utf8"), path);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
