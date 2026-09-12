/*
 * Entrée navigateur, pendant de `cli.ts` : seul module à effets de bord côté
 * web (DOM, lecture des fichiers déposés, téléchargement). Toute la
 * génération vit dans `src/qr.ts` et `src/render.ts`, tous deux purs.
 *
 * L'état de l'interface n'est pas dupliqué dans une structure à part : il est
 * relu depuis les contrôles du formulaire à chaque rendu. Seuls le logo
 * déposé et le masque affiché, qui ne correspondent à aucun champ, sont
 * gardés ici.
 */

import { MASK_COUNT, buildVariant, parseSvg, renderVariant, toUpperUrl, type SvgFile, type Variant } from "../src/qr.js";
import {
  DEFAULT_RENDER_OPTS,
  DOT_SHAPES,
  FINDER_SHAPES,
  PRESETS,
  PRESET_NAMES,
  dotPreviewSvg,
  finderPreviewSvg,
  presetPreviewSvg,
  type DotShape,
  type FinderShape,
  type PresetName,
  type RenderOpts,
} from "../src/render.js";

type Mode = "art" | "center" | "none";

/** Logo par défaut de chaque style, chargé à la demande depuis `art/`. */
const DEFAULT_LOGOS: Record<"art" | "center", string> = {
  art: "art/CF-Logo-VertFonce-Trans.svg",
  center: "art/Circle Logo.svg",
};

/** Libellés des formes de coins, pour l'infobulle et les lecteurs d'écran. */
const SHAPE_LABELS: Record<FinderShape, string> = {
  square: "Carrés",
  rounded: "Arrondis",
  "extra-rounded": "Très arrondis",
  circle: "Ronds",
  leaf: "Feuille",
};

/** Libellés des formes de points, pour l'infobulle et les lecteurs d'écran. */
const DOT_SHAPE_LABELS: Record<DotShape, string> = {
  circle: "Ronds",
  rounded: "Arrondis",
  "extra-rounded": "Très arrondis",
  square: "Carrés",
  leaf: "Feuille",
  diamond: "Losanges",
  bars: "Stries",
  connected: "Fluide",
};

/** Libellés des préréglages, tels qu'ils s'affichent sous chaque vignette. */
const PRESET_LABELS: Record<PresetName, string> = {
  classique: "Classique",
  rond: "Rond",
  feuille: "Feuille",
  fluide: "Fluide",
  stries: "Stries",
  minimal: "Minimal",
};

/** Côté d'une vignette de préréglage, en px. */
const PRESET_PREVIEW_PX = 76;

/** Côté d'un aperçu de forme de coin, en px. */
const SHAPE_PREVIEW_PX = 22;

/**
 * Côté d'un aperçu de forme de point, en px. Plus grand que celui des coins :
 * un coin est un dessin unique qui remplit sa vignette, un point n'en occupe
 * qu'une fraction, et à 22 px `rounded` et `extra-rounded` s'y confondaient.
 */
const DOT_PREVIEW_PX = 30;

/** Sous cette taille de point, les losanges se décodent mal (même seuil que le CLI). */
const DIAMOND_MIN_DOT_SIZE = 5;

/** Au-delà, le SVG produit devient lourd : le logo y est recopié jusqu'à 3 fois. */
const HEAVY_LOGO_BYTES = 200_000;

const DEBOUNCE_MS = 120;

interface Upload {
  logo: SvgFile;
  name: string;
  bytes: number;
}

const cache = new Map<string, SvgFile>();
let upload: Upload | null = null;
/** Masque affiché, de 0 à 7. « Régénérer » passe au suivant. */
let mask = 0;
/** Dernier SVG affiché, tel qu'il sera téléchargé. */
let currentSvg = "";
/** Évite qu'un rendu lancé avant un autre écrase son résultat au retour d'un await. */
let renderToken = 0;

const el = <T extends HTMLElement>(selector: string): T => {
  const found = document.querySelector<T>(selector);
  if (found === null) throw new Error(`Élément introuvable : ${selector}`);
  return found;
};

