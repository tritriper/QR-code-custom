/*
 * Logique QR pure, partagée par les deux entrées du projet (`cli.ts` et
 * `web/main.ts`). Comme `render.ts` : aucune E/S, aucun accès au système de
 * fichiers, aucun `console`.
 */

import qrcodegen from "./generated/qrcodegen.js";
import { countDarkModulesUnderArtwork, renderQrSvg, type RenderOpts } from "./render.js";

/** Contenu interne et viewBox d'un fichier SVG source. */
export interface SvgFile {
  content: string;
  viewBox: string;
}

/**
 * Une des 8 variantes de masque du même contenu. Le SVG n'est volontairement
 * pas inclus : le construire coûte cher (le logo est inliné jusqu'à 3 fois),
 * alors que le classement des variantes n'a besoin que de `collisions`.
 * Voir `renderVariant`.
 */
export interface Variant {
  mask: number;
  version: number;
  size: number;
  modules: boolean[][];
  /** Modules sombres sous les overlays : plus c'est bas, plus le logo ressort. */
  collisions: number;
}

export const MASK_COUNT = 8;

/** Encode les 8 masques du même texte et évalue chacun. */
export function buildVariants(text: string, opts: RenderOpts): Variant[] {
  const variants: Variant[] = [];
  for (let mask = 0; mask < MASK_COUNT; mask++) {
    const segments = qrcodegen.QrSegment.makeSegments(text);
    const qr = qrcodegen.QrCode.encodeSegments(segments, qrcodegen.QrCode.Ecc.HIGH, 1, 40, mask, true);
    const modules = toMatrix(qr);
    variants.push({
      mask,
      version: qr.version,
      size: qr.size,
      modules,
      collisions: countDarkModulesUnderArtwork(modules, opts),
    });
  }
  return variants;
}

export function renderVariant(variant: Variant, opts: RenderOpts): string {
  return renderQrSvg(variant.modules, opts);
}

/**
 * Extrait le viewBox et le contenu interne d'un fichier SVG.
 *
 * Le contenu est recopié tel quel dans le SVG produit : on retire d'abord les
 * `<script>` et les gestionnaires `on*=`, qu'un fichier déposé par
 * l'utilisateur peut contenir et qui s'exécuteraient à l'affichage de
 * l'aperçu. `label` sert à situer le fichier dans les messages d'erreur.
 */
export function parseSvg(source: string, label: string): SvgFile {
  const viewBox = /<svg[^>]*\sviewBox="([^"]+)"/i.exec(source)?.[1];
  if (viewBox === undefined) {
    throw new Error(`Aucun attribut viewBox trouvé dans ${label}`);
  }

  const opening = /<svg[^>]*>/i.exec(source);
  const closing = source.lastIndexOf("</svg>");
  if (opening === null || closing === -1) {
    throw new Error(`${label} ne ressemble pas à un fichier SVG`);
  }

  const content = source.slice(opening.index + opening[0].length, closing).trim();
  return { viewBox, content: sanitize(content) };
}

function sanitize(content: string): string {
  return content
    .replace(/<script\b[\s\S]*?<\/script\s*>/gi, "")
    .replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, "")
    .replace(/\son[a-z]+\s*=\s*'[^']*'/gi, "");
}

/**
 * Passe l'URL en majuscules pour déclencher le mode alphanumérique de qrcodegen
 * (5,5 bits/caractère au lieu de 8), ce qui abaisse la version du symbole.
 * Les avertissements sont retournés plutôt qu'affichés : chaque entrée les
 * présente à sa façon (terminal ou écran).
 */
export function toUpperUrl(url: string): { text: string; warnings: string[] } {
  const warnings: string[] = [];

  // Le schéma et le host sont insensibles à la casse, le reste ne l'est pas :
  // on prévient plutôt que de casser silencieusement le lien.
  const rest = url.replace(/^[a-z]+:\/\/[^/?#]*/i, "");
  if (rest !== "" && rest !== "/") {
    warnings.push(`"${rest}" est sensible à la casse, les MAJUSCULES peuvent rendre l'URL invalide.`);
  }

  const text = url.toUpperCase();
  if (!qrcodegen.QrSegment.isAlphanumeric(text)) {
    warnings.push("L'URL contient des caractères hors du jeu alphanumérique QR, les MAJUSCULES sont sans effet.");
  }
  return { text, warnings };
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
