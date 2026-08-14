/*
 * Entrée CLI. Seul module à effets de bord : lecture de l'illustration,
 * écriture des SVG, affichage du récapitulatif.
 *
 *   npx tsx src/cli.ts --url "https://collecti-frog.fr" --out dist/
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";

import { MASK_COUNT, buildVariants, parseSvg, renderVariant, toUpperUrl, type SvgFile } from "./qr.js";
import { DEFAULT_RENDER_OPTS, type RenderOpts } from "./render.js";

interface Options {
  url: string;
  art: string;
  out: string;
  upper: boolean;
  /** Zoom de l'illustration en pourcentage de la zone de données. */
  artScalePercent: number;
  /** Nombre de variantes de masque à écrire, les meilleures d'abord. */
  count: number;
  thicken: number;
  artColor: string;
  /** Couleur des modules et des motifs de détection. */
  color: string;
  /** Diamètre d'un point, en px. */
  dotSize: number;
  /** Distance entre les centres de deux points voisins, en px. */
  spacing: number;
  /** Désactive l'illustration --art (silhouette intégrée aux points). */
  noArt: boolean;
  /** Chemin du logo à afficher au centre, ou undefined pour ne pas en afficher. */
  centerLogo: string | undefined;
  /** Zoom du logo central en pourcentage de la zone de données. */
  centerLogoScalePercent: number;
  /** Couleur du logo central, ou undefined pour garder ses couleurs d'origine. */
  centerLogoColor: string | undefined;
}

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

  const renderOpts: RenderOpts = {
    ...DEFAULT_RENDER_OPTS,
    darkColor: opts.color,
    dotPx: opts.dotSize,
    modulePx: opts.spacing,
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

  // Les 8 masques sont toujours évalués : c'est ce qui permet de classer les
  // variantes. Seules les `count` meilleures sont écrites sur disque.
  const variants = buildVariants(text, renderOpts);
  const ranked = [...variants].sort((a, b) => a.collisions - b.collisions);
  const chosen = new Set(ranked.slice(0, opts.count).map((variant) => variant.mask));

  mkdirSync(opts.out, { recursive: true });
  const summaryHeader = [
    artwork !== undefined ? `illustration à ${opts.artScalePercent} %` : null,
    centerLogo !== undefined ? `logo central à ${opts.centerLogoScalePercent} %` : null,
  ]
    .filter((part) => part !== null)
    .join(", ");
  console.log(`URL encodée : ${text}${summaryHeader === "" ? "" : ` — ${summaryHeader}`}`);

  for (const variant of variants) {
    const summary = `masque ${variant.mask} → version ${variant.version} (${variant.size}×${variant.size}), ${variant.collisions} modules sombres concernés`;
    if (!chosen.has(variant.mask)) {
      console.log(`     ${summary}`);
      continue;
    }
    const file = join(opts.out, `qr-mask${variant.mask}.svg`);
    writeFileSync(file, renderVariant(variant, renderOpts), "utf8");
    console.log(`  ✓  ${summary} → ${file}`);
  }
}

function parseOptions(): Options {
  const { values } = parseArgs({
    options: {
      url: { type: "string" },
      art: { type: "string", default: DEFAULT_ART },
      out: { type: "string", default: "dist/" },
      upper: { type: "boolean", default: false },
      "art-scale": { type: "string", default: String(DEFAULT_RENDER_OPTS.artworkScale * 100) },
      count: { type: "string", default: "8" },
      thicken: { type: "string", default: String(DEFAULT_RENDER_OPTS.artworkThickenPx) },
      "art-color": { type: "string", default: DEFAULT_ART_COLOR },
      color: { type: "string", default: DEFAULT_RENDER_OPTS.darkColor },
      "dot-size": { type: "string", default: String(DEFAULT_RENDER_OPTS.dotPx) },
      spacing: { type: "string", default: String(DEFAULT_RENDER_OPTS.modulePx) },
      "no-art": { type: "boolean", default: false },
      "center-logo": { type: "string" },
      "center-logo-scale": { type: "string", default: String(DEFAULT_RENDER_OPTS.centerLogoScale * 100) },
      "center-logo-color": { type: "string" },
    },
  });

  if (values.url === undefined) {
    throw new Error(
      'Usage : --url "<URL>" [--art <fichier.svg>] [--out dist/] [--upper]\n' +
        '        [--art-scale 140] [--count 8] [--thicken 1] [--art-color "#12341f"]\n' +
        '        [--color "#000000"] [--dot-size 5] [--spacing 10] [--no-art]\n' +
        '        [--center-logo <fichier.svg>] [--center-logo-scale 24] [--center-logo-color "#000"]',
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

  const count = number(values.count, "--count");
  if (!Number.isInteger(count) || count < 1 || count > MASK_COUNT) {
    throw new Error(`--count doit être un entier entre 1 et ${MASK_COUNT}, reçu "${values.count}"`);
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

  const spacing = number(values.spacing, "--spacing");
  if (spacing <= 0) {
    throw new Error(`--spacing doit être strictement positif, reçu "${values.spacing}"`);
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
    count,
    thicken,
    artColor,
    color,
    dotSize,
    spacing,
    noArt: values["no-art"],
    centerLogo: values["center-logo"],
    centerLogoScalePercent,
    centerLogoColor,
  };
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