const ui = {
  form: el<HTMLFormElement>("#controls"),
  url: el<HTMLInputElement>("#url"),
  color: el<HTMLInputElement>("#color"),
  presets: el<HTMLDivElement>("#preset"),
  dotShapes: el<HTMLDivElement>("#dot-shape"),
  shapes: el<HTMLDivElement>("#finder-shape"),
  pupilShapes: el<HTMLDivElement>("#finder-pupil-shape"),
  pupilSame: el<HTMLInputElement>("#pupil-same"),
  pupilRow: el<HTMLDivElement>("#pupil-shape-row"),
  finderColor: el<HTMLInputElement>("#finder-color"),
  finderPupilColor: el<HTMLInputElement>("#finder-pupil-color"),
  finderSame: el<HTMLInputElement>("#finder-same"),
  artColor: el<HTMLInputElement>("#art-color"),
  centerColor: el<HTMLInputElement>("#center-color"),
  keepColors: el<HTMLInputElement>("#keep-colors"),
  dotSize: el<HTMLInputElement>("#dot-size"),
  density: el<HTMLInputElement>("#density"),
  artScale: el<HTMLInputElement>("#art-scale"),
  centerScale: el<HTMLInputElement>("#center-scale"),
  thicken: el<HTMLInputElement>("#thicken"),
  upper: el<HTMLInputElement>("#upper"),
  drop: el<HTMLDivElement>("#drop"),
  file: el<HTMLInputElement>("#logo-file"),
  pick: el<HTMLButtonElement>("#logo-pick"),
  reset: el<HTMLButtonElement>("#logo-reset"),
  logoName: el<HTMLParagraphElement>("#logo-name"),
  preview: el<HTMLDivElement>("#preview"),
  variantLabel: el<HTMLParagraphElement>("#variant-label"),
  regenerate: el<HTMLButtonElement>("#regenerate"),
  download: el<HTMLButtonElement>("#download"),
  messages: el<HTMLDivElement>("#messages"),
};

/*---- Lecture du formulaire ----*/

function mode(): Mode {
  return (new FormData(ui.form).get("mode") as Mode | null) ?? "art";
}

function dotShape(): DotShape {
  return (new FormData(ui.form).get("dot-shape") as DotShape | null) ?? DEFAULT_RENDER_OPTS.dotShape;
}

function finderShape(): FinderShape {
  return (new FormData(ui.form).get("finder-shape") as FinderShape | null) ?? DEFAULT_RENDER_OPTS.finderShape;
}

function finderPupilShape(): FinderShape {
  return (new FormData(ui.form).get("finder-pupil-shape") as FinderShape | null) ?? finderShape();
}

function outputPx(): number {
  return Number(new FormData(ui.form).get("size") ?? DEFAULT_RENDER_OPTS.outputPx);
}

function renderOpts(logo: SvgFile | null): RenderOpts {
  const current = mode();
  const keepOriginal = ui.keepColors.checked;
  return {
    ...DEFAULT_RENDER_OPTS,
    darkColor: ui.color.value,
    dotPx: Number(ui.dotSize.value),
    dotShape: dotShape(),
    outputPx: outputPx(),
    finderShape: finderShape(),
    // Case cochée : sans forme propre, le centre des coins suit leur contour.
    finderPupilShape: ui.pupilSame.checked ? undefined : finderPupilShape(),
    // Cases décochées seulement : sans couleur propre, les coins suivent celle des points.
    finderColor: ui.finderSame.checked ? undefined : ui.finderColor.value,
    finderPupilColor: ui.finderSame.checked ? undefined : ui.finderPupilColor.value,
    artworkScale: Number(ui.artScale.value) / 100,
    artworkThickenPx: Number(ui.thicken.value),
    artworkColor: ui.artColor.value,
    artworkContent: current === "art" ? logo?.content : undefined,
    artworkViewBox: current === "art" ? logo?.viewBox : undefined,
    centerLogoScale: Number(ui.centerScale.value) / 100,
    centerLogoColor: keepOriginal ? undefined : ui.centerColor.value,
    centerLogoContent: current === "center" ? logo?.content : undefined,
    centerLogoViewBox: current === "center" ? logo?.viewBox : undefined,
  };
}

