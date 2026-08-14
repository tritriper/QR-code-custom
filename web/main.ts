/*
 * Entrée navigateur, pendant de `cli.ts` : seul module à effets de bord côté
 * web (DOM, lecture des fichiers déposés, téléchargement). Toute la
 * génération vit dans `src/qr.ts` et `src/render.ts`, tous deux purs.
 *
 * L'état de l'interface n'est pas dupliqué dans une structure à part : il est
 * relu depuis les contrôles du formulaire à chaque rendu. Seuls le logo
 * déposé et la variante affichée, qui ne correspondent à aucun champ, sont
 * gardés ici.
 */

import { MASK_COUNT, buildVariants, parseSvg, renderVariant, toUpperUrl, type SvgFile, type Variant } from "../src/qr.js";
import { DEFAULT_RENDER_OPTS, type RenderOpts } from "../src/render.js";

type Mode = "art" | "center" | "none";

/** Logo par défaut de chaque style, chargé à la demande depuis `art/`. */
const DEFAULT_LOGOS: Record<"art" | "center", string> = {
  art: "art/CF-Logo-VertFonce-Trans.svg",
  center: "art/Circle Logo.svg",
};

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
/** Rang de la variante affichée : 0 = la mieux classée. */
let variantRank = 0;
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
  artColor: el<HTMLInputElement>("#art-color"),
  centerColor: el<HTMLInputElement>("#center-color"),
  keepColors: el<HTMLInputElement>("#keep-colors"),
  dotSize: el<HTMLInputElement>("#dot-size"),
  spacing: el<HTMLInputElement>("#spacing"),
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
  variantLabel: el<HTMLSpanElement>("#variant-label"),
  prev: el<HTMLButtonElement>("#prev"),
  next: el<HTMLButtonElement>("#next"),
  download: el<HTMLButtonElement>("#download"),
  messages: el<HTMLDivElement>("#messages"),
};

/*---- Lecture du formulaire ----*/

function mode(): Mode {
  return (new FormData(ui.form).get("mode") as Mode | null) ?? "art";
}

function renderOpts(logo: SvgFile | null): RenderOpts {
  const current = mode();
  const keepOriginal = ui.keepColors.checked;
  return {
    ...DEFAULT_RENDER_OPTS,
    darkColor: ui.color.value,
    dotPx: Number(ui.dotSize.value),
    modulePx: Number(ui.spacing.value),
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
    const ranked = buildVariants(text, opts).sort((a, b) => a.collisions - b.collisions);
    variantRank = Math.min(Math.max(variantRank, 0), ranked.length - 1);

    currentSvg = renderVariant(ranked[variantRank], opts);
    ui.preview.innerHTML = currentSvg;
    showVariant(ranked[variantRank], ranked.length);
    show(notes, null);
  } catch (error) {
    if (token !== renderToken) return;
    show(notes, error instanceof Error ? error.message : String(error));
  }
}

/** N'affiche que les réglages qui ont un sens dans le style choisi. */
function showRows(current: Mode): void {
  for (const row of document.querySelectorAll<HTMLElement>("[data-modes]")) {
    row.hidden = !(row.dataset.modes ?? "").split(" ").includes(current);
  }
}

function showVariant(variant: Variant, total: number): void {
  ui.variantLabel.textContent = `Variante ${variantRank + 1} sur ${total}`;
  ui.variantLabel.title = `masque ${variant.mask}, version ${variant.version} (${variant.size}×${variant.size})`;
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

ui.form.addEventListener("input", () => {
  // Le retour visuel des curseurs et des styles est immédiat ; seul le rendu,
  // qui reconstruit les 8 variantes, attend une pause dans la saisie.
  syncOutputs();
  showRows(mode());
  clearTimeout(timer);
  timer = setTimeout(() => void render(), DEBOUNCE_MS);
});

ui.prev.addEventListener("click", () => {
  variantRank = Math.max(0, variantRank - 1);
  void render();
});

ui.next.addEventListener("click", () => {
  variantRank = Math.min(MASK_COUNT - 1, variantRank + 1);
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

syncOutputs();
void render();
