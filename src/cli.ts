/*
 * Entrée CLI. Seul module à effets de bord : lecture de l'illustration,
 * écriture des SVG, affichage du récapitulatif.
 *
 *   npx tsx src/cli.ts --url "https://collecti-frog.fr" --art art/CF-Logo-Black-Trans.svg --out dist/
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";

import qrcodegen from "./generated/qrcodegen.js";
import { DEFAULT_RENDER_OPTS, countDarkModulesUnderArtwork, renderQrSvg, type RenderOpts } from "./render.js";

interface Options {
  url: string;
  art: string;
  out: string;
  upper: boolean;
  artScale: number;
}

interface Artwork {
  content: string;
  viewBox: string;
}

function main(): void {
  const opts = parseOptions();
  const artwork = readArtwork(opts.art);
  const text = opts.upper ? toUpperUrl(opts.url) : opts.url;

  const renderOpts: RenderOpts = {
    ...DEFAULT_RENDER_OPTS,
    artworkScale: opts.artScale,
    artworkContent: artwork.content,
    artworkViewBox: artwork.viewBox,
  };

  mkdirSync(opts.out, { recursive: true });
  console.log(`URL encodée : ${text}`);

  for (let mask = 0; mask < 8; mask++) {
    const segments = qrcodegen.QrSegment.makeSegments(text);
    const qr = qrcodegen.QrCode.encodeSegments(segments, qrcodegen.QrCode.Ecc.HIGH, 1, 40, mask, true);
    const modules = toMatrix(qr);

    const file = join(opts.out, `qr-mask${mask}.svg`);
    writeFileSync(file, renderQrSvg(modules, renderOpts), "utf8");

    const collisions = countDarkModulesUnderArtwork(modules, renderOpts);
    console.log(`  masque ${mask} → version ${qr.version} (${qr.size}×${qr.size}), ${collisions} modules sombres sous l'illustration → ${file}`);
  }
}

function parseOptions(): Options {
  const { values } = parseArgs({
    options: {
      url: { type: "string" },
      art: { type: "string" },
      out: { type: "string", default: "dist/" },
      upper: { type: "boolean", default: false },
      "art-scale": { type: "string", default: String(DEFAULT_RENDER_OPTS.artworkScale) },
    },
  });

  if (values.url === undefined || values.art === undefined) {
    throw new Error('Usage : --url "<URL>" --art <fichier.svg> [--out dist/] [--upper] [--art-scale 0.42]');
  }

  const artScale = Number(values["art-scale"]);
  if (!Number.isFinite(artScale) || artScale <= 0 || artScale > 1) {
    throw new Error(`--art-scale doit être un nombre dans ]0, 1], reçu "${values["art-scale"]}"`);
  }

  return { url: values.url, art: values.art, out: values.out, upper: values.upper, artScale };
}

/**
 * Passe l'URL en majuscules pour déclencher le mode alphanumérique de qrcodegen
 * (5,5 bits/caractère au lieu de 8), ce qui abaisse la version du symbole.
 */
function toUpperUrl(url: string): string {
  // Le schéma et le host sont insensibles à la casse, le reste ne l'est pas :
  // on prévient plutôt que de casser silencieusement le lien.
  const rest = url.replace(/^[a-z]+:\/\/[^/?#]*/i, "");
  if (rest !== "" && rest !== "/") {
    console.warn(`Attention : "${rest}" est sensible à la casse, --upper peut rendre l'URL invalide.`);
  }

  const upper = url.toUpperCase();
  if (!qrcodegen.QrSegment.isAlphanumeric(upper)) {
    console.warn("Attention : l'URL contient des caractères hors du jeu alphanumérique QR, --upper est sans effet.");
  }
  return upper;
}

/** Extrait le viewBox et le contenu interne du SVG de l'illustration. */
function readArtwork(path: string): Artwork {
  const source = readFileSync(path, "utf8");

  const viewBox = /<svg[^>]*\sviewBox="([^"]+)"/i.exec(source)?.[1];
  if (viewBox === undefined) {
    throw new Error(`Aucun attribut viewBox trouvé dans ${path}`);
  }

  const opening = /<svg[^>]*>/i.exec(source);
  const closing = source.lastIndexOf("</svg>");
  if (opening === null || closing === -1) {
    throw new Error(`${path} ne ressemble pas à un fichier SVG`);
  }

  return { viewBox, content: source.slice(opening.index + opening[0].length, closing).trim() };
}

function toMatrix(qr: qrcodegen.QrCode): boolean[][] {
  const matrix: boolean[][] = [];
  for (let y = 0; y < qr.size; y++) {
    const row: boolean[] = [];
    for (let x = 0; x < qr.size; x++) {
      row.push(qr.getModule(x, y));
    }
    matrix.push(row);
  }
  return matrix;
}

main();