/** Mêmes seuils que les avertissements du CLI (voir `parseOptions` dans cli.ts). */
function warnings(current: Mode): string[] {
  const list: string[] = [];
  if (current === "art" && Number(ui.artScale.value) > 100) {
    list.push(`À ${ui.artScale.value} %, le logo déborde de la zone de données : vérifie bien le décodage.`);
  }
  if (current === "center" && Number(ui.centerScale.value) > 30) {
    list.push(`À ${ui.centerScale.value} %, le logo efface une grande zone du QR code : vérifie bien le décodage.`);
  }
  // Même constat que le CLI (voir `parseOptions` et AGENTS.md) : le contour
  // rond ne supporte pas un centre anguleux.
  if (finderShape() === "circle" && !ui.pupilSame.checked && finderPupilShape() !== "circle") {
    list.push(
      "Un contour de coin rond avec un centre d'une autre forme se lit mal : les scanners ratent souvent le QR code. Garde un centre rond, ou choisis un autre contour.",
    );
  }
  // Même seuil que le CLI : le losange est inscrit dans le carré de la taille
  // demandée, il n'en couvre que la moitié.
  if (dotShape() === "diamond" && Number(ui.dotSize.value) < DIAMOND_MIN_DOT_SIZE) {
    list.push(
      `Des losanges aussi petits posent peu d'encre : le QR code se lira mal une fois imprimé en petit. Monte la taille des points au-dessus de ${DIAMOND_MIN_DOT_SIZE}, ou choisis une autre forme.`,
    );
  }
  if (current !== "none" && upload !== null && upload.bytes > HEAVY_LOGO_BYTES) {
    list.push(
      `Ton logo pèse ${Math.round(upload.bytes / 1024)} ko : le fichier produit sera lourd, car le logo y est recopié jusqu'à 3 fois.`,
    );
  }
  return list;
}

/*---- Rendu ----*/

async function logoFor(current: Mode): Promise<SvgFile | null> {
  if (current === "none") return null;
  if (upload !== null) return upload.logo;

  const path = DEFAULT_LOGOS[current];
  const cached = cache.get(path);
  if (cached !== undefined) return cached;

  const response = await fetch(encodeURI(path));
  if (!response.ok) throw new Error(`Logo par défaut introuvable (${path})`);
  const parsed = parseSvg(await response.text(), path);
  cache.set(path, parsed);
  return parsed;
}

async function render(): Promise<void> {
  const token = ++renderToken;
  const current = mode();
  showRows(current);

  const url = ui.url.value.trim();
  if (url === "") {
    showEmpty("Saisis une adresse pour voir le QR code.");
    return;
  }

  let text = url;
  const notes = warnings(current);
  if (ui.upper.checked) {
    const upper = toUpperUrl(url);
    text = upper.text;
    notes.push(...upper.warnings);
  }

  try {
    const logo = await logoFor(current);
    if (token !== renderToken) return;

    const opts = renderOpts(logo);
    const variant = buildVariant(text, mask, Number(ui.density.value));

    currentSvg = renderVariant(variant, opts);
    ui.preview.innerHTML = currentSvg;
    showVariant(variant);
    show(notes, null);
  } catch (error) {
    if (token !== renderToken) return;
    show(notes, error instanceof Error ? error.message : String(error));
  }
}

/**
 * Remplit la galerie de préréglages. Chaque vignette est un vrai QR miniature
 * rendu par `render.ts` : elle ne peut pas diverger de ce que le préréglage
 * produit réellement.
 *
 * La matrice est encodée une seule fois et partagée par les six vignettes —
 * c'est le même contenu, seule l'apparence change.
 */
function buildPresetGallery(container: HTMLElement, modules: boolean[][]): void {
  for (const name of PRESET_NAMES) {
    const label = document.createElement("label");

    const input = document.createElement("input");
    input.type = "radio";
    input.name = "preset";
    input.value = name;
    input.setAttribute("aria-label", PRESET_LABELS[name]);

    const preview = document.createElement("span");
    preview.innerHTML = `${presetPreviewSvg(modules, name, PRESET_PREVIEW_PX)}<em>${PRESET_LABELS[name]}</em>`;

    label.append(input, preview);
    container.append(label);
  }
}

/**
 * Recopie un préréglage dans les contrôles du formulaire. Les préréglages ne
 * sont volontairement pas un état à part : ils écrivent dans les champs, qui
 * restent l'unique source de vérité lue par `renderOpts()`.
 */
function applyPreset(name: PresetName): void {
  const preset = PRESETS[name];
  ui.dotSize.value = String(preset.dotPx);
  check(ui.dotShapes, preset.dotShape);
  check(ui.shapes, preset.finderShape);
}

function check(container: HTMLElement, value: string): void {
  for (const input of container.querySelectorAll<HTMLInputElement>("input")) {
    input.checked = input.value === value;
  }
}

/**
 * Sélectionne le préréglage qui correspond aux réglages courants, ou aucun
 * (« Perso ») s'ils n'en décrivent plus un. Déduit du formulaire à chaque
 * changement plutôt que mémorisé : toucher un curseur suffit alors à sortir du
 * préréglage, sans que rien n'ait à le signaler.
 */
function syncPresetSelection(): void {
  const current = PRESET_NAMES.find(
    (name) =>
      PRESETS[name].dotShape === dotShape() &&
      PRESETS[name].finderShape === finderShape() &&
      PRESETS[name].dotPx === Number(ui.dotSize.value),
  );
  for (const input of ui.presets.querySelectorAll<HTMLInputElement>("input")) {
    input.checked = input.value === current;
  }
}

/**
 * Remplit un groupe de boutons radio avec une forme de point par bouton, sur
 * le même principe que `buildShapeGroup()` : l'aperçu est dessiné par la
 * fonction de rendu des points elle-même.
 */
function buildDotShapeGroup(container: HTMLElement, checked: DotShape): void {
  for (const shape of DOT_SHAPES) {
    const label = document.createElement("label");
    label.title = DOT_SHAPE_LABELS[shape];

    const input = document.createElement("input");
    input.type = "radio";
    input.name = "dot-shape";
    input.value = shape;
    input.checked = shape === checked;
    input.setAttribute("aria-label", DOT_SHAPE_LABELS[shape]);

    const preview = document.createElement("span");
    preview.innerHTML = dotPreviewSvg(shape, DOT_PREVIEW_PX);

    label.append(input, preview);
    container.append(label);
  }
}

/**
 * Remplit un groupe de boutons radio avec une forme de coin par bouton.
 * L'aperçu est dessiné par `render.ts` lui-même : la liste des formes et leur
 * dessin ne peuvent pas diverger de ce que produit le QR.
 */
function buildShapeGroup(container: HTMLElement, name: string, checked: FinderShape): void {
  for (const shape of FINDER_SHAPES) {
    const label = document.createElement("label");
    label.title = SHAPE_LABELS[shape];

    const input = document.createElement("input");
    input.type = "radio";
    input.name = name;
    input.value = shape;
    input.checked = shape === checked;
    input.setAttribute("aria-label", SHAPE_LABELS[shape]);

    const preview = document.createElement("span");
    preview.innerHTML = finderPreviewSvg(shape, shape, SHAPE_PREVIEW_PX);

    label.append(input, preview);
    container.append(label);
  }
}

/**
 * Redessine les aperçus du centre avec le contour réellement choisi : c'est
 * l'association des deux formes qui se juge, pas le centre seul.
 */
function refreshPupilPreviews(): void {
  const ring = finderShape();
  for (const input of ui.pupilShapes.querySelectorAll<HTMLInputElement>("input")) {
    const preview = input.nextElementSibling;
    if (preview !== null) preview.innerHTML = finderPreviewSvg(ring, input.value as FinderShape, SHAPE_PREVIEW_PX);
  }
}

/** N'affiche que les réglages qui ont un sens dans le style choisi. */
function showRows(current: Mode): void {
  for (const row of document.querySelectorAll<HTMLElement>("[data-modes]")) {
    row.hidden = !(row.dataset.modes ?? "").split(" ").includes(current);
  }
}

function showVariant(variant: Variant): void {
  // La grille est affichée telle qu'obtenue, pas telle que demandée : la
  // densité n'est qu'un plancher (voir `buildVariant`).
  ui.variantLabel.textContent = `Grille ${variant.size}×${variant.size}`;
  ui.variantLabel.title = `masque ${variant.mask}, version ${variant.version}`;
}

function show(notes: string[], error: string | null): void {
  ui.messages.replaceChildren();
  if (error !== null) {
    ui.preview.replaceChildren();
    currentSvg = "";
  }
  ui.download.disabled = currentSvg === "";

  for (const note of notes) ui.messages.append(message("warn", note));
  if (error !== null) ui.messages.append(message("error", error));
}

/** Attente d'une saisie : ni un résultat, ni une erreur. */
function showEmpty(text: string): void {
  const line = document.createElement("p");
  line.className = "empty";
  line.textContent = text;
  ui.preview.replaceChildren(line);
  ui.messages.replaceChildren();
  currentSvg = "";
  ui.download.disabled = true;
}

function message(kind: "warn" | "error", text: string): HTMLParagraphElement {
  const line = document.createElement("p");
  line.className = `message ${kind}`;
  line.textContent = text;
  return line;
}

/** Recopie la valeur de chaque curseur dans le `<output>` qui l'accompagne. */
function syncOutputs(): void {
  for (const output of document.querySelectorAll<HTMLOutputElement>("output[data-for]")) {
    const id = output.dataset.for;
    const source = id === undefined ? null : document.querySelector<HTMLInputElement>(`#${id}`);
    if (source !== null) output.textContent = `${source.value}${output.dataset.unit ?? ""}`;
  }
}

/*---- Événements ----*/

let timer: ReturnType<typeof setTimeout> | undefined;

// Sur `input` et non `change` : l'écouteur du formulaire, un cran au-dessus
// dans la remontée de l'événement, resynchronise la galerie d'après les
// champs. Il doit donc les trouver déjà remplis, sinon il reconnaît l'ancien
// préréglage et décoche celui qu'on vient de choisir.
ui.presets.addEventListener("input", (event) => {
  const input = event.target;
  if (input instanceof HTMLInputElement) applyPreset(input.value as PresetName);
});

ui.form.addEventListener("input", () => {
  // Le retour visuel des curseurs et des styles est immédiat ; seul le rendu,
  // qui réencode et reconstruit le SVG, attend une pause dans la saisie.
  syncOutputs();
  syncPresetSelection();
  showRows(mode());
  ui.pupilRow.hidden = ui.pupilSame.checked;
  refreshPupilPreviews();
  clearTimeout(timer);
  timer = setTimeout(() => void render(), DEBOUNCE_MS);
});

// Un autre masque que celui affiché, tiré au hasard parmi les 7 restants :
// « régénérer » doit donner un dessin différent, pas dérouler une liste. Le
// tirage porte sur un décalage de 1 à 7, jamais 0, donc le dessin change
// toujours.
ui.regenerate.addEventListener("click", () => {
  mask = (mask + 1 + Math.floor(Math.random() * (MASK_COUNT - 1))) % MASK_COUNT;
  void render();
});

ui.pick.addEventListener("click", () => ui.file.click());
ui.file.addEventListener("change", () => {
  const file = ui.file.files?.[0];
  if (file !== undefined) void loadUpload(file);
});

ui.reset.addEventListener("click", () => {
  upload = null;
  ui.file.value = "";
  ui.logoName.textContent = "Logo Collecti'FROG par défaut";
  ui.reset.hidden = true;
  void render();
});

for (const event of ["dragenter", "dragover"] as const) {
  ui.drop.addEventListener(event, (dragEvent) => {
    dragEvent.preventDefault();
    ui.drop.classList.add("over");
  });
}

for (const event of ["dragleave", "drop"] as const) {
  ui.drop.addEventListener(event, () => ui.drop.classList.remove("over"));
}

ui.drop.addEventListener("drop", (dropEvent) => {
  dropEvent.preventDefault();
  const file = dropEvent.dataTransfer?.files[0];
  if (file !== undefined) void loadUpload(file);
});

ui.download.addEventListener("click", () => {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([currentSvg], { type: "image/svg+xml" }));
  link.download = "qr-code.svg";
  link.click();
  URL.revokeObjectURL(link.href);
});

async function loadUpload(file: File): Promise<void> {
  if (!/\.svg$/i.test(file.name) && file.type !== "image/svg+xml") {
    show([], `« ${file.name} » n'est pas un fichier SVG. Seul ce format est pris en charge pour le moment.`);
    return;
  }

  try {
    upload = { logo: parseSvg(await file.text(), file.name), name: file.name, bytes: file.size };
  } catch (error) {
    show([], error instanceof Error ? error.message : String(error));
    return;
  }

  ui.logoName.textContent = file.name;
  ui.reset.hidden = false;
  await render();
}

buildDotShapeGroup(ui.dotShapes, DEFAULT_RENDER_OPTS.dotShape);
buildShapeGroup(ui.shapes, "finder-shape", DEFAULT_RENDER_OPTS.finderShape);
buildShapeGroup(ui.pupilShapes, "finder-pupil-shape", DEFAULT_RENDER_OPTS.finderShape);
// Un QR court sert de modèle aux six vignettes : encodé une fois, rendu six
// fois avec des apparences différentes. La galerie se construit après les
// groupes de formes, dont `applyPreset()` coche les boutons.
buildPresetGallery(ui.presets, buildVariant("https://collecti-frog.fr", 0, 1).modules);
refreshPupilPreviews();
syncPresetSelection();
syncOutputs();
void render();
